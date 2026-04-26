/**
 * GET /api/cron/advertising/account-health-weekly
 *
 * Vercel Cron — runs weekly on Mondays at 10:00 UTC (schedule: "0 10 * * 1").
 * Sends the weekly Meta Business Manager account health reminder to the founder
 * via Telegram, asking them to manually review Account Quality.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import {
  createTelegramBot,
  sendWeeklyAccountHealthReminder,
} from '@/modules/advertising/alerts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 1. Auth
  const authError = assertCronAuth(request);
  if (authError) return authError;

  // 2. Kill switch
  if (process.env.ADVERTISING_AGENT_ENABLED !== 'true') {
    return NextResponse.json({ success: false, reason: 'kill_switch' });
  }

  // 3. Send weekly account health reminder
  try {
    const telegram = createTelegramBot();

    const result = await sendWeeklyAccountHealthReminder({ telegram });

    return NextResponse.json({ success: true, summary: result });
  } catch (e) {
    console.error('[cron/advertising/account-health-weekly] failed', e);
    Sentry.captureException(e, {
      tags: { cron: true, route: '/api/cron/advertising/account-health-weekly' },
    });
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}
