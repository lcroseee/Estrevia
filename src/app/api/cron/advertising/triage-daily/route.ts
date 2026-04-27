/**
 * GET /api/cron/advertising/triage-daily
 *
 * Vercel Cron — runs daily at 09:00 UTC (schedule: "0 9 * * *").
 * Full pipeline: Meta insights + PostHog funnel + Stripe attribution,
 * source reconciliation, full decide() (Tier 1 + Tier 2 + Tier 3),
 * act on all decisions, and send daily digest to Telegram.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 * Respects ADVERTISING_AGENT_DRY_RUN: logs decisions without calling Meta API.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { fetchMetaInsights } from '@/modules/advertising/perceive/meta-insights';
import { fetchFunnelSnapshot } from '@/modules/advertising/perceive/posthog-funnel';
import { fetchStripeAttribution } from '@/modules/advertising/perceive/stripe-attribution';
import { reconcile } from '@/modules/advertising/perceive/reconciler';
import { decide } from '@/modules/advertising/decide/orchestrator';
import { decideBayesian } from '@/modules/advertising/decide/tier-2-bayesian';
import { pause } from '@/modules/advertising/act/pause';
import { scale } from '@/modules/advertising/act/scale';
import { duplicate } from '@/modules/advertising/act/duplicate';
import { TelegramBot } from '@/modules/advertising/alerts/telegram-bot';
import { isDryRun } from '@/modules/advertising/safety/kill-switch';
import type { MetaInsightsApi } from '@/modules/advertising/perceive/meta-insights';
import type { PosthogFunnelApi } from '@/modules/advertising/perceive/posthog-funnel';
import type { StripeAttributionApi } from '@/modules/advertising/perceive/stripe-attribution';
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

  // 3. Full daily triage pipeline
  try {
    const dryRun = isDryRun();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateStr = yesterday.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    // Build dependencies
    const metaApiClient = buildMetaApiClient();
    const posthogClient = buildPosthogClient();
    const stripeClient = buildStripeClient();
    const telegramBot = buildTelegramBot();
    const decisionDb = buildDecisionDb();
    const spendCapDb = buildSpendCapDb();

    // --- Step 1: Perceive — pull all data sources in parallel ---
    const [metrics, funnelSnapshot, stripeAttributions] = await Promise.all([
      fetchMetaInsights({
        apiClient: metaApiClient,
        dateFrom: dateStr,
        dateTo: todayStr,
        retryBaseMs: 500,
      }),
      fetchFunnelSnapshot({
        apiClient: posthogClient,
        windowStart: yesterday,
        windowEnd: now,
      }),
      fetchStripeAttribution({
        apiClient: stripeClient,
        windowStart: yesterday,
        windowEnd: now,
      }),
    ]);

    // --- Step 2: Reconcile sources (alerts on critical drift) ---
    const reconciliation = await reconcile(metrics, funnelSnapshot, {
      alertBot: telegramBot,
    });

    // --- Step 3: Decide — full pipeline (Tier 1 + Tier 2 + Tier 3) ---
    // Gates loaded from DB in Phase 2 — pass empty array for now (Tier 2 disabled by default).
    // Baselines loaded from DB in Phase 2 — pass empty Map (Tier 3 skipped when no baseline).
    // Tier 2 is always injected via DI; the gate controls whether it actually fires.
    const { decisions, shadowLog } = await decide(
      metrics,
      [],
      {
        claudeClient: {
          // AnomalyExplainClient signature: (metric: AdMetric, context: string) => Promise<string>
          // Phase 2: wire real Claude API call for anomaly context
          anomalyExplain: async (_metric, _context) => 'anomaly-explain not yet available in MVP',
        },
        baselines: new Map(),
        tier2Decide: async (metric) => decideBayesian(metric),
      },
    );

    // --- Step 4: Act — apply all non-trivial decisions ---
    const records: DecisionRecord[] = [];
    let pauseCount = 0;
    let scaleCount = 0;
    let duplicateCount = 0;

    for (const decision of decisions) {
      if (decision.action === 'maintain' || decision.action === 'hold') continue;

      if (dryRun) {
        console.info(
          `[triage-daily][dry-run] would ${decision.action} ad:`,
          decision.ad_id,
          decision.reason,
        );
        continue;
      }

      try {
        const alertSender = telegramBotAsAlertSender(telegramBot);
        if (decision.action === 'pause') {
          const record = await pause(decision, {
            metaApi: metaApiClient,
            telegramBot: alertSender,
            spendCapDb,
            decisionDb,
          });
          records.push(record);
          pauseCount++;
        } else if (decision.action === 'scale_up' || decision.action === 'scale_down') {
          const record = await scale(decision, {
            metaApi: metaApiClient,
            telegramBot: alertSender,
            spendCapDb,
            decisionDb,
          });
          records.push(record);
          scaleCount++;
        } else if (decision.action === 'duplicate') {
          const record = await duplicate(decision, {
            metaApi: metaApiClient,
            telegramBot: alertSender,
            spendCapDb,
            decisionDb,
          });
          records.push(record);
          duplicateCount++;
        }
      } catch (actErr) {
        // Individual action failures are logged but don't abort the run
        console.error(
          `[triage-daily] action ${decision.action} failed for ad ${decision.ad_id}:`,
          actErr,
        );
        Sentry.captureException(actErr, {
          tags: { cron: true, route: '/api/cron/advertising/triage-daily' },
          extra: { ad_id: decision.ad_id, action: decision.action },
        });
      }
    }

    // --- Step 5: Send daily digest to Telegram ---
    const totalSpend = metrics.reduce((sum, m) => sum + m.spend_usd, 0);
    const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
    const shadowLogSummary =
      shadowLog.length > 0
        ? `${shadowLog.length} shadow decision(s) recorded`
        : undefined;

    if (!dryRun) {
      try {
        await telegramBot.sendDailyDigest({
          date: todayStr,
          decisions,
          spend_total_usd: totalSpend,
          impressions_total: totalImpressions,
          shadow_log_summary: shadowLogSummary,
        });
      } catch (digestErr) {
        // Digest failure is non-fatal — already tracked by Sentry in the bot
        console.error('[triage-daily] digest send failed:', digestErr);
      }
    }

    const summary = {
      ran_at: now.toISOString(),
      dry_run: dryRun,
      metrics_pulled: metrics.length,
      stripe_attributions: stripeAttributions.length,
      reconciliation_status: reconciliation.status,
      decisions_made: decisions.length,
      shadow_log_entries: shadowLog.length,
      actions_executed: records.length,
      pauses: pauseCount,
      scales: scaleCount,
      duplicates: duplicateCount,
      audit_records_written: records.length,
    };

    console.info('[cron/advertising/triage-daily] completed', summary);
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

// ---------------------------------------------------------------------------
// Dependency factories — read from env vars in production.
// Override via vi.mock in tests.
// ---------------------------------------------------------------------------

function buildMetaApiClient(): MetaInsightsApi & MetaAdClient {
  // Phase 2: replace with facebook-nodejs-business-sdk adapter
  return {
    getInsights: async (opts) => {
      throw new Error(
        `[triage-daily] MetaMarketingClient not yet implemented. opts=${JSON.stringify(opts)}`,
      );
    },
    pauseAd: async (adId) => {
      throw new Error(`[triage-daily] MetaMarketingClient.pauseAd not yet implemented. ad=${adId}`);
    },
    scaleBudget: async (adId, delta) => {
      throw new Error(
        `[triage-daily] MetaMarketingClient.scaleBudget not yet implemented. ad=${adId} delta=${delta}`,
      );
    },
    duplicateAd: async (adId) => {
      throw new Error(
        `[triage-daily] MetaMarketingClient.duplicateAd not yet implemented. ad=${adId}`,
      );
    },
    getAccountStatus: async () => {
      throw new Error(`[triage-daily] MetaMarketingClient.getAccountStatus not yet implemented.`);
    },
  };
}

function buildPosthogClient(): PosthogFunnelApi {
  // Phase 2: replace with posthog-node SDK integration
  return {
    getFunnel: async (opts) => {
      throw new Error(
        `[triage-daily] PostHog getFunnel not yet implemented. opts=${JSON.stringify(opts)}`,
      );
    },
  };
}

function buildStripeClient(): StripeAttributionApi {
  // Phase 2: replace with stripe SDK integration
  return {
    listSubscriptionsCreatedBetween: async (opts) => {
      throw new Error(
        `[triage-daily] Stripe listSubscriptionsCreatedBetween not yet implemented. ` +
          `from=${opts.created_gte.toISOString()}`,
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
 * Adapts TelegramBot (sendMessage(text, extra)) to AlertSender
 * (sendMessage({severity, text})). The spend-cap module uses AlertSender.
 */
function telegramBotAsAlertSender(bot: TelegramBot): AlertSender {
  return {
    sendMessage: async ({ severity, text }) => {
      return bot.sendMessage(`[${severity.toUpperCase()}] ${text}`);
    },
  };
}

function buildDecisionDb() {
  // DB client placeholder. In tests, `pause`/`scale`/`duplicate` are vi.mocked
  // so the db object is never actually invoked. Phase 2 wires in a real Drizzle client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return null as any;
}

function buildSpendCapDb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return null as any;
}
