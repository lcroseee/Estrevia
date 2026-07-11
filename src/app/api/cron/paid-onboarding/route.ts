/**
 * GET /api/cron/paid-onboarding
 *
 * Vercel Cron — runs hourly at :30.
 *
 * Sends the paid-onboarding activation email (~T+24h after subscribing):
 * one nudge toward generating the AI reading on /chart. Anchor = the user's
 * purchase_confirmation row in sent_emails, aged 20–44h. The wide window
 * tolerates missed cron runs without spamming — the NOT EXISTS guard below
 * caps it at exactly one send per payer, ever.
 *
 * Skip conditions:
 *   - subscription_status not in ('trialing','active') (canceled during trial)
 *   - stripe_subscription_id IS NULL (incomplete checkout)
 *   - email_undeliverable = true
 *   - a paid_onboarding row already exists in sent_emails (any age)
 *
 * Idempotency: NOT EXISTS query guard + wasSentWithin inside the sender +
 * Resend idempotencyKey. A failed send records nothing → retried next hour
 * while still inside the window. DRY_RUN gate applies (in the sender).
 *
 * Protected by CRON_SECRET (same as all other crons).
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { and, eq, gt, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { users, sentEmails } from '@/shared/lib/schema';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { sendPaidOnboardingEmail } from '@/shared/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const HOUR_MS = 60 * 60 * 1000;
// purchase_confirmation went out 20–44h ago (~T+24h send)
const WINDOW_MIN_AGE_MS = 20 * HOUR_MS;
const WINDOW_MAX_AGE_MS = 44 * HOUR_MS;

export async function GET(request: Request): Promise<NextResponse> {
  const authError = assertCronAuth(request);
  if (authError) return authError;

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MAX_AGE_MS);
  const windowEnd = new Date(now - WINDOW_MIN_AGE_MS);

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const db = getDb();

    // -------------------------------------------------------------------
    // Candidates: purchase_confirmation in the 20–44h window, still on an
    // active/trialing sub, deliverable, never sent paid_onboarding.
    // -------------------------------------------------------------------
    const candidates = await db
      .select({
        userId: users.id,
        email: users.email,
        locale: users.locale,
        subscriptionId: users.stripeSubscriptionId,
      })
      .from(sentEmails)
      .innerJoin(users, eq(sentEmails.userId, users.id))
      .where(
        and(
          eq(sentEmails.emailType, 'purchase_confirmation'),
          gt(sentEmails.sentAt, windowStart),
          lt(sentEmails.sentAt, windowEnd),
          isNotNull(users.stripeSubscriptionId),
          inArray(users.subscriptionStatus, ['trialing', 'active']),
          eq(users.emailUndeliverable, false),
          // Alias needed: the outer FROM is already sent_emails.
          sql`NOT EXISTS (
            SELECT 1 FROM sent_emails se2
            WHERE se2.user_id = ${users.id}
              AND se2.email_type = 'paid_onboarding'
          )`,
        ),
      )
      .limit(200);

    console.info('[cron/paid-onboarding] candidates found', { count: candidates.length });

    // A payer with two purchase_confirmation rows in the window (retried
    // webhook edge) must still get exactly one attempt per run.
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate.userId)) continue;
      seen.add(candidate.userId);
      processed++;

      try {
        const result = await sendPaidOnboardingEmail({
          userId: candidate.userId,
          email: candidate.email,
          locale: candidate.locale,
          subscriptionId: candidate.subscriptionId!,
        });
        if (result.sent) {
          sent++;
        } else {
          skipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        errors.push(`${candidate.userId} — ${msg}`);
        // Log userId only — never the email address (PII rule)
        console.error('[cron/paid-onboarding] send failed', {
          userId: candidate.userId,
          error: msg,
        });
        try {
          Sentry.captureException(err, { tags: { cron: 'paid-onboarding' } });
        } catch {
          // Sentry best-effort
        }
        // Continue — don't block other users
      }
    }
  } catch (fatalErr) {
    console.error('[cron/paid-onboarding] fatal error', {
      error: fatalErr instanceof Error ? fatalErr.message : 'unknown',
    });
    try {
      Sentry.captureException(fatalErr, { tags: { cron: 'paid-onboarding' } });
    } catch {
      // Sentry best-effort
    }
    // Return 200 — Vercel doesn't alert on cron 200; next run retries naturally
    return NextResponse.json(
      { ok: false, error: 'fatal', processed, sent, skipped },
      { status: 200 },
    );
  }

  console.info('[cron/paid-onboarding] complete', { processed, sent, skipped, errors: errors.length });
  return NextResponse.json({ ok: true, processed, sent, skipped, errors }, { status: 200 });
}
