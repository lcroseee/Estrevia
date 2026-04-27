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
import { auditTopCreatives } from '@/modules/advertising/decide/brand-voice-audit';
import { runDailyDropOffCheck, InMemoryDropOffStore } from '@/modules/advertising/alerts/drop-off-monitor';
import { evaluateGates } from '@/modules/advertising/decide/feature-gates';
import { TelegramBot } from '@/modules/advertising/alerts/telegram-bot';
import { isDryRun } from '@/modules/advertising/safety/kill-switch';
import type { MetaInsightsApi } from '@/modules/advertising/perceive/meta-insights';
import type { ClaudeClientForBrandVoice, CreativeBundleWithSpend } from '@/modules/advertising/decide/brand-voice-audit';
import type { DropOffPosthogClient, DropOffClaudeClient } from '@/modules/advertising/alerts/drop-off-monitor';
import type { GatesDb } from '@/modules/advertising/decide/feature-gates';

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
    const brandVoiceScores =
      creatives.length > 0 ? await auditTopCreatives(creatives, claudeForBrandVoice) : [];

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
    const updatedGates = await evaluateGates(
      {
        total_impressions: 0, // Phase 2: real value from Meta
        days_running: 0,      // Phase 2: real value from DB
      },
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
      tags: { cron: true, route: '/api/cron/advertising/retro-weekly' },
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
  return {
    getInsights: async (_opts) => {
      // Phase 2: facebook-nodejs-business-sdk integration
      return [];
    },
  };
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

function buildClaudeForBrandVoice(): ClaudeClientForBrandVoice {
  return {
    brandVoiceScore: async (_adId: string, _copy: string) => {
      // Phase 2: real Claude API call for brand voice scoring
      return {
        depth: 7,
        scientific: 7,
        respectful: 8,
        no_manipulation: true,
        overall: 7.6,
      };
    },
  };
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
  const chatId = process.env.TELEGRAM_CHAT_ID ?? '';
  return new TelegramBot({ token, chatId });
}

function buildGatesDb(): GatesDb {
  // Phase 2: replace with real Drizzle db
  // Returns a no-op mock that satisfies the interface with empty data
  return {
    select: () => ({
      from: async () => [],
    }),
    insert: () => ({
      values: async () => {},
    }),
    update: () => ({
      set: () => ({
        where: async () => {},
      }),
    }),
  };
}
