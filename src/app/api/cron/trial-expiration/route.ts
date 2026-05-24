/**
 * GET /api/cron/trial-expiration
 *
 * Vercel Cron — runs hourly.
 *
 * Sends T-24h (reminder_1d) and T-0 (trial_ended) emails for trial users
 * approaching or past their trial end date. The T-72h email (reminder_3d)
 * is triggered by the Stripe customer.subscription.trial_will_end webhook.
 *
 * Step windows:
 *   reminder_1d   — trial_end is between NOW() and NOW() + 26h
 *                   (26h window catches the hourly slot that straddles
 *                   the 24h mark)
 *   trial_ended   — trial_end is between NOW() - 48h and NOW()
 *                   (48h window ensures we catch users even if the cron
 *                   missed a run, without spamming after 2 days)
 *
 * Skip conditions:
 *   - subscription_status is 'active' (user converted during trial)
 *   - stripe_subscription_id is NULL (incomplete checkout)
 *   - email_undeliverable = true
 *   - step already in sent_trial_emails with resend_message_id (delivered)
 *
 * Idempotency: sendTrialExpirationEmail calls claimTrialEmailSlot internally,
 * so concurrent cron runs cannot double-fire. DRY_RUN gate applies.
 *
 * Protected by CRON_SECRET (same as all other crons).
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { and, between, eq, gt, isNotNull, isNull, lt, ne, not, or, sql } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { users, sentTrialEmails } from '@/shared/lib/schema';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { sendTrialExpirationEmail } from '@/shared/lib/trial-expiration-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const HOUR_MS = 60 * 60 * 1000;
// reminder_1d window: trial ends within the next 26 hours
const REMINDER_1D_WINDOW_MS = 26 * HOUR_MS;
// trial_ended window: trial ended within the last 48 hours
const TRIAL_ENDED_LOOKBACK_MS = 48 * HOUR_MS;

export async function GET(request: Request): Promise<NextResponse> {
  const authError = assertCronAuth(request);
  if (authError) return authError;

  const db = getDb();
  const now = new Date();

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    // -------------------------------------------------------------------
    // Fetch candidates: trialing users with trial_end in the relevant
    // windows who have stripe_subscription_id set.
    // We load both windows in one query and sort out the step in-process.
    // -------------------------------------------------------------------
    const windowStart = new Date(now.getTime() - TRIAL_ENDED_LOOKBACK_MS);
    const windowEnd = new Date(now.getTime() + REMINDER_1D_WINDOW_MS);

    const candidates = await db
      .select({
        id: users.id,
        email: users.email,
        locale: users.locale,
        stripeSubscriptionId: users.stripeSubscriptionId,
        trialEnd: users.trialEnd,
        subscriptionStatus: users.subscriptionStatus,
        plan: users.plan,
      })
      .from(users)
      .where(
        and(
          isNotNull(users.trialEnd),
          isNotNull(users.stripeSubscriptionId),
          // trial_end within either window
          and(
            gt(users.trialEnd, windowStart),
            lt(users.trialEnd, windowEnd),
          ),
          // Not already converted
          ne(users.subscriptionStatus, 'active'),
          // Not bounced
          eq(users.emailUndeliverable, false),
        ),
      )
      .limit(200);

    for (const user of candidates) {
      processed++;
      const trialEnd = user.trialEnd!;
      const subscriptionId = user.stripeSubscriptionId!;
      const locale = (user.locale ?? 'en') as 'en' | 'es';
      const plan = user.plan as 'pro_monthly' | 'pro_annual' | 'free';

      // Determine which step(s) this user is eligible for
      const isReminder1dEligible =
        trialEnd > now && trialEnd <= new Date(now.getTime() + REMINDER_1D_WINDOW_MS);
      const isTrialEndedEligible =
        trialEnd <= now && trialEnd > new Date(now.getTime() - TRIAL_ENDED_LOOKBACK_MS);

      // Fetch already-sent steps for this subscription
      const sentSteps = await db
        .select({ step: sentTrialEmails.step })
        .from(sentTrialEmails)
        .where(eq(sentTrialEmails.subscriptionId, subscriptionId));
      const sentSet = new Set(sentSteps.map((r) => r.step));

      const stepsToSend: Array<'reminder_1d' | 'trial_ended'> = [];
      if (isReminder1dEligible && !sentSet.has('reminder_1d')) {
        stepsToSend.push('reminder_1d');
      }
      if (isTrialEndedEligible && !sentSet.has('trial_ended')) {
        stepsToSend.push('trial_ended');
      }

      if (stepsToSend.length === 0) {
        skipped++;
        continue;
      }

      for (const step of stepsToSend) {
        try {
          const result = await sendTrialExpirationEmail({
            subscriptionId,
            userId: user.id,
            email: user.email,
            locale,
            step,
            trialEndDate: trialEnd,
            plan,
          });
          if (result.sent) {
            sent++;
          } else {
            skipped++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          errors.push(`${user.id}:${step} — ${msg}`);
          console.error('[cron/trial-expiration] send failed', {
            userId: user.id,
            subscriptionId,
            step,
            error: msg,
          });
          try {
            Sentry.captureException(err, {
              tags: { cron: 'trial-expiration', step },
            });
          } catch {
            // Sentry best-effort
          }
          // Continue — don't block other users
        }
      }
    }
  } catch (fatalErr) {
    console.error('[cron/trial-expiration] fatal error', {
      error: fatalErr instanceof Error ? fatalErr.message : 'unknown',
    });
    try {
      Sentry.captureException(fatalErr, { tags: { cron: 'trial-expiration' } });
    } catch {
      // Sentry best-effort
    }
    // Return 200 — Vercel doesn't alert on cron 200; next run retries naturally
    return NextResponse.json(
      { ok: false, error: 'fatal', processed, sent, skipped },
      { status: 200 },
    );
  }

  console.info('[cron/trial-expiration] complete', { processed, sent, skipped, errors: errors.length });
  return NextResponse.json({ ok: true, processed, sent, skipped, errors }, { status: 200 });
}
