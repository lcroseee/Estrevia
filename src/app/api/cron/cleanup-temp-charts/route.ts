/**
 * GET /api/cron/cleanup-temp-charts
 *
 * Nightly Vercel Cron (03:00 UTC) — enforces data retention promises made in
 * the privacy policy.
 *
 * Deletes:
 *   1. natal_charts where status = 'temp' AND user_id IS NULL AND
 *      created_at < NOW() - interval '7 days' AND NOT referenced by an
 *      active-nurture email_leads row (step<3, not converted, not
 *      unsubscribed, captured within the past 7 days). The lead-nurture
 *      drip personalizes T+24h / T+72h emails from this chart, so we
 *      cannot delete it out from under an in-flight drip. After 7 days the
 *      drip is complete and cleanup proceeds — late re-sends fall back to
 *      generic copy.
 *      (fixes P1 from audit 10-security-legal.md — anonymous chart calcs
 *       insert DB rows with no retention enforcement.)
 *   2. waitlist_entries where created_at < NOW() - interval '90 days'
 *      (fixes P1 from audit 03-pii-db.md — plaintext waitlist e-mails retained
 *       indefinitely; retention policy documented in schema.ts).
 *
 * Protected by `CRON_SECRET` (Vercel sends the Bearer token). Returns a JSON
 * body with per-target deletion counts.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull, lt, notExists, sql } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { emailLeads, natalCharts, waitlistEntries } from '@/shared/lib/schema';
import { assertCronAuth } from '@/shared/lib/cron-auth';

export const dynamic = 'force-dynamic';

interface CleanupResponse {
  tempCharts: number;
  waitlistEntries: number;
}

export async function GET(request: Request) {
  // ---------------------------------------------------------------------------
  // 1. Verify cron secret (missing env var → 500; wrong/missing header → 401)
  // ---------------------------------------------------------------------------
  const authError = assertCronAuth(request);
  if (authError) return authError;

  // ---------------------------------------------------------------------------
  // 2. Run deletions
  // ---------------------------------------------------------------------------
  try {
    const db = getDb();

    const deletedCharts = await db
      .delete(natalCharts)
      .where(
        and(
          eq(natalCharts.status, 'temp'),
          isNull(natalCharts.userId),
          lt(natalCharts.createdAt, sql`NOW() - INTERVAL '7 days'`),
          // Preserve charts referenced by an active-nurture lead. The
          // subquery uses raw SQL so it can correlate against the outer
          // natal_charts.id without needing the full Drizzle relation API.
          notExists(sql`
            SELECT 1 FROM ${emailLeads}
            WHERE ${emailLeads.chartId} = ${natalCharts.id}
              AND ${emailLeads.nurtureStep} < 3
              AND ${emailLeads.convertedToUserId} IS NULL
              AND ${emailLeads.unsubscribedAt} IS NULL
              AND ${emailLeads.createdAt} > NOW() - INTERVAL '7 days'
          `),
        ),
      )
      .returning({ id: natalCharts.id });

    const deletedWaitlist = await db
      .delete(waitlistEntries)
      .where(lt(waitlistEntries.createdAt, sql`NOW() - INTERVAL '90 days'`))
      .returning({ id: waitlistEntries.id });

    const body: CleanupResponse = {
      tempCharts: deletedCharts.length,
      waitlistEntries: deletedWaitlist.length,
    };

    return NextResponse.json({
      success: true,
      deleted: body,
    });
  } catch (err) {
    // Never log raw err (might include row snippets). Log name only.
    const name = err instanceof Error ? err.name : typeof err;
    console.error('[cron/cleanup-temp-charts] failed:', name);
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, {
        tags: { route: 'cron/cleanup-temp-charts' },
      });
    } catch {
      /* sentry optional */
    }
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
