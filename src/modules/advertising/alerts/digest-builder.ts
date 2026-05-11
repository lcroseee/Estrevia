/**
 * Daily-digest data builder — pure data fetch, no rendering.
 *
 * Single source of truth for the digest payload. Called by:
 *   - TelegramBot.sendDailyDigest() (push channel)
 *   - GET /api/admin/advertising/digest (pull channel for Cowork)
 *
 * Both channels render the same DailyDigestReport via formatTelegram() /
 * formatMarkdown() — guarantees Telegram and Cowork inbox never drift.
 */

import { gte, desc } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingDecisions } from '@/shared/lib/schema';
import { fetchMetaInsights } from '@/modules/advertising/perceive';
import { createMetaAdClient } from '@/modules/advertising/meta-graph-api';
import type { DailyDigestReport } from './telegram-bot';
import type { AdDecision } from '@/shared/types/advertising';

export interface BuildDigestDataOptions {
  /** Default: today (UTC). */
  date?: Date;
}

/**
 * Builds the digest payload from current state. Reads from:
 *   - Meta Insights (today's spend + impressions)
 *   - advertising_decisions table (today's logged decisions)
 *
 * Does NOT compute brand-voice scores or shadow-log summary — those are
 * provided by callers that already have them (e.g. retro-weekly cron).
 */
export async function buildDigestData(opts: BuildDigestDataOptions = {}): Promise<DailyDigestReport> {
  const today = opts.date ?? new Date();
  const startOfDayUtc = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  ));
  const dateIso = startOfDayUtc.toISOString().slice(0, 10);

  // 1. Today's per-ad metrics → aggregate spend + impressions
  const apiClient = createMetaAdClient();
  const metrics = await fetchMetaInsights({
    apiClient,
    dateFrom: dateIso,
    dateTo: dateIso,
  });
  let spendTotal = 0;
  let impressionsTotal = 0;
  for (const m of metrics) {
    spendTotal += m.spend_usd;
    impressionsTotal += m.impressions;
  }

  // 2. Today's decisions, newest first
  const db = getDb();
  const rows = await db
    .select()
    .from(advertisingDecisions)
    .where(gte(advertisingDecisions.timestamp, startOfDayUtc))
    .orderBy(desc(advertisingDecisions.timestamp))
    .limit(50);

  const decisions: AdDecision[] = rows.map((r) => ({
    ad_id: r.adId,
    action: r.action,
    delta_budget_usd: r.deltaBudgetUsd ?? undefined,
    reason: r.reason,
    reasoning_tier: r.reasoningTier,
    confidence: r.confidence,
    metrics_snapshot: r.metricsSnapshot as AdDecision['metrics_snapshot'],
  }));

  return {
    date: dateIso,
    decisions,
    spend_total_usd: spendTotal,
    impressions_total: impressionsTotal,
    // brand_voice_scores, shadow_log_summary, founder_action_required are
    // populated by upstream callers (retro-weekly cron, safety modules)
    // and merged into the report before send. Not built here.
  };
}
