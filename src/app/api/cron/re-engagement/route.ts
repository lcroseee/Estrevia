/**
 * GET /api/cron/re-engagement
 *
 * Vercel Cron — runs daily at 09:00 UTC.
 * Queries users who last visited between 28d and 56d ago, have marketing opt-in
 * enabled, and have not received a re-engagement email in the past 90 days.
 * Sends a single re-engagement email to each candidate.
 *
 * Protected by CRON_SECRET (Vercel sends Bearer token in Authorization header).
 *
 * Failures per-user are caught and logged — a failed send does NOT insert into
 * sent_emails, so that user becomes a candidate again the following day.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { and, eq, lt, gt, sql } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { users, sentEmails } from '@/shared/lib/schema';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { sendReEngagementEmail } from '@/shared/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const TWENTY_EIGHT_DAYS_MS = 28 * 24 * 60 * 60 * 1000;
const FIFTY_SIX_DAYS_MS = 56 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  // ---------------------------------------------------------------------------
  // 1. Verify cron secret
  // ---------------------------------------------------------------------------
  const authError = assertCronAuth(request);
  if (authError) return authError;

  const now = Date.now();
  const cutoffStart = new Date(now - FIFTY_SIX_DAYS_MS); // older → out of window
  const cutoffEnd = new Date(now - TWENTY_EIGHT_DAYS_MS); // newer → too recent
  const recentReEngagementCutoff = new Date(now - NINETY_DAYS_MS);

  let sent = 0;
  let failed = 0;

  try {
    const db = getDb();

    // ---------------------------------------------------------------------------
    // 2. Query candidates:
    //    - lastSeenAt in [now-56d, now-28d]
    //    - marketingEmailOptIn = true
    //    - emailUndeliverable = false
    //    - NOT EXISTS: re_engagement_28d sent in last 90d
    // ---------------------------------------------------------------------------
    const candidates = await db
      .select({
        id: users.id,
        email: users.email,
        locale: users.locale,
      })
      .from(users)
      .where(
        and(
          gt(users.lastSeenAt, cutoffStart),
          lt(users.lastSeenAt, cutoffEnd),
          eq(users.marketingEmailOptIn, true),
          eq(users.emailUndeliverable, false),
          sql`NOT EXISTS (
            SELECT 1 FROM ${sentEmails}
            WHERE ${sentEmails.userId} = ${users.id}
              AND ${sentEmails.emailType} = 're_engagement_28d'
              AND ${sentEmails.sentAt} > ${recentReEngagementCutoff}
          )`,
        ),
      );

    console.info('[cron/re-engagement] candidates found', { count: candidates.length });

    // ---------------------------------------------------------------------------
    // 3. Send email to each candidate — failures are isolated (loop continues)
    // ---------------------------------------------------------------------------
    for (const user of candidates) {
      try {
        await sendReEngagementEmail({
          userId: user.id,
          email: user.email,
          locale: user.locale,
        });
        sent++;
      } catch (err) {
        failed++;
        // Log userId only — never the email address (PII rule)
        console.error('[cron/re-engagement] send failed', {
          userId: user.id,
          err: err instanceof Error ? err.message : 'unknown',
        });
        Sentry.captureException(err, {
          tags: {
            cron: true,
            route: '/api/cron/re-engagement',
          },
          extra: { userId: user.id },
        });
      }
    }
  } catch (err) {
    console.error('[cron/re-engagement] query error:', err);
    Sentry.captureException(err, {
      tags: { cron: true, route: '/api/cron/re-engagement' },
    });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', sent, failed },
      { status: 500 },
    );
  }

  console.info('[cron/re-engagement] complete', { sent, failed });
  return NextResponse.json({ success: true, sent, failed });
}
