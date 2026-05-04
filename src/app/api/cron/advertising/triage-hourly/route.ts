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
import { getDb } from '@/shared/lib/db';
import { fetchMetaInsights } from '@/modules/advertising/perceive/meta-insights';
import { decide } from '@/modules/advertising/decide/orchestrator';
import { currentMode } from '@/modules/advertising/decide/feature-gates';
import { pause } from '@/modules/advertising/act/pause';
import { getMetaAdClient } from '@/modules/advertising/act';
import { createMetaAdClient } from '@/modules/advertising/meta-graph-api';
import { TelegramBot } from '@/modules/advertising/alerts/telegram-bot';
import { isDryRun } from '@/modules/advertising/safety/kill-switch';
import type { MetaInsightsApi } from '@/modules/advertising/perceive/meta-insights';
import type { MetaAdClient } from '@/modules/advertising/act/meta-marketing';
import type { AlertSender, SpendCapDb } from '@/modules/advertising/safety/spend-cap';
import type { DecisionLogDb } from '@/modules/advertising/audit/decision-log';
import type { GatesDb, Mode } from '@/modules/advertising/decide/feature-gates';
import type { DecisionRecord, FeatureGate } from '@/shared/types/advertising';

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
  // Track seniorBuyerMode outside the try/catch so the error path can tag
  // Sentry events with `subsystem: 'senior-buyer'` when the gate is on.
  let seniorBuyerMode: Mode | 'on' = 'off';
  try {
    const dryRun = isDryRun();

    // Build dependencies — real implementations use env vars in production.
    // metaApiClient: insights + perceive (buildMetaApiClient stub → Phase 2: real insights adapter)
    // actClient:     act-layer operations (getMetaAdClient() — real MetaAdManagementClient in prod)
    const metaApiClient = buildMetaApiClient();
    const actClient = getMetaAdClient();
    const telegramBot = buildTelegramBot();
    const decisionDb = buildDecisionDb();
    const spendCapDb = buildSpendCapDb();

    // Read seniorBuyerMode gate. When on, decide() (rewritten in v3b T22) routes
    // through the senior-buyer phase-evaluator instead of legacy Tier 1/2/3.
    // The gate is treated as a hard kill-switch — non-'off' = senior-buyer flow.
    // A DB read failure is non-fatal: fall back to legacy path ('off').
    try {
      seniorBuyerMode = await currentMode(
        'seniorBuyerMode',
        getDb() as unknown as GatesDb,
      );
    } catch (gateErr) {
      console.warn(
        '[triage-hourly] seniorBuyerMode gate read failed; defaulting to off',
        gateErr,
      );
      seniorBuyerMode = 'off';
    }

    // Build gates list passed to decide(). Post-T22, the orchestrator reads
    // `gates.find(g => g.feature_id === 'seniorBuyerMode')?.mode` to choose
    // between legacy Tier 1 and the senior-buyer phase-evaluator.
    const gates: FeatureGate[] =
      seniorBuyerMode !== 'off'
        ? [
            {
              feature_id: 'seniorBuyerMode',
              // Cast: T22 extends Mode union with 'on'; until then we widen at the
              // boundary so the gate flows through to the orchestrator unchanged.
              mode: seniorBuyerMode as FeatureGate['mode'],
              activation_criteria: {},
              current_state: {},
            },
          ]
        : [];

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
    // When seniorBuyerMode='on', decide() ignores tier-2/tier-3 deps and
    // dispatches to the senior-buyer phase-evaluator (T22).
    const { decisions } = await decide(metrics, gates, {
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
        metaApi: actClient,
        insightsApi: metaApiClient,
        telegramBot: telegramBotAsAlertSender(telegramBot),
        spendCapDb,
        decisionDb,
      });
      records.push(record);
    }

    const summary = {
      ran_at: now.toISOString(),
      dry_run: dryRun,
      senior_buyer_mode: seniorBuyerMode,
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
      tags: {
        cron: true,
        route: '/api/cron/advertising/triage-hourly',
        db_layer: 'drizzle',
        cron_route: '/api/cron/advertising/triage-hourly',
        // Surface senior-buyer subsystem in Sentry when the gate is on so
        // alerts route to the right runbook and triage owner.
        ...(seniorBuyerMode !== 'off' ? { subsystem: 'senior-buyer' } : {}),
      },
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
 * Builds a Meta API client using env vars (META_ACCESS_TOKEN, META_AD_ACCOUNT_ID).
 * Returns the real Graph API adapter; tests mock this factory via vi.mock on
 * `@/modules/advertising/meta-graph-api`.
 */
function buildMetaApiClient(): MetaInsightsApi & MetaAdClient {
  return createMetaAdClient();
}

function buildTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID ?? '';
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

function buildDecisionDb(): DecisionLogDb {
  // Real Drizzle client. The structural DecisionLogDb interface in
  // decision-log.ts is satisfied by the Drizzle db's insert() chain on the
  // advertising_decision_log table. The `as unknown as` cast bridges the
  // structural interface (mock-shape) to the real Drizzle client type.
  return getDb() as unknown as DecisionLogDb;
}

function buildSpendCapDb(): SpendCapDb {
  // Real Drizzle client. Same structural-cast rationale as buildDecisionDb.
  return getDb() as unknown as SpendCapDb;
}
