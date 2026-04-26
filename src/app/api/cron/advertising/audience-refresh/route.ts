/**
 * GET /api/cron/advertising/audience-refresh
 *
 * Vercel Cron — runs daily at 06:00 UTC (schedule: "0 6 * * *").
 * Refreshes Meta Custom Audiences: syncs converted user lists, updates
 * retargeting pools, and rebuilds lookalike seed audiences.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 *
 * TODO (S7/audiences): Wire up real implementations:
 *   import { runAudienceRefresh } from '@/modules/advertising/audiences/refresh-cycle';
 *   const summary = await runAudienceRefresh();
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

  // 3. Run audience refresh
  try {
    // TODO(audiences): Replace with real audience refresh when module is complete
    // const summary = await runAudienceRefresh();
    const summary = {
      stub: true,
      message: 'audience refresh not yet wired — waiting for audiences module',
    };

    return NextResponse.json({ success: true, summary });
  } catch (e) {
    console.error('[cron/advertising/audience-refresh] failed', e);
    Sentry.captureException(e, {
      tags: { cron: true, route: '/api/cron/advertising/audience-refresh' },
    });
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}
