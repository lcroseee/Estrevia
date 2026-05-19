# Meta /insights Conversion Data Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Meta /insights `actions[action_type='lead']` data flow end-to-end from Graph API → `advertising_ad_set_state.conversions_7d_meta` / `conversions_total_meta`, unblocking the Tier-1 conversion guard, Phase B→C transition, data-maturity classifier, and LPV→Lead switch.

**Architecture:** Three-call perceive (existing 1-day daily + new 7-day + new 28-day, the latter two via a thin `fetchConversionWindows` wrapper). Parse Meta `actions[]` in `toAdMetric` keyed by a caller-supplied `windowKey`. Aggregate per ad-set in existing `aggregateMetricsByAdSet`. Write via the existing `UpsertAdSetStateInput` fields (`conversions7dMeta` / `conversionsTotalMeta` already exist on the type at `state-store.ts:24-26`). Skip the writer when the upstream fetch threw (preserve old values; schema is `notNull().default(0)`).

**Tech Stack:** TypeScript 6 strict, Vitest, Next.js 16 App Router, Drizzle ORM, Meta Graph API v22.0.

**Spec:** `docs/superpowers/specs/2026-05-18-meta-insights-conversion-flow-design.md`

---

## File Map

**Create:**
- `src/modules/advertising/__tests__/fixtures/meta-insights-actions-response.json` — Meta API response fixture with `actions[]` (Task 2).
- `src/modules/advertising/perceive/conversion-windows.ts` — thin two-call wrapper around `fetchMetaInsights` for 7d + 28d windows with per-window error isolation (Task 10).
- `src/modules/advertising/perceive/__tests__/conversion-windows.test.ts` — unit tests for the wrapper (Task 10).

**Modify:**
- `src/shared/types/advertising/perceive.ts` — extend `AdMetric` with `conversions_total?: number | null` (Task 1).
- `src/modules/advertising/meta-graph-api/ad-client.ts` — extend `MetaInsightsRow`, `getInsights` signature + URL builder, `toAdMetric` parser (Tasks 3-7).
- `src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts` — add 4 new test cases (Tasks 4, 6).
- `src/modules/advertising/perceive/meta-insights.ts` — extend `MetaInsightsApi` interface + `FetchMetaInsightsOptions` with `windowKey` (Task 8).
- `src/modules/advertising/perceive/__tests__/meta-insights.test.ts` — add windowKey-forward test (Task 9).
- `src/modules/advertising/__tests__/mocks/meta-api.ts` — extend mock to match new interface (verify in Task 8).
- `src/app/api/cron/advertising/triage-daily/route.ts` — call `fetchConversionWindows` in perceive block, extend aggregator, plumb conversion fields into upsert calls (Tasks 11-14).
- `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts` — mock `fetchConversionWindows`, add 3 new test cases for triage-daily conversion plumbing (Task 15).
- `src/modules/advertising/decide/__tests__/tier-1-rules.test.ts` — add test confirming guard fires on `conversions_7d=0, days_running=10` (Task 16).

**Verify-only (no code change):**
- `src/modules/advertising/senior-buyer/state-store.ts` — `UpsertAdSetStateInput` already has `conversions7dMeta?: number` / `conversionsTotalMeta?: number` (lines 24-26). Update path strips undefined; insert path defaults to 0.

---

## Task 1: Extend AdMetric type

**Files:**
- Modify: `src/shared/types/advertising/perceive.ts:1-17`

- [ ] **Step 1: Add `conversions_total` field to AdMetric**

Edit `src/shared/types/advertising/perceive.ts`, replace lines 1-17 with:

```ts
export interface AdMetric {
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  date: string; // YYYY-MM-DD UTC
  impressions: number;
  clicks: number;
  spend_usd: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  reach: number;
  days_running: number;
  /** Window-relative lead conversions (7-day click attribution). Populated when getInsights is called with windowKey='conversions_7d'. */
  conversions_7d?: number | null;
  /** Rolling-28-day lead conversions (7-day click attribution). Populated when getInsights is called with windowKey='conversions_total'. */
  conversions_total?: number | null;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'DISAPPROVED';
}
```

- [ ] **Step 2: Run typecheck to find downstream fixture breakage**

Run: `npm run typecheck 2>&1 | head -40`
Expected: zero or few errors. Optional field added to interface is non-breaking. If errors appear in test fixtures, they're pre-existing — leave for Task 17 sweep.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/advertising/perceive.ts
git commit -m "feat(advertising/meta-insights-flow/T1): add conversions_total to AdMetric"
```

---

## Task 2: Create Meta /insights actions fixture

**Files:**
- Create: `src/modules/advertising/__tests__/fixtures/meta-insights-actions-response.json`

- [ ] **Step 1: Write fixture**

Create file with this exact content:

```json
{
  "data": [
    {
      "ad_id": "ad_with_leads",
      "adset_id": "adset_alpha",
      "campaign_id": "campaign_en",
      "date_start": "2026-05-11",
      "date_stop": "2026-05-18",
      "impressions": "12450",
      "clicks": "287",
      "spend": "42.18",
      "ctr": "0.02306",
      "cpc": "0.147",
      "cpm": "3.388",
      "frequency": "1.62",
      "reach": "7691",
      "actions": [
        { "action_type": "link_click", "value": "287", "7d_click": "287" },
        { "action_type": "landing_page_view", "value": "243", "7d_click": "243" },
        { "action_type": "lead", "value": "12", "7d_click": "12" }
      ]
    },
    {
      "ad_id": "ad_no_actions",
      "adset_id": "adset_beta",
      "campaign_id": "campaign_es",
      "date_start": "2026-05-11",
      "date_stop": "2026-05-18",
      "impressions": "3200",
      "clicks": "41",
      "spend": "8.10",
      "ctr": "0.0128",
      "cpc": "0.198",
      "cpm": "2.531",
      "frequency": "1.18",
      "reach": "2712"
    }
  ],
  "paging": { "cursors": { "before": "abc", "after": "xyz" } }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/advertising/__tests__/fixtures/meta-insights-actions-response.json
git commit -m "feat(advertising/meta-insights-flow/T2): Meta /insights actions fixture"
```

---

## Task 3: Extend MetaInsightsRow with actions field

**Files:**
- Modify: `src/modules/advertising/meta-graph-api/ad-client.ts:11-26`

- [ ] **Step 1: Add `actions` to `MetaInsightsRow` interface**

Edit `src/modules/advertising/meta-graph-api/ad-client.ts`, replace lines 12-26 with:

```ts
interface MetaInsightsRow {
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  date_start?: string;
  date_stop?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  reach?: string;
  actions?: Array<{
    action_type: string;
    value: string;
    '1d_click'?: string;
    '7d_click'?: string;
    '28d_click'?: string;
  }>;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -E "ad-client|error" | head -10`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/meta-graph-api/ad-client.ts
git commit -m "feat(advertising/meta-insights-flow/T3): add actions[] to MetaInsightsRow"
```

---

## Task 4: TDD — getInsights forwards actions field + action_attribution_windows

**Files:**
- Modify: `src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts` (add tests inside existing `describe('getInsights', ...)` block ending around line 245)

- [ ] **Step 1: Add failing test**

Find the line `describe('getInsights', () => {` at line 171. Insert a new test BEFORE its closing `});` at approximately line 245:

```ts
    it('forwards action_attribution_windows and includes actions in fields when windowKey provided', async () => {
      const fetchImpl = chainedFetch(ok({ data: [] }));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      await client.getInsights({
        time_range: { since: '2026-05-11', until: '2026-05-18' },
        level: 'ad',
        fields: ['impressions', 'clicks', 'spend'],
        action_attribution_windows: ['7d_click'],
        windowKey: 'conversions_7d',
      });
      const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      // actions must be appended to fields
      expect(decodeURIComponent(url)).toContain('fields=ad_id,adset_id,campaign_id,date_start,date_stop,impressions,clicks,spend,actions');
      // action_attribution_windows must be JSON-encoded array
      expect(url).toContain(encodeURIComponent('["7d_click"]'));
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts -t "forwards action_attribution_windows"`
Expected: FAIL — TypeScript error about `action_attribution_windows`/`windowKey` not existing on opts type, or runtime miss on URL contents.

- [ ] **Step 3: Implement — update getInsights signature + URL builder**

Edit `src/modules/advertising/meta-graph-api/ad-client.ts`, replace lines 95-111 with:

```ts
  async getInsights(opts: {
    time_range: { since: string; until: string };
    level: string;
    fields: string[];
    action_attribution_windows?: Array<'1d_click' | '7d_click' | '1d_view' | '7d_view' | '28d_click'>;
    windowKey?: 'conversions_7d' | 'conversions_total';
  }): Promise<AdMetric[]> {
    const fields = ['ad_id', 'adset_id', 'campaign_id', 'date_start', 'date_stop', ...opts.fields];
    if (opts.windowKey) fields.push('actions');
    const params = new URLSearchParams({
      level: opts.level,
      fields: fields.join(','),
      time_range: JSON.stringify(opts.time_range),
      limit: '500',
    });
    if (opts.action_attribution_windows && opts.action_attribution_windows.length > 0) {
      params.set('action_attribution_windows', JSON.stringify(opts.action_attribution_windows));
    }
    const res = await this.request<MetaInsightsResponse>(
      'GET',
      `/${this.adAccountId}/insights?${params.toString()}`,
    );
    return (res.data ?? []).map((row) => this.toAdMetric(row, opts.time_range, opts.windowKey));
  }
```

- [ ] **Step 4: Update `toAdMetric` signature to accept windowKey (minimal change to compile)**

Still in `ad-client.ts`, replace `private toAdMetric(` at line 161 down to its closing brace at line 183 with:

```ts
  private toAdMetric(
    row: MetaInsightsRow,
    timeRange: { since: string; until: string },
    windowKey?: 'conversions_7d' | 'conversions_total',
  ): AdMetric {
    const date = row.date_start ?? timeRange.since;
    const daysRunning = this.diffDaysInclusive(row.date_start ?? timeRange.since, row.date_stop ?? timeRange.until);
    const out: AdMetric = {
      ad_id: row.ad_id ?? '',
      adset_id: row.adset_id ?? '',
      campaign_id: row.campaign_id ?? '',
      date,
      impressions: this.parseNum(row.impressions),
      clicks: this.parseNum(row.clicks),
      spend_usd: this.parseNum(row.spend),
      ctr: this.parseNum(row.ctr),
      cpc: this.parseNum(row.cpc),
      cpm: this.parseNum(row.cpm),
      frequency: this.parseNum(row.frequency),
      reach: this.parseNum(row.reach),
      days_running: daysRunning,
      status: 'ACTIVE',
    };
    if (windowKey) {
      const leadAction = row.actions?.find((a) => a.action_type === 'lead');
      const rawValue = leadAction?.['7d_click'] ?? leadAction?.value;
      out[windowKey] = leadAction ? this.parseNum(rawValue) : 0;
    }
    return out;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts -t "forwards action_attribution_windows"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/advertising/meta-graph-api/ad-client.ts src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts
git commit -m "feat(advertising/meta-insights-flow/T4): getInsights forwards windows + actions"
```

---

## Task 5: TDD — toAdMetric parses lead conversions

**Files:**
- Modify: `src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts` (extend `describe('getInsights', ...)`)

- [ ] **Step 1: Add three failing tests**

Insert these three tests right after the test added in Task 4 (still inside `describe('getInsights', ...)`, before its closing `});`):

```ts
    it('parses actions[lead].7d_click into AdMetric.conversions_7d when windowKey=conversions_7d', async () => {
      // Reuse the actions fixture loaded synchronously.
      const fixture = await import('../../__tests__/fixtures/meta-insights-actions-response.json');
      const fetchImpl = chainedFetch(ok(fixture.default ?? fixture));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.getInsights({
        time_range: { since: '2026-05-11', until: '2026-05-18' },
        level: 'ad',
        fields: ['impressions', 'clicks', 'spend'],
        action_attribution_windows: ['7d_click'],
        windowKey: 'conversions_7d',
      });
      expect(res).toHaveLength(2);
      const withLeads = res.find((r) => r.ad_id === 'ad_with_leads');
      const noActions = res.find((r) => r.ad_id === 'ad_no_actions');
      expect(withLeads?.conversions_7d).toBe(12);
      expect(withLeads?.conversions_total).toBeUndefined();
      expect(noActions?.conversions_7d).toBe(0);
    });

    it('parses actions[lead] into AdMetric.conversions_total when windowKey=conversions_total', async () => {
      const fixture = await import('../../__tests__/fixtures/meta-insights-actions-response.json');
      const fetchImpl = chainedFetch(ok(fixture.default ?? fixture));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.getInsights({
        time_range: { since: '2026-04-20', until: '2026-05-18' },
        level: 'ad',
        fields: ['impressions', 'clicks', 'spend'],
        action_attribution_windows: ['7d_click'],
        windowKey: 'conversions_total',
      });
      const withLeads = res.find((r) => r.ad_id === 'ad_with_leads');
      expect(withLeads?.conversions_total).toBe(12);
      expect(withLeads?.conversions_7d).toBeUndefined();
    });

    it('leaves conversions_* undefined when windowKey is not provided', async () => {
      const fixture = await import('../../__tests__/fixtures/meta-insights-actions-response.json');
      const fetchImpl = chainedFetch(ok(fixture.default ?? fixture));
      const client = new MetaAdManagementClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
      const res = await client.getInsights({
        time_range: { since: '2026-05-11', until: '2026-05-18' },
        level: 'ad',
        fields: ['impressions', 'clicks', 'spend'],
      });
      const withLeads = res.find((r) => r.ad_id === 'ad_with_leads');
      expect(withLeads?.conversions_7d).toBeUndefined();
      expect(withLeads?.conversions_total).toBeUndefined();
    });
```

- [ ] **Step 2: Run tests — they should now pass since toAdMetric was already updated in Task 4**

Run: `npx vitest run src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts -t "getInsights"`
Expected: ALL `getInsights` tests pass (existing 3 + 1 from Task 4 + 3 new = 7 tests).

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts
git commit -m "test(advertising/meta-insights-flow/T5): toAdMetric lead conversion parsing"
```

---

## Task 6: Extend perceive interfaces with windowKey

**Files:**
- Modify: `src/modules/advertising/perceive/meta-insights.ts:4-25`
- Modify: `src/modules/advertising/perceive/meta-insights.ts:49-79`

- [ ] **Step 1: Add windowKey to MetaInsightsApi + FetchMetaInsightsOptions**

Edit `src/modules/advertising/perceive/meta-insights.ts`. Replace lines 4-25 with:

```ts
export interface MetaInsightsApi {
  getInsights(opts: {
    time_range: { since: string; until: string };
    level: string;
    fields: string[];
    /**
     * Per Q4 (hybrid by purpose): Meta is the source for phase detection.
     * 7d_click only — no view attribution (inflates conversions on awareness
     * creatives). Pass-through to Meta Marketing API param of the same name.
     */
    action_attribution_windows?: Array<'1d_click' | '7d_click' | '1d_view' | '7d_view' | '28d_click'>;
    /**
     * When set, getInsights requests `actions{action_type,value,7d_click}` and
     * the resulting AdMetric receives the lead conversion count under the named
     * key (`conversions_7d` for the 7-day window, `conversions_total` for the
     * rolling-28-day window). Omit to preserve the original non-conversion fetch.
     */
    windowKey?: 'conversions_7d' | 'conversions_total';
  }): Promise<AdMetric[]>;
}

export interface FetchMetaInsightsOptions {
  apiClient: MockMetaApi | MetaInsightsApi;
  dateFrom: string;
  dateTo: string;
  action_attribution_windows?: Array<'1d_click' | '7d_click' | '1d_view' | '7d_view' | '28d_click'>;
  windowKey?: 'conversions_7d' | 'conversions_total';
  /** Base delay in ms for exponential backoff. Defaults to 1000ms; override in tests. */
  retryBaseMs?: number;
  maxRetries?: number;
}
```

- [ ] **Step 2: Update fetchMetaInsights to forward both new params**

Still in the same file, replace the function body (lines 49-79) with:

```ts
export async function fetchMetaInsights(opts: FetchMetaInsightsOptions): Promise<AdMetric[]> {
  const { apiClient, dateFrom, dateTo, retryBaseMs = 1000, maxRetries = 3 } = opts;

  const query = {
    time_range: { since: dateFrom, until: dateTo },
    level: 'ad' as const,
    fields: [...META_FIELDS],
    action_attribution_windows: opts.action_attribution_windows ?? ['7d_click' as const],
    windowKey: opts.windowKey,
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiClient.getInsights(query);
    } catch (err: unknown) {
      const isRateLimit =
        typeof err === 'object' &&
        err !== null &&
        (err as Record<string, unknown>).code === META_RATE_LIMIT_CODE;

      if (isRateLimit && attempt < maxRetries - 1) {
        await sleep(retryBaseMs * 2 ** attempt);
        continue;
      }

      throw err;
    }
  }

  // unreachable — loop always returns or throws
  throw new Error('fetchMetaInsights: exceeded max retries');
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -E "meta-insights|error TS" | head -10`
Expected: no errors. The mock `MockMetaApi` in `__tests__/mocks/meta-api.ts` is typed against `MetaInsightsApi`, so adding optional fields is non-breaking.

- [ ] **Step 4: Run existing perceive tests to ensure no regressions**

Run: `npx vitest run src/modules/advertising/perceive/__tests__/meta-insights.test.ts`
Expected: All 5 existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/advertising/perceive/meta-insights.ts
git commit -m "feat(advertising/meta-insights-flow/T6): forward windowKey through perceive"
```

---

## Task 7: TDD — fetchMetaInsights forwards windowKey

**Files:**
- Modify: `src/modules/advertising/perceive/__tests__/meta-insights.test.ts`

- [ ] **Step 1: Add failing test**

Append before the closing `});` of the outer `describe('fetchMetaInsights', ...)` block (after the existing `'passes action_attribution_windows=["7d_click"]'` test):

```ts
  it('forwards windowKey to apiClient.getInsights when provided', async () => {
    const api = mockMetaApi();
    api.getInsights.mockResolvedValue([]);

    await fetchMetaInsights({
      apiClient: api,
      dateFrom: '2026-05-11',
      dateTo: '2026-05-18',
      windowKey: 'conversions_7d',
    });

    expect(api.getInsights).toHaveBeenCalledWith(
      expect.objectContaining({ windowKey: 'conversions_7d' }),
    );
  });

  it('omits windowKey field when not provided', async () => {
    const api = mockMetaApi();
    api.getInsights.mockResolvedValue([]);

    await fetchMetaInsights({
      apiClient: api,
      dateFrom: '2026-05-11',
      dateTo: '2026-05-18',
    });

    const callArg = api.getInsights.mock.calls[0][0] as { windowKey?: unknown };
    expect(callArg.windowKey).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/modules/advertising/perceive/__tests__/meta-insights.test.ts`
Expected: All 7 tests pass (5 existing + 2 new).

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/perceive/__tests__/meta-insights.test.ts
git commit -m "test(advertising/meta-insights-flow/T7): windowKey forwarding"
```

---

## Task 8: Create fetchConversionWindows wrapper

**Files:**
- Create: `src/modules/advertising/perceive/conversion-windows.ts`

- [ ] **Step 1: Write the module**

Create file with this content:

```ts
import type { AdMetric } from '@/shared/types/advertising';
import type { MetaInsightsApi, FetchMetaInsightsOptions } from './meta-insights';
import type { MockMetaApi } from '../__tests__/mocks/meta-api';
import { fetchMetaInsights } from './meta-insights';

export interface ConversionWindows {
  /** Per-ad metrics with `conversions_7d` populated. `null` when the fetch threw. */
  metrics7d: AdMetric[] | null;
  /** Per-ad metrics with `conversions_total` populated. `null` when the fetch threw. */
  metrics28d: AdMetric[] | null;
}

export interface FetchConversionWindowsOptions {
  apiClient: MockMetaApi | MetaInsightsApi;
  /** Today's date as YYYY-MM-DD (UTC). The 7d window is today-6 → today, the 28d window is today-27 → today. */
  todayStr: string;
  retryBaseMs?: number;
  maxRetries?: number;
}

/**
 * Fetches Meta /insights twice — once for the 7-day rolling window and once
 * for the 28-day rolling window — with per-window error isolation.
 *
 * Both calls request `action_attribution_windows=['7d_click']` so each
 * AdMetric's `conversions_7d` / `conversions_total` reflects 7-day-click
 * lead attribution. The `windowKey` distinguishes which field gets populated
 * (see `toAdMetric` in `meta-graph-api/ad-client.ts`).
 *
 * Returning `null` for a window signals "fetch threw" — the caller MUST omit
 * the corresponding conversion field from `upsertAdSetState` so the schema's
 * `notNull().default(0)` value is preserved instead of overwritten with zeros.
 */
export async function fetchConversionWindows(
  opts: FetchConversionWindowsOptions,
): Promise<ConversionWindows> {
  const { apiClient, todayStr, retryBaseMs, maxRetries } = opts;
  const from7d = isoDateAddDays(todayStr, -6);
  const from28d = isoDateAddDays(todayStr, -27);

  const baseOpts: Omit<FetchMetaInsightsOptions, 'dateFrom' | 'dateTo' | 'windowKey'> = {
    apiClient,
    retryBaseMs,
    maxRetries,
    action_attribution_windows: ['7d_click'],
  };

  const [r7d, r28d] = await Promise.allSettled([
    fetchMetaInsights({ ...baseOpts, dateFrom: from7d, dateTo: todayStr, windowKey: 'conversions_7d' }),
    fetchMetaInsights({ ...baseOpts, dateFrom: from28d, dateTo: todayStr, windowKey: 'conversions_total' }),
  ]);

  return {
    metrics7d: r7d.status === 'fulfilled' ? r7d.value : null,
    metrics28d: r28d.status === 'fulfilled' ? r28d.value : null,
  };
}

function isoDateAddDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -E "conversion-windows|error TS" | head -10`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/perceive/conversion-windows.ts
git commit -m "feat(advertising/meta-insights-flow/T8): fetchConversionWindows wrapper"
```

---

## Task 9: TDD — fetchConversionWindows tests

**Files:**
- Create: `src/modules/advertising/perceive/__tests__/conversion-windows.test.ts`

- [ ] **Step 1: Write failing tests**

Create file with this content:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchConversionWindows } from '../conversion-windows';
import { mockMetaApi } from '../../__tests__/mocks/meta-api';
import { mockAdMetric } from '../../__tests__/fixtures';

describe('fetchConversionWindows', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('calls getInsights twice with 7d and 28d date ranges and matching windowKeys', async () => {
    const api = mockMetaApi();
    api.getInsights
      .mockResolvedValueOnce([mockAdMetric({ ad_id: 'a7', conversions_7d: 12 })])
      .mockResolvedValueOnce([mockAdMetric({ ad_id: 'a28', conversions_total: 47 })]);

    const result = await fetchConversionWindows({
      apiClient: api,
      todayStr: '2026-05-18',
      retryBaseMs: 0,
    });

    expect(api.getInsights).toHaveBeenCalledTimes(2);
    expect(api.getInsights).toHaveBeenNthCalledWith(1, expect.objectContaining({
      time_range: { since: '2026-05-12', until: '2026-05-18' },
      windowKey: 'conversions_7d',
      action_attribution_windows: ['7d_click'],
    }));
    expect(api.getInsights).toHaveBeenNthCalledWith(2, expect.objectContaining({
      time_range: { since: '2026-04-21', until: '2026-05-18' },
      windowKey: 'conversions_total',
      action_attribution_windows: ['7d_click'],
    }));

    expect(result.metrics7d?.[0].ad_id).toBe('a7');
    expect(result.metrics28d?.[0].ad_id).toBe('a28');
  });

  it('returns metrics7d=null when 7d call rejects, but preserves successful 28d', async () => {
    const api = mockMetaApi();
    api.getInsights
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([mockAdMetric({ ad_id: 'a28' })]);

    const result = await fetchConversionWindows({
      apiClient: api,
      todayStr: '2026-05-18',
      retryBaseMs: 0,
    });

    expect(result.metrics7d).toBeNull();
    expect(result.metrics28d?.[0].ad_id).toBe('a28');
  });

  it('returns both null when both calls reject', async () => {
    const api = mockMetaApi();
    api.getInsights
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'));

    const result = await fetchConversionWindows({
      apiClient: api,
      todayStr: '2026-05-18',
      retryBaseMs: 0,
    });

    expect(result.metrics7d).toBeNull();
    expect(result.metrics28d).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/modules/advertising/perceive/__tests__/conversion-windows.test.ts`
Expected: All 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/perceive/__tests__/conversion-windows.test.ts
git commit -m "test(advertising/meta-insights-flow/T9): fetchConversionWindows isolation"
```

---

## Task 10: Extend aggregateMetricsByAdSet to sum conversions

**Files:**
- Modify: `src/app/api/cron/advertising/triage-daily/route.ts:603-662`

- [ ] **Step 1: Add `conversions` field to AggregatedAdSetSnapshot and sum logic**

Edit `src/app/api/cron/advertising/triage-daily/route.ts`. Replace lines 603-662 with:

```ts
interface AggregatedAdSetSnapshot {
  adSetId: string;
  impressions: number;
  clicks: number;
  spendUsd: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  /** Sum of lead conversions across ads in this ad set. `null` indicates the
   * source metrics array was `null` (fetch failed) and the caller MUST skip
   * the conversion field in any DB upsert. */
  conversions: number | null;
}

/**
 * Collapses ad-level Meta Insights rows into one snapshot per ad set.
 * Sums impressions/clicks/spend, recomputes ratios from those sums so
 * CTR/CPC/CPM stay arithmetically consistent. Frequency is impression-
 * weighted across sibling ads. Conversions are summed across whichever
 * AdMetric field is populated (`conversions_7d` or `conversions_total`),
 * since each call site supplies a single-window result.
 *
 * Pass `null` to signal "no data" — propagates to all returned entries.
 */
function aggregateMetricsByAdSet(
  metrics: AdMetric[] | null,
): Map<string, AggregatedAdSetSnapshot> {
  type Acc = AggregatedAdSetSnapshot & { _freqWeightSum: number; _freqAcc: number };
  const acc = new Map<string, Acc>();
  if (metrics === null) return new Map();
  for (const m of metrics) {
    if (!m.adset_id) continue;
    const leadCount = m.conversions_7d ?? m.conversions_total ?? 0;
    const existing = acc.get(m.adset_id);
    if (existing) {
      existing.impressions += m.impressions;
      existing.clicks += m.clicks;
      existing.spendUsd += m.spend_usd;
      existing.conversions = (existing.conversions ?? 0) + leadCount;
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
        conversions: leadCount,
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
      conversions: s.conversions,
    });
  }
  return out;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -E "triage-daily|error TS" | head -10`
Expected: no new errors. The existing `aggregated.values()` consumer at line 443 still works (extra optional field).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/advertising/triage-daily/route.ts
git commit -m "feat(advertising/meta-insights-flow/T10): aggregator sums lead conversions"
```

---

## Task 11: Wire fetchConversionWindows into triage-daily perceive block

**Files:**
- Modify: `src/app/api/cron/advertising/triage-daily/route.ts:17` (import)
- Modify: `src/app/api/cron/advertising/triage-daily/route.ts:116-146` (perceive block + senior-buyer call)

- [ ] **Step 1: Add import**

In `src/app/api/cron/advertising/triage-daily/route.ts`, find line 17:

```ts
import { fetchMetaInsights } from '@/modules/advertising/perceive/meta-insights';
```

Replace with:

```ts
import { fetchMetaInsights } from '@/modules/advertising/perceive/meta-insights';
import { fetchConversionWindows } from '@/modules/advertising/perceive/conversion-windows';
```

- [ ] **Step 2: Fetch conversion windows in parallel with existing perceive calls**

Find the `Promise.all` block at lines 117-138. Replace it with:

```ts
    // --- Step 1: Perceive — pull all data sources in parallel ---
    const [metrics, conversionWindows, funnelSnapshot, stripeAttributions] = await Promise.all([
      fetchMetaInsights({
        apiClient: metaApiClient,
        dateFrom: dateStr,
        dateTo: todayStr,
        retryBaseMs: 500,
      }),
      fetchConversionWindows({
        apiClient: metaApiClient,
        todayStr,
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

    if (conversionWindows.metrics7d === null) {
      Sentry.captureMessage('fetchConversionWindows: 7d window failed', {
        level: 'warning',
        tags: { cron: true, route: '/api/cron/advertising/triage-daily', subsystem: 'senior-buyer/conversions' },
      });
    }
    if (conversionWindows.metrics28d === null) {
      Sentry.captureMessage('fetchConversionWindows: 28d window failed', {
        level: 'warning',
        tags: { cron: true, route: '/api/cron/advertising/triage-daily', subsystem: 'senior-buyer/conversions' },
      });
    }
```

- [ ] **Step 3: Pass conversion windows to runSeniorBuyerDailyExtension**

Find line 146:

```ts
    const seniorBuyerSummary = await runSeniorBuyerDailyExtension(metrics, todayStr);
```

Replace with:

```ts
    const seniorBuyerSummary = await runSeniorBuyerDailyExtension(
      metrics,
      conversionWindows.metrics7d,
      conversionWindows.metrics28d,
      todayStr,
    );
```

- [ ] **Step 4: Run typecheck — will fail because runSeniorBuyerDailyExtension signature is unchanged**

Run: `npm run typecheck 2>&1 | grep "runSeniorBuyerDailyExtension"`
Expected: type error about 4 args vs 2 expected. Task 12 fixes this.

- [ ] **Step 5: Do NOT commit yet — proceed to Task 12 to fix the signature**

---

## Task 12: Extend runSeniorBuyerDailyExtension to plumb conversion fields

**Files:**
- Modify: `src/app/api/cron/advertising/triage-daily/route.ts:366-516` (function body)

- [ ] **Step 1: Update signature + body**

Edit `src/app/api/cron/advertising/triage-daily/route.ts`. Replace the entire `runSeniorBuyerDailyExtension` function (line 366 down to its closing brace at approximately line 588) by performing these focused edits:

**Edit 1 — signature:** Find `async function runSeniorBuyerDailyExtension(\n  metrics: AdMetric[],\n  todayStr: string,\n): Promise<SeniorBuyerDailySummary> {` and replace with:

```ts
async function runSeniorBuyerDailyExtension(
  metrics: AdMetric[],
  metrics7d: AdMetric[] | null,
  metrics28d: AdMetric[] | null,
  todayStr: string,
): Promise<SeniorBuyerDailySummary> {
```

**Edit 2 — aggregate conversion windows at top of function body:** Right after the line `const summary: SeniorBuyerDailySummary = { ... errors: 0, };` (the closing brace of the summary literal, around line 377), insert:

```ts

  // Aggregate the conversion-window metrics by ad-set once so the bootstrap
  // and transition loops can read the totals cheaply. `null` upstream (fetch
  // failed) propagates to "no field in the upsert input" rather than 0 — so
  // bootstrap INSERT inherits schema default 0 and UPDATE preserves the old
  // value via stripUndefined() inside upsertAdSetState.
  const agg7d = aggregateMetricsByAdSet(metrics7d);
  const agg28d = aggregateMetricsByAdSet(metrics28d);
  const has7d = metrics7d !== null;
  const has28d = metrics28d !== null;
  const conversionFieldsFor = (
    adSetId: string,
  ): { conversions7dMeta?: number; conversionsTotalMeta?: number } => {
    const fields: { conversions7dMeta?: number; conversionsTotalMeta?: number } = {};
    if (has7d) fields.conversions7dMeta = agg7d.get(adSetId)?.conversions ?? 0;
    if (has28d) fields.conversionsTotalMeta = agg28d.get(adSetId)?.conversions ?? 0;
    return fields;
  };
```

**Edit 3 — bootstrap upsert (~line 409-419):** Find the upsert inside the bootstrap loop:

```ts
        await upsertAdSetState({
          adSetId: metric.adset_id,
          campaignId: metric.campaign_id,
          // TODO: Meta Insights doesn't return ad-set locale; default 'en'.
          // The next phase-evaluator pass will overwrite via upsert once
          // an authoritative source (ad set name parser, founder seed,
          // or Stripe attribution) supplies a real locale.
          locale: 'en',
          currentPhase: 'A',
          dataMaturityMode: 'COLD_START',
        });
```

Replace with:

```ts
        await upsertAdSetState({
          adSetId: metric.adset_id,
          campaignId: metric.campaign_id,
          // TODO: Meta Insights doesn't return ad-set locale; default 'en'.
          // The next phase-evaluator pass will overwrite via upsert once
          // an authoritative source (ad set name parser, founder seed,
          // or Stripe attribution) supplies a real locale.
          locale: 'en',
          currentPhase: 'A',
          dataMaturityMode: 'COLD_START',
          ...conversionFieldsFor(metric.adset_id),
        });
```

**Edit 4 — maturity-transition upsert (~line 542-547):** Find:

```ts
        await upsertAdSetState({
          adSetId: adSet.adSetId,
          campaignId: adSet.campaignId,
          locale: adSet.locale,
          dataMaturityMode: newMaturity,
        });
```

Replace with:

```ts
        await upsertAdSetState({
          adSetId: adSet.adSetId,
          campaignId: adSet.campaignId,
          locale: adSet.locale,
          dataMaturityMode: newMaturity,
          ...conversionFieldsFor(adSet.adSetId),
        });
```

**Edit 5 — phase-transition upsert (~line 566-571):** Find:

```ts
          await upsertAdSetState({
            adSetId: adSet.adSetId,
            campaignId: adSet.campaignId,
            locale: adSet.locale,
            currentPhase: 'C',
          });
```

Replace with:

```ts
          await upsertAdSetState({
            adSetId: adSet.adSetId,
            campaignId: adSet.campaignId,
            locale: adSet.locale,
            currentPhase: 'C',
            ...conversionFieldsFor(adSet.adSetId),
          });
```

- [ ] **Step 2: Add tail-loop that refreshes conversion fields for every live ad-set**

> **Plan-level addition beyond spec §4 #11/13:** without this, only ad-sets that transition phase/maturity on a given day get conversion-data updates — most days no ad-sets transition, so the Tier-1 guard, data-maturity classifier, and Phase B→C threshold all read stale data from the last transition. The tail-loop iterates `liveAdSets` (already loaded from DB at line 521) so it can use each row's authoritative `locale` instead of risking a clobber from a hardcoded default.

Still in `runSeniorBuyerDailyExtension`, find the closing brace of the transition `for (const adSet of liveAdSets) { ... }` loop (the one around lines 521-583 that runs the maturity + phase-B-to-C checks). Immediately AFTER its closing `}` and BEFORE `return summary;`, insert:

```ts

  // Tail refresh: write conversion fields for every live ad-set, even those
  // that did not transition phase or maturity this run. Without this,
  // conversions_*_meta only updates on transition days, which violates the
  // Tier-1 guard's "fresh 7d window" assumption (tier-1-rules.ts:41).
  // liveAdSets carries the authoritative locale from DB — use it to avoid
  // clobbering ES rows with an 'en' default.
  for (const adSet of liveAdSets) {
    const convFields = conversionFieldsFor(adSet.adSetId);
    if (convFields.conversions7dMeta === undefined && convFields.conversionsTotalMeta === undefined) continue;
    try {
      await upsertAdSetState({
        adSetId: adSet.adSetId,
        campaignId: adSet.campaignId,
        locale: adSet.locale,
        ...convFields,
      });
    } catch (err) {
      summary.errors += 1;
      console.warn(
        `[triage-daily][senior-buyer] conversion refresh failed for ${adSet.adSetId}:`,
        err,
      );
      Sentry.captureException(err, {
        tags: { cron: true, route: '/api/cron/advertising/triage-daily', subsystem: 'senior-buyer/conversions' },
        extra: { ad_set_id: adSet.adSetId },
      });
    }
  }
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -E "triage-daily|error TS" | head -20`
Expected: no errors.

- [ ] **Step 4: Run existing cron-handlers tests to ensure no regressions**

Run: `npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts -t "triage-daily"`
Expected: All existing triage-daily tests pass. The default `fetchMetaInsights` mock returns the same payload for every call, so the new `fetchConversionWindows` consumer sees valid data.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/advertising/triage-daily/route.ts
git commit -m "feat(advertising/meta-insights-flow/T11-T12): plumb conversion windows into ad-set state"
```

---

## Task 13: Mock fetchConversionWindows in cron-handlers test setup

**Files:**
- Modify: `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts:126-145` (extend module mock)

- [ ] **Step 1: Add module mock for conversion-windows**

In `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`, find the `vi.mock('@/modules/advertising/perceive/meta-insights', ...)` block at lines 126-145. Immediately after its closing `}));`, insert:

```ts
// ---------------------------------------------------------------------------
// Mock conversion-windows wrapper (used by triage-daily)
// ---------------------------------------------------------------------------
vi.mock('@/modules/advertising/perceive/conversion-windows', () => ({
  fetchConversionWindows: vi.fn().mockResolvedValue({
    metrics7d: [
      {
        ad_id: 'ad_001',
        adset_id: 'adset_001',
        campaign_id: 'campaign_001',
        date: '2026-04-26',
        impressions: 1000,
        clicks: 20,
        spend_usd: 5.0,
        ctr: 0.02,
        cpc: 0.25,
        cpm: 5.0,
        frequency: 1.2,
        reach: 900,
        days_running: 5,
        conversions_7d: 60,
        status: 'ACTIVE',
      },
    ],
    metrics28d: [
      {
        ad_id: 'ad_001',
        adset_id: 'adset_001',
        campaign_id: 'campaign_001',
        date: '2026-04-26',
        impressions: 1000,
        clicks: 20,
        spend_usd: 5.0,
        ctr: 0.02,
        cpc: 0.25,
        cpm: 5.0,
        frequency: 1.2,
        reach: 900,
        days_running: 5,
        conversions_total: 200,
        status: 'ACTIVE',
      },
    ],
  }),
}));
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -E "cron-handlers|error TS" | head -10`
Expected: no errors.

- [ ] **Step 3: Run all cron-handlers tests**

Run: `npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`
Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/advertising/__tests__/cron-handlers.test.ts
git commit -m "test(advertising/meta-insights-flow/T13): mock fetchConversionWindows"
```

---

## Task 14: TDD — triage-daily writes conversions into ad-set state

**Files:**
- Modify: `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts` (extend `describe('triage-daily — senior-buyer extension', ...)` at line 957)

- [ ] **Step 1: Add three new tests**

Inside the `describe('triage-daily — senior-buyer extension', () => {` block, append BEFORE its closing `});`:

```ts
  it('writes conversions7dMeta and conversionsTotalMeta to ad_set_state', async () => {
    const stateStore = await import('@/modules/advertising/senior-buyer/state-store');
    const convWindows = await import('@/modules/advertising/perceive/conversion-windows');
    const upsertAdSetStateMock = vi.mocked(stateStore.upsertAdSetState);
    upsertAdSetStateMock.mockClear();

    // Three ads in adset_alpha (two with leads) + one ad in adset_beta.
    vi.mocked(convWindows.fetchConversionWindows).mockResolvedValueOnce({
      metrics7d: [
        { ad_id: 'ad1', adset_id: 'adset_alpha', campaign_id: 'c1', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, conversions_7d: 7, status: 'ACTIVE' },
        { ad_id: 'ad2', adset_id: 'adset_alpha', campaign_id: 'c1', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, conversions_7d: 5, status: 'ACTIVE' },
        { ad_id: 'ad3', adset_id: 'adset_beta',  campaign_id: 'c2', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, conversions_7d: 0, status: 'ACTIVE' },
      ],
      metrics28d: [
        { ad_id: 'ad1', adset_id: 'adset_alpha', campaign_id: 'c1', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, conversions_total: 31, status: 'ACTIVE' },
        { ad_id: 'ad2', adset_id: 'adset_alpha', campaign_id: 'c1', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, conversions_total: 19, status: 'ACTIVE' },
        { ad_id: 'ad3', adset_id: 'adset_beta',  campaign_id: 'c2', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, conversions_total: 4,  status: 'ACTIVE' },
      ],
    });
    // The daily metrics fetch needs to surface the same ad sets so the bootstrap loop sees them.
    vi.mocked(fetchMetaInsights).mockResolvedValueOnce([
      { ad_id: 'ad1', adset_id: 'adset_alpha', campaign_id: 'c1', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, status: 'ACTIVE' },
      { ad_id: 'ad2', adset_id: 'adset_alpha', campaign_id: 'c1', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, status: 'ACTIVE' },
      { ad_id: 'ad3', adset_id: 'adset_beta',  campaign_id: 'c2', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, status: 'ACTIVE' },
    ]);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    expect(res.status).toBe(200);

    // Sum 7d for adset_alpha = 7 + 5 = 12; for adset_beta = 0.
    const alphaCall = upsertAdSetStateMock.mock.calls.find(
      (c) => c[0].adSetId === 'adset_alpha' && c[0].conversions7dMeta !== undefined,
    );
    expect(alphaCall).toBeDefined();
    expect(alphaCall![0].conversions7dMeta).toBe(12);
    expect(alphaCall![0].conversionsTotalMeta).toBe(50);

    const betaCall = upsertAdSetStateMock.mock.calls.find(
      (c) => c[0].adSetId === 'adset_beta' && c[0].conversions7dMeta !== undefined,
    );
    expect(betaCall).toBeDefined();
    expect(betaCall![0].conversions7dMeta).toBe(0);
    expect(betaCall![0].conversionsTotalMeta).toBe(4);
  });

  it('omits conversions7dMeta when 7d fetch failed but writes conversionsTotalMeta', async () => {
    const stateStore = await import('@/modules/advertising/senior-buyer/state-store');
    const convWindows = await import('@/modules/advertising/perceive/conversion-windows');
    const upsertAdSetStateMock = vi.mocked(stateStore.upsertAdSetState);
    upsertAdSetStateMock.mockClear();

    vi.mocked(convWindows.fetchConversionWindows).mockResolvedValueOnce({
      metrics7d: null,
      metrics28d: [
        { ad_id: 'ad1', adset_id: 'adset_a', campaign_id: 'c1', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, conversions_total: 8, status: 'ACTIVE' },
      ],
    });
    vi.mocked(fetchMetaInsights).mockResolvedValueOnce([
      { ad_id: 'ad1', adset_id: 'adset_a', campaign_id: 'c1', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, status: 'ACTIVE' },
    ]);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    expect(res.status).toBe(200);

    const aCall = upsertAdSetStateMock.mock.calls.find(
      (c) => c[0].adSetId === 'adset_a' && c[0].conversionsTotalMeta !== undefined,
    );
    expect(aCall).toBeDefined();
    expect(aCall![0].conversions7dMeta).toBeUndefined();
    expect(aCall![0].conversionsTotalMeta).toBe(8);
  });

  it('omits both conversion fields when both fetches failed', async () => {
    const stateStore = await import('@/modules/advertising/senior-buyer/state-store');
    const convWindows = await import('@/modules/advertising/perceive/conversion-windows');
    const upsertAdSetStateMock = vi.mocked(stateStore.upsertAdSetState);
    upsertAdSetStateMock.mockClear();

    vi.mocked(convWindows.fetchConversionWindows).mockResolvedValueOnce({
      metrics7d: null,
      metrics28d: null,
    });
    vi.mocked(fetchMetaInsights).mockResolvedValueOnce([
      { ad_id: 'ad1', adset_id: 'adset_x', campaign_id: 'c1', date: '2026-05-18', impressions: 1, clicks: 1, spend_usd: 1, ctr: 1, cpc: 1, cpm: 1, frequency: 1, reach: 1, days_running: 1, status: 'ACTIVE' },
    ]);

    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await triageDailyGET(req);
    expect(res.status).toBe(200);

    // No upsert call should have conversionFields populated.
    for (const call of upsertAdSetStateMock.mock.calls) {
      if (call[0].adSetId === 'adset_x') {
        expect(call[0].conversions7dMeta).toBeUndefined();
        expect(call[0].conversionsTotalMeta).toBeUndefined();
      }
    }
  });
```

- [ ] **Step 2: Run new tests**

Run: `npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts -t "writes conversions7dMeta|omits conversions7dMeta|omits both conversion"`
Expected: 3 passing tests.

- [ ] **Step 3: Run full cron-handlers test file to ensure no regressions**

Run: `npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/advertising/__tests__/cron-handlers.test.ts
git commit -m "test(advertising/meta-insights-flow/T14): triage-daily writes ad-set conversion totals"
```

---

## Task 15: Pin the conversion-guard behavior at conversions_7d=0

**Context:** The existing tests at `tier-1-rules.test.ts:137-178` already cover the conversion-guard at `conversions_7d=49`, exact threshold 50, null/undefined fail-open, and learning-phase precedence. The exact zero case (`conversions_7d=0`) is not pinned and is the most common post-fix state (no leads in last 7d). This task adds one assertion to lock it in.

**Files:**
- Modify: `src/modules/advertising/decide/__tests__/tier-1-rules.test.ts:135-178` (extend "Conversion sample size guard" group inside `describe('applyTier1Rules', ...)`)

- [ ] **Step 1: Add the failing test**

Find the comment `// --- Conversion sample size guard ---` at line 135. Insert this test immediately after the `it('holds when conversions_7d < 50 (insufficient sample)', ...)` block ending at line 142 (i.e. between lines 142 and 144):

```ts
  it('holds when conversions_7d = 0 (zero leads, in sample) — post-fix common case', () => {
    // Pre-fix audit state: AdMetric.conversions_7d was always undefined → guard fail-open.
    // Post-fix with fetchConversionWindows: live ad-sets with no leads in last 7d report 0.
    // The guard must hold-with-insufficient_conversions, NOT fall through to the
    // frequency/CPC pause rules (which would otherwise fire on a fatigued ad-set).
    const m = mockAdMetric({
      days_running: 10,
      conversions_7d: 0,
      frequency: 5.0, // would trigger frequency_cap pause if guard didn't fire
      cpc: 6.0,       // would trigger cpc_hard_cap pause if guard didn't fire
    });
    const decision = applyTier1Rules(m);
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('insufficient_conversions');
    expect(decision.reason).toContain('0/7d');
  });
```

- [ ] **Step 2: Run the new test**

Run: `npx vitest run src/modules/advertising/decide/__tests__/tier-1-rules.test.ts -t "conversions_7d = 0"`
Expected: PASS — the implementation at `tier-1-rules.ts:41` already covers this (`m.conversions_7d != null && m.conversions_7d < 50` is true for 0).

- [ ] **Step 3: Run full tier-1-rules test file**

Run: `npx vitest run src/modules/advertising/decide/__tests__/tier-1-rules.test.ts`
Expected: All tests pass (existing + 1 new).

- [ ] **Step 4: Commit**

```bash
git add src/modules/advertising/decide/__tests__/tier-1-rules.test.ts
git commit -m "test(advertising/meta-insights-flow/T15): pin conversion guard at zero leads"
```

---

## Task 16: Final verification — full test suite + typecheck + lint

**Files:** none

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: zero new errors in any of the files modified by this PR. (Pre-existing warnings in `.claude/worktrees/` are unrelated — per memory `feedback_lint_worktrees_pollution`.)

- [ ] **Step 3: Run full test suite (advertising + cron handlers)**

Run: `npx vitest run src/modules/advertising/ src/app/api/cron/advertising/`
Expected: all tests pass.

- [ ] **Step 4: Run full repo test suite (catch incidental fixture breakage)**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Final commit if anything required cleanup**

If any pre-existing fixture or test required a small fix (e.g. adding `conversions_total: undefined` to a `satisfies AdMetric` literal), commit it now:

```bash
git add -p   # review hunks individually
git commit -m "chore(advertising/meta-insights-flow/T16): fixture type alignment"
```

If no cleanup was needed, skip this step.

- [ ] **Step 6: Smoke checklist (founder-owned, post-deploy)**

Record the post-deploy smoke checklist in the PR description (do not commit to repo):

1. After push, wait for next 09:00 UTC triage-daily cron (or trigger manually).
2. `SELECT ad_set_id, conversions_7d_meta, conversions_total_meta, updated_at FROM advertising_ad_set_state ORDER BY updated_at DESC LIMIT 5;` — expect non-zero for live ad-sets with leads in the last 7/28d.
3. Inspect Sentry for `subsystem: 'senior-buyer/conversions'` events — none expected on a healthy run.
4. Confirm `summary.errors` in Vercel logs for the triage-daily run is consistent with prior runs.

---

## Out-of-scope follow-ups (do NOT include in this PR)

- `writeDailySnapshot` keeps `conversionsMeta: 0`. Wiring requires a 4th 1-day /insights call. Deferred until daily-history baselines are needed.
- Historical 28-day backfill for ad-sets that already had leads before this PR shipped — one-shot `scripts/advertising/` script later.
- `conversions_14d_meta` column — currently unused; populate later if needed.
- `subscribe` / `complete_registration` / `purchase` action types — add when Stripe-paid conversions accumulate volume.
- Vercel env-var verification (`NEXT_PUBLIC_META_PIXEL_ID` / `META_CAPI_ACCESS_TOKEN` / `META_PIXEL_ID`) — separate ops task.
- `seniorBuyerMode` gate flip from `shadow` to `enforce` — separate founder-owned decision.
