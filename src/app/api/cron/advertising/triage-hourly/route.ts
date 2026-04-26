/**
 * GET /api/cron/advertising/triage-hourly
 *
 * Vercel Cron — runs every hour (schedule: "0 * * * *").
 * Runs the hourly advertising triage: checks active ads, applies Tier 1 rules,
 * and logs decisions to the audit trail.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 *
 * TODO (S6/S7): Replace stub with real orchestrator call:
 *   import { runHourlyTriage } from '@/modules/advertising/decide/orchestrator';
 *   const summary = await runHourlyTriage();
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

  // 3. Run triage
  try {
    // TODO(S6): Replace with real orchestrator call when decide module is complete
    // const summary = await runHourlyTriage();
    const summary = {
      stub: true,
      message: 'hourly triage not yet wired — waiting for S6 orchestrator',
    };

    return NextResponse.json({ success: true, summary });
  } catch (e) {
    console.error('[cron/advertising/triage-hourly] failed', e);
    Sentry.captureException(e, {
      tags: { cron: true, route: '/api/cron/advertising/triage-hourly' },
    });
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}
