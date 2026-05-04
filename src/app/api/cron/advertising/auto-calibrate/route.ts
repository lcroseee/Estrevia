/**
 * GET /api/cron/advertising/auto-calibrate
 *
 * Vercel Cron — runs weekly on Sundays at 03:00 UTC (schedule: "0 3 * * 0").
 * Senior-buyer auto-calibrator: refreshes per-ad-set thresholds from the last
 * 30 days of metric history (Phase B/C/D ad sets only). Bounded-change
 * (>2×) edits are routed through the Telegram approval flow.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 * Respects ADVERTISING_AGENT_DRY_RUN: logs intent without persisting changes
 * (handled inside `runWeeklyCalibration` via the injected telegramBot).
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import { createTelegramBot } from '@/modules/advertising/alerts';
import { runWeeklyCalibration } from '@/modules/advertising/senior-buyer/auto-calibrator';
import { isDryRun } from '@/modules/advertising/safety/kill-switch';
import { assertCronAuth } from '@/shared/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  // 1. Auth
  const authError = assertCronAuth(request);
  if (authError) return authError;

  // 2. Kill switch
  if (process.env.ADVERTISING_AGENT_ENABLED !== 'true') {
    return NextResponse.json({ skipped: 'agent disabled' });
  }

  // 3. Run weekly calibration
  try {
    const dryRun = isDryRun();
    const bot = createTelegramBot();

    // Adapter: the auto-calibrator's `telegramBot` interface narrows
    // `requestApproval` to a single-message + `{ riskLevel }` shape, while
    // the concrete TelegramBot accepts `(question, options[], risk)`.
    // Wrap the concrete client so the calibrator gets the shape it expects.
    const telegramBot = {
      requestApproval: async (
        message: string,
        options: { riskLevel: 'HIGH_RISK' },
      ): Promise<{ approved: boolean }> => {
        const result = await bot.requestApproval(
          message,
          [
            { label: '✅ Approve', value: 'approve' },
            { label: '❌ Reject', value: 'reject' },
          ],
          options.riskLevel,
        );
        return { approved: result.approved };
      },
    };

    const result = await runWeeklyCalibration({ telegramBot });

    console.info('[cron/advertising/auto-calibrate] complete', {
      dry_run: dryRun,
      ...result,
    });
    return NextResponse.json({ success: true, summary: result });
  } catch (err) {
    console.error('[cron/advertising/auto-calibrate] failed', err);
    Sentry.captureException(err, {
      tags: {
        cron: true,
        route: '/api/cron/advertising/auto-calibrate',
        subsystem: 'senior-buyer',
      },
    });
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
