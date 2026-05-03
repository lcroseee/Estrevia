# Advertising Agent — Pre-flight Blockers (v3a)

**Date:** 2026-05-03
**Author:** brainstorming session (founder + assistant)
**Scope:** 9 independent fixes that MUST ship before the autonomous advertising agent (Senior Buyer Mode, v3b spec) can safely exit `ADVERTISING_AGENT_DRY_RUN=true`. Without these the agent makes decisions on incomplete/unreliable infrastructure (stub audiences, missing safety checks, no reconciler safety, dangerous legacy constants).
**Status:** approved for plan-writing.
**Depends on:** none — can ship before any other spec.
**Blocks:** v3b (Senior Buyer Mode) — agent should not be flipped to `seniorBuyerMode='on'` until all 9 fixes here are deployed and verified.

---

## Context

Today's audit (after first draft of v3b Senior Buyer Mode spec) revealed 13 not-covered + 4 partially-covered functional/safety gaps in the advertising agent infrastructure. The Senior Buyer Mode spec focused on decision-making logic but assumed surrounding infrastructure (audiences, safety checks, reconciler safety, attribution windows) was production-ready. It is not.

**Current state of advertising agent in production** (as of 2026-05-03):

| Component | State |
|---|---|
| Cron routes (triage-hourly, triage-daily, retro-weekly, audience-refresh, account-health-weekly) | All deployed, all running per Vercel cron schedule |
| Tier-1 hard rules | Active (`LEARNING_PHASE_DAYS=2` — too aggressive) |
| Tier-2 Bayesian | Shadow mode (no autonomous decisions) |
| Tier-3 anomaly | Skipped (no baselines) |
| `audience-refresh` cron | Running daily 06:00 UTC, but ALL deps are stubs (returns `[]`, throws `not implemented`) |
| Pixel + CAPI | Env vars set, **NOT integrated in code** (deferred to v3b Stage 0) |
| Reconciler critical_drift | Alerts via Telegram, agent continues making decisions on drifted data |
| Brand consistency check | Stub `passed=true` |
| Controversial symbol check | Stub `passed=true` |
| Frequency control on ad sets | Not configured (relies only on agent post-fact pause at agg `frequency >= 4.0`) |
| Attribution windows | Meta defaults (7d_click + 1d_view), PostHog session-based, Stripe undefined — divergence not addressed |
| Retro-weekly feature gate evaluator | Uses `total_impressions: 0`, `days_running: 0` placeholders — gates never mature |
| Admin UI auth | Working (parent `/admin/layout.tsx` calls `getAdminUser` → `ADMIN_ALLOWED_EMAILS` allowlist) — needs env verification only |
| `ADVERTISING_AGENT_DRY_RUN` | Set to `true` in production today (immediate safety while specs were being designed) |
| `ADVERTISING_AGENT_ENABLED` | Set to `true` (kill switch off — cron logic runs, just doesn't call Meta API due to DRY_RUN) |

This spec covers the 9 P0/P1 items required to make the agent safely deployable.

---

## Goals

1. Eliminate the dangerous `LEARNING_PHASE_DAYS=2` constant in legacy Tier-1 path (defensive baseline raise).
2. Implement `audience-refresh` cron's 7 stubbed dependencies (Stripe, PostHog, Meta API, Drizzle) so retargeting and exclusion audiences actually exist and update daily.
3. Configure per-user frequency control (`frequency_control_specs`) at Meta ad set level (not just post-fact agent pause).
4. Standardize attribution windows: Meta 7d_click for phase detection, PostHog 14d for ROAS/CPA, Stripe 14d. Hybrid by purpose per Q4.
5. Replace stub safety checks (brand consistency, controversial symbol) with real Gemini Vision API integration.
6. Add reconciler global suspend mechanism with 24h auto-resume — when Meta vs PostHog drift >25%, agent halts non-emergency decisions until data integrity restored.
7. Replace placeholder `0` values in retro-weekly feature gate evaluator with real Meta Insights aggregates.
8. Extend `pre-launch-check` script with all required production env vars and add `verify-prod-state` operational script.
9. Document and verify production env state (DRY_RUN, ENABLED, ADMIN_ALLOWED_EMAILS, NEXT_PUBLIC_META_PIXEL_ID).

## Non-goals

- Lookalike audiences (LCA 1/5/10%) — deferred to v3c backlog.
- Creative testing matrix (factorial A/B framework) — deferred to v3c.
- Real-time Tier 2/3 disagreement alerts — observability nice-to-have, deferred to v3c.
- Persistent `DropOffStore` (Drizzle-backed) — observability, deferred to v3c.
- Stale-audience health check (depends on this spec's #2 first) — deferred to v3c.
- CSV/JSON decision-log export from admin UI — observability, deferred to v3c.
- Admin UI shadow-log replay verification — verify-only task, can be done as part of testing this spec.
- Per-phase dynamic frequency caps — deferred to v3b Senior Buyer Mode (after data validates need).
- Custom Audience advanced matching (phone, address, name) — basic email-only matching for MVP.
- Meta CAPI integration — that's v3b Stage 0 (pre-flight here only adds infrastructure, CAPI is its own deliverable).
- Replacement of Tier 1 hard rules with phase-based logic — that IS v3b Senior Buyer Mode.

---

## Architecture

v3a is **9 independent fixes**, not one cohesive feature. Most touch existing modules; one adds a single new DB table; two add new modules (`vision-checker`, `audiences/*`). All fixes ship to existing `src/modules/advertising/` infrastructure without restructuring.

```
┌─────────────────────────────────────────────────────────────────┐
│  Existing advertising agent infrastructure                       │
│                                                                  │
│   perceive/                          (modified — fix #4 + #7)    │
│   ├── meta-insights.ts               attribution_windows         │
│   ├── posthog-funnel.ts              attribution_window_days     │
│   ├── stripe-attribution.ts          14d window                  │
│   ├── reconciler.ts                  global suspend + auto-resume│
│   └── recon-state-store.ts           [NEW]                       │
│                                                                  │
│   decide/                            (modified — fix #1)         │
│   ├── tier-1-rules.ts                LEARNING_PHASE_DAYS = 7     │
│   └── orchestrator.ts                gated by recon suspend      │
│                                                                  │
│   audiences/                         (modified — fix #2)         │
│   ├── stripe-client.ts               [NEW] real Stripe SDK       │
│   ├── posthog-emails.ts              [NEW] real PostHog HogQL    │
│   ├── meta-custom-audiences.ts       [NEW] real Meta API         │
│   ├── audience-row-store.ts          [NEW] Drizzle CRUD          │
│   └── refresh-cycle.ts               [unchanged orchestration]   │
│                                                                  │
│   creative-gen/safety/               (modified — fix #5 + #6)    │
│   ├── checks.ts                      brand + symbol use vision   │
│   └── vision-checker.ts              [NEW] Gemini Vision wrapper │
│                                                                  │
│   meta-graph-api/                    (modified — fix #3)         │
│   └── ad-client.ts                   createAdSet accepts         │
│                                       frequencyControlSpecs      │
│                                                                  │
│   shared/lib/schema.ts               (modified — fix #7)         │
│   └── advertising_recon_state        [NEW] single-row table      │
│                                                                  │
│   app/admin/advertising/             (modified — fix #7)         │
│   └── recon-state/page.tsx           [NEW] founder unblock UI    │
│                                                                  │
│   app/api/cron/advertising/                                       │
│   ├── audience-refresh/route.ts      (modified — fix #2)         │
│   ├── retro-weekly/route.ts          (modified — fix #8)         │
│   └── triage-daily/route.ts          (modified — fix #7 auto-resume check)│
│                                                                  │
│   scripts/advertising/               (modified — fix #3 + #9)    │
│   ├── setup-meta-campaign.ts         frequency_control_specs     │
│   ├── pre-launch-check.ts            new env vars                │
│   ├── verify-prod-state.ts           [NEW] env audit (manual)    │
│   └── migrate-frequency-caps.ts      [NEW] one-shot for existing │
│                                                                  │
│   docs/advertising/                                              │
│   ├── attribution-windows.md         [NEW] documentation         │
│   └── deploy-runbook.md              [NEW] verification steps    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Per-fix design

### Fix #1 — Defensive raise of `LEARNING_PHASE_DAYS`

**Problem:** `src/modules/advertising/decide/tier-1-rules.ts:7` has `const LEARNING_PHASE_DAYS = 2`. Standard Meta best practice is 7 days minimum. Two days is "nervous beginner" — paused healthy ad sets during normal cold-start CPC elevation. v3b senior buyer mode replaces this constant entirely (`phase_b_max_days=14`), but the constant remains live for `seniorBuyerMode='off'` emergency rollback path. If ever flipped back, the dangerous behavior returns.

**Fix:**
```ts
// src/modules/advertising/decide/tier-1-rules.ts
- const LEARNING_PHASE_DAYS = 2;
+ // Senior buyer baseline. v3b Senior Buyer Mode supersedes this with Phase B max_days=14
+ // and Q5 conversion-based transition. Kept here as defensive minimum for legacy rollback.
+ const LEARNING_PHASE_DAYS = 7;
```

**Test changes** (`src/modules/advertising/decide/__tests__/tier-1-rules.test.ts:8-23`):
- `'holds during learning phase (days_running < 2)'` → `'holds during learning phase (days_running < 7)'`
- `mockAdMetric({ days_running: 1 })` → `mockAdMetric({ days_running: 6 })`
- `'does NOT hold when days_running exactly equals threshold (2)'` → `'(7)'`
- `mockAdMetric({ days_running: 2, ... })` → `mockAdMetric({ days_running: 7, ... })`

**Time:** 30 min.

### Fix #2 — `audience-refresh` real dependencies

**Problem:** `src/app/api/cron/advertising/audience-refresh/route.ts:79-114` builds `ExclusionsDeps` and `RetargetingDeps` with 7 stub functions:
- `stripe.listActiveCustomers` returns `[]`
- `posthog.getRecentlyRegisteredEmails` returns `[]`
- `posthog.getCalcNoRegisterEmails` returns `[]`
- `posthog.getRegisterNoPaidEmails` returns `[]`
- `metaApi.upsertCustomAudience` throws `not yet implemented`
- `db.upsertAudienceRow` returns placeholder

Result: cron runs daily, succeeds, but creates/updates no actual audiences. Retargeting & exclusion audiences never exist. If agent ever scales (post-DRY_RUN), it serves ads to existing subscribers (no exclusion list).

**Fix — 4 new modules:**

```
src/modules/advertising/audiences/
├── stripe-client.ts                NEW
├── posthog-emails.ts               NEW
├── meta-custom-audiences.ts        NEW
└── audience-row-store.ts           NEW
```

**`stripe-client.ts`** — real Stripe SDK wrapper:
```ts
import { getStripe } from '@/shared/lib/stripe';

export async function listActiveCustomers(): Promise<string[]> {
  const stripe = getStripe();
  const emails: string[] = [];
  let starting_after: string | undefined;

  // Paginate through all subscriptions with status=active
  while (true) {
    const subs = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after,
      expand: ['data.customer'],
    });

    for (const sub of subs.data) {
      const cust = sub.customer as Stripe.Customer;
      if (cust.email) emails.push(normalizeEmail(cust.email));
    }

    if (!subs.has_more) break;
    starting_after = subs.data[subs.data.length - 1].id;
  }

  return [...new Set(emails)]; // dedupe
}

function normalizeEmail(e: string): string {
  return e.toLowerCase().trim();
}
```

**`posthog-emails.ts`** — HogQL queries (use existing PostHog client pattern from `funnel-client.ts`):
```ts
export async function getRecentlyRegisteredEmails(sinceDate: Date): Promise<string[]> {
  const sinceIso = sinceDate.toISOString();
  // user_registered events with email property in last sinceDate window
  const query = `SELECT DISTINCT properties.email AS email
                 FROM events
                 WHERE event = 'user_registered'
                   AND timestamp >= toDateTime('${sinceIso}')
                   AND properties.email IS NOT NULL`;
  return await runHogQL(query);
}

export async function getCalcNoRegisterEmails(windowDays: number): Promise<string[]> {
  // Users who fired chart_calculated but NOT user_registered in window
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const query = `SELECT DISTINCT properties.email AS email
                 FROM events
                 WHERE event = 'chart_calculated'
                   AND timestamp >= toDateTime('${sinceIso}')
                   AND properties.email IS NOT NULL
                   AND distinct_id NOT IN (
                     SELECT DISTINCT distinct_id FROM events
                     WHERE event = 'user_registered'
                       AND timestamp >= toDateTime('${sinceIso}')
                   )`;
  return await runHogQL(query);
}

export async function getRegisterNoPaidEmails(windowDays: number): Promise<string[]> {
  // Users who registered but did NOT subscribe in window
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const query = `SELECT DISTINCT properties.email AS email
                 FROM events
                 WHERE event = 'user_registered'
                   AND timestamp >= toDateTime('${sinceIso}')
                   AND properties.email IS NOT NULL
                   AND distinct_id NOT IN (
                     SELECT DISTINCT distinct_id FROM events
                     WHERE event = 'subscription_started'
                       AND timestamp >= toDateTime('${sinceIso}')
                   )`;
  return await runHogQL(query);
}
```

`runHogQL` is a shared helper that POSTs to `${posthog_host}/api/projects/${id}/query/` with `Authorization: Bearer ${PERSONAL_API_KEY}` (same pattern as `funnel-client.ts:71-79`).

**`meta-custom-audiences.ts`** — Meta Custom Audiences API:
```ts
import crypto from 'crypto';

export interface UpsertCustomAudienceOpts {
  name: string;
  description: string;
  emails: string[];  // already normalized lowercase+trim
  meta_audience_id?: string;  // if exists, update; else create
}

export async function upsertCustomAudience(opts: UpsertCustomAudienceOpts): Promise<{ audience_id: string; size: number }> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  // Hash each email — Meta requires SHA-256 hashed PII
  const hashedEmails = opts.emails.map(e => sha256Hex(e));

  let audienceId = opts.meta_audience_id;
  if (!audienceId) {
    // Create new audience
    const createRes = await fetch(`https://graph.facebook.com/v22.0/${adAccountId}/customaudiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: opts.name,
        description: opts.description,
        subtype: 'CUSTOM',
        customer_file_source: 'USER_PROVIDED_ONLY',
        access_token: accessToken,
      }),
    });
    if (!createRes.ok) throw new Error(`Meta createCustomAudience failed: ${createRes.status} ${await createRes.text()}`);
    audienceId = (await createRes.json()).id;
  }

  // REPLACE the audience contents (full daily rebuild)
  // Meta supports `payload.session` for batched uploads — for MVP volume (<10k emails)
  // single batch is fine.
  const replaceRes = await fetch(`https://graph.facebook.com/v22.0/${audienceId}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: {
        schema: ['EMAIL'],
        data: hashedEmails.map(h => [h]),
      },
      session: {
        session_id: Date.now(),
        batch_seq: 1,
        last_batch_flag: true,
      },
      access_token: accessToken,
    }),
  });
  if (!replaceRes.ok) throw new Error(`Meta upsertAudience users failed: ${replaceRes.status} ${await replaceRes.text()}`);
  const result = await replaceRes.json();

  return { audience_id: audienceId!, size: result.num_received ?? opts.emails.length };
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
```

**`audience-row-store.ts`** — Drizzle CRUD on existing `advertising_audiences` table:
```ts
import { getDb } from '@/shared/lib/db';
import { advertisingAudiences } from '@/shared/lib/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function upsertAudienceRow(row: {
  kind: 'exclusion' | 'retargeting_calc_no_register' | 'retargeting_register_no_paid' | 'lookalike_seed';
  metaAudienceId: string | null;
  size: number;
  sourceQuery: string;
}): Promise<{ id: string }> {
  const db = getDb();
  // Check if row exists by kind
  const existing = await db.select({ id: advertisingAudiences.id })
    .from(advertisingAudiences)
    .where(eq(advertisingAudiences.kind, row.kind))
    .limit(1);

  if (existing.length > 0) {
    await db.update(advertisingAudiences)
      .set({
        metaAudienceId: row.metaAudienceId,
        size: row.size,
        lastRefreshedAt: new Date(),
        sourceQuery: row.sourceQuery,
      })
      .where(eq(advertisingAudiences.id, existing[0].id));
    return { id: existing[0].id };
  }

  const id = nanoid();
  await db.insert(advertisingAudiences).values({
    id,
    kind: row.kind,
    metaAudienceId: row.metaAudienceId,
    size: row.size,
    lastRefreshedAt: new Date(),
    sourceQuery: row.sourceQuery,
    activeInCampaigns: [],
  });
  return { id };
}
```

**Wiring in `audience-refresh/route.ts:79-114`**:
```ts
import * as stripeClient from '@/modules/advertising/audiences/stripe-client';
import * as posthogEmails from '@/modules/advertising/audiences/posthog-emails';
import * as metaCustomAudiences from '@/modules/advertising/audiences/meta-custom-audiences';
import * as audienceRowStore from '@/modules/advertising/audiences/audience-row-store';

function buildExclusionsDeps(): ExclusionsDeps {
  return {
    stripe: { listActiveCustomers: stripeClient.listActiveCustomers },
    posthog: { getRecentlyRegisteredEmails: posthogEmails.getRecentlyRegisteredEmails },
    metaApi: { upsertCustomAudience: metaCustomAudiences.upsertCustomAudience },
    db: { upsertAudienceRow: audienceRowStore.upsertAudienceRow },
  };
}

function buildRetargetingDeps(): RetargetingDeps {
  return {
    posthog: {
      getCalcNoRegisterEmails: (days) => posthogEmails.getCalcNoRegisterEmails(days),
      getRegisterNoPaidEmails: (days) => posthogEmails.getRegisterNoPaidEmails(days),
    },
    metaApi: { upsertCustomAudience: metaCustomAudiences.upsertCustomAudience },
    db: { upsertAudienceRow: audienceRowStore.upsertAudienceRow },
  };
}
```

**Error handling:** per existing pattern in `refresh-cycle.ts` — each audience kind wrapped in try/catch, failed kinds logged in summary `failed_audiences` count, other audiences continue. Sentry capture per failure with `{ subsystem: 'audiences', kind, source: 'stripe'|'posthog'|'meta' }` tags.

**Time:** 8-12 hours.

### Fix #3 — Frequency control on ad sets

**Problem:** Tier-1 rule pauses ad set when aggregate `frequency >= 4.0`. But aggregate frequency hides per-user variance: some users may have seen the ad 8-10 times before average reaches 4. Result: irritation → negative Meta feedback → delivery degradation. The fix is at the ad set creation level (`frequency_control_specs`), not post-fact pausing.

**Fix part 1 — extend `MetaAdManagementClient.createAdSet`** (`src/modules/advertising/meta-graph-api/ad-client.ts:199-260`):

Add `frequencyControlSpecs` to `CreateAdSetOpts`:
```ts
export interface CreateAdSetOpts {
  // ...existing fields...
  frequencyControlSpecs?: Array<{
    event: 'IMPRESSIONS' | 'REACH';
    interval_days: number;
    max_frequency: number;
  }>;
}
```

Pass through in API request body (around line 215):
```ts
const body: Record<string, unknown> = {
  // ...existing fields...
  optimization_goal: opts.optimizationGoal,
  billing_event: opts.billingEvent,
  status: opts.status,
};

if (opts.frequencyControlSpecs) {
  body.frequency_control_specs = opts.frequencyControlSpecs;
}
```

**Fix part 2 — set MVP cap in setup script** (`scripts/advertising/setup-meta-campaign.ts:57-77`):

Both `createAdSet` calls add:
```ts
frequencyControlSpecs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 10 }],
```

This caps each user to ~1.4 impressions/day on average per ad set — comfortable for astrology niche (not too aggressive, allows Meta enough impressions for learning).

**Fix part 3 — migration script for existing ad sets** (`scripts/advertising/migrate-frequency-caps.ts` — NEW):

Existing 2 ad sets in production were created BEFORE this fix. Need a one-shot script that calls `MetaAdManagementClient.updateAdSet(adsetId, { frequencyControlSpecs: [...] })` for each of `META_LAUNCH_ADSET_ID_EN` and `META_LAUNCH_ADSET_ID_ES` from env.

This requires adding an `updateAdSet` method to `MetaAdManagementClient` if it doesn't exist (existing `updateAdSetBudget` may need expansion).

**Time:** 1 hour (script + migration).

### Fix #4 — Hybrid attribution windows

**Problem:** Meta uses defaults (7d_click + 1d_view), PostHog session-based (typically last-touch within active session), Stripe attribution implicit (relies on `session.metadata.utm_*` set at checkout creation but no explicit window). Astrology vertical has 30-50% delayed conversions (7-14 days post-click) — current attribution misses them.

**Fix per Q4 hybrid by purpose:**
- **Meta data (for phase detection)**: `action_attribution_windows: ['7d_click']` — single window, no view (view-attribution causes inflation)
- **PostHog data (for ROAS / CPA / drop detection)**: 14-day window from click time
- **Stripe data (for revenue)**: 14-day from click time
- **Reconciler queries**: aligned at 7d_click (apples-to-apples)

**Fix part 1 — `meta-insights.ts`**:
Pass `action_attribution_windows: ['7d_click']` in Meta Insights request. Surface conversion counts derived from `actions` field filtered by event type (`Lead`, `Subscribe`).

**Fix part 2 — `posthog-funnel.ts`**:
Extend `getFunnel` interface to accept `attribution_window_days`:
```ts
async getFunnel(opts: {
  date_from: string;
  date_to: string;
  filters?: { utm_source?: string; ad_id?: string };
  attribution_window_days?: number;  // NEW — default 14
}): Promise<FunnelSnapshot>;
```

Default 14 in the implementation. In HogQL query, when `filters.ad_id` is present, restrict to events where `event_time` is within `attribution_window_days` of the most recent ad click event for the same `distinct_id`. (Implementation detail: HogQL has `argMin`/`argMax` for finding the click time per distinct_id, then comparing event time to it.)

For reconciliation queries: pass `attribution_window_days: 7` from `reconciler.ts` callsite to compare apples-to-apples with Meta's 7d_click.

**Fix part 3 — `stripe-attribution.ts`**:
Extend `fetchStripeAttribution` to filter `subscription.created_at` within 14 days of `metadata.utm_click_timestamp` (set at checkout session creation). If no `utm_click_timestamp` in metadata (legacy subs), fall back to created_at since checkout.

**Fix part 4 — documentation**:
NEW file `docs/advertising/attribution-windows.md` documenting:
- Why hybrid (Meta/PostHog/Stripe disagree on attribution)
- What windows for what purpose
- How to recalibrate if astrology vertical shows different decay curve in 3-6 months

**Time:** 4-6 hours.

### Fix #5 + #6 — Vision-based brand + symbol checks

**Problem:** `creative-gen/safety/checks.ts:122-163` has both `brandConsistencyCheck` and `controversialSymbolCheck` as stubs returning `passed: true`. Off-brand creatives and policy-violating symbols pass without filter.

**Fix — NEW module `src/modules/advertising/creative-gen/safety/vision-checker.ts`:**

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface VisionAnalysisResult {
  json: Record<string, unknown>;
  cost_usd: number;
}

export interface VisionClient {
  analyzeImage(imageUrl: string, prompt: string): Promise<VisionAnalysisResult>;
}

export class GeminiVisionClient implements VisionClient {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.genAI = new GoogleGenerativeAI(opts.apiKey);
    this.model = opts.model ?? 'gemini-2.5-flash';
  }

  async analyzeImage(imageUrl: string, prompt: string): Promise<VisionAnalysisResult> {
    const model = this.genAI.getGenerativeModel({ model: this.model });
    // Fetch image, base64-encode, send to Gemini
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`);
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = imageRes.headers.get('content-type') ?? 'image/jpeg';

    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      prompt + '\nRespond ONLY with valid JSON, no other text.',
    ]);
    const text = result.response.text();
    const json = JSON.parse(text);
    // Approximate cost: gemini-2.5-flash ~ $0.0002 per image at MVP volumes
    return { json, cost_usd: 0.0002 };
  }
}

export function createGeminiVisionClient(): VisionClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  return new GeminiVisionClient({ apiKey });
}
```

**Fix part 2 — replace stubs in `safety/checks.ts:122-163`:**

```ts
const BRAND_PALETTE = ['#FFD700', '#C0C0C0', '#9B8EC4', '#0A0A0F'] as const;

const BRAND_PROMPT = `Does this image use the Estrevia astrology app brand palette? Approved colors: gold (${BRAND_PALETTE[0]}), silver (${BRAND_PALETTE[1]}), deep purple (${BRAND_PALETTE[2]}), dark navy (${BRAND_PALETTE[3]}). The dominant 3-4 colors of the image should match within reasonable tolerance (CIE76 ΔE ≤ 25 — generous for AI-generated variations). Respond JSON: {"passed": boolean, "dominantColors": ["#hex", "#hex", ...], "reason": "..."}.`;

const SYMBOL_PROMPT = `Identify any of the following in this image: pentagrams (5-pointed star inscribed in circle), inverted crosses, swastikas, religious crosses or crescents or stars-of-david, occult/satanic symbols. Innocuous astrological symbols (planet glyphs ☉☽♀♂♃, zodiac signs ♈♉♊, traditional astrology imagery) are ALLOWED — do not flag those. Respond JSON: {"found": boolean, "items": ["item1", "item2"], "reason": "..."}.`;

export async function brandConsistencyCheck(
  creative: CreativeBundle,
  deps: SafetyDeps & { visionClient?: VisionClient },
): Promise<SafetyCheckResult> {
  if (!deps.visionClient) {
    // Soft-fail with warning if no client configured (e.g. tests without vision)
    return {
      check_name: 'brand_consistency',
      passed: true,
      severity: 'info',
      reason: 'Vision client not configured — check skipped',
    };
  }
  try {
    const result = await deps.visionClient.analyzeImage(creative.asset.url, BRAND_PROMPT);
    const json = result.json as { passed: boolean; dominantColors: string[]; reason: string };
    return {
      check_name: 'brand_consistency',
      passed: json.passed,
      severity: json.passed ? 'info' : 'warning',
      reason: json.reason ?? `dominant colors: ${json.dominantColors?.join(', ') ?? 'unknown'}`,
    };
  } catch (err) {
    // Vision API failure → soft-fail with warning, don't block creative
    return {
      check_name: 'brand_consistency',
      passed: true,
      severity: 'warning',
      reason: `Vision check failed (degraded): ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

export async function controversialSymbolCheck(
  imageUrl: string,
  deps: SafetyDeps & { visionClient?: VisionClient },
): Promise<SafetyCheckResult> {
  if (!deps.visionClient) {
    return {
      check_name: 'controversial_symbol',
      passed: true,
      severity: 'info',
      reason: 'Vision client not configured — check skipped',
    };
  }
  try {
    const result = await deps.visionClient.analyzeImage(imageUrl, SYMBOL_PROMPT);
    const json = result.json as { found: boolean; items: string[]; reason: string };
    return {
      check_name: 'controversial_symbol',
      passed: !json.found,
      severity: json.found ? 'block' : 'info',  // BLOCK on violation — Meta policy compliance
      reason: json.found ? `Detected: ${json.items?.join(', ')} — ${json.reason}` : undefined,
    };
  } catch (err) {
    // Vision failure → block to be safe (Meta policy violation = ad reject = wasted spend)
    return {
      check_name: 'controversial_symbol',
      passed: false,
      severity: 'warning',
      reason: `Vision check failed — manual review recommended: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}
```

**Asymmetric error handling rationale:**
- Brand check: failure → pass with warning (off-brand is bad but not blocking)
- Symbol check: failure → fail with warning (Meta policy violation = ad reject = wasted impression budget = worse than soft-fail)

**Cost monitoring:** track `cost_usd` returned from vision calls. Aggregate weekly in `retro-weekly` digest. Telegram warning if `>$5/week` (early signal of runaway).

**Time:** 4-6 hours total (#5 + #6 share the same module).

### Fix #7 — Reconciler global suspend

**Problem:** `perceive/reconciler.ts:54-60` sends Telegram alert on `critical_drift` (Meta clicks vs PostHog landings ≥25% delta) but agent continues making decisions on drifted data. If pixel breaks, agent scales "successful" campaigns based on phantom conversions until founder reads Telegram and intervenes.

**Fix part 1 — NEW DB table `advertising_recon_state`:**

Single-row table in `src/shared/lib/schema.ts`:
```ts
export const advertisingReconState = pgTable('advertising_recon_state', {
  id: text('id').primaryKey().default('singleton'),  // always 'singleton'
  suspended: boolean('suspended').notNull().default(false),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspendReason: text('suspend_reason'),
  autoResumeAt: timestamp('auto_resume_at', { withTimezone: true }),
  lastDriftPct: real('last_drift_pct'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Migration via Drizzle: add table, seed singleton row with `suspended: false`.

**Fix part 2 — NEW module `perceive/recon-state-store.ts`:**

```ts
import { getDb } from '@/shared/lib/db';
import { advertisingReconState } from '@/shared/lib/schema';
import { eq } from 'drizzle-orm';

export interface ReconState {
  suspended: boolean;
  suspendedAt: Date | null;
  suspendReason: string | null;
  autoResumeAt: Date | null;
  lastDriftPct: number | null;
}

export async function getReconState(): Promise<ReconState> {
  const db = getDb();
  const rows = await db.select().from(advertisingReconState).where(eq(advertisingReconState.id, 'singleton')).limit(1);
  if (rows.length === 0) {
    // Bootstrap singleton row
    await db.insert(advertisingReconState).values({ id: 'singleton', suspended: false });
    return { suspended: false, suspendedAt: null, suspendReason: null, autoResumeAt: null, lastDriftPct: null };
  }
  const r = rows[0];
  return {
    suspended: r.suspended,
    suspendedAt: r.suspendedAt,
    suspendReason: r.suspendReason,
    autoResumeAt: r.autoResumeAt,
    lastDriftPct: r.lastDriftPct,
  };
}

export async function suspend(reason: string, driftPct: number, autoResumeHours = 24): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.update(advertisingReconState)
    .set({
      suspended: true,
      suspendedAt: now,
      suspendReason: reason,
      autoResumeAt: new Date(now.getTime() + autoResumeHours * 60 * 60 * 1000),
      lastDriftPct: driftPct,
      updatedAt: now,
    })
    .where(eq(advertisingReconState.id, 'singleton'));
}

export async function resume(reason: string): Promise<void> {
  const db = getDb();
  await db.update(advertisingReconState)
    .set({
      suspended: false,
      suspendedAt: null,
      suspendReason: null,
      autoResumeAt: null,
      updatedAt: new Date(),
    })
    .where(eq(advertisingReconState.id, 'singleton'));
}

export async function checkAutoResume(): Promise<{ resumed: boolean; reason?: string }> {
  const state = await getReconState();
  if (!state.suspended || !state.autoResumeAt) return { resumed: false };
  if (Date.now() < state.autoResumeAt.getTime()) return { resumed: false };
  // 24h elapsed — auto-resume (caller should re-run reconcile to verify drift restored)
  await resume('auto_resume_24h_elapsed');
  return { resumed: true, reason: 'auto_resume_24h_elapsed' };
}
```

**Fix part 3 — modify `reconciler.ts:54-60`:**

```ts
import { suspend } from './recon-state-store';

if (status === 'critical_drift') {
  // Existing alert
  if (opts.alertBot) {
    await opts.alertBot.sendMessage(
      `[perceive/reconciler] critical_drift detected — meta_clicks=${metaClicks}, posthog_landings=${phLandings}, delta_pct=${(delta_pct * 100).toFixed(1)}%`,
    );
  }

  // NEW: trigger global suspend
  await suspend(
    `critical_drift: meta=${metaClicks}, posthog=${phLandings}, delta=${(delta_pct * 100).toFixed(1)}%`,
    delta_pct,
    24,  // auto-resume in 24h
  );

  // NEW: explicit critical Telegram alert about suspension
  if (opts.alertBot) {
    await opts.alertBot.sendMessage(
      `🚨 ADVERTISING AGENT SUSPENDED — reconciler critical_drift. ` +
      `All non-emergency decisions paused for 24h auto-resume. ` +
      `Investigate Pixel/PostHog drift. Founder unblock: /admin/advertising/recon-state`,
    );
  }
}
```

**Fix part 4 — gate orchestrator**:

In `decide/orchestrator.ts`, at the top of `decide()`:
```ts
import { getReconState } from '@/modules/advertising/perceive/recon-state-store';

export async function decide(metrics, gates, deps): Promise<{decisions, shadowLog}> {
  const reconState = await getReconState();
  if (reconState.suspended) {
    // Allow only Phase B exceptions equivalent in legacy: pause-on-disapproval
    // Filter input metrics to ONLY those with status='DISAPPROVED' for emergency pause
    const emergencyMetrics = metrics.filter(m => m.status === 'DISAPPROVED');
    if (emergencyMetrics.length === 0) {
      return { decisions: [], shadowLog: [] };  // Hold everything
    }
    metrics = emergencyMetrics;  // Continue with only emergency-relevant
  }

  // ...existing decide logic...
}
```

**Fix part 5 — auto-resume check in cron:**

In `triage-daily/route.ts`, at start (after kill switch check):
```ts
import { checkAutoResume } from '@/modules/advertising/perceive/recon-state-store';
const resumeResult = await checkAutoResume();
if (resumeResult.resumed) {
  console.info('[triage-daily] reconciler auto-resumed after 24h');
  // Subsequent reconcile() call will detect if drift is still present and re-suspend if needed
}
```

**Fix part 6 — admin UI for founder unblock:**

NEW page `src/app/admin/advertising/recon-state/page.tsx`:
- Server Component, reads current reconState
- Shows: suspended? (Yes/No), suspendedAt, suspendReason, autoResumeAt
- "Resume Now" button — Server Action that calls `resume('founder_manual_override')`

Add nav link in `src/app/admin/advertising/layout.tsx`.

**Time:** 4-5 hours (DB + state store + reconciler + orchestrator gate + admin UI).

### Fix #8 — Retro-weekly real values

**Problem:** `cron/advertising/retro-weekly/route.ts:74-77`:
```ts
const updatedGates = await evaluateGates(
  { total_impressions: 0, days_running: 0 },  // Phase 2: real value from Meta
  gatesDb,
);
```

Feature gate activation criteria require `min_impressions_per_creative: 5_000` and `min_days_running: 14`. With `0` placeholders these conditions are NEVER met. Tier 2 (Bayesian) and Tier 3 (anomaly) gates can never auto-mature → manual flip required.

**Fix:**
```ts
// Aggregate real values from Meta Insights for past week
const weeklyMetrics = await fetchMetaInsights({
  apiClient: metaApiClient,
  dateFrom: weekAgo.toISOString().slice(0, 10),
  dateTo: now.toISOString().slice(0, 10),
});

const total_impressions = weeklyMetrics.reduce((sum, m) => sum + m.impressions, 0);

// days_running per ad set — use median across active ad sets as representative value
const daysSorted = weeklyMetrics
  .map(m => m.days_running)
  .filter(d => d > 0)
  .sort((a, b) => a - b);
const days_running = daysSorted.length > 0
  ? daysSorted[Math.floor(daysSorted.length / 2)]
  : 0;

const updatedGates = await evaluateGates(
  { total_impressions, days_running },
  gatesDb,
);
```

`metaApiClient` is already built in retro-weekly via `buildMetaApiClient()` — but currently returns stub `{ getInsights: async () => [] }` (line 158-164). Replace with real `createMetaAdClient()` wrapper (similar pattern as triage-daily).

**Time:** 1 hour.

### Fix #9 — Env verification + deploy checklist

**Problem:** Critical env vars (DRY_RUN, ENABLED, ADMIN_ALLOWED_EMAILS, NEXT_PUBLIC_META_PIXEL_ID) state in production not part of any verification flow. `pre-launch-check.ts` exists but doesn't cover all of these.

**Fix part 1 — extend `scripts/advertising/pre-launch-check.ts`:**

Add to env-vars check section:
```ts
const REQUIRED_ENV_VARS = {
  // ...existing entries...
  'NEXT_PUBLIC_META_PIXEL_ID': {
    required: true,
    visibility: 'public',  // exposed to browser
    purpose: 'Pixel script <head> injection (Stage 0 of v3b)',
  },
  'ADVERTISING_AGENT_ENABLED': {
    required: true,
    expectedValues: ['true', 'false'],
    purpose: 'kill switch — true = cron logic runs, false = early-return',
  },
  'ADVERTISING_AGENT_DRY_RUN': {
    required: true,
    expectedValues: ['true', 'false'],
    purpose: 'act-layer short-circuit — true = no Meta API mutations',
  },
  'ADMIN_ALLOWED_EMAILS': {
    required: true,
    validate: (v: string) => v.split(',').every(e => e.includes('@')),
    purpose: '/admin/* auth allowlist (Clerk + email check)',
  },
};
```

This script reads from `process.env` (already loaded via `dotenv/config`), so no shell command injection risk.

**Fix part 2 — NEW `scripts/advertising/verify-prod-state.ts`:**

This is a developer-facing operational tool. Approach: read from local `.env.production` file (after the operator has run `vercel env pull --environment=production` themselves), check that required vars are present and have valid shape.

```ts
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface CheckSpec {
  name: string;
  expected?: string;
  expectedNotEmpty?: boolean;
  forStage: 'pre-flight' | 'autonomous' | 'all';
}

const REQUIRED: CheckSpec[] = [
  { name: 'ADVERTISING_AGENT_ENABLED', expected: 'true', forStage: 'all' },
  { name: 'ADVERTISING_AGENT_DRY_RUN', expectedNotEmpty: true, forStage: 'all' },
  { name: 'NEXT_PUBLIC_META_PIXEL_ID', expectedNotEmpty: true, forStage: 'autonomous' },
  { name: 'ADMIN_ALLOWED_EMAILS', expectedNotEmpty: true, forStage: 'all' },
  { name: 'META_PIXEL_ID', expectedNotEmpty: true, forStage: 'all' },
  { name: 'META_CAPI_TOKEN', expectedNotEmpty: true, forStage: 'autonomous' },
];

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

async function main() {
  console.log('=== Production env state for advertising agent ===\n');
  console.log('Source: .env.production (run `vercel env pull --environment=production` first to refresh)\n');

  const envPath = join(process.cwd(), '.env.production');
  if (!existsSync(envPath)) {
    console.error('ERROR: .env.production not found.');
    console.error('Run: vercel env pull --environment=production');
    process.exit(1);
  }

  const env = loadEnvFile(envPath);
  let errors = 0;
  let warnings = 0;

  for (const spec of REQUIRED) {
    const value = env[spec.name];
    const set = !!value;

    if (!set) {
      console.log(`✗ ${spec.name} MISSING — required for stage: ${spec.forStage}`);
      if (spec.forStage === 'all' || spec.forStage === 'pre-flight') errors++;
      else warnings++;
      continue;
    }

    if (spec.expected && value !== spec.expected) {
      console.log(`⚠ ${spec.name}=${value} (expected: ${spec.expected}) — required for stage: ${spec.forStage}`);
      warnings++;
      continue;
    }

    console.log(`✓ ${spec.name} (${spec.forStage})`);
  }

  console.log(`\n${errors} error(s), ${warnings} warning(s)`);
  process.exit(errors > 0 ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
```

The script does NOT run shell commands itself — operator runs `vercel env pull` separately, then this script verifies the resulting `.env.production`. This avoids any subprocess execution risk.

**Fix part 3 — operational runbook:**

NEW file `docs/advertising/deploy-runbook.md`:
- Pre-flight (this spec) deploy: verify `ADVERTISING_AGENT_DRY_RUN=true`, run `npm run advertising:pre-launch-check`, manually `vercel env pull --environment=production` then run `npm run advertising:verify-prod-state`
- Stage 0 (v3b Pixel + CAPI) deploy: verify `NEXT_PUBLIC_META_PIXEL_ID` set, force-trigger one of each event, verify in Meta Events Manager Test Events
- Autonomous (v3b) flip: verify all of above + flip `ADVERTISING_AGENT_DRY_RUN=false`, monitor first 48h cron runs

**Time:** 1 hour (script + runbook).

---

## Cross-cutting concerns

### New env vars

None. All vars referenced already exist in production:
- `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` (used by audience-refresh)
- `STRIPE_SECRET_KEY` (used by stripe-client)
- `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` (used by posthog-emails)
- `GEMINI_API_KEY` (used by vision-checker)
- `ADMIN_ALLOWED_EMAILS`, `ADVERTISING_AGENT_ENABLED`, `ADVERTISING_AGENT_DRY_RUN` (verified by #9)

### New DB tables

One: `advertising_recon_state` (Fix #7). Single-row table.

### New Telegram alerts

- 🚨 Critical: reconciler global suspend triggered (#7)
- 🚨 Critical: reconciler auto-resume failed (drift persisted >24h) (#7)
- ⚠ Warning: vision check weekly cost > $5 (#5/#6)
- ⚠ Warning: audience-refresh `failed_audiences > 0` (#2)

### Sentry tags

Extends today's Track 9 pattern (`{ subsystem, db_layer }`):
- `vision-checker.ts`: `{ subsystem: 'creative-gen-safety', check: 'brand'|'symbol' }`
- `audiences/*.ts`: `{ subsystem: 'audiences', kind: 'exclusion'|'retargeting'|'lookalike', source: 'stripe'|'posthog'|'meta' }`
- `reconciler.ts` + `recon-state-store.ts`: `{ subsystem: 'reconciler', suspended: true|false }`

### Inter-fix dependencies

- Fixes #1, #3, #8 — independent, pure code changes
- Fix #2 — depends on existing SDKs (`stripe`, `posthog-node` already in `package.json`); no inter-fix dep
- Fix #4 — touches multiple perceive modules but no inter-fix dep
- Fixes #5+#6 — same module, internally sequential
- Fix #7 — adds new DB table, requires migration before route deploy
- Fix #9 — operational, runs after all code fixes deployed

### Wave structure for parallel agents

```
Wave 0 (parallel, no blockers — 6 agents):
  Track 1: #1 LEARNING_PHASE_DAYS raise + test
  Track 2: #3 frequency_control_specs in setup script + ad-client extension + migration script
  Track 3: #4a meta-insights attribution_windows
  Track 4: #4b posthog-funnel attribution_window_days
  Track 5: #4c stripe-attribution 14d window
  Track 6: #5+#6 vision-checker module + brand + symbol checks

Wave 1 (parallel, after #4b posthog-funnel API stable — 3 agents):
  Track 7: #2 audience-refresh implementations (4 new modules + wiring)
  Track 8: #7 reconciler suspend + DB table + state store + orchestrator gate + admin UI
  Track 9: #8 retro-weekly real values

Wave 2 (parallel, after all code merged — 2 agents):
  Track 10: #9 pre-launch-check extension + verify-prod-state script + deploy-runbook
  Track 11: Migration script execution against existing 2 production ad sets (one-shot, founder-confirmed)
```

11 tracks total. Same parallel pattern as today's 10-agent execution.

---

## Error handling

Per-fix error handling specified inline. Cross-cutting principle: **fail-safe defaults — on any error, the agent holds position rather than acting.**

Reuse today's Track 9 patterns:
- All cron-triggered work wrapped in try/catch with `Sentry.captureException` and `tags: { cron: true, route: '...', subsystem: '...' }`
- DB writes use `onConflictDoUpdate` for idempotent upserts where applicable
- External API failures (Meta, PostHog, Stripe, Gemini) caught, logged with warn, fall-through to safe defaults

Specific to v3a:
- Vision client failure on brand check → soft-pass with warning (not blocker)
- Vision client failure on symbol check → fail with warning (Meta policy = real consequence)
- Reconciler suspend cannot be DB-rolled-back — if `suspend()` fails → Sentry critical, alert founder, decision logic continues with WARNING log (degraded mode acceptable for one tick rather than total halt)
- Auto-resume fails to reconnect to drifted source → log warn, leave suspended, founder eventually intervenes

---

## Testing strategy

### Unit tests (TDD, Vitest)

```
src/modules/advertising/audiences/__tests__/
├── stripe-client.test.ts                  Mock Stripe SDK, verify pagination + dedup
├── posthog-emails.test.ts                 Mock fetch for HogQL, verify query shapes
├── meta-custom-audiences.test.ts          Mock fetch for Meta API, verify SHA-256 hash + payload
└── audience-row-store.test.ts             Mock Drizzle, verify upsert chain

src/modules/advertising/creative-gen/safety/__tests__/
├── vision-checker.test.ts                 Mock VisionClient, test analyzeImage
├── brand-consistency.test.ts              Replace stub test with vision-mocked test
└── controversial-symbol.test.ts           Replace stub test, verify BLOCK on found=true

src/modules/advertising/perceive/__tests__/
├── reconciler.test.ts                     Extend with suspend trigger + auto-resume cases
├── recon-state-store.test.ts              CRUD tests with mocked Drizzle
├── meta-insights.test.ts                  Verify attribution_windows in request
├── posthog-funnel.test.ts                 Verify attribution_window_days in HogQL
└── stripe-attribution.test.ts             Verify 14d window filter

src/modules/advertising/decide/__tests__/
├── tier-1-rules.test.ts                   Update boundary case 2 → 7
└── orchestrator.test.ts                   Verify suspend gate (returns empty when suspended)

src/modules/advertising/meta-graph-api/__tests__/
└── ad-client.test.ts                      Verify frequency_control_specs in createAdSet payload
```

Coverage targets per module: ≥85% (matching today's Track 9 baseline).

### Integration tests

Extend `cron-handlers.test.ts`:
- audience-refresh end-to-end: mock all SDKs, verify 4 audience kinds upserted
- triage-daily with reconciler suspended: verify decisions array empty (only DISAPPROVED ads slip through)
- triage-daily reconciler auto-resume: verify resume() called when 24h elapsed
- retro-weekly with real impressions: verify gate evaluator receives non-zero values

Extend `setup-meta-campaign.test.ts`:
- Verify `frequency_control_specs` in both `createAdSet` calls

### Manual verification post-deploy

**Wave-by-wave verification:**

After Wave 0:
- Run unit tests for all 6 tracks
- `npm run typecheck` clean

After Wave 1:
- Trigger `audience-refresh` cron via `curl`, verify summary shows non-zero `total_audiences` and zero `failed_audiences`
- Force a critical_drift scenario (manually set PostHog `landing_view` to 0 for a test window), verify reconciler suspends + Telegram alerts fire
- Verify admin UI `/admin/advertising/recon-state` shows suspended state + Resume Now button works

After Wave 2:
- Run `npm run advertising:pre-launch-check` — expect 0 errors
- Run `npm run advertising:verify-prod-state` — verify all required env vars set
- Execute `migrate-frequency-caps.ts` against production ad sets, verify Meta UI shows new frequency cap

### Pre-deploy gate (per-spec)

```bash
# Run all unit + integration tests for v3a scope
npx vitest run src/modules/advertising/audiences \
              src/modules/advertising/creative-gen/safety \
              src/modules/advertising/perceive \
              src/modules/advertising/decide \
              src/modules/advertising/meta-graph-api \
              src/app/api/cron/advertising

NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck

npm run lint -- src/modules/advertising/audiences \
                src/modules/advertising/creative-gen/safety \
                src/modules/advertising/perceive

# Operational verification
npm run advertising:pre-launch-check
npm run advertising:verify-prod-state
```

---

## Out of scope (deferred to v3c backlog)

- #3 Lookalike audiences (LCA 1/5/10%) — separate audience strategy spec
- #7 Creative testing matrix (factorial A/B framework) — separate testing spec
- #12 Real-time Tier 2/3 disagreement alerts — observability nice-to-have
- #13 Persistent DropOffStore (Drizzle) — observability
- #15 Stale-audience health check — depends on #2 (this spec) being live
- #16 CSV/JSON decision-log export — observability
- #17 Admin UI shadow-log replay verification — verify-only, can be done as part of v3a manual testing

## Out of scope (in v3b — Senior Buyer Mode)

- Per-phase frequency caps (this spec sets single 10/7d, v3b can dynamically adjust per phase if needed)
- Tier 2 / Tier 3 integration into Phase C policies
- Auto-calibrator weekly cron + drift trigger
- Data-maturity classifier (COLD_START / CALIBRATING / AUTONOMOUS)
- All decision-making logic (v3b is "what does the agent do", v3a is "what makes decisions reliable")
- Pixel + CAPI integration (Stage 0 of v3b — separate from this spec's pre-flight scope)

---

## Approval

Approved by founder via brainstorming session 2026-05-03. 4 architectural decisions confirmed:

| # | Decision | Choice |
|---|---|---|
| v3a-1 | Reconciler suspend scope | Global suspend with 24h auto-resume + founder unblock |
| v3a-2 | Attribution windows | Hybrid by purpose (Meta 7d_click for phase, PostHog 14d for ROAS, Stripe 14d) |
| v3a-3 | Frequency cap | `{IMPRESSIONS, 7d, 10}` constant for MVP — same on all ad sets and phases |
| v3a-4 | Brand + symbol check | Both via Gemini Vision (single integration point, $0.0002/check) |

All 9 mechanical/operational fixes (#1, #3, #8, #14 retro values, #18-20 env verification) handled per design without additional decisions needed.

Ready for plan-writing.
