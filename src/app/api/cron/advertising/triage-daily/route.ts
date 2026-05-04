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
import { getDb } from '@/shared/lib/db';
import { fetchMetaInsights } from '@/modules/advertising/perceive/meta-insights';
import { fetchFunnelSnapshot } from '@/modules/advertising/perceive/posthog-funnel';
import { fetchStripeAttribution } from '@/modules/advertising/perceive/stripe-attribution';
import { reconcile } from '@/modules/advertising/perceive/reconciler';
import { checkAutoResume } from '@/modules/advertising/perceive/recon-state-store';
import { decide } from '@/modules/advertising/decide/orchestrator';
import { decideBayesian } from '@/modules/advertising/decide/tier-2-bayesian';
import { pause } from '@/modules/advertising/act/pause';
import { scale } from '@/modules/advertising/act/scale';
import { duplicate } from '@/modules/advertising/act/duplicate';
import { writeDailySnapshot } from '@/modules/advertising/senior-buyer/metric-history';
import {
  listAdSetsByPhase,
  upsertAdSetState,
  recordPhaseTransition,
  recordMaturityTransition,
} from '@/modules/advertising/senior-buyer/state-store';
import { classifyMaturity } from '@/modules/advertising/senior-buyer/data-maturity-classifier';
import { runDriftTriggeredCalibration } from '@/modules/advertising/senior-buyer/auto-calibrator';
import { resolveThreshold } from '@/modules/advertising/senior-buyer/threshold-resolver';
import { getMetaAdClient } from '@/modules/advertising/act';
import { createMetaAdClient } from '@/modules/advertising/meta-graph-api';
import { createPosthogFunnelClient } from '@/modules/advertising/posthog/funnel-client';
import { createStripeAttributionClient } from '@/modules/advertising/stripe/attribution-client';
import { TelegramBot } from '@/modules/advertising/alerts/telegram-bot';
import { isDryRun } from '@/modules/advertising/safety/kill-switch';
import type { MetaInsightsApi } from '@/modules/advertising/perceive/meta-insights';
import type { PosthogFunnelApi } from '@/modules/advertising/perceive/posthog-funnel';
import type { StripeAttributionApi } from '@/modules/advertising/perceive/stripe-attribution';
import type { MetaAdClient } from '@/modules/advertising/act/meta-marketing';
import type { AlertSender, SpendCapDb } from '@/modules/advertising/safety/spend-cap';
import type { DecisionLogDb } from '@/modules/advertising/audit/decision-log';
import type { AdMetric, DecisionRecord } from '@/shared/types/advertising';

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

    // Build dependencies.
    // metaApiClient: insights + perceive (real Graph API adapter via createMetaAdClient)
    // actClient:     act-layer operations (getMetaAdClient() — real MetaAdManagementClient in prod)
    const metaApiClient = buildMetaApiClient();
    const actClient = getMetaAdClient();
    const posthogClient = buildPosthogClient();
    const stripeClient = await buildStripeClient();
    const telegramBot = buildTelegramBot();
    const decisionDb = buildDecisionDb();
    const spendCapDb = buildSpendCapDb();

    // Auto-resume check: if the agent has been suspended by a previous
    // reconciler critical_drift and the 24h window has elapsed, clear the
    // suspended flag at the top of this run. The next reconcile() further
    // down may re-suspend if drift is still present.
    let autoResumed = false;
    try {
      const resumeResult = await checkAutoResume();
      if (resumeResult.resumed) {
        autoResumed = true;
        console.info('[triage-daily] reconciler auto-resumed after 24h');
        try {
          await telegramBot.sendMessage(
            `ℹ️ Advertising agent reconciler auto-resumed after 24h. ` +
              `Next reconcile() will re-suspend if drift persists.`,
          );
        } catch (alertErr) {
          console.error('[triage-daily] auto-resume alert failed:', alertErr);
        }
      }
    } catch (resumeErr) {
      // Auto-resume check failure is non-fatal — log and continue. The
      // reconciler will still detect drift and suspend; if already suspended,
      // the orchestrator gate stays in effect.
      console.error('[triage-daily] auto-resume check failed:', resumeErr);
      Sentry.captureException(resumeErr, {
        tags: {
          cron: true,
          route: '/api/cron/advertising/triage-daily',
          subsystem: 'reconciler',
        },
      });
    }

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
        // Q4 hybrid attribution: reconciler aligns with Meta's 7d_click window
        // for apples-to-apples comparison. Ad-set-level callsites (audience-
        // refresh) default to 14d for ROAS/CPA decisions.
        attributionWindowDays: 7,
      }),
      fetchStripeAttribution({
        apiClient: stripeClient,
        windowStart: yesterday,
        windowEnd: now,
      }),
    ]);

    // --- Step 1b: Persist daily snapshots + drift-triggered calibration +
    //              phase / maturity transitions (senior-buyer mode).
    //
    // Failures here are non-fatal: we still want decide()/act()/digest to
    // run even if the new senior-buyer plumbing isn't ready (e.g. no
    // ad_set_state rows seeded yet during early rollout).
    const seniorBuyerSummary = await runSeniorBuyerDailyExtension(metrics, todayStr);

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
            metaApi: actClient,
            insightsApi: metaApiClient,
            telegramBot: alertSender,
            spendCapDb,
            decisionDb,
          });
          records.push(record);
          pauseCount++;
        } else if (decision.action === 'scale_up' || decision.action === 'scale_down') {
          const record = await scale(decision, {
            metaApi: actClient,
            insightsApi: metaApiClient,
            telegramBot: alertSender,
            spendCapDb,
            decisionDb,
          });
          records.push(record);
          scaleCount++;
        } else if (decision.action === 'duplicate') {
          const record = await duplicate(decision, {
            metaApi: actClient,
            insightsApi: metaApiClient,
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
          tags: {
            cron: true,
            route: '/api/cron/advertising/triage-daily',
            db_layer: 'drizzle',
            cron_route: '/api/cron/advertising/triage-daily',
          },
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
      auto_resumed: autoResumed,
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
      senior_buyer: seniorBuyerSummary,
    };

    console.info('[cron/advertising/triage-daily] completed', summary);
    return NextResponse.json({ success: true, summary });
  } catch (e) {
    console.error('[cron/advertising/triage-daily] failed', e);
    Sentry.captureException(e, {
      tags: {
        cron: true,
        route: '/api/cron/advertising/triage-daily',
        db_layer: 'drizzle',
        cron_route: '/api/cron/advertising/triage-daily',
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

function buildMetaApiClient(): MetaInsightsApi & MetaAdClient {
  return createMetaAdClient();
}

function buildPosthogClient(): PosthogFunnelApi {
  return createPosthogFunnelClient();
}

async function buildStripeClient(): Promise<StripeAttributionApi> {
  return createStripeAttributionClient();
}

function buildTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID ?? '';
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

// ---------------------------------------------------------------------------
// Senior-buyer daily extension (T24)
// ---------------------------------------------------------------------------

interface SeniorBuyerDailySummary {
  snapshots_written: number;
  drift_calibrations_run: number;
  maturity_transitions: number;
  phase_transitions: number;
  errors: number;
}

/**
 * Wraps the senior-buyer daily plumbing in a single helper so the route's
 * happy-path stays readable. Any failure inside is non-fatal — the rest of
 * decide() / act() / digest still runs even if the new tables aren't
 * populated yet (e.g. early rollout before any ad_set_state rows exist).
 */
async function runSeniorBuyerDailyExtension(
  metrics: AdMetric[],
  todayStr: string,
): Promise<SeniorBuyerDailySummary> {
  const summary: SeniorBuyerDailySummary = {
    snapshots_written: 0,
    drift_calibrations_run: 0,
    maturity_transitions: 0,
    phase_transitions: 0,
    errors: 0,
  };

  // 1. Daily snapshot per (adset_id, today). Aggregate sibling ads under the
  //    same ad set so multiple AdMetric rows collapse into one history row
  //    rather than racing through onConflictDoUpdate.
  const aggregated = aggregateMetricsByAdSet(metrics);
  for (const snap of aggregated.values()) {
    try {
      await writeDailySnapshot({
        adSetId: snap.adSetId,
        date: todayStr,
        impressions: snap.impressions,
        clicks: snap.clicks,
        spendUsd: snap.spendUsd,
        ctr: snap.ctr,
        cpc: snap.cpc,
        cpm: snap.cpm,
        frequency: snap.frequency,
        // PostHog/Stripe joins land in a follow-up cron pass; for MVP we
        // persist Meta-side metrics only and leave conversions/revenue at 0.
        conversionsMeta: 0,
        conversionsPosthog: 0,
        revenueUsd: 0,
        roas: null,
      });
      summary.snapshots_written += 1;
    } catch (err) {
      summary.errors += 1;
      console.warn(
        `[triage-daily][senior-buyer] writeDailySnapshot failed for ${snap.adSetId}:`,
        err,
      );
      Sentry.captureException(err, {
        tags: {
          cron: true,
          route: '/api/cron/advertising/triage-daily',
          subsystem: 'senior-buyer/snapshot',
        },
        extra: { ad_set_id: snap.adSetId, date: todayStr },
      });
    }
  }

  // 2. Drift-triggered calibration check across all live ad sets.
  let liveAdSets: Awaited<ReturnType<typeof listAdSetsByPhase>> = [];
  try {
    liveAdSets = await listAdSetsByPhase(['B', 'C', 'D']);
  } catch (err) {
    summary.errors += 1;
    console.warn('[triage-daily][senior-buyer] listAdSetsByPhase failed:', err);
    Sentry.captureException(err, {
      tags: {
        cron: true,
        route: '/api/cron/advertising/triage-daily',
        subsystem: 'senior-buyer/list',
      },
    });
    return summary;
  }

  for (const adSet of liveAdSets) {
    try {
      await runDriftTriggeredCalibration(adSet.adSetId, adSet.campaignId);
      summary.drift_calibrations_run += 1;
    } catch (err) {
      summary.errors += 1;
      console.warn(
        `[triage-daily][senior-buyer] drift calibration failed for ${adSet.adSetId}:`,
        err,
      );
      Sentry.captureException(err, {
        tags: {
          cron: true,
          route: '/api/cron/advertising/triage-daily',
          subsystem: 'senior-buyer/drift',
        },
        extra: { ad_set_id: adSet.adSetId },
      });
    }
  }

  // 3. Phase + maturity transition checks (Phase B → C, COLD_START →
  //    CALIBRATING → AUTONOMOUS, etc.). Threshold values resolve per ad
  //    set so DB overrides win over code defaults.
  for (const adSet of liveAdSets) {
    try {
      // Maturity reclassification — baseline_cv hidden in COLD_START
      // (insufficient sample), default to 0; auto-calibrator owns the
      // cv-aware reclassification once it has a real baseline.
      const newMaturity = classifyMaturity({
        conversions_total_meta: adSet.conversionsTotalMeta,
        days_with_pixel_data: adSet.daysWithPixelData,
        baseline_cv: 0,
      });
      if (newMaturity !== adSet.dataMaturityMode) {
        await recordMaturityTransition(
          adSet.adSetId,
          adSet.dataMaturityMode as 'COLD_START' | 'CALIBRATING' | 'AUTONOMOUS',
          newMaturity,
          `auto_classify_${newMaturity}`,
          {
            conversions_total_meta: adSet.conversionsTotalMeta,
            days_with_pixel_data: adSet.daysWithPixelData,
          },
        );
        await upsertAdSetState({
          adSetId: adSet.adSetId,
          campaignId: adSet.campaignId,
          locale: adSet.locale,
          dataMaturityMode: newMaturity,
        });
        summary.maturity_transitions += 1;
      }

      // Phase B → C transition (spec Q5): per-ad-set threshold so founder
      // overrides win over the 50/7d default.
      if (adSet.currentPhase === 'B') {
        const phaseBToCThreshold = await resolveThreshold(
          'phase_b_to_c_conv_meta_7d',
          { ad_set_id: adSet.adSetId, campaign_id: adSet.campaignId },
        );
        if (adSet.conversions7dMeta >= phaseBToCThreshold) {
          await recordPhaseTransition(
            adSet.adSetId,
            'B',
            'C',
            `meta_default_${phaseBToCThreshold}/7d`,
            { conversions_7d_meta: adSet.conversions7dMeta },
          );
          await upsertAdSetState({
            adSetId: adSet.adSetId,
            campaignId: adSet.campaignId,
            locale: adSet.locale,
            currentPhase: 'C',
          });
          summary.phase_transitions += 1;
        }
      }
    } catch (err) {
      summary.errors += 1;
      console.warn(
        `[triage-daily][senior-buyer] transition check failed for ${adSet.adSetId}:`,
        err,
      );
      Sentry.captureException(err, {
        tags: {
          cron: true,
          route: '/api/cron/advertising/triage-daily',
          subsystem: 'senior-buyer/transitions',
        },
        extra: { ad_set_id: adSet.adSetId },
      });
    }
  }

  return summary;
}

interface AggregatedAdSetSnapshot {
  adSetId: string;
  impressions: number;
  clicks: number;
  spendUsd: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
}

/**
 * Collapses ad-level Meta Insights rows into one snapshot per ad set.
 * Sums impressions/clicks/spend, recomputes ratios from those sums so
 * CTR/CPC/CPM stay arithmetically consistent. Frequency is impression-
 * weighted across sibling ads.
 */
function aggregateMetricsByAdSet(metrics: AdMetric[]): Map<string, AggregatedAdSetSnapshot> {
  type Acc = AggregatedAdSetSnapshot & { _freqWeightSum: number; _freqAcc: number };
  const acc = new Map<string, Acc>();
  for (const m of metrics) {
    if (!m.adset_id) continue;
    const existing = acc.get(m.adset_id);
    if (existing) {
      existing.impressions += m.impressions;
      existing.clicks += m.clicks;
      existing.spendUsd += m.spend_usd;
      existing._freqAcc += m.frequency * m.impressions;
      existing._freqWeightSum += m.impressions;
    } else {
      acc.set(m.adset_id, {
        adSetId: m.adset_id,
        impressions: m.impressions,
        clicks: m.clicks,
        spendUsd: m.spend_usd,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        frequency: 0,
        _freqAcc: m.frequency * m.impressions,
        _freqWeightSum: m.impressions,
      });
    }
  }

  const out = new Map<string, AggregatedAdSetSnapshot>();
  for (const [id, s] of acc) {
    out.set(id, {
      adSetId: s.adSetId,
      impressions: s.impressions,
      clicks: s.clicks,
      spendUsd: s.spendUsd,
      ctr: s.impressions > 0 ? s.clicks / s.impressions : 0,
      cpc: s.clicks > 0 ? s.spendUsd / s.clicks : 0,
      cpm: s.impressions > 0 ? (s.spendUsd / s.impressions) * 1000 : 0,
      frequency: s._freqWeightSum > 0 ? s._freqAcc / s._freqWeightSum : 0,
    });
  }
  return out;
}
