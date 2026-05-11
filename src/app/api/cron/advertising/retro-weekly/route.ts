/**
 * GET /api/cron/advertising/retro-weekly
 *
 * Vercel Cron — runs weekly on Mondays at 09:00 UTC (schedule: "0 9 * * 1").
 * Weekly retrospective: brand-voice audit of top creatives, drop-off funnel
 * review, audience activation gate evaluation, and a weekly retro report
 * sent to Telegram.
 *
 * Protected by CRON_SECRET. Respects ADVERTISING_AGENT_ENABLED kill switch.
 * Respects ADVERTISING_AGENT_DRY_RUN: logs results without sending to Telegram.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { assertCronAuth } from '@/shared/lib/cron-auth';
import { getDb } from '@/shared/lib/db';
import { auditTopCreatives } from '@/modules/advertising/decide/brand-voice-audit';
import { saveBrandVoiceScores } from '@/modules/advertising/decide/brand-voice-store';
import { ClaudeBrandVoiceClient } from '@/modules/advertising/creative-gen/clients';
import { runDailyDropOffCheck, InMemoryDropOffStore } from '@/modules/advertising/alerts/drop-off-monitor';
import { evaluateGates } from '@/modules/advertising/decide/feature-gates';
import { TelegramBot } from '@/modules/advertising/alerts/telegram-bot';
import { isDryRun } from '@/modules/advertising/safety/kill-switch';
import { fetchMetaInsights } from '@/modules/advertising/perceive/meta-insights';
import { createMetaAdClient } from '@/modules/advertising/meta-graph-api';
import type { MetaInsightsApi } from '@/modules/advertising/perceive/meta-insights';
import type { ClaudeClientForBrandVoice, CreativeBundleWithSpend } from '@/modules/advertising/decide/brand-voice-audit';
import type { DropOffPosthogClient, DropOffClaudeClient } from '@/modules/advertising/alerts/drop-off-monitor';
import type { GatesDb } from '@/modules/advertising/decide/feature-gates';
import type { AdMetric, BrandVoiceScore } from '@/shared/types/advertising';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 1. Auth
  const authError = assertCronAuth(request);
  if (authError) return authError;

  // 2. Kill switch
  if (process.env.ADVERTISING_AGENT_ENABLED !== 'true') {
    return NextResponse.json({ success: false, reason: 'kill_switch' });
  }

  // 3. Weekly retrospective
  try {
    const dryRun = isDryRun();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const telegramBot = buildTelegramBot();
    const claudeForBrandVoice = buildClaudeForBrandVoice();
    const claudeForDropOff = buildClaudeForDropOff();
    const posthogClient = buildPosthogClient();
    const gatesDb = buildGatesDb();
    const metaApiClient = buildMetaApiClient();

    // --- Step 1: Brand-voice audit of top creatives ---
    const creatives = await fetchTopCreativesWithSpend(metaApiClient, weekAgo, now);
    let brandVoiceScores: BrandVoiceScore[] = [];
    if (claudeForBrandVoice !== null && creatives.length > 0) {
      brandVoiceScores = await auditTopCreatives(creatives, claudeForBrandVoice);
      if (brandVoiceScores.length > 0) {
        await saveBrandVoiceScores(brandVoiceScores);
      }
    }

    const needsReviewCount = brandVoiceScores.filter((s) => s.needs_review).length;

    // --- Step 2: Drop-off funnel review ---
    // Use in-memory store at weekly cadence (persistent store in Phase 2)
    const dropOffStore = new InMemoryDropOffStore();
    const dropOffResult = await runDailyDropOffCheck({
      posthog: posthogClient,
      telegram: telegramBot,
      store: dropOffStore,
      claude: claudeForDropOff,
      today: now.toISOString().slice(0, 10),
    });

    // --- Step 3: Evaluate audience activation gates ---
    // Pull ad-level Meta-Insights for the past 7 days and aggregate into the
    // shape evaluateGates expects: total_impressions = sum across rows;
    // days_running = median across active ad-set rows (filter d > 0). Until
    // these read real values, gates were stuck at 0 / 0 and could never mature
    // past their `min_impressions_per_creative` (5_000) and `min_days_running`
    // (14) thresholds. Fetch failures fall back to zeros so the cron still
    // completes — Sentry already wraps the outer try/catch.
    const weeklyMetricsDateFrom = weekAgo.toISOString().slice(0, 10);
    const weeklyMetricsDateTo = now.toISOString().slice(0, 10);
    const weeklyMetrics = await fetchMetaInsights({
      apiClient: metaApiClient,
      dateFrom: weeklyMetricsDateFrom,
      dateTo: weeklyMetricsDateTo,
    }).catch((err) => {
      console.warn(
        '[retro-weekly] failed to fetch weekly metrics for gates evaluation, using zeros:',
        err,
      );
      return [] as AdMetric[];
    });

    const total_impressions = weeklyMetrics.reduce(
      (sum, m) => sum + (m.impressions ?? 0),
      0,
    );
    const days_running = medianDaysRunning(weeklyMetrics);

    const updatedGates = await evaluateGates(
      { total_impressions, days_running },
      gatesDb,
    );

    const activeGates = updatedGates.filter(
      (g) => g.mode === 'active_auto' || g.mode === 'active_proposal',
    );

    // --- Step 4: Send weekly retro report to Telegram ---
    const retroLines: string[] = [
      `📅 *Weekly Retro — ${now.toISOString().slice(0, 10)}*`,
      '',
      `*Brand Voice Audit:* ${brandVoiceScores.length} creatives audited, ${needsReviewCount} need review`,
    ];

    if (needsReviewCount > 0) {
      const reviewIds = brandVoiceScores
        .filter((s) => s.needs_review)
        .map((s) => s.ad_id)
        .join(', ');
      retroLines.push(`  ⚠️ Review needed: ${reviewIds}`);
    }

    retroLines.push('');
    retroLines.push(
      `*Drop-off Monitor:* ${dropOffResult.status} (${dropOffResult.baseline_sample_count} baseline samples)`,
    );

    if (dropOffResult.alerts.length > 0) {
      retroLines.push(`  🚨 ${dropOffResult.alerts.length} drop-off alert(s) detected`);
    }

    retroLines.push('');
    retroLines.push(`*Feature Gates:* ${updatedGates.length} total, ${activeGates.length} active`);

    const retroMessage = retroLines.join('\n');

    if (dryRun) {
      console.info('[retro-weekly][dry-run] would send retro report:', retroMessage);
    } else {
      try {
        await telegramBot.sendAlert('info', retroMessage);
      } catch (alertErr) {
        console.error('[retro-weekly] Telegram alert failed:', alertErr);
      }
    }

    const summary = {
      ran_at: now.toISOString(),
      dry_run: dryRun,
      brand_voice: {
        creatives_audited: brandVoiceScores.length,
        needs_review: needsReviewCount,
      },
      drop_off: {
        status: dropOffResult.status,
        baseline_samples: dropOffResult.baseline_sample_count,
        alerts: dropOffResult.alerts.length,
      },
      gates: {
        total: updatedGates.length,
        active: activeGates.length,
      },
    };

    console.info('[cron/advertising/retro-weekly] completed', summary);
    return NextResponse.json({ success: true, summary });
  } catch (e) {
    console.error('[cron/advertising/retro-weekly] failed', e);
    Sentry.captureException(e, {
      tags: {
        cron: true,
        route: '/api/cron/advertising/retro-weekly',
        db_layer: 'drizzle',
        cron_route: '/api/cron/advertising/retro-weekly',
      },
    });
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Dependency factories
// ---------------------------------------------------------------------------

function buildMetaApiClient(): MetaInsightsApi {
  // Reuse the same Graph API adapter that triage-daily / triage-hourly use
  // (MetaAdManagementClient). createMetaAdClient() reads META_ACCESS_TOKEN
  // and META_AD_ACCOUNT_ID from env and throws if missing — production has
  // both set; tests inject a mock via vi.mock('@/modules/advertising/meta-graph-api').
  return createMetaAdClient();
}

/**
 * Median of `days_running` over rows where `days_running > 0`. For an even
 * count, returns the upper-middle element (index = floor(n/2)) — picking the
 * higher of the two middles is a deliberate small-bias toward "more days
 * running" which is the right side for gate-maturation thresholds.
 *
 * Returns 0 when no rows have positive days_running.
 */
function medianDaysRunning(metrics: AdMetric[]): number {
  const sorted = metrics
    .map((m) => m.days_running ?? 0)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

async function fetchTopCreativesWithSpend(
  metaApiClient: MetaInsightsApi,
  since: Date,
  until: Date,
): Promise<CreativeBundleWithSpend[]> {
  try {
    const insights = await metaApiClient.getInsights({
      time_range: {
        since: since.toISOString().slice(0, 10),
        until: until.toISOString().slice(0, 10),
      },
      level: 'ad',
      fields: ['ad_id', 'spend'],
    });

    // Phase 2: fetch real ad copy from Meta creative API.
    // For now, return placeholder CreativeBundle shapes with spend data.
    return insights.map((insight): CreativeBundleWithSpend => ({
      id: insight.ad_id,
      hook_template_id: '',
      asset: {
        id: '',
        kind: 'image',
        generator: 'imagen-4-fast',
        prompt_used: '',
        url: '',
        width: 0,
        height: 0,
        cost_usd: 0,
        created_at: new Date(),
      },
      copy: '',   // Phase 2: fetch real copy from Meta creative API
      cta: '',
      locale: 'en',
      status: 'live',
      safety_checks: [],
      spend_usd: insight.spend_usd,
    }));
  } catch (err) {
    console.warn('[retro-weekly] failed to fetch top creatives, skipping brand-voice audit:', err);
    return [];
  }
}

function buildPosthogClient(): DropOffPosthogClient {
  return {
    getFunnel: async (opts) => {
      // Phase 2: posthog-node SDK integration
      throw new Error(
        `[retro-weekly] PostHog getFunnel not yet implemented. opts=${JSON.stringify(opts)}`,
      );
    },
  };
}

export function buildClaudeForBrandVoice(): ClaudeClientForBrandVoice | null {
  if (process.env.BRAND_VOICE_SCORER_ENABLED !== 'true') {
    return null;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — required for ClaudeBrandVoiceClient when BRAND_VOICE_SCORER_ENABLED=true');
  }
  return new ClaudeBrandVoiceClient({ anthropicApiKey: apiKey });
}

function buildClaudeForDropOff(): DropOffClaudeClient {
  return {
    anomalyExplain: async (_prompt: string) => {
      // Phase 2: real Claude API call for anomaly context
      return 'anomaly-explain not yet available in MVP';
    },
  };
}

function buildTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID ?? '';
  return new TelegramBot({ token, chatId });
}

function buildGatesDb(): GatesDb {
  // Real Drizzle client. The structural GatesDb interface in
  // feature-gates.ts is satisfied by the Drizzle db's select/insert/update
  // methods on the advertising_feature_gates table. evaluateGates is
  // safe on an empty table — returns [] when no rows present.
  return getDb() as unknown as GatesDb;
}
