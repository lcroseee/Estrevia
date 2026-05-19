# Meta /insights Conversion Data Flow — Design Spec

**Date:** 2026-05-18
**Author:** Kirill (founder) + Claude (brainstorm)
**Status:** Spec
**Closes:** Advertising-audit Known-Issues SEV1 #2 ("conversions not flowing into `advertising_ad_set_state.conversions_*_meta`"), SEV2 #6 (`getInsights` missing `action_attribution_windows` forward), SEV2 #9 (`toAdMetric` never populates `conversions_7d`).

> Out of scope for this PR (tracked separately): Vercel env-var verification (SEV1 #1 — `NEXT_PUBLIC_META_PIXEL_ID`), nurture-drip step 2–6 observability, historical 28-day backfill.

---

## 1. Context

The advertising agent's `decide` and `senior-buyer` layers gate every meaningful action on conversion data. Today that data path is broken end-to-end:

- `MetaAdManagementClient.getInsights()` at `src/modules/advertising/meta-graph-api/ad-client.ts:95-111` does **not** include `actions{action_type,value}` in the `fields` URL param and does **not** forward `action_attribution_windows`. The perceive-layer interface in `src/modules/advertising/perceive/meta-insights.ts:4-16` already accepts `action_attribution_windows` and passes it, but it's silently dropped at the implementation boundary.
- `toAdMetric()` at `src/modules/advertising/meta-graph-api/ad-client.ts:161-183` never populates `AdMetric.conversions_7d`. The `MetaInsightsRow` interface (lines 12-26) doesn't even declare an `actions` field.
- `runSeniorBuyerDailyExtension()` at `src/app/api/cron/advertising/triage-daily/route.ts:366-516` runs three loops over `metrics`, but never writes `conversions_7d_meta` or `conversions_total_meta` to `advertising_ad_set_state`. The `writeDailySnapshot` call at line 457 hardcodes `conversionsMeta: 0`.
- The DB columns at `src/shared/lib/schema.ts:379-381` (`conversions7dMeta`, `conversions14dMeta`, `conversionsTotalMeta`) all default to `0` and are `notNull()`. Every existing row still reads `0`.

**Downstream blast radius:**
- Tier-1 conversion guard at `src/modules/advertising/decide/tier-1-rules.ts:41` (`m.conversions_7d != null`) is fail-open — never fires.
- Phase B → C transition gate at `triage-daily/route.ts:558` (`adSet.conversions7dMeta >= phaseBToCThreshold`) can never fire.
- Data maturity classifier at `src/modules/advertising/senior-buyer/data-maturity-classifier.ts:29,35` always reports `COLD_START` because `conversions_total_meta < 50` is permanently true.
- LPV → Lead optimization-event switch in `src/modules/advertising/senior-buyer/policies/phase-c.ts:99` can never fire.

The agent runs in shadow / `DRY_RUN=true` mode today, so the failure is masked. Before `seniorBuyerMode` flips to `enforce` and `DRY_RUN=false`, this pipeline must work.

---

## 2. Scope

### In scope (this PR)

1. Fix `getInsights()` to request `actions{action_type,value}` and forward `action_attribution_windows`.
2. Fix `toAdMetric()` to parse `actions[]`, filter to `action_type === 'lead'`, and populate either `conversions_7d` or `conversions_total` on `AdMetric` based on a caller-supplied `windowKey`.
3. Extend the perceive layer so the existing `fetchMetaInsights` accepts a `windowKey` pass-through and the triage-daily caller fires two additional /insights queries (7-day for `conversions_7d_meta`, 28-day for `conversions_total_meta`) alongside the existing 1-day daily-snapshot call.
4. Plumb aggregated conversion counts through `aggregateMetricsByAdSet` → `runSeniorBuyerDailyExtension` → `upsertAdSetState` (write `conversions7dMeta` / `conversionsTotalMeta`).
5. Unit-test fixture `src/modules/advertising/__tests__/fixtures/meta-insights-actions-response.json` + Vitest coverage at all three layers.

### Out of scope (explicit non-goals)

- `subscribe`, `complete_registration`, `purchase`, or any non-`lead` `action_type` — single-signal MVP per founder decision.
- Backfill of historical `advertising_ad_set_state` rows from Meta's last 28-day data.
- Changes to `seniorBuyerMode` feature gate or `DRY_RUN` defaults — pipeline is being unblocked, not turned on.
- Changes to attribution windows beyond `7d_click`. View attribution remains forbidden (inflates awareness-creative conversion counts).
- New PostHog observability events for pipeline verification. (Verification is one-shot manual smoke.)
- Schema migration. The existing `notNull().default(0)` columns are accepted as-is.
- Vercel env-var verification (`NEXT_PUBLIC_META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, `META_PIXEL_ID`) — separate ops task.
- `conversions_14d_meta` column — left at `0` default; no caller reads it today.

---

## 3. Data flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ triage-daily cron (0 9 * * *)                                            │
└──────────────────────────────────────────────────────────────────────────┘
              │
              │ Promise.all
              ▼
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│ fetchMetaInsights               │  │ fetchMetaInsights               │
│   dateFrom=yesterday            │  │   dateFrom=today-6              │
│   dateTo=today                  │  │   dateTo=today                  │
│   windowKey=(none)              │  │   windowKey='conversions_7d'    │
│                                 │  │   action_attribution_windows    │
│ (existing call — daily snapshot)│  │     = ['7d_click']              │
└────────────┬────────────────────┘  └──────────┬──────────────────────┘
             │                                  │
             │     ┌─────────────────────────────────┐
             │     │ fetchMetaInsights               │
             │     │   dateFrom=today-27             │
             │     │   dateTo=today                  │
             │     │   windowKey='conversions_total' │
             │     │   action_attribution_windows    │
             │     │     = ['7d_click']              │
             │     └──────────┬──────────────────────┘
             │                │
             ▼                ▼
   AdMetric[] (daily)  AdMetric[] (7d, .conversions_7d filled)
                       AdMetric[] (28d, .conversions_total filled)
             │
             ▼
   runSeniorBuyerDailyExtension(metricsDaily, metrics7d, metrics28d, todayStr)
             │
             ├─ bootstrap loop (lines ~402-437)
             │    upsertAdSetState({ ..., conversions7dMeta, conversionsTotalMeta })
             │
             ├─ daily snapshot loop (lines ~439-485)
             │    writeDailySnapshot({ ..., conversionsMeta: 0 })   ← unchanged this PR (see §9)
             │
             └─ transition loop (lines ~518-580)
                  upsertAdSetState({ ..., conversions7dMeta, conversionsTotalMeta })
```

**Window semantics:**
- `conversions_7d_meta` = leads with 7-day click attribution that landed in the **last 7 calendar days**.
- `conversions_total_meta` = leads with 7-day click attribution that landed in the **last 28 calendar days**. The name is slightly misleading (it's a rolling-28-day count, not lifetime), but it matches the existing `data-maturity-classifier` thresholds (50/500) which were calibrated against rolling totals.

**Fetch-failure policy (per founder decision):**
- 200 OK without `actions` array → write `0` (real "no leads yet").
- 200 OK with `actions` but no `action_type === 'lead'` → write `0`.
- Fetch throws (network / 5xx after 3 retries) → **skip the conversion fields in the upsert entirely**. Old values remain; new ad-sets keep the schema default of `0`. Log to Sentry via existing `triage-daily/route.ts` Sentry handler with `subsystem: 'senior-buyer/conversions'`. Increment `summary.errors`.

---

## 4. Component changes

| # | File | Change |
|---|---|---|
| 1 | `src/shared/types/advertising/perceive.ts` | Add `conversions_total?: number \| null` to `AdMetric`. Keep `conversions_7d?: number \| null` as-is. |
| 2 | `src/modules/advertising/meta-graph-api/ad-client.ts` (interface `MetaInsightsRow`, lines 12-26) | Add `actions?: Array<{ action_type: string; value: string; '1d_click'?: string; '7d_click'?: string; '28d_click'?: string }>`. |
| 3 | `src/modules/advertising/meta-graph-api/ad-client.ts` (`getInsights`, lines 95-111) | Add params `action_attribution_windows?: Array<'1d_click' \| '7d_click' \| '1d_view' \| '7d_view' \| '28d_click'>` and `windowKey?: 'conversions_7d' \| 'conversions_total'`. Include `'actions'` in the comma-joined `fields` query param. Encode `action_attribution_windows` as `JSON.stringify(...)` in URL params. Pass `windowKey` into `toAdMetric` for each row. |
| 4 | `src/modules/advertising/meta-graph-api/ad-client.ts` (`toAdMetric`, lines 161-183) | New behavior when `windowKey` is supplied: find `actions.find(a => a.action_type === 'lead')`. If found, take `a['7d_click']` (preferred, since we always pass `['7d_click']`) else `a.value`, parse via `parseNum` (NaN → 0). Assign to `result[windowKey]`. If `actions` array is absent → assign `0` to `result[windowKey]`. If `windowKey` is undefined, leave both conversion fields undefined (existing 1-day daily-snapshot path). |
| 5 | `src/modules/advertising/perceive/meta-insights.ts` (interface `MetaInsightsApi`, lines 4-16) | Add to opts: `windowKey?: 'conversions_7d' \| 'conversions_total'`. |
| 6 | `src/modules/advertising/perceive/meta-insights.ts` (`FetchMetaInsightsOptions`, lines 18-25) | Add `windowKey?: 'conversions_7d' \| 'conversions_total'`. |
| 7 | `src/modules/advertising/perceive/meta-insights.ts` (`fetchMetaInsights`, lines 49-79) | Pass `windowKey` and `action_attribution_windows` through to `apiClient.getInsights`. Existing `['7d_click']` literal stays; callers that want to populate conversion data must also pass `windowKey`. |
| 8 | `src/app/api/cron/advertising/triage-daily/route.ts` (perceive block, lines 117-138) | Within the outer `Promise.all`, add two parallel `fetchMetaInsights` calls: one with `windowKey: 'conversions_7d'` and `dateFrom: subtractDays(today, 6)`, one with `windowKey: 'conversions_total'` and `dateFrom: subtractDays(today, 27)`. Both with `dateTo: todayStr`. Wrap each in its own try/catch so partial success is preserved (e.g. 7d ok, 28d fails). On catch: log Sentry, set the respective result to `null`. |
| 9 | `src/app/api/cron/advertising/triage-daily/route.ts` (`runSeniorBuyerDailyExtension` signature, line 366) | Add params `metrics7d: AdMetric[] \| null, metrics28d: AdMetric[] \| null`. `null` ⇒ "fetch failed, do not write conversion fields this run". |
| 10 | `src/app/api/cron/advertising/triage-daily/route.ts` (aggregator at line 620) | Add `conversions: number` to `AggregatedAdSetSnapshot` (sum of `m.conversions_7d ?? m.conversions_total ?? 0` across ads in the ad set). |
| 11 | `src/app/api/cron/advertising/triage-daily/route.ts` (bootstrap loop, lines ~402-437) | Aggregate `metrics7d`/`metrics28d` by ad-set once at top of function. In each `upsertAdSetState` call, append `conversions7dMeta: agg7d.get(adsetId)?.conversions` and `conversionsTotalMeta: agg28d.get(adsetId)?.conversions`. Omit the keys (pass `undefined`) when the corresponding metrics array is `null`; `stripUndefined()` inside `upsertAdSetState` (lines 64-66 of `state-store.ts`) preserves old DB values. |
| 12 | _Removed — see §9 "out-of-scope"._ `writeDailySnapshot` keeps `conversionsMeta: 0` for now. Writing rolling 7-day totals into a per-day history column is semantically wrong; daily attribution needs a separate 1-day /insights call, deferred. |
| 13 | `src/app/api/cron/advertising/triage-daily/route.ts` (transition loop, lines ~518-580) | Same upsert extension as #11 — pass conversion fields through. |
| 14 | `src/modules/advertising/senior-buyer/state-store.ts` (`UpsertAdSetStateInput`, lines 17-36) | **No change.** `conversions7dMeta?`, `conversions14dMeta?`, `conversionsTotalMeta?` already declared (lines 24-26); update path already calls `stripUndefined(input)` (line 66), insert path already defaults missing values to `0` (lines 82-84). Verify only — no edit. |
| 15 | `src/modules/advertising/__tests__/fixtures/meta-insights-actions-response.json` (new file alongside existing `fixtures/index.ts`) | Realistic Meta /insights JSON with one ad row, `actions: [{action_type: 'lead', '7d_click': '12', value: '15'}, {action_type: 'link_click', value: '47'}]`, and a second ad row with empty/missing `actions`. |
| 16 | `src/modules/advertising/meta-graph-api/__tests__/ad-client.test.ts` (extend existing file) | Three new test cases: (a) `getInsights` URL builder includes `actions` in `fields` and `action_attribution_windows=["7d_click"]` URL-encoded JSON; (b) `toAdMetric` with `windowKey='conversions_7d'` returns `conversions_7d: 12` from fixture; (c) `toAdMetric` with `windowKey='conversions_total'` and missing `actions` array returns `conversions_total: 0`. |
| 17 | `src/modules/advertising/perceive/__tests__/meta-insights.test.ts` (extend) | Test that `windowKey` is forwarded verbatim to `apiClient.getInsights`. |
| 18 | `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts` (extend) | Verify (a) three `fetchMetaInsights` calls (1d snapshot + 7d + 28d) with correct date ranges and `windowKey`; (b) when 7d call rejects but 28d succeeds, `upsertAdSetState` is called with `conversions7dMeta: undefined` but `conversionsTotalMeta: <number>`; (c) on both rejections, no `conversions*Meta` keys in the upsert input; (d) Sentry `captureException` invoked with `subsystem: 'senior-buyer/conversions'`. |
| 19 | `src/modules/advertising/decide/__tests__/tier-1-rules.test.ts` (extend) | Add fixture `mockAdMetric({ conversions_7d: 0, days_running: 10 })` and verify guard at line 41 now fires (returns `null`, no pause action). |

**Why `windowKey` instead of a richer return type:** keeping `AdMetric` flat means the existing 50+ test fixtures and all decide/act/senior-buyer code paths stay unchanged. Adding `conversions_total` as a sibling optional field is a strict superset of today's type. Callers that don't want conversion data simply don't pass `windowKey`.

---

## 5. Edge cases

| Case | Behavior | Where handled |
|---|---|---|
| Meta returns 200 OK, no `actions` field on row | Assign `0` to `windowKey` field. | `toAdMetric` (change #4) |
| Meta returns 200 OK, `actions` present but no `lead` type | Assign `0`. | `toAdMetric` |
| `actions[lead]['7d_click']` is `undefined`, only `value` present | Fall back to `parseNum(value)`. | `toAdMetric` |
| `value` is the string `"0"` | Returns `0`. | `parseNum` (existing) |
| `value` is malformed (non-numeric) | `parseNum` returns `0`. | `parseNum` (existing) |
| 7d fetch fails (network/5xx after 3 retries) but 28d succeeds | Skip `conversions7dMeta` field in upsert. Set `conversionsTotalMeta`. Log Sentry. | triage-daily perceive block (#8), bootstrap/transition (#11/#13) |
| Both fetches fail | Skip both fields. Existing daily-snapshot path unaffected. Log Sentry twice. `summary.errors += 2`. | triage-daily perceive block |
| Rate-limit (code 17) | Existing `meta-insights.ts:62-71` exponential-backoff loop applies. After 3 attempts, throws → caught by triage-daily try/catch. | `fetchMetaInsights` (no change) |
| Ad-set in metrics but not yet in `advertising_ad_set_state` | Bootstrap loop creates row with Phase A / COLD_START and now also writes initial `conversions7dMeta` / `conversionsTotalMeta`. | bootstrap loop (#11) |
| New ad-set with zero leads ever | Writes `0` everywhere. Tier-1 guard fires (correct — agent should not act). | end-to-end |
| Ad-set in DB but not in metrics this run (paused/no spend) | Existing behavior: no upsert. Old conversion values stay. Acceptable — Meta would return 0 anyway for paused. |
| API param `action_attribution_windows` URL-encoded | `JSON.stringify(['7d_click'])` → `["7d_click"]` → `encodeURIComponent` via `URLSearchParams`. Verify in test #16(a). | `getInsights` (#3) |

---

## 6. Testing strategy

**Unit (Vitest):**
- 3 new cases in `ad-client.test.ts` (URL builder + parsing happy/empty).
- 1 extension in `meta-insights.test.ts` (windowKey forward).
- 3 new cases in `cron-handlers.test.ts` (three-call flow, partial-failure, daily snapshot).
- 1 extension in `tier-1-rules.test.ts` (guard fires with `conversions_7d=0, days_running>=7`).

**Integration:** none. Meta API is third-party; no VCR fixtures in repo. Existing mock-injection pattern (`MockMetaApi`) covers the integration boundary.

**Type-check + lint:** must pass. Adding optional `conversions_total` to `AdMetric` is a non-breaking superset, but any downstream code that destructures with `satisfies AdMetric` may need explicit `conversions_total: undefined`. Grep for `: AdMetric =` and `satisfies AdMetric` callsites — expect ~6 fixture files and ~3 production callsites; touch only if TS errors.

**Manual smoke (founder owes post-deploy):**
1. After push to `main`, wait for next 09:00 UTC triage-daily run (or trigger manually via `vercel dev` + cron simulator).
2. `SELECT ad_set_id, conversions_7d_meta, conversions_total_meta, updated_at FROM advertising_ad_set_state ORDER BY updated_at DESC LIMIT 5;` — expect non-zero values for live ad-sets that have received leads in the last 7/28 days.
3. `SELECT date, ad_set_id, conversions_meta FROM advertising_ad_set_metric_history WHERE date = CURRENT_DATE;` — expect **zero** (daily snapshot conversion writer is explicitly deferred; see §9).
4. Inspect Sentry for `subsystem: 'senior-buyer/conversions'` events — none expected on a healthy run.
5. Confirm `summary.errors` in Vercel logs for the triage-daily run is consistent with prior runs (no regression).

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Meta /insights `actions[].7d_click` field shape varies (some accounts use `1d_click`/`28d_click` keys instead) | We pass `action_attribution_windows=['7d_click']` explicitly — Meta should return the matching nested key. Fixture covers both `7d_click` keyed and bare `value` fallback. |
| Three /insights calls per cron run triple the rate-limit budget consumption | Pre-flight rate-limit guard in `base.ts:47-56` (warn 75%, block 90%) already gates this. Each call paginates with `limit=500`. Triage-daily runs once per day; with current account size (~10 active ad-sets, 1 page each) headroom is large. Watch the warn-75% log on the next run if it ever fires. |
| `conversionsTotalMeta` name implies lifetime; rolling 28d may mislead future readers | Document semantics in spec (this file) + add a one-line comment in `state-store.ts` next to the type extension: `// rolling 28-day, not lifetime`. |
| Type-check fan-out: adding `conversions_total?` to `AdMetric` breaks fixture literals that use `satisfies AdMetric` | Grep + fix during implementation. Estimated ~6 test fixtures need `conversions_total: undefined` added. |
| Tier-1 guard now fires for previously-untouched ad-sets, blocking the agent's first real actions | This is the intended behavior. Senior-buyer rule "no pause/scale/edit on <50 conversions" is what we want. Memory `feedback_meta_learning_phase` confirms founder approval. |
| `seniorBuyerMode='shadow'` means no real actions fire post-fix anyway | Acceptable. This PR unblocks the data pipeline; the gate flip (`shadow` → `enforce`) is a separate founder-owned decision. |

---

## 8. Acceptance criteria

- All 19 file changes from §4 landed; lint + typecheck + `npm test` green.
- Three new + four extended Vitest cases all pass.
- After deploy, `advertising_ad_set_state.conversions_7d_meta` shows non-zero for at least one live ad-set within 24h. (Manual verification, founder-owned.)
- No regression in existing `runSeniorBuyerDailyExtension` summary counters (`bootstraps_created`, `snapshots_written`, `phase_transitions`).
- Sentry shows zero `subsystem: 'senior-buyer/conversions'` events on a healthy run.

---

## 9. Out-of-scope items captured for follow-up

- **Vercel env-var verification** for `NEXT_PUBLIC_META_PIXEL_ID` / `META_PIXEL_ID` / `META_CAPI_ACCESS_TOKEN` — separate ops runbook.
- **Historical backfill** of `conversions_total_meta` for ad-sets that started earning leads before this PR shipped — one-shot script via `scripts/advertising/`.
- **`conversions_14d_meta`** column — currently dead. Either populate (third call with `action_attribution_windows=['14d_click']`, but no caller reads it today) or drop in a later migration.
- **`subscribe` / `purchase` action types** for when Stripe-paid conversions accumulate enough volume.
- **Nurture drip steps 2–6 production verification** — separate observability task.
- **Daily-snapshot conversion writer** — `writeDailySnapshot.conversionsMeta` stays at `0`. Wiring requires a 4th 1-day /insights call (or repurposing the existing 1-day call with `windowKey='conversions_daily'` + a new `AdMetric.conversions_daily?` field). Defer until daily-history baselines are needed by retro-weekly.

---

## 10. Appendix: Meta /insights actions reference

Sample response shape (excerpt, 1 ad row):

```json
{
  "data": [
    {
      "ad_id": "120211234567890123",
      "adset_id": "120211234567890456",
      "campaign_id": "120211234567890789",
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
    }
  ],
  "paging": { "cursors": { "before": "...", "after": "..." } }
}
```

Reference: https://developers.facebook.com/docs/marketing-api/insights/parameters/v22.0#action-attribution-windows
