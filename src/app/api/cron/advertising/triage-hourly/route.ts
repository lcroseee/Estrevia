/**
 * GET /api/cron/advertising/triage-hourly
 *
 * Vercel Cron — runs every hour (schedule: "0 * * * *").
 * Hourly triage: lightweight Tier 1 rules only (pause-only safety).
 * Pulls Meta insights for the past hour, runs Tier 1, applies pause decisions.
 *
 * Tier 2 and Tier 3 are NOT run here — they require longer windows and are
 * reserved for the daily triage cadence.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 * Respects ADVERTISING_AGENT_DRY_RUN: logs decisions without calling Meta API.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { fetchMetaInsights } from '@/modules/advertising/perceive/meta-insights';
import { decide } from '@/modules/advertising/decide/orchestrator';
import { pause } from '@/modules/advertising/act/pause';
import { TelegramBot } from '@/modules/advertising/alerts/telegram-bot';
import { isDryRun } from '@/modules/advertising/safety/kill-switch';
import type { MetaInsightsApi } from '@/modules/advertising/perceive/meta-insights';
import type { MetaAdClient } from '@/modules/advertising/act/meta-marketing';
import type { AlertSender } from '@/modules/advertising/safety/spend-cap';
import type { DecisionRecord } from '@/shared/types/advertising';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 1. Auth
  const authError = assertCronAuth(request);
  if (authError) return authError;

  // 2. Kill switch
  if (process.env.ADVERTISING_AGENT_ENABLED !== 'true') {
    return NextResponse.json({ success: false, reason: 'kill_switch' });
  }

  // 3. Hourly triage
  try {
    const dryRun = isDryRun();

    // Build dependencies — real implementations use env vars in production
    const metaApiClient = buildMetaApiClient();
    const telegramBot = buildTelegramBot();
    const decisionDb = buildDecisionDb();
    const spendCapDb = buildSpendCapDb();

    // Pull Meta insights for the past hour
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dateFrom = hourAgo.toISOString().slice(0, 10);
    const dateTo = now.toISOString().slice(0, 10);

    const metrics = await fetchMetaInsights({
      apiClient: metaApiClient,
      dateFrom,
      dateTo,
      retryBaseMs: 500,
    });

    // Run Tier 1 only (hourly = lightweight, pause-only safety).
    // No baselines at hourly cadence — Tier 3 skipped.
    // tier2Decide: undefined — Tier 2 not run at hourly cadence.
    const { decisions } = await decide(metrics, [], {
      // AnomalyExplainClient signature: (metric: AdMetric, context: string) => Promise<string>
      // Not used at hourly cadence (no baselines → Tier 3 skipped), but required by interface.
      claudeClient: { anomalyExplain: async (_metric, _context) => 'no-op at hourly cadence' },
      baselines: new Map(),
      tier2Decide: undefined,
    });

    // Apply only pause decisions — no scale/duplicate at hourly cadence
    const pauseDecisions = decisions.filter((d) => d.action === 'pause');

    const records: DecisionRecord[] = [];
    for (const decision of pauseDecisions) {
      if (dryRun) {
        console.info('[triage-hourly][dry-run] would pause ad:', decision.ad_id, decision.reason);
        continue;
      }
      const record = await pause(decision, {
        metaApi: metaApiClient,
        telegramBot: telegramBotAsAlertSender(telegramBot),
        spendCapDb,
        decisionDb,
      });
      records.push(record);
    }

    const summary = {
      ran_at: now.toISOString(),
      dry_run: dryRun,
      metrics_fetched: metrics.length,
      decisions_made: decisions.length,
      pause_decisions: pauseDecisions.length,
      pauses_applied: records.length,
    };

    console.info('[cron/advertising/triage-hourly] completed', summary);
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

// ---------------------------------------------------------------------------
// Dependency factories — read from env vars in production.
// Override via vi.mock in tests.
// ---------------------------------------------------------------------------

/**
 * Builds a Meta API client using env vars.
 * In production: connects to Meta Marketing API.
 * In tests: mocked via vi.mock on the perceive/act modules.
 *
 * Returns a minimal MetaInsightsApi + MetaAdClient shape built from env vars.
 * A full adapter class will be added in Phase 2.
 */
function buildMetaApiClient(): MetaInsightsApi & MetaAdClient {
  const accessToken = process.env.META_ACCESS_TOKEN ?? '';
  const adAccountId = process.env.META_AD_ACCOUNT_ID ?? '';

  // Placeholder implementation — Phase 2 will replace with facebook-nodejs-business-sdk
  return {
    getInsights: async (opts) => {
      throw new Error(
        `[triage-hourly] MetaMarketingClient not yet implemented. ` +
          `Configure META_ACCESS_TOKEN + META_AD_ACCOUNT_ID. opts=${JSON.stringify(opts)}`,
      );
    },
    pauseAd: async (adId) => {
      throw new Error(
        `[triage-hourly] MetaMarketingClient.pauseAd not yet implemented. ad=${adId}`,
      );
    },
    scaleBudget: async (adId, delta) => {
      throw new Error(
        `[triage-hourly] MetaMarketingClient.scaleBudget not yet implemented. ad=${adId} delta=${delta}`,
      );
    },
    duplicateAd: async (adId) => {
      throw new Error(
        `[triage-hourly] MetaMarketingClient.duplicateAd not yet implemented. ad=${adId}`,
      );
    },
    getAccountStatus: async () => {
      throw new Error(
        `[triage-hourly] MetaMarketingClient.getAccountStatus not yet implemented. ` +
          `account=${adAccountId} token=${accessToken ? '[set]' : '[missing]'}`,
      );
    },
  };
}

function buildTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = process.env.TELEGRAM_CHAT_ID ?? '';
  return new TelegramBot({ token, chatId });
}

/**
 * Adapts TelegramBot (which has sendMessage(text, extra)) to AlertSender
 * (which has sendMessage({severity, text})). The spend-cap module uses the
 * AlertSender interface, while TelegramBot exposes the full Telegram API.
 */
function telegramBotAsAlertSender(bot: TelegramBot): AlertSender {
  return {
    sendMessage: async ({ severity, text }) => {
      return bot.sendMessage(`[${severity.toUpperCase()}] ${text}`);
    },
  };
}

function buildDecisionDb() {
  // DB client placeholder. In tests, `pause` (which consumes this) is vi.mocked
  // so the db object is never actually invoked. Phase 2 wires in a real Drizzle client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return null as any;
}

function buildSpendCapDb() {
  // Same: phase 2 replacement with real Drizzle client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return null as any;
}
