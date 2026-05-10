# Patch 04 — Cowork visibility layer (read-only API + scheduled digest + Telegram tier-down) — REVISED

> **Supersedes:** the original Patch 04 produced in the prior Cowork brainstorm session (file:
> `local-agent-mode-sessions/.../outputs/cowork-handoff-2026-05-10/04-cowork-visibility-layer.md`).
> That file was written before the codebase was inspected; several signatures it referenced do not
> exist at HEAD `81aba89`. This revision corrects every leak so the future apply-session can
> copy-paste the snippets without further archaeology.
>
> **Authoritative reference:** `.cowork-meta/phase1-verification-20260510T221911Z/06-signatures-reference.md`
> (consolidates 5 parallel `Explore` reports against HEAD `81aba89`).
>
> All `file:line` citations below are verified against HEAD `81aba89` via that reference.

---

## What's revised

| Original Patch 04 (incorrect) | Corrected against HEAD `81aba89` |
|---|---|
| `getMetaInsights({ level, since, until })` returning aggregated account-level metrics | `fetchMetaInsights({ apiClient, dateFrom, dateTo })` returning `AdMetric[]` (per-ad daily). Aggregation happens in the route handler. |
| `getReconcilerState()` returning `{ last_run, delta_pct }` | `getReconState()` returning `ReconState { suspended, suspendedAt, suspendReason, autoResumeAt, lastDriftPct }`. Drop `last_run` (no equivalent exists). |
| `advertisingDecisions.createdAt`, `.targetId`, `.tier` | `advertisingDecisions.timestamp`, `.adId`, `.reasoningTier` |
| `safetyChecks.find(c => c.check_name === 'brand_voice_overall')` | `BrandVoiceScore` is **not persisted** anywhere at HEAD. Defer `include=brand_voice` to Phase 4. Patch 04 returns `{ status: 'not_implemented', reason: 'Phase 4 dependency (real ClaudeBrandVoiceClient + new advertising_audits table)' }` for that include. |
| `sendAlert(severity, message)` — implicit "every alert is real-time" | Backward-compatible extension: `sendAlert(severity, message, opts?: { tier?: 1 \| 2 })`. Default `tier=1` preserves every existing caller's behavior. |
| Inline digest markdown inside `TelegramBot.sendDailyDigest()` | Extract `buildDigestData(): Promise<DailyDigestReport>` (data fetch) + `formatTelegram(report)` + `formatMarkdown(report)` (pure renderers). Both `TelegramBot.sendDailyDigest()` and `/api/admin/advertising/digest` call the same `buildDigestData()`. |
| Admin auth via Clerk JWT only | Bearer-token via `ADVERTISING_STATUS_BEARER` env. Cowork's WebFetch is server-to-server and cannot carry a Clerk session cookie. Existing `requireAdmin()` callers are unaffected. |

---

## Goal

Build a thin observation surface that Cowork can read via WebFetch, allowing:

1. **On-demand queries** — "what's CPL today" → I fetch JSON, parse, answer.
2. **Scheduled daily digest** — Cowork wakes up at 9:00, fetches markdown digest, presents in inbox with analysis.
3. **Telegram becomes signal-rich** — tier-2 reports leave Telegram, only tier-1 (real-time critical) remain → faster reaction time when Telegram pings.

This **does not replace** Telegram — it tier-downs what flows through it.

## Architecture

```
                  Estrevia advertising agent
                            │
         ┌──────────────────┼─────────────────────┐
         │                  │                     │
   real-time event    cron-triggered        founder asks
   (kill-switch,      digest renderer       in Cowork
   account-emerg,     (scheduled-tasks
   pixel-fail)        skill or Vercel cron)
         │                  │                     │
         ▼                  ▼                     ▼
   Telegram alert    Cowork inbox via      Cowork chat via
   (push to phone)   scheduled task        WebFetch on-demand
                     (push)                (pull)
```

---

## Component 1 — Read-only status endpoint

**New file:** `src/app/api/admin/advertising/status/route.ts`

### Imports (all verified against HEAD `81aba89`)

| Symbol | Source | Verified at |
|---|---|---|
| `fetchMetaInsights`, `MetaInsightsApi` | `@/modules/advertising/perceive` | `src/modules/advertising/perceive/index.ts:1-2` |
| `AdMetric` | `@/shared/types/advertising` (re-export of `perceive.ts`) | `src/shared/types/advertising/perceive.ts:1-16` |
| `createMetaAdClient` | `@/modules/advertising/meta-graph-api` | `src/modules/advertising/meta-graph-api/index.ts:72` |
| `getReconState`, `ReconState` | `@/modules/advertising/perceive/recon-state-store` | `src/modules/advertising/perceive/recon-state-store.ts:25-38` |
| `advertisingDecisions` | `@/shared/lib/schema` | `src/shared/lib/schema.ts:190-211` |
| `getDb` | `@/shared/lib/db` | unchanged from original Patch 04 |

### Complete route handler

```ts
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
```

**Notes on impl:**

- `fetchMetaInsights` returns `AdMetric[]` (per-ad-per-day rows) — verified at `src/modules/advertising/perceive/meta-insights.ts:49-79` and `src/shared/types/advertising/perceive.ts:1-16`. Aggregation is the route handler's job.
- `apiClient` is constructed via `createMetaAdClient()` (which reads `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` from env); same pattern as `src/app/api/cron/advertising/triage-hourly/route.ts:183-184`.
- `advertisingDecisions` columns: `timestamp`, `adId`, `reasoningTier` (verified at `src/shared/lib/schema.ts:190-211`). Index `adv_decisions_timestamp_idx` supports the `gte(timestamp, since)` filter.
- `getReconState()` returns the `ReconState` shape from `src/modules/advertising/perceive/recon-state-store.ts:25-31`. There is no `last_run` field at HEAD.
- All fields PII-free by construction — only ad/creative IDs and metric aggregates.

---

## Component 2 — Daily digest endpoint + builder/renderer extraction

This component lands as **three new files** + **one refactor**:

1. New: `src/modules/advertising/alerts/digest-builder.ts` — pure data fetch.
2. New: `src/modules/advertising/alerts/digest-renderers.ts` — pure renderers (`formatTelegram` + `formatMarkdown`).
3. New: `src/app/api/admin/advertising/digest/route.ts` — Bearer-gated endpoint.
4. Refactor: `src/modules/advertising/alerts/telegram-bot.ts` — `sendDailyDigest()` now calls the builder + Telegram renderer instead of inline-building markdown.

The existing `DailyDigestReport` interface (already exported at `src/modules/advertising/alerts/telegram-bot.ts:43-51`) is the single canonical shape. After refactor, it should move to a dedicated file or stay re-exported.

### 2a. `src/modules/advertising/alerts/digest-builder.ts` (NEW)

```ts
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
```

### 2b. `src/modules/advertising/alerts/digest-renderers.ts` (NEW)

```ts
/**
 * Pure renderers — DailyDigestReport → string.
 *
 * Two output flavors:
 *   - formatTelegram(): Telegram-flavored Markdown (single-asterisk bold,
 *     backtick code spans, emoji prefixes — matches the legacy inline
 *     output of TelegramBot.sendDailyDigest before this refactor).
 *   - formatMarkdown(): CommonMark for Cowork inbox + API consumers
 *     (double-asterisk bold, fenced code, no Telegram escapes).
 *
 * Both render the same DailyDigestReport. Drift between channels is
 * impossible by construction — only renderer logic differs.
 */

import type { DailyDigestReport } from './telegram-bot';

export function formatTelegram(report: DailyDigestReport): string {
  const lines: string[] = [];
  lines.push(`📊 *Advertising Daily Digest — ${report.date}*`);
  lines.push('');
  lines.push(`💰 Spend: $${report.spend_total_usd.toFixed(2)} | 👁 Impressions: ${report.impressions_total.toLocaleString()}`);
  lines.push('');

  if (report.decisions.length > 0) {
    lines.push('*Decisions taken:*');
    for (const d of report.decisions) {
      const icon =
        d.action === 'pause' ? '⏸' :
        d.action === 'scale_up' ? '📈' :
        d.action === 'maintain' ? '✅' :
        '→';
      lines.push(`${icon} \`${d.ad_id}\` — ${d.action} (${d.reason})`);
    }
    lines.push('');
  } else {
    lines.push('_No decisions taken today._');
    lines.push('');
  }

  if (report.brand_voice_scores && report.brand_voice_scores.length > 0) {
    const needsReview = report.brand_voice_scores.filter((s) => s.needs_review);
    if (needsReview.length > 0) {
      lines.push(`⚠️ *Brand voice review needed:* ${needsReview.map((s) => s.ad_id).join(', ')}`);
      lines.push('');
    }
  }

  if (report.shadow_log_summary) {
    lines.push('*Shadow mode log:*');
    lines.push(report.shadow_log_summary);
    lines.push('');
  }

  if (report.founder_action_required) {
    lines.push(`🚨 *Action required:* ${report.founder_action_required}`);
  }

  return lines.join('\n');
}

export function formatMarkdown(report: DailyDigestReport): string {
  const lines: string[] = [];
  lines.push(`# Estrevia advertising — daily digest ${report.date}`);
  lines.push('');
  lines.push('## Spend');
  lines.push(`- Today: $${report.spend_total_usd.toFixed(2)}`);
  lines.push(`- Impressions: ${report.impressions_total.toLocaleString()}`);
  lines.push('');

  lines.push('## Agent decisions');
  if (report.decisions.length > 0) {
    for (const d of report.decisions) {
      lines.push(`- \`${d.ad_id}\` — **${d.action}** (${d.reasoning_tier}, confidence ${(d.confidence * 100).toFixed(0)}%): ${d.reason}`);
    }
  } else {
    lines.push('- _No decisions taken today._');
  }
  lines.push('');

  if (report.brand_voice_scores && report.brand_voice_scores.length > 0) {
    const flagged = report.brand_voice_scores.filter((s) => s.needs_review);
    if (flagged.length > 0) {
      lines.push('## Brand voice — needs review');
      for (const s of flagged) {
        lines.push(`- \`${s.ad_id}\` (overall ${s.overall.toFixed(1)})`);
      }
      lines.push('');
    }
  }

  if (report.shadow_log_summary) {
    lines.push('## Shadow log');
    lines.push(report.shadow_log_summary);
    lines.push('');
  }

  lines.push('## Action required');
  lines.push(report.founder_action_required ?? 'None.');

  return lines.join('\n');
}
```

### 2c. `src/app/api/admin/advertising/digest/route.ts` (NEW)

```ts
/**
 * GET /api/admin/advertising/digest?type=daily
 *
 * Pre-rendered markdown digest for direct presentation in the Cowork
 * inbox. Same Bearer auth as /status (ADVERTISING_STATUS_BEARER).
 *
 * Builds the report via `buildDigestData()` — the same builder
 * `TelegramBot.sendDailyDigest()` calls — then renders with
 * `formatMarkdown()` for CommonMark output. The Telegram bot uses
 * `formatTelegram()` against the identical report, guaranteeing
 * cross-channel alignment.
 *
 * `type=weekly` is reserved; not yet implemented (would call a separate
 * weekly builder once weekly metrics are exposed).
 *
 * Response: text/markdown body.
 */

import { NextResponse } from 'next/server';
import { buildDigestData } from '@/modules/advertising/alerts/digest-builder';
import { formatMarkdown } from '@/modules/advertising/alerts/digest-renderers';

export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get('authorization') ?? '';
  const expected = process.env.ADVERTISING_STATUS_BEARER;
  if (!expected || !auth.startsWith('Bearer ') || auth.slice(7) !== expected) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED' },
      { status: 401, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    );
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'daily';

  if (type !== 'daily' && type !== 'weekly') {
    return NextResponse.json(
      { error: 'INVALID_TYPE', message: 'type must be daily or weekly' },
      { status: 400 },
    );
  }

  if (type === 'weekly') {
    return NextResponse.json(
      { error: 'NOT_IMPLEMENTED', message: 'weekly digest builder not yet wired; deferred to Phase 4' },
      { status: 501 },
    );
  }

  const report = await buildDigestData();
  const markdown = formatMarkdown(report);

  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
```

### 2d. Refactor `TelegramBot.sendDailyDigest()`

The current `sendDailyDigest()` builds markdown inline at `src/modules/advertising/alerts/telegram-bot.ts:112-158`. Replace the body with calls to `buildDigestData()` + `formatTelegram()`. The signature still accepts an optional `report` arg so existing callers that pre-build the report (with `brand_voice_scores` / `shadow_log_summary` populated) continue to work — when no report is passed, the bot self-builds.

```diff
--- a/src/modules/advertising/alerts/telegram-bot.ts
+++ b/src/modules/advertising/alerts/telegram-bot.ts
@@ -1,6 +1,8 @@
 import type { AdDecision, BrandVoiceScore } from '@/shared/types/advertising';
+import { buildDigestData } from './digest-builder';
+import { formatTelegram } from './digest-renderers';

@@ -108,53 +110,21 @@
   /**
    * Sends a formatted daily digest to the founder.
-   * Format: date header + decisions summary + spend + optional shadow log + action item
+   *
+   * If `report` is omitted, builds it from current state via
+   * `buildDigestData()`. Callers that need to attach optional
+   * `brand_voice_scores` / `shadow_log_summary` / `founder_action_required`
+   * fields should pre-build the report and pass it in.
+   *
+   * Rendering is delegated to `formatTelegram()` — the same shape is
+   * exposed at `GET /api/admin/advertising/digest` via `formatMarkdown()`,
+   * so the Telegram push and the Cowork pull never drift.
    */
-  async sendDailyDigest(report: DailyDigestReport): Promise<TelegramMessage> {
-    const lines: string[] = [];
-
-    lines.push(`📊 *Advertising Daily Digest — ${report.date}*`);
-    lines.push('');
-
-    // Spend + impressions overview
-    lines.push(`💰 Spend: $${report.spend_total_usd.toFixed(2)} | 👁 Impressions: ${report.impressions_total.toLocaleString()}`);
-    lines.push('');
-
-    // Decisions summary
-    if (report.decisions.length > 0) {
-      lines.push('*Decisions taken:*');
-      for (const d of report.decisions) {
-        const icon = d.action === 'pause' ? '⏸' : d.action === 'scale_up' ? '📈' : d.action === 'maintain' ? '✅' : '→';
-        lines.push(`${icon} \`${d.ad_id}\` — ${d.action} (${d.reason})`);
-      }
-      lines.push('');
-    } else {
-      lines.push('_No decisions taken today._');
-      lines.push('');
-    }
-
-    // Brand voice scores if provided
-    if (report.brand_voice_scores && report.brand_voice_scores.length > 0) {
-      const needsReview = report.brand_voice_scores.filter((s) => s.needs_review);
-      if (needsReview.length > 0) {
-        lines.push(`⚠️ *Brand voice review needed:* ${needsReview.map((s) => s.ad_id).join(', ')}`);
-        lines.push('');
-      }
-    }
-
-    // Shadow log summary
-    if (report.shadow_log_summary) {
-      lines.push('*Shadow mode log:*');
-      lines.push(report.shadow_log_summary);
-      lines.push('');
-    }
-
-    // Founder action required
-    if (report.founder_action_required) {
-      lines.push(`🚨 *Action required:* ${report.founder_action_required}`);
-    }
-
-    const text = lines.join('\n');
-    return this.sendMessage(text, { parse_mode: 'Markdown' });
+  async sendDailyDigest(report?: DailyDigestReport): Promise<TelegramMessage> {
+    const data = report ?? (await buildDigestData());
+    const text = formatTelegram(data);
+    return this.sendMessage(text, { parse_mode: 'Markdown' });
   }
```

---

## Component 3 — Cowork scheduled task

*(Cowork-side configuration only; no Estrevia code change.)*

In Cowork, create a scheduled task (using the `schedule` skill / `mcp__scheduled-tasks__create_scheduled_task` tool):

**Schedule:** every day at 9:00 local time.

**Prompt:**

```
Fetch the Estrevia daily advertising digest and present it in my Cowork inbox.

1. WebFetch GET https://estrevia.app/api/admin/advertising/digest?type=daily
   Authorization: Bearer <ADVERTISING_STATUS_BEARER from CLAUDE.md or memory>

2. The response is a markdown document. Render it directly.

3. After the digest, add a 1-paragraph analysis:
   - Compare today's spend against the 7-day rolling average (call
     /api/admin/advertising/status?include=spend&since=<7d-ago-ISO> for the baseline)
   - If reconciler is suspended or last_drift_pct crossed 25%, flag it
   - If any creative crossed frequency 2.5, recommend refresh action
   - If none of the above, just say "No action needed."

4. End with one line: "Reply with `details X` to dive into any item."

Be brief. The user reads this on mobile in the morning.
```

**Result:** every day at 9:00, the Cowork inbox has a parsed and analyzed digest with commentary. The founder can reply with follow-ups (e.g., "details 3") and I'll dive into specific items via the same `/status` endpoint.

For weekly retro: separate scheduled task on Mondays at 9:00, with `?type=weekly` — gated on the Phase 4 weekly-builder landing first.

---

## Component 4 — Telegram tier classification

Audit the existing alerts in `src/modules/advertising/alerts/` and split into tiers.

### Tier 1 — KEEP on Telegram (real-time push)

| Alert | Source | Why tier 1 |
|---|---|---|
| Account suspension | `perceive/meta-insights.ts` checks `disable_reason` | Need to react in <30 min |
| Kill-switch tripped | `safety/kill-switch.ts` | Something seriously wrong; need to know now |
| Pixel/CAPI events stopped | `perceive/posthog-funnel.ts` zero-event check | Lost conversion data; degrades optimization |
| Daily spend > 2× rolling baseline | new check in triage-hourly | $$ at risk |
| `account-emergency` policy fired | `senior-buyer/policies/account-emergency.ts` | By definition emergency |
| Reconciler `suspended: true` | `perceive/recon-state-store.ts` | Attribution broken — agent paused |
| Ad rejected by Meta + strike registered | upload-client error path | 3 strikes = ban |
| `requestApproval(HIGH_RISK)` from `senior-buyer/approval-router.ts` | already tier-1 by design | Blocking decision needs founder input |

### Tier 2 — MOVE to Cowork digest

| Alert | Currently in Telegram? | Move because |
|---|---|---|
| Daily digest (decisions, spend, top/bottom creatives) | ✓ `sendDailyDigest()` | Better in Cowork: richer formatting, follow-up questions, no Telegram char-limit |
| Weekly account health summary | ✓ `weekly-account-health.ts` | Same |
| Brand voice drift trends | partial | Trends need 30+ datapoints — Telegram is wrong format |
| `requestApproval(LOW_RISK)` for non-blocking decisions | ✓ — currently in Telegram | If LOW_RISK auto-approves after 4h anyway, founder can review the next morning in digest |
| Creative fatigue list (freq >2.5) | partial | Not urgent (24h window OK); move to digest |
| Bayesian decision log | partial | Cumulative — better as digest section |
| Audience refresh-cycle reports | ? | Operational, not urgent |

### Implementation — backward-compatible `sendAlert` extension

The current `sendAlert` signature is positional `(severity, message)` at `src/modules/advertising/alerts/telegram-bot.ts:163-171`. Every existing caller passes exactly two args. To add tier-gating without touching call sites, extend with an **optional** third arg whose default behavior matches today's semantics.

```diff
--- a/src/modules/advertising/alerts/telegram-bot.ts
+++ b/src/modules/advertising/alerts/telegram-bot.ts
@@ -160,13 +160,42 @@
   /**
    * Sends a severity-labelled alert message to the founder.
+   *
+   * Tier gating (added in Patch 04):
+   *   tier 1 (default) — always sends, regardless of env flag.
+   *   tier 2           — suppressed when ADVERTISING_TIER2_VIA_DIGEST=true.
+   *                      Returns null so callers can handle the no-op case.
+   *
+   * Default `tier=1` preserves existing behavior for every caller that
+   * does not pass the third arg. Migrate call sites incrementally as
+   * documented in the Tier 2 table.
    */
-  async sendAlert(severity: AlertSeverity, message: string): Promise<TelegramMessage> {
+  async sendAlert(
+    severity: AlertSeverity,
+    message: string,
+    opts: { tier?: 1 | 2 } = {},
+  ): Promise<TelegramMessage | null> {
+    const tier = opts.tier ?? 1;
+    if (tier === 2 && process.env.ADVERTISING_TIER2_VIA_DIGEST === 'true') {
+      // Suppressed — picked up by the daily digest builder instead.
+      return null;
+    }
     const icons: Record<AlertSeverity, string> = {
       info: 'ℹ️',
       warning: '⚠️',
       critical: '🚨',
     };
     const text = `${icons[severity]} *[${severity.toUpperCase()}]* ${message}`;
     return this.sendMessage(text, { parse_mode: 'Markdown' });
   }
```

**Migration path:**

1. Land the signature change with `ADVERTISING_TIER2_VIA_DIGEST=false` default (today's behavior preserved).
2. Mark tier-2 alert sites with `{ tier: 2 }` — they still fire to Telegram because the flag is `false`.
3. After Cowork digest verified for 1–2 weeks, flip `ADVERTISING_TIER2_VIA_DIGEST=true` → tier-2 alerts stop reaching Telegram, only tier-1 push survives.

**Return-type note:** existing callers that destructure or chain off `sendAlert` results need to handle `null`. Search call sites with `grep -rn "\.sendAlert(" src/` before flipping the env. Most callers ignore the return value; the ones that don't can be updated in the same patch.

---

## Env additions

```diff
--- a/.env.example
+++ b/.env.example
@@ -106,3 +106,11 @@
 ADVERTISING_DAILY_SPEND_CAP_USD=80
 ADVERTISING_AGENT_ENABLED=false
 ADVERTISING_AGENT_DRY_RUN=true
+
+# Bearer token for Cowork to read /api/admin/advertising/status + /digest.
+# Generate via: openssl rand -hex 32
+# Add to Vercel `production` env. Rotate quarterly.
+ADVERTISING_STATUS_BEARER=
+
+# When true, tier-2 alerts (sendAlert(..., { tier: 2 })) are suppressed from
+# Telegram and surfaced only via the daily Cowork digest. Default false
+# preserves pre-Patch-04 behavior. Flip after Cowork digest verified.
+ADVERTISING_TIER2_VIA_DIGEST=false
```

Generate the bearer via `openssl rand -hex 32`. Add to Vercel `production` env. Mirror to the Cowork-side store (CLAUDE.md or scheduled-task memory) so the WebFetch can read it.

---

## Phasing recommendation

**Week 1**: Ship `/status` endpoint + Bearer token in production. Test with manual `curl`. No Cowork integration yet.

**Week 2**: Ship `/digest` endpoint + `digest-builder` + `digest-renderers` refactor (shared between Telegram + API). Refactor `TelegramBot.sendDailyDigest()` to call the new builder/renderer. Set up scheduled Cowork task. Run alongside Telegram for 1 week — both fire, founder receives both.

**Week 3**: Verify Cowork digest is reliable. Mark tier-2 call sites with `{ tier: 2 }`. Flip `ADVERTISING_TIER2_VIA_DIGEST=true` → tier-2 alerts stop hitting Telegram. Telegram now only fires for tier-1.

**Week 4+**: Adjust tier classification based on real signal-to-noise. Some events may stay dual-channel (Telegram + Cowork) — that's fine, label them tier-1.

---

## Tests

`__tests__/api/admin/advertising/status.test.ts`:
- 401 when Bearer missing, malformed, or wrong.
- 200 + correct shape when authed.
- `include` filter respected (only requested branches populated).
- `since` filter respected (decisions DB query bounded by `gte(timestamp, since)`).
- `aggregateSpend()` correctness: zero metrics → zeros; weighted ctr / cpc / frequency math.
- `aggregateFatigued()` correctness: only ads with weighted-mean freq > 2.5 surface; recommendation buckets at 3.0 / 3.5.
- `include=brand_voice` returns `{ status: 'not_implemented', reason: 'Phase 4 dependency (real ClaudeBrandVoiceClient + new advertising_audits table)' }`.
- `include=reconciler` exposes `suspended`, `suspended_at`, `last_drift_pct` (verify no `last_run` field).
- No PII in any response branch (no `email`, no `userId`, no `birth_*` fields).

`__tests__/modules/advertising/alerts/digest-builder.test.ts`:
- Builds report with empty metrics (no live ads) — `spend_total_usd: 0`, `decisions: []`.
- Decisions populated from DB rows mapped via `adId → ad_id`, `reasoningTier → reasoning_tier`.
- `metricsSnapshot` correctly typed back into `AdMetric`.

`__tests__/modules/advertising/alerts/digest-renderers.test.ts`:
- Same `DailyDigestReport` → `formatTelegram` output matches the pre-refactor inline-built string exactly (regression-anchor against `src/modules/advertising/alerts/telegram-bot.ts:112-158` legacy output).
- `formatMarkdown` produces well-formed CommonMark (heading levels, action-required section always present).
- Edge cases: empty decisions, no brand voice scores, `founder_action_required` present/absent.

`__tests__/modules/advertising/alerts/telegram-bot.test.ts` (extend existing):
- `sendAlert(severity, message)` (two-arg) still works — defaults to tier 1, always sends.
- `sendAlert(severity, message, { tier: 2 })` returns `null` when `ADVERTISING_TIER2_VIA_DIGEST=true`, sends when flag is unset / `false`.
- `sendDailyDigest()` (no-arg) auto-builds via `buildDigestData()`.
- `sendDailyDigest(report)` (with arg) bypasses the builder.

> **Brand voice persistence test cannot land in Patch 04** — `BrandVoiceScore` is not persisted at HEAD. Add it together with the Phase 4 `advertising_audits` migration.

---

## Effort + risk

- `/status` endpoint + aggregators: ~3 hours (aggregation math + 6 include branches + tests)
- `digest-builder` + `digest-renderers` + `/digest` endpoint: ~2 hours
- `TelegramBot.sendDailyDigest()` refactor + regression anchor: ~1 hour
- Backward-compat `sendAlert` extension + flag: ~1 hour
- Cowork scheduled task: 5 minutes
- Tests: ~2 hours
- **Total: ~1 day**

Risk: low. All read-only on the Estrevia side. Bearer token rotates independently. Default `ADVERTISING_TIER2_VIA_DIGEST=false` means the refactor lands without changing Telegram behavior — flip later when confidence is established. If `/status` or `/digest` goes down, the Telegram bot still works as before — no degradation of the tier-1 flow.

---

## What does NOT belong in this layer

- **Mutations** (pause, scale, approve) — those stay in admin UI / Telegram approval flow / agent's own decide-loop. Cowork is read-only.
- **PII** — never expose user emails, IPs, individual events. Aggregates only.
- **Live monitoring** — not a real-time stream; snapshot only. For real-time, Telegram tier-1 is right.
- **Brand-voice persistence schema** — the new `advertising_audits` table is a Phase 4 concern. Patch 04 surfaces a `not_implemented` stub so the API contract is forward-compatible.

---

## After Patch 04 is shipped

Conversational queries from Cowork that become natural:

- "что у меня по spend сегодня"
- "покажи последние решения agent'а"
- "какие креативы выгорели"
- "когда последний раз падал reconciler"
- "сколько ads в DISAPPROVED за неделю"

I make a single WebFetch call to `/status?include=...&since=...`, parse, answer in plain language. No third-party MCP needed. Telegram остаётся тем, чем должен быть — экстренный сигнал.
