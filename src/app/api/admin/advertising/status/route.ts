/**
 * GET /api/admin/advertising/status
 *
 * Read-only snapshot of advertising agent state for Cowork visibility.
 *
 * Auth: Bearer token via Authorization header. Token is checked against
 * ADVERTISING_STATUS_BEARER env var (rotate periodically).
 *
 * Why Bearer not Clerk JWT: Cowork's WebFetch tool sends the request
 * server-to-server and can't carry a Clerk session cookie. Bearer token
 * is the simplest auth that works for this use case. Existing
 * `requireAdmin()`-gated admin routes are unaffected.
 *
 * Query params:
 *   include  comma-separated subset of:
 *            spend, decisions, fatigued, brand_voice, reconciler,
 *            account_health, audiences
 *            Default: spend,decisions,fatigued
 *   since    ISO timestamp — restrict decisions/spend to events after this.
 *            Default: 24h ago.
 *
 * Response: JSON snapshot. Never includes PII (no individual user info).
 *
 * Example:
 *   curl https://estrevia.app/api/admin/advertising/status?include=spend,decisions,fatigued \
 *        -H "Authorization: Bearer $ADVERTISING_STATUS_BEARER"
 */

import { NextResponse } from 'next/server';
import { gte, desc } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { advertisingDecisions } from '@/shared/lib/schema';
import { fetchMetaInsights } from '@/modules/advertising/perceive';
import { getReconState } from '@/modules/advertising/perceive/recon-state-store';
import { createMetaAdClient } from '@/modules/advertising/meta-graph-api';
import type { AdMetric } from '@/shared/types/advertising';

interface StatusInclude {
  spend: boolean;
  decisions: boolean;
  fatigued: boolean;
  brand_voice: boolean;
  reconciler: boolean;
  account_health: boolean;
  audiences: boolean;
}

function parseInclude(raw: string | null): StatusInclude {
  const items = (raw ?? 'spend,decisions,fatigued').split(',').map((s) => s.trim());
  return {
    spend: items.includes('spend'),
    decisions: items.includes('decisions'),
    fatigued: items.includes('fatigued'),
    brand_voice: items.includes('brand_voice'),
    reconciler: items.includes('reconciler'),
    account_health: items.includes('account_health'),
    audiences: items.includes('audiences'),
  };
}

function parseSince(raw: string | null): Date {
  if (!raw) return new Date(Date.now() - 24 * 60 * 60 * 1000);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(Date.now() - 24 * 60 * 60 * 1000) : d;
}

function toIsoDate(d: Date): string {
  // YYYY-MM-DD in UTC — Meta Insights API contract
  return d.toISOString().slice(0, 10);
}

interface SpendAggregate {
  spend_usd: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc_usd: number;
  cpm_usd: number;
  reach: number;
  frequency_avg: number;
  ad_count: number;
}

/**
 * Aggregates the per-ad-per-day `AdMetric[]` returned by `fetchMetaInsights`
 * into a single account-level snapshot for the response payload.
 *
 * Weighted averages (ctr, cpc, frequency) are computed against the
 * underlying totals to avoid Simpson's-paradox style mis-aggregation.
 */
function aggregateSpend(metrics: AdMetric[]): SpendAggregate {
  if (metrics.length === 0) {
    return {
      spend_usd: 0, impressions: 0, clicks: 0,
      ctr: 0, cpc_usd: 0, cpm_usd: 0,
      reach: 0, frequency_avg: 0, ad_count: 0,
    };
  }
  let spend = 0, impressions = 0, clicks = 0, reach = 0, frequencyWeighted = 0;
  const adIds = new Set<string>();
  for (const m of metrics) {
    spend += m.spend_usd;
    impressions += m.impressions;
    clicks += m.clicks;
    reach += m.reach;
    frequencyWeighted += m.frequency * m.impressions;
    adIds.add(m.ad_id);
  }
  return {
    spend_usd: spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    cpc_usd: clicks > 0 ? spend / clicks : 0,
    cpm_usd: impressions > 0 ? (spend / impressions) * 1000 : 0,
    reach,
    frequency_avg: impressions > 0 ? frequencyWeighted / impressions : 0,
    ad_count: adIds.size,
  };
}

interface FatiguedEntry {
  ad_id: string;
  frequency: number;
  ctr: number;
  spend_usd: number;
  days_running: number;
  recommendation: 'pause_now' | 'refresh_creative' | 'monitor';
}

/**
 * Collapses 7-day per-ad-per-day metrics into a single per-ad row, then
 * filters to ads whose 7d-mean frequency exceeds 2.5.
 *
 * Done client-side because `fetchMetaInsights` returns per-day rows; the
 * Meta API itself does support filtering by frequency, but our typed
 * client at HEAD does not expose that filter, so we aggregate locally.
 */
function aggregateFatigued(metrics: AdMetric[]): FatiguedEntry[] {
  const byAd = new Map<string, { spend: number; impressions: number; clicks: number; frequencyWeighted: number; daysRunning: number }>();
  for (const m of metrics) {
    const cur = byAd.get(m.ad_id) ?? { spend: 0, impressions: 0, clicks: 0, frequencyWeighted: 0, daysRunning: 0 };
    cur.spend += m.spend_usd;
    cur.impressions += m.impressions;
    cur.clicks += m.clicks;
    cur.frequencyWeighted += m.frequency * m.impressions;
    cur.daysRunning = Math.max(cur.daysRunning, m.days_running);
    byAd.set(m.ad_id, cur);
  }
  const out: FatiguedEntry[] = [];
  for (const [adId, agg] of byAd) {
    const freq = agg.impressions > 0 ? agg.frequencyWeighted / agg.impressions : 0;
    if (freq <= 2.5) continue;
    out.push({
      ad_id: adId,
      frequency: freq,
      ctr: agg.impressions > 0 ? agg.clicks / agg.impressions : 0,
      spend_usd: agg.spend,
      days_running: agg.daysRunning,
      recommendation:
        freq > 3.5 ? 'pause_now' :
        freq > 3.0 ? 'refresh_creative' :
                     'monitor',
    });
  }
  return out.sort((a, b) => b.frequency - a.frequency);
}

export async function GET(request: Request): Promise<NextResponse> {
  // 1. Auth — Bearer token
  const auth = request.headers.get('authorization') ?? '';
  const expected = process.env.ADVERTISING_STATUS_BEARER;
  if (!expected || !auth.startsWith('Bearer ') || auth.slice(7) !== expected) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED' },
      { status: 401, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    );
  }

  const url = new URL(request.url);
  const include = parseInclude(url.searchParams.get('include'));
  const since = parseSince(url.searchParams.get('since'));
  const now = new Date();
  const db = getDb();
  const apiClient = createMetaAdClient();

  const result: Record<string, unknown> = {
    ts: now.toISOString(),
    since: since.toISOString(),
  };

  // 2. Spend / metrics overview (aggregated from per-ad-per-day rows)
  if (include.spend) {
    const metrics = await fetchMetaInsights({
      apiClient,
      dateFrom: toIsoDate(since),
      dateTo: toIsoDate(now),
    });
    const agg = aggregateSpend(metrics);
    result.spend = {
      spend_usd: agg.spend_usd,
      impressions: agg.impressions,
      clicks: agg.clicks,
      ctr: agg.ctr,
      cpc_usd: agg.cpc_usd,
      cpm_usd: agg.cpm_usd,
      reach: agg.reach,
      frequency_avg: agg.frequency_avg,
      ad_count: agg.ad_count,
      // NOTE: conversions / CPL are not exposed on AdMetric at HEAD. When
      // attribution is wired through Stripe + PostHog reconcile, add a
      // `conversions` and `cpl_blended_usd` field here.
    };
  }

  // 3. Recent agent decisions
  if (include.decisions) {
    const rows = await db
      .select()
      .from(advertisingDecisions)
      .where(gte(advertisingDecisions.timestamp, since))
      .orderBy(desc(advertisingDecisions.timestamp))
      .limit(50);

    result.decisions = rows.map((r) => ({
      id: r.id,
      action: r.action,
      ad_id: r.adId,
      reasoning_tier: r.reasoningTier,
      reason: r.reason,
      confidence: r.confidence,
      delta_budget_usd: r.deltaBudgetUsd,
      applied: r.applied,
      applied_at: r.appliedAt ? r.appliedAt.toISOString() : null,
      decided_at: r.timestamp.toISOString(),
    }));
  }

  // 4. Fatigued creatives — 7d window, frequency > 2.5 (computed client-side)
  if (include.fatigued) {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const metrics7d = await fetchMetaInsights({
      apiClient,
      dateFrom: toIsoDate(sevenDaysAgo),
      dateTo: toIsoDate(now),
    });
    result.fatigued = aggregateFatigued(metrics7d);
  }

  // 5. Brand-voice scorer results
  //
  // Brand voice scoring is computed transiently inside the `retro-weekly`
  // cron via `auditTopCreatives()` and is NOT persisted (verified at HEAD
  // `81aba89`: no `advertising_audits` table, no `brand_voice_overall`
  // column on `advertisingCreatives.safetyChecks`).
  //
  // Phase 4 dependency: real `ClaudeBrandVoiceClient` (currently mocked at
  // `src/app/api/cron/advertising/retro-weekly/route.ts:270-283`) plus a
  // new `advertising_audits` table.
  if (include.brand_voice) {
    result.brand_voice = {
      status: 'not_implemented',
      reason: 'Phase 4 dependency (real ClaudeBrandVoiceClient + new advertising_audits table)',
    };
  }

  // 6. Reconciler state — Meta vs PostHog drift
  //
  // `ReconState` tracks the suspended-during-drift lifecycle, NOT a
  // complete audit log of every reconciler run. No `last_run` equivalent
  // exists at HEAD — we surface `suspendedAt` (last time drift triggered
  // a suspend) and `lastDriftPct`. If/when a true "last run" timestamp
  // is added, extend this branch.
  if (include.reconciler) {
    const recon = await getReconState();
    const driftPct = recon.lastDriftPct ?? 0;
    result.reconciler = {
      suspended: recon.suspended,
      suspended_at: recon.suspendedAt ? recon.suspendedAt.toISOString() : null,
      suspend_reason: recon.suspendReason,
      auto_resume_at: recon.autoResumeAt ? recon.autoResumeAt.toISOString() : null,
      last_drift_pct: driftPct,
      status:
        driftPct < 25 ? 'healthy' :
        driftPct < 50 ? 'warning' :
                        'critical',
    };
  }

  // 7. Account health — for tier-1 alerts cross-check
  //
  // `AdMetric.status` already encodes per-ad enabled/paused/disapproved
  // state. Surfacing it counts as a lightweight account-health proxy
  // until a dedicated account-level health endpoint is wired.
  if (include.account_health) {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const metrics7d = await fetchMetaInsights({
      apiClient,
      dateFrom: toIsoDate(sevenDaysAgo),
      dateTo: toIsoDate(now),
    });
    const adState = new Map<string, AdMetric['status']>();
    for (const m of metrics7d) adState.set(m.ad_id, m.status);
    const counts = { ACTIVE: 0, PAUSED: 0, DELETED: 0, DISAPPROVED: 0 };
    for (const status of adState.values()) counts[status] += 1;
    result.account_health = {
      ads_by_status: counts,
      total_ads_seen_7d: adState.size,
      note: 'Derived from AdMetric.status. Replace with dedicated account-status pull when wired.',
    };
  }

  // 8. Audiences (custom audience refresh state)
  //
  // Audience-row store wiring lands in Phase 4. For Patch 04, surface a
  // not-implemented stub so the include flag is forward-compatible.
  if (include.audiences) {
    result.audiences = {
      status: 'not_implemented',
      reason: 'Phase 4 dependency (audience-row-store read API not yet exposed)',
    };
  }

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
