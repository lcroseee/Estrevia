/**
 * GET /api/cron/advertising/triage-daily
 *
 * Vercel Cron — runs daily at 09:00 UTC (schedule: "0 9 * * *").
 * Runs the full daily advertising review: performance reconciliation, daily
 * digest generation, and drop-off monitor check.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 *
 * TODO (S6/S7/S9): Wire up real implementations:
 *   import { runDailyTriage } from '@/modules/advertising/decide/orchestrator';
 *   import { runDailyDropOffCheck } from '@/modules/advertising/alerts/drop-off-monitor';
 *   const summary = await runDailyTriage();
 *   await runDailyDropOffCheck(deps);
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { assertCronAuth } from '@/shared/lib/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 1. Auth
  const authError = assertCronAuth(request);
  if (authError) return authError;

  // 2. Kill switch
  if (process.env.ADVERTISING_AGENT_ENABLED !== 'true') {
    return NextResponse.json({ success: false, reason: 'kill_switch' });
  }

  // 3. Run daily triage
  try {
    // TODO(S6): Replace with real orchestrator call when decide module is complete
    // const summary = await runDailyTriage();
    // TODO(S9): Wire drop-off monitor with real PostHog + store deps
    // await runDailyDropOffCheck({ posthog, telegram, store });
    const summary = {
      stub: true,
      message: 'daily triage not yet wired — waiting for S6 orchestrator + S9 drop-off monitor',
    };

    return NextResponse.json({ success: true, summary });
  } catch (e) {
    console.error('[cron/advertising/triage-daily] failed', e);
    Sentry.captureException(e, {
      tags: { cron: true, route: '/api/cron/advertising/triage-daily' },
    });
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}
