# Meta Graph API Adapter + Launch Pipeline — Design

**Date:** 2026-05-02
**Owner:** Kirill (founder)
**Status:** Approved (brainstorming → writing-plans next)
**Predecessor:** `docs/advertising/launch-runbook.md`, `docs/advertising/dry-run-smoke-test.md`
**Successor:** Implementation plan in `docs/superpowers/plans/2026-05-02-meta-graph-api-launch.md` (to be written)

---

## 1. Problem statement

The advertising agent has all upstream pieces in place:
- 17 creatives are `approved` in `advertising_creatives` (8 EN, 9 ES, all by Imagen 4 Ultra, $1.02 spent on generation).
- All 23 pre-launch checks pass — Meta auth, CAPI, Telegram, Gemini, DB, feature gates.
- Production deploy is healthy with `ADVERTISING_AGENT_ENABLED=true`, `ADVERTISING_AGENT_DRY_RUN=true`.
- Cron handlers fire on schedule and pass the kill-switch test.

**But there is no production code that actually talks to the Meta Graph API for ad management.** Two interfaces exist (`MetaApiClient` for upload in `creative-gen/upload/`, `MetaAdClient` for act in `act/meta-marketing.ts`), but only mock implementations exist (`__tests__/mocks/meta-api.ts`). Consequently:

- All 17 approved creatives are stuck at `status='approved'`. Meta does not know they exist.
- Even flipping `DRY_RUN=false` would do nothing — there are no live ads for the agent to manage.
- The smoke-test note from 2026-04-26 ("Orchestration not yet exercised end-to-end") quietly captures this gap; the gap is the focus of this iteration.

**Additional findings (2026-05-02 review):**
- Only 3 of 36 hook templates were used (8.3% angle coverage). Five high-potential templates remain untested: `identity-reveal-2`, `identity-reveal-6`, `authority-3`, `rarity-3`, `rarity-5`.
- Two existing creatives have quality issues: `QgVH83CNEv1unzbRdOKJC` (artifact text-like marks in sky) and `V8a1sQF5SwR1P-OGOIrfo` (off-prompt planet collage).
- The admin review page filters only `pending_review`, so approved/uploaded/live creatives are invisible.
- The Meta launch **Campaign** and **EN/ES Ad Sets** do not yet exist in Meta Business Manager. Each Ad must attach to an existing Ad Set, so this is a hard precondition. Resolved by generating them via API (Agent 11) rather than manual UI setup.

---

## 2. Goals

1. Build a production Meta Graph API adapter that fully implements both `MetaApiClient` and `MetaAdClient` interfaces (full S4 act-stream — upload + pause + scaleBudget + duplicate + createCampaign + createAdSet).
2. Wire the adapter into the admin approve route (auto-upload at approval) and into the act-stream runtime (replace mock when `NODE_ENV=production` and `DRY_RUN!=true`).
3. Ship a one-off setup CLI that creates the launch Campaign + EN/ES Ad Sets via Meta API (founder copies returned IDs to Vercel env vars).
4. Ship a bulk-publish CLI + admin endpoint + UI button to migrate the 15 already-approved creatives (after rejecting 2 bad ones) and 20 new ones into Meta as paused ads.
5. Expand creative coverage: generate 20 new creatives across 5 untested templates.
6. Fix the admin UX bug so all status values are visible with a filter.
7. Decompose the work into 11 parallel agent tasks (one extra for the campaign setup script).

## 3. Non-goals (out of scope)

- Cleanup cron for orphan Meta resources after partial upload failures (Phase 2).
- Real-time spend dashboard via Meta Insights API (existing `account-health-weekly` covers weekly).
- Cold-start pre-warming with 50 known users (org process, not code).
- Variant/UTM lineage tracking for `duplicateAd` (S5+ when act stream activates).
- `unpublish-all.ts` rollback script (only needed in emergency; not pre-built).
- Removal of unused images from Vercel Blob (storage cost negligible).
- Activating S5 (anomaly detection) or S6 (Bayesian decisions) — those gates require accumulated impressions data.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Application Layer (existing)                                    │
│                                                                   │
│  creative-gen/upload/meta-upload.ts   act/{pause,scale,duplicate}│
│  uses MetaApiClient interface ◄──┐    use MetaAdClient interface │
│                                  │                ▲              │
└──────────────────────────────────┼────────────────┼──────────────┘
                                   │ DI             │ DI
┌──────────────────────────────────┼────────────────┼──────────────┐
│  Infrastructure Layer (NEW)      ▼                │              │
│                                                                   │
│  src/modules/advertising/meta-graph-api/                          │
│    base.ts          → MetaGraphApiBase (HTTP + auth + retry)     │
│    errors.ts        → Error taxonomy                              │
│    types.ts         → Internal Graph response shapes              │
│    upload-client.ts → MetaUploadClient impl MetaApiClient ◄──────┘
│    ad-client.ts     → MetaAdManagementClient impl MetaAdClient   │
│    index.ts         → factory + barrel                            │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                        Meta Graph API (graph.facebook.com/v22.0)
```

### Entry points into the adapter

1. **`scripts/advertising/setup-meta-campaign.ts`** — one-off CLI run by founder before any ads are launched. Calls `adClient.createCampaign(...)` + `adClient.createAdSet(...)` × 2 (EN, ES). Prints IDs and the exact `vercel env add` commands to set `META_LAUNCH_CAMPAIGN_ID`, `META_LAUNCH_ADSET_ID_EN`, `META_LAUNCH_ADSET_ID_ES`.
2. **`src/app/api/admin/creatives/[id]/approve/route.ts`** — calls `uploadClient.uploadCreative(...)` after the approval `UPDATE`. Auto-upload at approval going forward.
3. **`scripts/advertising/publish-approved.ts`** — one-off CLI for already-approved creatives without an `meta_ad_id`. Idempotent. Shares logic with the admin endpoint via a `publishApprovedService` module.
4. **`src/app/api/admin/creatives/publish-batch/route.ts`** — admin endpoint exposing the same `publishApprovedService` for the UI button on the review page.
5. **`src/modules/advertising/act/index.ts`** runtime factory — returns the real `MetaAdManagementClient` when `NODE_ENV === 'production'` AND `ADVERTISING_AGENT_DRY_RUN !== 'true'`. Mock in tests.

### What does not change

- `MetaApiClient` and `MetaAdClient` interface signatures stay stable.
- `creative-gen/upload/meta-upload.ts` business logic untouched.
- `act/{pause,scale,duplicate}.ts` business logic untouched.

---

## 5. Components

### 5.1 `meta-graph-api/base.ts`

```typescript
export interface MetaGraphConfig {
  accessToken: string;        // META_ACCESS_TOKEN (System User)
  adAccountId: string;        // act_<id>
  apiVersion: string;         // 'v22.0' (default)
  fetchImpl?: typeof fetch;   // injectable for tests
}

export class MetaGraphApiBase {
  protected async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown> | FormData,
  ): Promise<T>;
}
```

- Always sends `access_token` as query param (Meta's default).
- Maps non-2xx responses to typed errors (see 5.2).
- Retry policy: 3 retries with exponential backoff (1s, 2s, 4s) for 5xx and Meta `code: 1, 2, 4`. No retry on 4xx (auth/quota/validation — fail fast).
- Rate limit: parses `X-Business-Use-Case-Usage` header; sleeps 60s if >75%; throws `MetaRateLimitError` if >90%.

### 5.2 `meta-graph-api/errors.ts`

```typescript
export class MetaApiError extends Error {
  code: number;
  subcode?: number;
  fbtraceId?: string;
  httpStatus: number;
}
export class MetaAuthError extends MetaApiError { }        // 190, 102
export class MetaPermissionError extends MetaApiError { }  // 200, 803
export class MetaRateLimitError extends MetaApiError { }   // 17, 32, 80004
export class MetaValidationError extends MetaApiError { }  // 100 + ad-specific
```

All inherit from `MetaApiError`. Sentry receives the base class with structured tags for grouping.

### 5.3 `meta-graph-api/upload-client.ts`

```typescript
class MetaUploadClient extends MetaGraphApiBase implements MetaApiClient {
  async uploadCreative(opts): Promise<{ creative_id: string; ad_id: string }>;
}
```

3-step transactional flow:
1. `POST /act_<id>/adimages` — Meta fetches `image_url` (Vercel Blob public). Returns `image_hash`.
2. `POST /act_<id>/adcreatives` — creates AdCreative with `image_hash` + `link_url` (with UTM) + `body` (copy) + `cta_type` + `name`.
3. `POST /act_<id>/ads` — creates Ad with `status=PAUSED`, attached to `creative_id` + `ad_set_id`.

`adset_id` comes from `META_LAUNCH_ADSET_ID_EN` / `META_LAUNCH_ADSET_ID_ES` env (preconfigured adsets per locale). These adsets must exist in Meta Business Manager before launch.

**Transactionality:** if step 3 fails, steps 1+2 leave orphan Meta resources. Strategy: log to `audit/creative-log.ts` with partial state + Sentry alert. Cleanup is Phase 2.

### 5.4 `meta-graph-api/ad-client.ts`

```typescript
class MetaAdManagementClient extends MetaGraphApiBase implements MetaAdClient {
  // Existing interface methods (act stream, runs when DRY_RUN=false)
  async pauseAd(adId): Promise<void>;
  async updateAdSetBudget(adSetId, dailyBudgetCents): Promise<void>;
  async duplicateAd(adId, overrides): Promise<{ ad_id: string }>;

  // Setup methods (used once during campaign bootstrap)
  async createCampaign(opts: {
    name: string;
    objective: 'OUTCOME_TRAFFIC' | 'OUTCOME_AWARENESS';
    status: 'PAUSED';
  }): Promise<{ campaign_id: string }>;

  async createAdSet(opts: {
    campaignId: string;
    name: string;
    locale: 'en' | 'es';
    dailyBudgetCents: number;
    targeting: {
      countries: string[];          // EN: ['US','GB','CA','AU']; ES: LATAM list
      ageMin: number; ageMax: number;
      interests?: string[];          // optional MVP
    };
    optimizationGoal: 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS';
    billingEvent: 'IMPRESSIONS' | 'LINK_CLICKS';
    status: 'PAUSED';
  }): Promise<{ adset_id: string }>;
}
```

- `pauseAd`: `POST /<ad_id>` body `{ status: 'PAUSED' }`.
- `updateAdSetBudget`: `POST /<adset_id>` body `{ daily_budget: <cents> }`.
- `duplicateAd`: uses Meta's native copy endpoint `POST /<ad_id>/copies` — atomic copy with overrides.
- `createCampaign`: `POST /act_<id>/campaigns` — returns `campaign_id`.
- `createAdSet`: `POST /act_<id>/adsets` — returns `adset_id`. Targeting is JSON-encoded per Meta's [Targeting Specs](https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-specs/).

`MetaAdClient` interface in `act/meta-marketing.ts` will be extended to include `createCampaign` + `createAdSet` (interface change, but additive — existing mock just adds two stubs).

### 5.5 `meta-graph-api/index.ts`

```typescript
export function createMetaUploadClient(): MetaApiClient;
export function createMetaAdClient(): MetaAdClient;
```

Reads `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` from env. In test mode (`process.env.VITEST=true` or `NODE_ENV=test`) throws `Error('Use mock in tests')` to prevent accidental real-API calls in unit tests.

### 5.6 Modifications + new files

| File | Change |
|---|---|
| `src/app/api/admin/creatives/[id]/approve/route.ts` | After `UPDATE status='approved'`, call `createMetaUploadClient().uploadCreative(...)`, then `UPDATE status='uploaded', meta_ad_id`. Also fix race: `UPDATE … WHERE id=<id> AND status='pending_review' RETURNING id` |
| `src/modules/advertising/act/index.ts` | Add `getMetaAdClient()` factory; returns real adapter in production+notDryRun, mock in tests/dev |
| `src/modules/advertising/act/meta-marketing.ts` | Extend `MetaAdClient` interface with `createCampaign` + `createAdSet` (additive change; existing tests gain 2 mock stubs) |
| `src/app/admin/advertising/creatives/review/page.tsx` | Replace fixed `eq(status, 'pending_review')` with dropdown filter `?status=pending_review|approved|uploaded|live|paused|rejected|all`, default `pending_review`. Add **"Publish all approved" button** that POSTs to `/api/admin/creatives/publish-batch` and shows progress |
| `scripts/advertising/publish-approved.ts` | **NEW**: reads `status='approved' AND meta_ad_id IS NULL` rows; batch upload via `createMetaUploadClient()`; idempotent re-run safe; `--dry-run` and `--limit=N` flags |
| `scripts/advertising/setup-meta-campaign.ts` | **NEW** (one-off): creates Campaign + EN AdSet + ES AdSet via Meta API; prints IDs and exact `vercel env add` commands for the founder to run |
| `src/app/api/admin/creatives/publish-batch/route.ts` | **NEW**: admin endpoint mirroring CLI logic; same idempotency guard; returns `{uploaded, failed, skipped}` summary for UI display |

---

## 6. Data flows

### 6.1 Single creative upload (admin Approve)

```
[Founder clicks Approve in admin UI]
        │
        ▼
POST /api/admin/creatives/<id>/approve
        │
        ├─► [DB] UPDATE advertising_creatives
        │     SET status='approved', approved_by=email, approved_at=now()
        │     WHERE id=<id> AND status='pending_review'
        │     RETURNING id
        │
        ├─► createMetaUploadClient().uploadCreative({asset_url, copy, cta, locale, tracking})
        │       │
        │       ├─► POST /act_X/adimages {url}              → image_hash
        │       ├─► POST /act_X/adcreatives {image_hash, body, link_url, cta_type, name}
        │       │                                            → creative_id
        │       └─► POST /act_X/ads {name, adset_id, creative.id, status='PAUSED'}
        │                                                    → ad_id
        │
        ├─► [DB] UPDATE advertising_creatives
        │           SET status='uploaded', meta_ad_id=ad_id
        │           WHERE id=<id>
        │
        ├─► [audit] INSERT advertising_audit
        │           {kind:'creative_uploaded', creative_id, meta_ad_id, latency_ms}
        │
        └─► JSON 200 { success:true, meta_ad_id }
```

### 6.2 Bulk publish (CLI)

```
$ npx tsx scripts/advertising/publish-approved.ts [--dry-run] [--limit=N]

  ├─► SELECT * FROM advertising_creatives
  │     WHERE status='approved' AND meta_ad_id IS NULL
  │     ORDER BY created_at LIMIT N
  │
  ├─► (optional --dry-run): print payload preview only, exit
  │
  ├─► for each creative:
  │     try {
  │       (idempotency guard) GET /act_X/ads?filtering=… search by creative_excerpt
  │       if found, skip with audit log
  │       else uploadCreative(...); UPDATE; audit_log
  │     } catch (e) { audit_log + console.error; continue with next }
  │
  └─► print summary { uploaded:N, failed:M, orphans:K }
```

### 6.3 Act stream (pause / scale / duplicate) when DRY_RUN=false

```
[Cron /api/cron/advertising/triage-hourly]
        │
        ▼
perceive → fetch Meta Insights
        │
        ▼
decide → [{action:'pause', ad_id, reason:'CTR<0.3% over 5K impressions'}]
        │
        ▼
DRY_RUN check
        │
        ├── DRY_RUN=true → alerts.sendTelegram({action, reason}); audit_log; return
        │
        └── DRY_RUN=false:
              act/pause.ts(adId, deps:{metaAdClient: getMetaAdClient()})
                  │
                  ├─► metaAdClient.pauseAd(adId)
                  │     └─► POST /<ad_id> {status:'PAUSED'}
                  │
                  ├─► [DB] UPDATE advertising_creatives SET status='paused'
                  │           WHERE meta_ad_id=adId
                  │
                  ├─► [audit] INSERT advertising_audit
                  │       {kind:'ad_paused', ad_id, reason}
                  │
                  └─► alerts.sendTelegram({executed:'paused', adId, reason})
```

### 6.4 State diagram for `advertising_creatives.status`

```
   (creative-gen)
        │
        ▼
   pending_review ──► (admin: reject) ──► rejected (terminal)
        │
        │ (admin: approve)
        ▼
   approved ──► (upload retries fail) ──► (manual reject) ──► rejected
        │
        │ (uploadCreative success)
        ▼
   uploaded ──► (founder un-pauses in Meta UI)
        │
        ▼
   live ◄──── (act: scale/duplicate)
        │
        │ (act: pause OR Meta auto)
        ▼
   paused ──► (resume from admin/Meta UI) ──► live
```

### 6.5 DB changes

**No schema changes.** All required columns exist:
- `advertising_creatives.status` enum already includes `uploaded`, `live`, `paused`.
- `advertising_creatives.meta_ad_id` exists (text, nullable, indexed).
- `advertising_creatives.approved_by`, `approved_at` exist.

**Idempotency:**
- `publish-approved.ts` filters `meta_ad_id IS NULL` — safe to re-run.
- Approve route uses `WHERE status='pending_review' RETURNING id` to prevent duplicate POST → 0 rows = 409 INVALID_STATUS.
- Bulk-publish includes a Meta search guard (`GET /act_X/ads?filtering=[creative.body CONTAIN <excerpt>]`) before upload — prevents duplicates from earlier "DB UPDATE failed but Meta succeeded" cases.

**Audit log additions:** new `kind` values in existing `advertising_audit` table:
- `creative_uploaded`, `creative_upload_failed`, `creative_orphan_partial`
- `ad_paused`, `ad_scaled`, `ad_duplicated` (act stream)

---

## 7. Error handling

### 7.1 Error taxonomy

| Class | Meta code(s) | HTTP | Action | Retry? |
|---|---|---|---|---|
| `MetaAuthError` | 190, 102 | 401 | Kill switch + Sentry + Telegram alert founder | No |
| `MetaPermissionError` | 200, 803 | 403 | Sentry + Telegram (System User perms likely revoked) | No |
| `MetaRateLimitError` | 17, 32, 80004 | 400/429 | Sleep + retry; defer to next cron tick if exhausted | Yes (3×) |
| `MetaValidationError` | 100, 1487, 1815108 | 400 | Audit log; mark `creative_upload_failed`; status remains `approved`; founder review | No |
| `MetaServerError` | 1, 2, 4 (5xx) | 5xx | Exponential backoff (1s, 2s, 4s) | Yes (3×) |
| `MetaNetworkError` | (timeout, fetch fail) | n/a | Same backoff | Yes (3×) |
| `MetaApiError` (catch-all) | unknown | * | Sentry with `fbtrace_id`; founder via Telegram | No |

### 7.2 Edge cases

1. **Token expires during bulk upload.** CLI loops, 6th creative throws `MetaAuthError`. Kill-switch breaks the loop. Audit log shows 5 uploaded, 10 not attempted. Telegram: refresh token, re-run. Idempotent re-run handles the rest.

2. **Asset URL temporarily 502 (Vercel Blob).** Meta returns 400 "Could not fetch image from URL". Special-case: if message contains "Could not fetch image", reclassify as `MetaServerError` and retry. After 3 retries → `MetaValidationError`.

3. **Duplicate approve race.** Add `WHERE status='pending_review' RETURNING id` to the `UPDATE`. If 0 rows, return 409 without upload.

4. **uploadCreative succeeded, DB UPDATE failed.** Most painful case — Meta has the ad, DB doesn't know. Mitigation:
   - Sentry alert with `meta_ad_id` in context.
   - Manual recovery: admin endpoint `POST /api/admin/creatives/<id>/refresh-from-meta` (NOT IN SCOPE — Phase 2).
   - Bulk CLI uses Meta search guard before upload — catches dup attempts at re-run.

5. **Partial failure after `/adimages` (orphan image).** Cost: 0 (Meta dedupes by hash). Retry safe. Audit log: `creative_orphan_partial`.

6. **Partial failure after `/adcreatives` (orphan creative).** Retry creates a NEW creative — old orphan stays. Cost: 0 (paused, no spend). Cleanup is Phase 2.

7. **Bulk rate limit risk.** ~33 ads × 3 calls = ~99 calls, well under System User tier (~600 req/hour). Riskless.

### 7.3 Observability

| Channel | Events | Frequency |
|---|---|---|
| Sentry | All `MetaApiError` subclasses with `fbtrace_id`, `creative_id`, `latency_ms` tags | Each error |
| Telegram (founder) | Auth/Permission errors, batch-stop in CLI, partial failures with orphans | Critical only |
| `advertising_audit` (DB) | All upload attempts (success/fail/orphan), all act decisions | Each action |
| `console.log/error` | Bulk publish CLI human-readable progress | CLI runs only |

---

## 8. Testing strategy

| Level | Coverage | Tooling |
|---|---|---|
| Unit | Each file → `__tests__/file.test.ts`. Mock fetch via `vi.fn()`. Cover retry, error classification, request-payload format | vitest |
| Integration | Factory creates correct client from env. Happy-path through full 3-step upload (mock fetch) | vitest |
| E2E (CLI) | Bulk publish against test DB + mock fetch. Idempotency: run twice — uploaded only once | vitest |
| Type tests | Implementation satisfies `MetaApiClient` / `MetaAdClient` — TS compiler enforces. CI runs `tsc --noEmit` | tsc |
| Manual smoke | After all agents complete: `--dry-run` preview, then 1 real ad upload, verify in Meta UI | manual |

Acceptance gate: minimum 1 test per public method + each edge case from §7.2.

---

## 9. Decomposition into 11 parallel agent tasks

### 9.1 Task table

| # | Subagent type | Task | Files | Depends on | Time |
|---|---|---|---|---|---|
| 1 | `backend` | Foundation: HTTP wrapper, auth, retry, rate limit | `meta-graph-api/{base,errors,types}.ts` + `base.test.ts` | — | 45-60 min |
| 2 | `backend` | `MetaUploadClient` — 3-step upload | `meta-graph-api/upload-client.ts` + test | 1 (types only) | 60-90 min |
| 3 | `backend` | `MetaAdManagementClient` — pause + scale + duplicate + **createCampaign + createAdSet**; also extends `MetaAdClient` interface in `act/meta-marketing.ts` | `meta-graph-api/ad-client.ts` + `act/meta-marketing.ts` (interface extension) + tests + mock stubs | 1 (types only) | 90-120 min |
| 4 | `backend` | Factory + integration test (smoke through factory) | `meta-graph-api/index.ts` + `integration.test.ts` | 2, 3 | 30-45 min |
| 5 | `backend` | Wire upload into admin approve route + race-fix `WHERE status='pending_review' RETURNING id` | `src/app/api/admin/creatives/[id]/approve/route.ts` + tests | 2 | 30-45 min |
| 6 | `backend` | Bulk publish: CLI script + admin POST endpoint (shared service module). Both call same `publishApprovedService(deps)` function with idempotency guard | `scripts/advertising/publish-approved.ts` + `src/app/api/admin/creatives/publish-batch/route.ts` + shared service + tests | 2, 4 | 90-120 min |
| 7 | `backend` | Wire `getMetaAdClient()` factory into act-stream runtime; env-gate | `src/modules/advertising/act/index.ts` (modify) + test | 3, 4 | 30-45 min |
| 8 | `meta-ads` | Generate creatives: `identity-reveal-2` + `identity-reveal-6` (4 EN + 4 ES = 8 ads) | existing CLI run + commit log to `docs/advertising/` | — | 10-20 min |
| 9 | `meta-ads` | Generate creatives: `authority-3` + `rarity-3` + `rarity-5` (6 EN + 6 ES = 12 ads) | existing CLI run + commit log | — | 15-25 min |
| 10 | `frontend` | Admin UX: status-filter dropdown + **"Publish all approved" button** wired to `/api/admin/creatives/publish-batch` + reject 2 bad creatives via `/api/admin/creatives/<id>/reject` | `src/app/admin/advertising/creatives/review/page.tsx` (modify) + new client component for the button + reject script | 6 (for endpoint to call) | 60-75 min |
| 11 | `backend` | **NEW** — Setup CLI: creates Campaign + EN AdSet + ES AdSet via Meta API; prints IDs and exact `vercel env add` commands for the founder | `scripts/advertising/setup-meta-campaign.ts` + test | 3 (needs createCampaign + createAdSet methods) | 45-60 min |

### 9.2 Dependency waves

```
Wave 1 (T+0)                — 3 agents in parallel
   ├── Agent 1:  base + errors + types
   ├── Agent 8:  gen creatives batch A (identity-reveal-2 + -6)
   └── Agent 9:  gen creatives batch B (authority-3 + rarity-3 + rarity-5)

Wave 2 (T+45-60m)           — 2 agents in parallel (after Agent 1 publishes types)
   ├── Agent 2:  MetaUploadClient
   └── Agent 3:  MetaAdManagementClient (incl. createCampaign + createAdSet)

Wave 3 (T+1.5-2h)           — up to 3 agents in parallel
   ├── Agent 5:  approve-route wire    (needs Agent 2)
   ├── Agent 4:  factory + integration (needs Agent 2 AND Agent 3)
   └── Agent 11: setup-meta-campaign script (needs Agent 3)

Wave 4 (T+2-3h)             — 3 agents in parallel (after Agent 4 + Agent 6)
   ├── Agent 6:  bulk-publish CLI + admin endpoint (needs Agent 2 AND Agent 4)
   ├── Agent 7:  act runtime factory   (needs Agent 3 AND Agent 4)
   └── Agent 10: admin UX + Publish button + reject bad creatives (needs Agent 6 endpoint)

T+3-4h                      — all 11 done → manual smoke run
```

**Wall-clock estimate: 3-4 hours** until CLI/endpoint are ready for bulk-publish. Manual smoke (run setup script → 1 ad → verify in Meta UI → bulk) adds 30-60 min. Note that Agent 10 (UI button) moved from Wave 1 → Wave 4 because it now needs the `publish-batch` endpoint to call.

### 9.3 Types-first development

Agent 1 publishes `types.ts` with all Meta API response shapes + interface signatures within the first 5-10 minutes. Agents 2-7 import types and start implementation in parallel even before `base.ts` is fully complete.

---

## 10. Launch sequence (after agents complete)

```
[T+4h] All 11 agent PRs/commits merged into main
   │
   ▼
[T+4h] Founder runs setup-meta-campaign.ts locally
   │   $ npx tsx scripts/advertising/setup-meta-campaign.ts
   │   Output: campaign_id=cmp_xyz, adset_id_en=as_abc, adset_id_es=as_def
   │   Output also prints exact commands:
   │     vercel env add META_LAUNCH_CAMPAIGN_ID production  (paste cmp_xyz)
   │     vercel env add META_LAUNCH_ADSET_ID_EN production  (paste as_abc)
   │     vercel env add META_LAUNCH_ADSET_ID_ES production  (paste as_def)
   │   Founder runs those 3 commands.
   │
   ▼
[T+4h+5m] Production deploy (vercel --prod) with updated env vars
   │
   ▼
[T+4h+10m] Smoke run #1: dry-run preview
   │   $ npx tsx scripts/advertising/publish-approved.ts --dry-run
   │   Output: "Would upload up to 35 creatives." (15 existing approved after
   │   rejecting 2 of original 17, + up to 20 new approved by founder).
   │   Actual count depends on how many of the 20 new pass admin review.
   │   Inspect payload sample by eye
   │
   ▼
[T+4h+15m] Smoke run #2: 1 ad
   │   $ npx tsx scripts/advertising/publish-approved.ts --limit=1
   │   (or click "Publish all approved" in admin UI with limit=1 — both routes work)
   │
   ▼
[T+4h+20m] Manual verify in Meta Ads Manager
   │   • Ad exists, status=PAUSED ✓
   │   • Asset URL renders correctly ✓
   │   • Copy + CTA display ✓
   │   • UTM in link_url correct ✓
   │   • adset_id linkage correct (under our launch campaign) ✓
   │
   ▼
[T+4h+25m] Bulk publish remaining (up to 34)
   │   $ npx tsx scripts/advertising/publish-approved.ts
   │   (or "Publish all approved" admin button)
   │   ~30 sec per ad → ~17 min total worst case
   │
   ▼
[T+4h+40m] Verify in Meta Ads Manager: up to 35 paused ads (1 smoke + bulk rest)
   │
   ▼
[T+4h+45m] Founder un-pauses 6-12 best ads in Meta UI ($20/day cap stays)
   │
   ▼
[T+4h+50m] LIVE — ads run paid traffic
   │   DRY_RUN remains true (agent observes only for first 24-48h)
   │
   ▼
[T+1-7d] Decision: keep DRY_RUN=true or flip?
        Routine on day +7 (`trig_012WMFuy4qxchNRKhtu14YUu`) helps with review.
```

---

## 11. Rollback strategy

| Level | Trigger | Action | Time |
|---|---|---|---|
| Wrong campaign/adset created | setup-meta-campaign.ts ran with bad targeting/budget | Manually archive Campaign in Meta Business Manager UI; re-run setup script with corrected params; copy new IDs to Vercel env; redeploy | 10 min |
| Single creative | One creative is bad / Meta disapproved | `POST /api/admin/creatives/<id>/reject` → status='rejected'; archive in Meta UI | 1 min |
| Bulk publish broke | CLI/endpoint failed mid-run | Idempotent — fix env, re-run | 5 min |
| Many orphans in Meta | Visible after batch | Manual cleanup in Meta Business Manager UI | 30 min manual |
| Adapter breaks everything | Production-error storm, Sentry alert flood | Kill switch: `vercel env rm ADVERTISING_AGENT_ENABLED && add false`; redeploy | 2 min |
| Catastrophic spend | Creative accidentally launched as ACTIVE, Meta burning budget | Meta Ads Manager → Pause All; debug afterwards | 1 min (UI) |
| Roll back all 33 created ads | Decided launch was a mistake | Manual archive 33 ads via Meta UI or API loop (no `unpublish-all.ts` in scope) | 10-30 min |

**Cannot rollback:** spend already incurred after un-pause. One-way.

---

## 12. Acceptance criteria

1. `npm test` green (existing 1098+ tests + new tests from agents).
2. `npm run typecheck` (or equivalent `tsc --noEmit`) passes.
3. `npm run advertising:pre-launch-check` still 23/23 passed.
4. Adapter implements both interfaces (`MetaApiClient` + extended `MetaAdClient` with `createCampaign` + `createAdSet`) — TS compiler enforces.
5. `setup-meta-campaign.ts` runs end-to-end against Meta API and creates a Campaign + 2 Ad Sets (visible in Meta Business Manager UI, all in `PAUSED` status). IDs printed plus `vercel env add` commands.
6. After founder runs the printed `vercel env add` commands and redeploys, `publish-approved.ts --dry-run` prints correct preview without errors.
7. One creative successfully appears in Meta Ads Manager as paused with all fields correct (asset, copy, CTA, UTM in link, adset linkage to our launch Campaign/AdSet).
8. Admin "Publish all approved" button works: triggers the endpoint, shows progress, ends with summary `{uploaded, failed, skipped}`. CLI and endpoint produce the same result for the same DB state (idempotency).
9. 20 new creatives generated and approved (after admin click) — visible at `/admin/advertising/creatives/review?status=approved`.
10. 2 bad creatives in DB at `status='rejected'` (`QgVH83CNEv1unzbRdOKJC`, `V8a1sQF5SwR1P-OGOIrfo`).
11. Admin review page shows status filter dropdown; default `pending_review`, switchable to all values including `all`.
12. Production deploy successful; ENABLED=true, DRY_RUN=true; cron handlers continue triggering Telegram alerts.

---

## 13. Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Meta Graph API changes response format | Low | Medium | Adapter isolated in one module |
| Vercel Blob URL unavailable when Meta fetches | Medium | Low | Retry + transient-error reclassification |
| Imagen 4 keeps generating with constellation lines | High | Medium (visual not ideal) | Founder review per creative, safe fallback |
| Founder accidentally clicks Approve on bad creative → auto-uploads paused | Medium | Low (paused, no spend) | Reject through UI; archive in Meta UI |
| Race between bulk publish and auto-upload-on-approve | Low | Low | Idempotency guard in CLI (search-before-upload) |
| Someone runs CLI locally against prod DB | Medium | High | CLI requires `META_ACCESS_TOKEN` — fails without it; `.env` not auto-loaded with prod keys |
| Adapter tests mock incorrectly — production fails | Low | High | Smoke step before bulk: 1 ad → manual verify in Meta UI |

---

## 14. References

- `docs/advertising/launch-runbook.md` — operational playbook (Phases 0-4)
- `docs/advertising/dry-run-smoke-test.md` — pre-launch verification results (2026-04-26)
- `docs/marketing.md` — Cold Start Strategy, Brand Voice rules
- `docs/superpowers/plans/2026-04-26-advertising-agent.md` — predecessor implementation plan
- `src/modules/advertising/creative-gen/templates/hooks-{en,es}.ts` — full hook template catalog (36 templates, 3 in production use)
- `src/shared/lib/schema.ts:209-230` — `advertising_creatives` schema
- `src/modules/advertising/creative-gen/upload/meta-upload.ts` — `MetaApiClient` interface + `uploadApprovedCreative` business logic
- `src/modules/advertising/act/meta-marketing.ts` — `MetaAdClient` interface (currently 34-line shim)

---

## 15. Resolutions log

Resolutions captured during brainstorming for traceability:

1. **Launch adsets** — Not preconfigured in Meta Business Manager. **Resolved:** generate Campaign + EN/ES Ad Sets via Meta API in a one-off setup CLI (`setup-meta-campaign.ts`). Agent 11 owns this. See §5.6 + §10 step 1.
2. **`publish-batch` admin endpoint** — **In scope.** CLI and endpoint share the same service module to avoid duplication. UI gets a "Publish all approved" button on the review page. Agent 6 owns CLI + endpoint; Agent 10 owns the button. See §5.6 + §9.1 row 6 + row 10.
3. **Day-7 review reminder doc** — **Not in scope.** Relying on the existing scheduled remote agent (`trig_012WMFuy4qxchNRKhtu14YUu`) which fires on 2026-05-09 14:00 UTC and opens a GitHub issue with the manual review checklist.
