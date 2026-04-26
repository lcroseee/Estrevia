/**
 * GET /api/cron/advertising/retro-weekly
 *
 * Vercel Cron — runs weekly on Mondays at 09:00 UTC (schedule: "0 9 * * 1").
 * Generates the weekly retrospective report: 7-day performance summary,
 * campaign learnings, budget recommendations, and creative iteration plan.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 *
 * TODO (S6/S7): Wire up real implementations:
 *   import { runWeeklyRetro } from '@/modules/advertising/decide/orchestrator';
 *   const summary = await runWeeklyRetro();
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

  // 3. Run weekly retro
  try {
    // TODO(S6): Replace with real orchestrator call when decide module is complete
    // const summary = await runWeeklyRetro();
    const summary = {
      stub: true,
      message: 'weekly retro not yet wired — waiting for S6 orchestrator',
    };

    return NextResponse.json({ success: true, summary });
  } catch (e) {
    console.error('[cron/advertising/retro-weekly] failed', e);
    Sentry.captureException(e, {
      tags: { cron: true, route: '/api/cron/advertising/retro-weekly' },
    });
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}
