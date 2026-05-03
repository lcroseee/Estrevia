# Senior Media Buyer Mode — Advertising Agent Redesign (Stage 0 + Autonomous System)

**Date:** 2026-05-03 (revised after ground-truth audit)
**Author:** brainstorming session (founder + assistant)
**Scope:** complete redesign of advertising agent with mandatory Pixel/CAPI infrastructure + per-ad-set data-maturity-driven autonomous decision-making + auto-calibrating thresholds. Replaces existing Tier-1 hard rules with a 4-phase ad-set lifecycle state machine that self-graduates between behaviors based on accumulated data.
**Status:** approved for plan-writing.

---

## Context — ground truth from 2026-05-03 audit

The autonomous advertising agent (`src/modules/advertising/`) shipped to production on 2026-05-03 with `ADVERTISING_AGENT_ENABLED=true`. Today's deploy (`8c5922a`) wired real Drizzle DB into spend-cap and audit factories. `ADVERTISING_AGENT_DRY_RUN=true` was set as immediate safety while this spec was being designed.

**Critical findings during ground-truth audit** (after first draft of this spec):

| Reality | Implication |
|---|---|
| **Pricing**: Premium $4.99/mo, $34.99/yr → realistic LTV $25-40 | Original spec's `target_cpa = $30` was **6x the monthly price** — completely wrong. Real targets: signup ≤$1.50, subscription ≤$10. |
| **Meta campaign**: 1 campaign / 2 ad sets (EN $14/d + ES $6/d = $20/d total, not $80) | Spend cap of $80/d gives 4x headroom. "21 ads" in earlier metrics = creatives within these 2 ad sets. |
| **Meta optimization goal: `LANDING_PAGE_VIEWS`** (`scripts/advertising/setup-meta-campaign.ts:53-65`) | Meta is NOT optimizing for any conversion event. Q3/Q5/Q11 of original spec assumed conversion-optimization which doesn't exist. |
| **Meta Pixel + CAPI**: env vars set 4 days ago, **but Pixel script NOT loaded on site, CAPI client NOT implemented** | Meta has zero visibility into our conversion funnel. Without this infrastructure all phase-detection logic is blind. |
| **Funnel events** (`landing_view`, `user_registered`, `subscription_started`) shipped today via PostHog only | Need to also fire to Meta CAPI (with dedupe via `event_id`) — current code does NOT do this. |
| **Data volume**: launch ~24-48h ago, no churn cohort yet | LTV math is forward-projection from price × estimated retention. Real LTV not measurable for ≥3 months. |

**Conclusion:** the original 742-line draft of this spec described a campaign at month 3-6. Estrevia is at day 1-2. This revised spec adds the missing Stage 0 (Pixel + CAPI infrastructure) AND restructures the agent into a **per-ad-set data-maturity-driven system** that automatically self-graduates between behavior modes (COLD_START → CALIBRATING → AUTONOMOUS) as data accumulates per ad set.

**The agent is fully autonomous from day 1** — no manual stage advancement. Behavior on each ad set tracks that ad set's accumulated data maturity.

---

## Goals

1. **Stage 0** — install Meta Pixel + CAPI integration so Meta can see and optimize against our conversion funnel events (`Lead`, `Subscribe`, custom `chart_calculated`). Hard prerequisite — without this, downstream goals don't function.
2. Replace Tier-1 hard rules with a 4-phase ad-set lifecycle state machine (Pre-launch / Learning / Active / Decline) that respects Meta's learning phase, scales via duplicate (not edit), and routes decisions through reversibility-based approval.
3. **Per-ad-set data maturity classification** — agent treats fresh ad sets (COLD_START) differently from established ones (AUTONOMOUS), automatically graduating each ad set as its data accumulates.
4. **Auto-calibrating thresholds** — no hardcoded numeric targets in the long term. Cold-start defaults from code (with realistic LTV-derived values for $4.99 product), then weekly + drift-triggered recalibration from rolling 30-day baselines per ad set.
5. Hybrid DB-stored thresholds (`advertising_thresholds` table) + code-default fallbacks → founder can override via existing admin UI; agent can self-update via auto-calibrator; tests use deterministic code defaults.
6. 2 new act types (`refresh_creative`, `propose_new_ad_set`) for Phase D, gated by reversibility-based approval flow.

## Non-goals

- Calendar / seasonality awareness (add as JSON config when reaching Q4 holidays).
- Telegram inbound commands — outbound notifications/approvals only.
- Auto-iteration loop on creative generation (per CLAUDE.md gate ~month 3+).
- CBO migration — current ABO structure preserved.
- Multi-creative ad sets with per-variant kill — single creative per ad set assumption maintained.
- Variance-based seasonality auto-detection.
- LTV measurement infrastructure — bootstrap with code-default $30 LTV until real cohort data exists (~month 6+).
- Replacement of Tier 2 (Bayesian) and Tier 3 (anomaly) — they become signal sources for Phase C, not removed.
- Audience size headroom checking (needs Meta API not currently wired).
- Per-campaign threshold overrides via configuration files — admin UI only.

---

## Architecture

```
                ┌────────────────────────────────────────────────────┐
                │  Stage 0 — Conversion infrastructure (foundation)   │
                │                                                      │
                │   Browser:  next/script Pixel snippet in RootLayout  │
                │              fbq('init', PIXEL_ID)                   │
                │              fbq('track', 'PageView')                │
                │              fbq('track', 'Lead')      ← user signup │
                │              fbq('track', 'Subscribe') ← stripe sub  │
                │                                                      │
                │   Server:   src/modules/advertising/meta-capi/       │
                │              sendCapiEvent({event, user_data,        │
                │                              custom_data, event_id}) │
                │              Dedupe via event_id keyed off userId    │
                │              + event_name + minute timestamp         │
                │                                                      │
                │   Wiring:   webhooks/clerk → trackEvent + capi('Lead')│
                │             webhooks/stripe → trackEvent + capi('Subscribe')│
                │             BirthDataForm → trackEvent + fbq('chart_calculated')│
                │             marketing/page → trackEvent + fbq('PageView')│
                └────────────────────────────────────────────────────┘
                                          │
                                          ▼  conversion data flows
                ┌────────────────────────────────────────────────────┐
                │  Senior Buyer Mode — autonomous decisioning          │
                │                                                      │
                │   Vercel cron triage-hourly + triage-daily           │
                │     │                                                │
                │     ▼                                                │
                │   Perceive (Meta + PostHog + Stripe + CAPI events)  │
                │     │                                                │
                │     ▼                                                │
                │   Phase Evaluator (per ad set, parallel)            │
                │     │                                                │
                │     ├─ data-maturity-classifier:                    │
                │     │     classifies ad set as COLD_START /          │
                │     │     CALIBRATING / AUTONOMOUS                  │
                │     │                                                │
                │     ├─ threshold-resolver:                          │
                │     │     reads from advertising_thresholds DB,     │
                │     │     falls back to code defaults if missing    │
                │     │                                                │
                │     ├─ phase determination (A/B/C/D/PAUSED)         │
                │     ├─ phase-specific policy applied with thresholds│
                │     ├─ decisions[] returned                          │
                │     │                                                │
                │     ▼                                                │
                │   Approval Router (Q12 reversibility)                │
                │     - REVERSIBLE → execute_immediately               │
                │     - LEARNING_RESET → LOW_RISK 4h auto-approve      │
                │     - NEW_SPEND → HIGH_RISK blocking                 │
                │     - data_maturity=COLD_START → suppress all except │
                │       Phase B exceptions + account emergency         │
                │     - data_maturity=CALIBRATING → all decisions      │
                │       routed via LOW_RISK approval (founder veto)    │
                │     - data_maturity=AUTONOMOUS → Q12 reversibility   │
                │                                                      │
                │     ▼                                                │
                │   Act layer: pause / scale / duplicate               │
                │              + NEW refresh_creative                  │
                │              + NEW propose_new_ad_set                │
                └────────────────────────────────────────────────────┘
                                          │
                                          ▼  weekly + drift-triggered
                ┌────────────────────────────────────────────────────┐
                │  Auto-calibrator (Q18 — hybrid weekly + drift)       │
                │                                                      │
                │   Weekly cron (Sunday 03:00 UTC):                    │
                │     for each ad set with ≥30 daily snapshots:        │
                │       baseline = baseline-calculator(history, 30d)   │
                │       new_thresholds = derive_from_baseline(baseline)│
                │       apply 4 protections (samples, outliers, bound, │
                │         fallback)                                     │
                │       upsert advertising_thresholds(...)              │
                │       trigger founder approval if change >2x          │
                │                                                      │
                │   Drift-triggered (after each triage-daily):         │
                │     if any ad set z-score > |3.0| from baseline:     │
                │       run calibration just for that ad set           │
                └────────────────────────────────────────────────────┘
```

### Data-maturity classification (per ad set)

```
classify(ad_set, history) → DataMaturityMode

  if conversions_total < 50 OR days_with_pixel_data < 14:
    return 'COLD_START'

  if conversions_total < 500 OR days_with_pixel_data < 60 OR
     baseline_stddev / baseline_mean > 0.5 (still volatile):
    return 'CALIBRATING'

  return 'AUTONOMOUS'
```

`conversions_total` is **Meta-attributed via Pixel + CAPI** (Q4 split — Meta drives Meta's view of learning maturity).

`days_with_pixel_data` counts days since Pixel/CAPI started flowing for THIS ad set, not since ad set creation.

### Lifecycle state machine (per ad set)

Same 4 phases as original spec, but with **mode-aware behavior**:

```
              ┌─────────────────────────────────────────────────────┐
              │                                                      │
              ▼                                                      │
    [A: Pre-launch]                                                  │
    days_running = 0, creative checks                                │
              │                                                      │
              │ ad goes live → days_running = 1                     │
              ▼                                                      │
    [B: Learning]                                                    │
    All modes: Phase B exceptions (Q6) — extreme failures only       │
    COLD_START: this is the default state                            │
    ───┬──────────────────────────────────────                      │
       │                                                             │
       │ 50 conv/7d ─┐                                               │
       │ OR 30/14d   ├──→ [C: Active]                                │
       │             │    AUTONOMOUS: Q8 scale + Q9 pause (full)     │
       │             │    CALIBRATING: same logic, decisions need     │
       │             │      LOW_RISK approval per decision            │
       │             │    COLD_START: stays in B until graduation    │
       │             │                                                │
       │ <30/14d ──→ [PAUSED] flagged_for_review                     │
       │                                                             │
       │             │ Q8 scale → DUPLICATE creates                  │
       │             │   new ad_set in [B], COLD_START ──────────────► (new ad_set)
       │             │                                                │
       │             │ frequency >3 / CTR fade /                     │
       │             │ conv velocity drop / 30d plateau              │
       │             │ ──→ [D: Decline]                              │
       │             │     refresh_creative (LEARNING_RESET)         │
       │             │     OR propose_new_ad_set (HIGH_RISK)         │
       │             │     OR pause_for_rest (REVERSIBLE)            │
       │             │       │                                       │
       │             │       │ all 3 actions → ad set                │
       │             │       └──────────────────────────────────────►[B] (re-enter)
       │             │                                                │
       └─→ [PAUSED]  │                                                │
                                                                      │
       Account-emergency from any phase ──────────────────────────────► [PAUSED]
```

Phase C uses Tier 2 (Bayesian) and Tier 3 (anomaly) as **signal sources** when the ad set is AUTONOMOUS — they consult them but Phase C policy makes the final call. In COLD_START / CALIBRATING modes, Tier 2/3 signals are recorded but not acted on.

---

## Stage 0 — Pixel + CAPI integration (MUST ship before agent autonomous mode)

Without this, Meta has no conversion data → Meta can't optimize → no `Lead` or `Subscribe` events → Phase B → C transition criteria (Q5: 50 conversions/7d) impossible to meet → agent stuck in COLD_START forever.

### Components

```
src/app/[locale]/layout.tsx                                  [MODIFY]
  Inject Meta Pixel script via <Script src="..." strategy="afterInteractive" />
  Configured via NEXT_PUBLIC_META_PIXEL_ID env var (NEW — public version of META_PIXEL_ID)

src/modules/advertising/meta-capi/                           [NEW MODULE]
├── client.ts                          CapiClient class (sends events to Graph API)
├── event-mapper.ts                    Maps internal events → Meta standard events
├── dedupe.ts                          event_id generator: hash(userId + event + minute)
├── types.ts                           CapiEventPayload, UserData, CustomData interfaces
└── __tests__/
    ├── client.test.ts                 vi.fn fetch mock — assert request shape
    ├── event-mapper.test.ts           Mapping table tests
    └── dedupe.test.ts                 Determinism + collision resistance

src/modules/advertising/meta-capi/index.ts                   [NEW]
  Exports: sendCapiEvent (high-level wrapper)

src/shared/lib/analytics.ts                                  [MODIFY]
  trackEvent / trackServerEvent extended:
    - Still fire to PostHog (existing behavior)
    - ALSO fire to Meta CAPI in parallel via meta-capi/client
    - Both use same event_id for client/server dedupe in Meta's pipeline
    - Map internal AnalyticsEvent → Meta standard event:
        landing_view → 'PageView'  (Pixel-side only, redundant with auto-PageView)
        chart_calculated → 'ViewContent'  (Pixel + CAPI)
        passport_reshared → custom 'Share'  (Pixel + CAPI)
        user_registered → 'Lead'  (CAPI primary, Pixel client-side complement)
        paywall_opened → custom 'InitiateCheckout'  (Pixel + CAPI)
        subscription_started → 'Subscribe'  (CAPI primary)

src/app/api/webhooks/clerk/route.ts                          [MODIFY]
  Already fires trackServerEvent (today's commit 4567f13).
  Wrap to also call sendCapiEvent('Lead', {...}, event_id) inside same try/catch.

src/app/api/webhooks/stripe/route.ts                         [MODIFY]
  Already fires trackServerEvent (today's commit ba5dd7f).
  Wrap to also call sendCapiEvent('Subscribe', {...}, event_id, value, currency).

src/modules/astro-engine/components/BirthDataForm.tsx        [MODIFY]
  Already fires trackEvent('chart_calculated') (line 127).
  Add fbq('track', 'ViewContent', {...}) directly (client-side companion).
```

### Event mapping (canonical → Meta standard)

| Estrevia event (canonical) | Meta Pixel event | Meta CAPI event | Notes |
|---|---|---|---|
| `landing_view` | `PageView` (auto) | — | Pixel auto-tracks PageView; no extra wiring |
| `chart_calculated` | `ViewContent` | `ViewContent` | `content_type: 'natal_chart'`, `content_ids: [chart_id]` |
| `passport_reshared` | custom `Share` | custom `Share` | `platform`, `passport_id` |
| `user_registered` | `Lead` | `Lead` | Server-side primary (CAPI); client complement |
| `paywall_opened` | custom `InitiateCheckout` | custom `InitiateCheckout` | `value: 4.99` (or 34.99 annual estimate) |
| `subscription_started` | — | `Subscribe` | Server-side only (Stripe webhook); `value: amount_usd`, `currency`, `predicted_ltv: 30.00` |

### CAPI client interface

```ts
// src/modules/advertising/meta-capi/types.ts
export interface CapiUserData {
  external_id?: string;        // hashed Clerk userId
  em?: string;                 // hashed email
  client_ip_address?: string;  // request IP
  client_user_agent?: string;  // request UA
}

export interface CapiCustomData {
  value?: number;              // for value-tracking events (Subscribe, Purchase)
  currency?: string;           // 'USD' | 'EUR' | etc
  content_ids?: string[];
  content_type?: string;
  predicted_ltv?: number;      // for Subscribe events
  [k: string]: unknown;        // other custom params
}

export interface CapiEventPayload {
  event_name: string;          // 'Lead' | 'Subscribe' | 'ViewContent' | etc
  event_time: number;          // Unix seconds
  event_id: string;            // dedupe key — same as fbq event_id
  action_source: 'website';
  user_data: CapiUserData;
  custom_data?: CapiCustomData;
  event_source_url?: string;
}

// src/modules/advertising/meta-capi/client.ts
export interface CapiClientConfig {
  pixelId: string;
  capiToken: string;
  graphApiVersion: string;     // 'v22.0'
  fetchImpl?: typeof fetch;    // for tests
  testEventCode?: string;      // optional: route to Meta Test Events for dev
}

export class CapiClient {
  constructor(config: CapiClientConfig);
  async sendEvent(payload: CapiEventPayload): Promise<{ events_received: number; messages: string[] }>;
  async sendBatch(payloads: CapiEventPayload[]): Promise<{ events_received: number }>;
}

// High-level wrapper used by analytics.ts
// src/modules/advertising/meta-capi/index.ts
export function sendCapiEvent(
  event_name: string,
  user_data: CapiUserData,
  custom_data?: CapiCustomData,
  options?: { event_id?: string; event_source_url?: string },
): void;  // fire-and-forget via waitUntil() like existing posthog-node pattern
```

### Dedupe strategy

```ts
// src/modules/advertising/meta-capi/dedupe.ts
/**
 * Generate stable event_id. Both client (fbq) and server (CAPI) MUST send
 * the SAME event_id for Meta to dedupe. Otherwise events double-count.
 *
 * Format: hash(distinctId + event_name + minute_timestamp)
 *   - distinctId = Clerk userId for authenticated, anonymous_id from posthog for guests
 *   - minute_timestamp = floor(unix_seconds / 60) — same minute = same event
 */
export function generateEventId(
  distinctId: string,
  event_name: string,
  timestamp_seconds: number,
): string;
```

### Env vars (NEW)

```
NEXT_PUBLIC_META_PIXEL_ID=<from existing META_PIXEL_ID, mirrored as public>
META_CAPI_GRAPH_VERSION=v22.0     # default if unset
META_CAPI_TEST_EVENT_CODE=        # optional, for Meta Events Manager Test Events page
```

`META_PIXEL_ID` and `META_CAPI_TOKEN` already in Vercel production (verified during audit). Need to add `NEXT_PUBLIC_META_PIXEL_ID` (browser-readable copy) and ensure mirroring in `.env.example`.

### Switching Meta optimization goal AFTER Pixel data accumulates

Current campaign optimizes for `LANDING_PAGE_VIEWS` (`scripts/advertising/setup-meta-campaign.ts:53-65`).

After Pixel + CAPI live AND ad set accumulates ≥50 `Lead` events (Meta's standard learning threshold), agent SHOULD switch optimization to `CONVERSIONS` with `Lead` event. Q11 hybrid switch logic handles this:

- COLD_START → ad set stays on `LANDING_PAGE_VIEWS` optimization
- When `conversions_meta_7d >= 50` AND `state.optimization_event === 'landing_page_view'` → propose hybrid switch to `Lead` (LOW_RISK approval, resets learning)
- Later: when `Lead` event count reaches 100/week AND `subscription_started` count ≥10/week → propose another switch to `Subscribe` optimization (LOW_RISK approval)

This makes the switch graduate naturally as data accumulates, not on a manual trigger.

---

## Components — full module map

```
src/modules/advertising/
├── meta-capi/                                              [NEW MODULE — Stage 0]
│   ├── client.ts
│   ├── event-mapper.ts
│   ├── dedupe.ts
│   ├── types.ts
│   ├── index.ts
│   └── __tests__/
│
├── senior-buyer/                                           [NEW MODULE — Senior Buyer Mode]
│   ├── phase-evaluator.ts                Main orchestrator per ad set
│   ├── data-maturity-classifier.ts       COLD_START / CALIBRATING / AUTONOMOUS
│   ├── threshold-resolver.ts             DB → code-default fallback resolver
│   ├── baseline-calculator.ts            Pure: history → mean/stddev/percentiles
│   ├── auto-calibrator.ts                Weekly + drift-triggered threshold updates
│   ├── targets.ts                        Code-default thresholds (cold-start values)
│   ├── policies/
│   │   ├── phase-a.ts
│   │   ├── phase-b.ts                    Includes 8 extreme-failure exceptions (Q6)
│   │   ├── phase-c.ts                    Q8 scale + Q9 pause + Q11 hybrid switch
│   │   ├── phase-d.ts                    Q10 mixed actions
│   │   └── account-emergency.ts
│   ├── state-store.ts                    DB CRUD for 4 new tables
│   ├── metric-history.ts                 Daily snapshot writer + retention
│   ├── comparable-window.ts              Tue-vs-Tue z-score reader
│   ├── approval-router.ts                Q12 reversibility + maturity-mode gating
│   └── __tests__/
│
├── act/
│   ├── refresh-creative.ts               [NEW] Replace creative in existing ad set
│   ├── propose-new-ad-set.ts             [NEW] HIGH_RISK approval gate
│   ├── pause.ts                          [unchanged]
│   ├── scale.ts                          [unchanged but unused — Phase C uses duplicate-only]
│   └── duplicate.ts                      [unchanged]
│
├── decide/
│   ├── orchestrator.ts                   [REWRITE] Branches on data-maturity per ad set
│   ├── tier-1-rules.ts                   [DEPRECATED — kept for ENABLED=false fallback]
│   ├── tier-2-bayesian.ts                [unchanged — consumed as signal by phase-c]
│   ├── tier-3-anomaly.ts                 [unchanged — consumed as signal by phase-c]
│   └── feature-gates.ts                  [extended — kill-switch only, not rollout staging]
│
├── perceive/
│   ├── posthog-funnel.ts                 [unchanged]
│   ├── stripe-attribution.ts             [unchanged]
│   ├── meta-insights.ts                  [extended — surface Meta-attributed conversions and learning_stage]
│   └── account-health.ts                 [extended — surface disapproval_rate, quality_rating]
│
src/shared/lib/
├── schema.ts                             [extended — 4 new tables]
└── analytics.ts                          [extended — fire to Meta CAPI in parallel with PostHog]

src/app/[locale]/layout.tsx               [MODIFY] Pixel script via next/script

src/app/api/webhooks/clerk/route.ts       [MODIFY] Add CAPI Lead event
src/app/api/webhooks/stripe/route.ts      [MODIFY] Add CAPI Subscribe event

src/modules/astro-engine/components/BirthDataForm.tsx  [MODIFY] Add fbq ViewContent

src/app/api/cron/advertising/
├── triage-hourly/route.ts                [extended] Invokes phase evaluator
├── triage-daily/route.ts                 [extended] Daily metric snapshot writer + drift-triggered calibration check
├── retro-weekly/route.ts                 [extended] Weekly auto-calibrator + history pruning + shadow comparison digest
└── auto-calibrate/route.ts               [NEW] Sunday 03:00 UTC weekly calibration cron

src/app/admin/advertising/
├── thresholds/                           [NEW pages]
│   ├── page.tsx                          List all thresholds with source ('default' | 'auto_calibrated' | 'founder_override')
│   ├── ThresholdRow.tsx                  Edit-in-place with audit log
│   └── ThresholdHistory.tsx              Show all changes for a threshold over time
├── ad-set-state/                         [NEW pages]
│   ├── page.tsx                          List all ad sets with current phase, mode, key metrics
│   └── AdSetStateCard.tsx                Drill into one ad set's full state
├── creatives/                            [unchanged]
├── decisions/                            [unchanged]
├── gates/                                [unchanged]
├── spend/                                [unchanged]
├── layout.tsx                            [unchanged]
└── page.tsx                              [extended — add nav links to new pages]
```

---

## Data infrastructure

Four new Drizzle tables in `src/shared/lib/schema.ts`. All snake_case in SQL, camelCase in Drizzle.

### `advertising_ad_set_state`

One row per ad set. Source of truth for current phase, data maturity mode, and counters.

```sql
ad_set_id              TEXT PRIMARY KEY
campaign_id            TEXT NOT NULL                     -- denormalized for filtering
locale                 TEXT NOT NULL                     -- 'en' | 'es' (from setup-meta-campaign)
current_phase          TEXT  -- 'A' | 'B' | 'C' | 'D' | 'PAUSED' | 'RETIRED'
phase_entered_at       TIMESTAMPTZ NOT NULL
data_maturity_mode     TEXT NOT NULL DEFAULT 'COLD_START'
                              -- 'COLD_START' | 'CALIBRATING' | 'AUTONOMOUS'
maturity_entered_at    TIMESTAMPTZ NOT NULL
optimization_event     TEXT NOT NULL DEFAULT 'landing_page_view'
                              -- Meta optimization event name (bottom of funnel preferred when data allows)
conversions_7d_meta    INTEGER NOT NULL DEFAULT 0       -- Meta-attributed (Q4: phase + maturity detection)
conversions_14d_meta   INTEGER NOT NULL DEFAULT 0
conversions_total_meta INTEGER NOT NULL DEFAULT 0       -- since pixel started flowing
days_with_pixel_data   INTEGER NOT NULL DEFAULT 0       -- driven by maturity classifier
conversions_7d_posthog INTEGER NOT NULL DEFAULT 0       -- PostHog→Stripe (Q4: ROAS / CPA decisions)
roas_7d                REAL                              -- PostHog revenue / Meta spend
cpa_7d                 REAL                              -- Meta spend / PostHog conversions
frequency_current      REAL
parent_ad_set_id       TEXT                              -- self-FK for duplicates
duplicates_count       INTEGER NOT NULL DEFAULT 0
last_action_taken_at   TIMESTAMPTZ
flagged_for_review     BOOLEAN NOT NULL DEFAULT false
flag_reason            TEXT
updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Indexes: `(current_phase)`, `(data_maturity_mode)`, `(parent_ad_set_id)`, `(flagged_for_review) WHERE flagged_for_review = true`.

### `advertising_ad_set_metric_history`

One row per ad set per day. Time-series for comparable-window queries and baseline calculation.

```sql
id                     TEXT PRIMARY KEY                  -- nanoid
ad_set_id              TEXT NOT NULL
date                   TEXT NOT NULL                     -- YYYY-MM-DD UTC
day_of_week            INTEGER NOT NULL                  -- 0-6 for Tue-vs-Tue queries
impressions            INTEGER NOT NULL
clicks                 INTEGER NOT NULL
spend_usd              REAL NOT NULL
ctr                    REAL NOT NULL
cpc                    REAL NOT NULL
cpm                    REAL NOT NULL
frequency              REAL NOT NULL
conversions_meta       INTEGER NOT NULL                  -- Meta-attributed
conversions_posthog    INTEGER NOT NULL                  -- PostHog (utm_content=ad_id)
revenue_usd            REAL NOT NULL DEFAULT 0           -- from Stripe attribution
roas                   REAL                              -- nullable when spend = 0
created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
UNIQUE(ad_set_id, date)
```

Indexes: `(ad_set_id, date DESC)`, `(ad_set_id, day_of_week, date DESC)`.

Retention: 90 days. Pruning runs in `retro-weekly` cron.

### `advertising_ad_set_phase_transitions`

Append-only audit log of phase + maturity changes.

```sql
id                     TEXT PRIMARY KEY                  -- nanoid
ad_set_id              TEXT NOT NULL
transition_kind        TEXT NOT NULL                     -- 'phase' | 'maturity'
from_value             TEXT NOT NULL
to_value               TEXT NOT NULL
reason                 TEXT NOT NULL                     -- e.g. 'meta_default_50/7d', 'frequency_saturation', 'graduated_to_calibrating'
metric_snapshot        JSONB NOT NULL                    -- AdMetric at time of transition
triggered_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Index: `(ad_set_id, triggered_at DESC)`.

Retention: forever.

### `advertising_thresholds`

NEW per Q17 D — DB-stored thresholds with code defaults as fallback.

```sql
id                          TEXT PRIMARY KEY              -- nanoid
scope                       TEXT NOT NULL                 -- 'global' | 'campaign' | 'ad_set'
scope_id                    TEXT                          -- NULL for global; campaign_id or ad_set_id otherwise
metric_name                 TEXT NOT NULL                 -- 'target_cpa_signup' | 'target_roas' | 'phase_b_extreme_freq' | etc
value                       REAL NOT NULL
source                      TEXT NOT NULL                 -- 'default' | 'auto_calibrated' | 'founder_override'
effective_from              TIMESTAMPTZ NOT NULL
baseline_metric_snapshot    JSONB                         -- what data was used (for auto_calibrated values)
changed_by                  TEXT NOT NULL                 -- 'system_calibrator' | 'founder' | 'migration'
notes                       TEXT
created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
UNIQUE(scope, scope_id, metric_name, effective_from)
```

Indexes: `(scope, scope_id, metric_name, effective_from DESC)` — critical for fast lookup of "current effective threshold for X".

**Resolution order** (`threshold-resolver.ts`):
1. Look up `(scope='ad_set', scope_id=ad_set_id, metric_name=X)` ORDER BY effective_from DESC LIMIT 1
2. Else look up `(scope='campaign', scope_id=campaign_id, metric_name=X)`
3. Else look up `(scope='global', scope_id=NULL, metric_name=X)`
4. Else fall back to code default in `senior-buyer/targets.ts`

---

## Cold-start threshold defaults (`senior-buyer/targets.ts`)

Derived from real LTV math. **All values can be overridden via `advertising_thresholds` table — these are last-resort fallbacks.**

```ts
// LTV bounds: $4.99/mo Premium, $34.99/yr ($2.92/mo eff)
// Realistic LTV with 10-15% monthly churn = $25-40
// Conservative LTV used for thresholds: $30 (median)
// Payback window: 12 months → CPA target ≤ LTV / 3 = $10

export const COLD_START_DEFAULTS = {
  // ─── Conversion-economics targets ──────────────────────
  // Signup CR (signup → subscription) assumed 20% in COLD_START.
  // Will auto-calibrate to actual rate once measured.
  target_cpa_signup_usd: 1.50,            // = $10 sub_cpa × 20% conversion
  target_cpa_subscription_usd: 10.00,     // = $30 LTV / 3 (12mo payback)
  target_roas_signup: 1.0,                // breakeven for signup-optimization phase
  target_roas_subscription: 2.0,          // 2x payback target for subscription phase

  // ─── Phase B → C transition (Q5) ────────────────────────
  phase_b_to_c_conv_meta_7d: 50,          // Meta-default
  phase_b_to_c_conv_meta_14d_fallback: 30,
  phase_b_max_days: 14,

  // ─── Phase B extreme failures (Q6) ──────────────────────
  phase_b_extreme_frequency_cap: 5.0,
  phase_b_extreme_zero_conv_spend_floor_usd: 50.00,
  phase_b_extreme_ctr_doa: 0.003,         // 0.3%
  phase_b_extreme_ctr_doa_min_impressions: 1000,
  phase_b_extreme_cpc_cap_usd: 10.00,
  account_disapproval_rate_emergency: 0.05,

  // ─── Phase C scale (Q8) ─────────────────────────────────
  scale_roas_min_multiplier: 2.0,         // ROAS ≥ 2x target_roas_subscription
  scale_cpa_max_multiplier: 0.6,          // OR CPA ≤ 0.6x target_cpa_subscription
  scale_frequency_max: 2.5,
  scale_sustained_days: 7,
  scale_budget_increase_pct: 50,          // +50% on duplicate
  scale_max_duplicates_per_parent: 2,

  // ─── Phase C pause (Q9) ─────────────────────────────────
  pause_cpa_threshold_multiplier: 2.0,    // CPA > 2x target_cpa
  pause_cpa_sustained_days: 7,
  pause_roas_threshold_multiplier: 0.5,   // ROAS < 0.5x target_roas
  pause_roas_sustained_days: 14,
  pause_frequency_threshold: 4.0,

  // ─── Phase D detection (Q10) ────────────────────────────
  decline_frequency_trigger: 3.0,
  decline_frequency_sustained_days: 3,
  decline_z_score_trigger: -2.0,          // CTR fade or conversion velocity drop
  decline_plateau_days: 30,

  // ─── Q11 hybrid event switch ────────────────────────────
  hybrid_switch_signup_to_lead_conv_7d: 50,
  hybrid_switch_lead_to_subscribe_lead_per_week: 100,
  hybrid_switch_lead_to_subscribe_sub_per_week: 10,

  // ─── Data maturity classification ───────────────────────
  maturity_cold_start_max_conv_total: 50,
  maturity_cold_start_max_days: 14,
  maturity_calibrating_max_conv_total: 500,
  maturity_calibrating_max_days: 60,
  maturity_calibrating_max_cv: 0.5,       // baseline_stddev / baseline_mean

  // ─── Auto-calibrator ────────────────────────────────────
  calibration_min_history_days: 30,
  calibration_outlier_pct_to_drop: 0.10,
  calibration_drift_z_threshold: 3.0,
  calibration_max_change_factor: 2.0,     // changes > 2x require founder approval

  // ─── Approval routing (Q12) ─────────────────────────────
  approval_low_risk_timeout_hours: 4,
  approval_cooldown_after_reject_hours: 24,
} as const;
```

---

## Decision policies — per phase + per maturity mode

### Phase A — Pre-launch
Triggered when ad set just created. Allowed: `hold` only. Transitions to Phase B when ad goes live.

### Phase B — Learning

**8 extreme-failure exceptions** apply in ALL maturity modes (incl. COLD_START). These are the only autonomous actions in COLD_START.

1. `current_metrics.status === 'DISAPPROVED'` → pause
2. `frequency >= phase_b_extreme_frequency_cap` (default 5.0)
3. `spend_usd >= phase_b_extreme_zero_conv_spend_floor_usd` AND `conversions_meta_7d === 0`
4. `ctr < phase_b_extreme_ctr_doa` AND `impressions >= phase_b_extreme_ctr_doa_min_impressions`
5. `cpc >= phase_b_extreme_cpc_cap_usd`
6. Account disapproval_rate > threshold → pause-ALL
7. Account quality_rating === 'BELOW_AVERAGE' → pause-ALL
8. Spend cap hit (existing `spend-cap.ts`)

**Phase B → Phase C transition** uses Meta-attributed conversions:
- `conversions_7d_meta >= phase_b_to_c_conv_meta_7d` (50)
- OR `days_in_b >= phase_b_max_days` AND `conversions_14d_meta >= phase_b_to_c_conv_meta_14d_fallback` (30)
- OR `days_in_b >= phase_b_max_days` AND `conversions_14d_meta < 30` → PAUSED + flagged

Default: `hold` with reason `learning_in_progress`.

### Phase C — Active

**Maturity mode gating** within Phase C:

| Mode | Behavior |
|---|---|
| `COLD_START` | Phase B exceptions only (should never happen — COLD_START stays in B) |
| `CALIBRATING` | Q8/Q9/Q10/Q11 logic runs, ALL non-extreme decisions routed via LOW_RISK approval (founder vetoes individually) |
| `AUTONOMOUS` | Q8/Q9/Q10/Q11 logic runs, decisions routed per Q12 reversibility |

**Q9 pause criteria** (evaluated FIRST to free budget):
- `cpa_7d > pause_cpa_threshold_multiplier × resolveThreshold('target_cpa_subscription_usd')` sustained 7 days → pause
- OR `roas_14d < pause_roas_threshold_multiplier × resolveThreshold('target_roas_subscription')` → pause
- OR `frequency_current > pause_frequency_threshold` → escalate to Phase D

**Q8 scale criteria** (all must hold):
- `roas_7d >= scale_roas_min_multiplier × resolveThreshold('target_roas_subscription')` OR `cpa_7d < scale_cpa_max_multiplier × resolveThreshold('target_cpa_subscription_usd')`
- `frequency_current < scale_frequency_max` (2.5)
- Sustained 7 days (verified via `comparable-window`)
- `state.duplicates_count < scale_max_duplicates_per_parent` (2)

**Scale execution:**
- Pre-flight spend-cap check. If exceeded → pre-emptively pause worst Phase C underperformer (CPA >1.5x target) → re-check. Else defer + digest entry.
- New duplicate via `act/duplicate.ts` with `budget_usd_new = original_budget × (1 + scale_budget_increase_pct/100)` (default +50%)
- New ad set state row with `parent_ad_set_id` set; phase = 'A' → automatic transition to 'B'; data_maturity_mode = 'COLD_START'

**Q11 hybrid event switch** (auto-trigger):

Sequence (each step requires LOW_RISK approval — resets learning):
1. `optimization_event === 'landing_page_view'` AND `state.conversions_7d_meta >= hybrid_switch_signup_to_lead_conv_7d` (50) → switch to `Lead`
2. `optimization_event === 'Lead'` AND `Lead conversions/week >= 100` AND `Subscribe events/week >= 10` → switch to `Subscribe`

After each switch: `metaApi.updateAdSetOptimizationEvent(...)`, `state.optimization_event` updated, transition back to Phase B (Meta resets learning on optimization change).

**Phase C → Phase D transition** (any one):
- `frequency_current > decline_frequency_trigger` (3.0) sustained `decline_frequency_sustained_days` (3)
- CTR fade: `comparable('ctr')` z-score < `decline_z_score_trigger` (-2.0)
- Conversion velocity drop: `comparable('conversions')` z-score < -2.0
- Plateau: `days_in_c >= decline_plateau_days` (30) AND `state.duplicates_count === 0`

Default: `maintain`.

### Phase D — Decline

Triggered from Phase C. Action mapping (Q10 Mixed):

| Trigger | Action | Approval | Re-entry |
|---|---|---|---|
| `frequency > 3.0` | `refresh_creative` | LOW_RISK 4h | → Phase B (resets learning) |
| CTR fade z<-2 | `refresh_creative` | LOW_RISK 4h | → Phase B |
| Conv velocity drop z<-2 | `propose_new_ad_set` | HIGH_RISK | original→PAUSED, new→Phase A→B |
| Plateau 30d no scale | `pause_for_rest` (14d) | execute_immediately | unpause → Phase B |

### Account emergency (cross-phase)

`account-health-weekly` cron + cheap check on every tick:
- `disapproval_rate > 0.05` → pause-ALL
- `quality_rating === 'BELOW_AVERAGE'` → pause-ALL
- `account.status === 'DISABLED'` → pause-ALL + critical alert + Sentry

---

## Auto-calibrator — Q18 hybrid weekly + drift-triggered

### Weekly cron (Sunday 03:00 UTC)

```ts
// src/app/api/cron/advertising/auto-calibrate/route.ts
async function weeklyCalibration() {
  for (const ad_set of stateStore.listByPhase(['B', 'C', 'D'])) {
    const history = metricHistory.getRange(ad_set.ad_set_id, 30);

    // Protection 1: minimum samples
    if (history.length < calibration_min_history_days) continue;

    for (const metric of ['ctr', 'cpa', 'roas', 'frequency', 'conversions_per_day']) {
      const values = history.map(s => s[metric]).filter(v => v != null);

      // Protection 2: outlier rejection (drop top/bottom 10%)
      const trimmed = trimOutliers(values, calibration_outlier_pct_to_drop);

      const baseline = calculateBaseline(trimmed);  // {mean, stddev, p25, p50, p75}

      // Derive new threshold per derivation rules
      const derivationRules = thresholdDerivationFor(metric);
      const new_threshold = derivationRules(baseline);

      const current_threshold = thresholdResolver.resolve(ad_set, metric);

      // Protection 3: bounded change
      if (Math.abs(new_threshold / current_threshold) > calibration_max_change_factor ||
          Math.abs(current_threshold / new_threshold) > calibration_max_change_factor) {
        // > 2x change — require founder approval
        await telegramBot.requestApproval(
          formatThresholdChangeProposal(ad_set, metric, current_threshold, new_threshold, baseline),
          [{label: '✅ Apply', value: 'apply'}, {label: '❌ Keep current', value: 'keep'}],
          'HIGH_RISK',
        );
        continue;
      }

      // Protection 4: sanity check (NaN, negative, infinity)
      if (!isFinite(new_threshold) || new_threshold < 0) continue;

      await thresholdsStore.upsert({
        scope: 'ad_set',
        scope_id: ad_set.ad_set_id,
        metric_name: metric,
        value: new_threshold,
        source: 'auto_calibrated',
        baseline_metric_snapshot: baseline,
        changed_by: 'system_calibrator',
        effective_from: new Date(),
      });
    }
  }
}
```

### Drift-triggered (after each `triage-daily`)

```ts
async function driftTriggeredCheck() {
  for (const ad_set of stateStore.listByPhase(['B', 'C', 'D'])) {
    for (const metric of ['ctr', 'cpa', 'roas']) {
      const result = await comparableWindow.comparable(ad_set.ad_set_id, metric);
      if (!result) continue;
      if (Math.abs(result.z_score) > calibration_drift_z_threshold) {
        // Run focused recalibration just for this ad set
        await calibrateAdSet(ad_set.ad_set_id);
      }
    }
  }
}
```

### Threshold derivation rules

```ts
// src/modules/advertising/senior-buyer/baseline-calculator.ts
const DERIVATION_RULES: Record<string, (b: Baseline) => number> = {
  // For pause: threshold = where "obviously bad" starts
  'cpa_pause_threshold': (b) => b.mean * 2.0,
  'roas_pause_threshold': (b) => b.mean * 0.5,
  'frequency_pause_threshold': (b) => Math.min(5.0, b.mean + 2 * b.stddev),

  // For scale: threshold = where "exceptional" starts
  'roas_scale_threshold': (b) => b.mean * 1.5,
  'cpa_scale_threshold': (b) => b.mean * 0.6,

  // For decline detection: when current value differs significantly
  'ctr_decline_z_score': (b) => -2.0,  // statistical, not baseline-derived
};
```

---

## Approval routing — Q12 + maturity-mode gating

```ts
// src/modules/advertising/senior-buyer/approval-router.ts

async function route(decision: AdDecision, state: AdSetState): Promise<RouterDecision> {
  // ─── Maturity gate first ──────────────────────────────
  if (state.data_maturity_mode === 'COLD_START') {
    // Only Phase B exceptions and account-emergency allowed
    if (!isExtremeFailure(decision) && !isAccountEmergency(decision)) {
      return { type: 'rejected', reason: 'cold_start_mode_suppression' };
    }
  }

  if (state.data_maturity_mode === 'CALIBRATING') {
    // Everything except REVERSIBLE goes through LOW_RISK approval
    // (founder sees and vetoes individual decisions during calibration)
    if (!isReversible(decision)) {
      return await routeAsLowRisk(decision);
    }
  }

  // ─── AUTONOMOUS mode — Q12 reversibility ──────────────
  switch (decision.action) {
    case 'pause':
    case 'pause_for_rest':
    case 'unpause':
    case 'hold':
    case 'maintain':
      return { type: 'execute_immediately', reason: 'reversible_action' };

    case 'duplicate':
      return await routeAsLowRisk(decision);  // commits new spend

    case 'refresh_creative':
    case 'hybrid_event_switch':
      return await routeAsLowRisk(decision);  // resets learning

    case 'propose_new_ad_set':
      return await routeAsHighRisk(decision);  // entirely new spend, blocking

    default:
      return { type: 'rejected', reason: `unknown_action: ${decision.action}` };
  }
}
```

---

## Comparable window math

`comparable(ad_set_id, metric, weeks_lookback=4)` — same as original spec, no changes. Returns `{ current_value, baseline_mean, baseline_stddev, delta_pct, z_score, is_significant, sample_size }` or `null` if insufficient history (<2 prior same-DOW samples).

---

## Rollout & feature gate

The original Q14 (shadow mode through `feature-gates`) is **replaced by the per-ad-set data-maturity model**. Every ad set automatically progresses COLD_START → CALIBRATING → AUTONOMOUS based on its own data accumulation. No manual stage advancement.

`seniorBuyerMode` feature gate is retained but simplified to **kill-switch only**:
- `off` → legacy Tier 1/2/3 path runs (current behavior — for emergency rollback)
- `on` → new senior buyer mode active for ALL ad sets, with per-ad-set maturity gating

Initial value: `off` until Stage 0 (Pixel + CAPI) is verified live in production. Once Stage 0 verified working (Telegram digest shows non-zero `Lead` events flowing to Meta) → flip to `on` via admin UI or DB update.

`ADVERTISING_AGENT_DRY_RUN` global env continues to short-circuit all act-layer Meta API calls regardless of feature gate. Used during Stage 0 install + first 3-5 days of `on` to verify decisioning before enabling actual Meta mutations.

---

## Error handling

Same 7 layers as original spec, with these additions for new components:

### Pixel + CAPI failures
- Pixel script fails to load (network error, ad-blocker) → no client events fire, server-side CAPI still runs (silent degradation, expected for ad-blocker users)
- CAPI request fails (Meta down, token revoked) → log warn + Sentry. Do NOT propagate to webhook handler 500 (would cause Stripe/Clerk retries → duplicate user upserts). Decision logic still runs on PostHog data alone.
- Event_id collision → impossible by construction (hash includes minute timestamp), but if Meta detects → Meta dedupes silently, no error to us.

### Threshold resolver failures
- DB read fails → fall back to code default with warn log. Sentry. Decision logic continues.
- Invalid value in DB (NaN, negative when positive expected) → fall back to code default. Sentry critical.
- Auto-calibrator produces invalid baseline (insufficient samples after outlier removal) → keep current threshold, skip update for this metric this week.

### Auto-calibrator failures
- Weekly cron fails → Sentry. Skip this week's calibration. Existing thresholds remain. Next week retries.
- Drift-triggered calibration fails → log warn, skip. Triage continues.
- Telegram approval for >2x change times out → keep current threshold (no automatic apply). Auto-resend reminder weekly.

### Data maturity classifier
- `days_with_pixel_data` undercounted (Pixel was down some days) → maturity stays in COLD_START longer than ideal. Founder can manually override via admin UI to advance.
- Conversion data delayed by Meta API (24-48h reporting lag) → maturity advancement is conservative; OK.

---

## Testing strategy

### Unit tests (TDD, Vitest)

```
src/modules/advertising/meta-capi/__tests__/
├── client.test.ts                     vi.fn fetch — assert request shape, retry behavior
├── event-mapper.test.ts               Internal event → Meta event lookup table
├── dedupe.test.ts                     event_id determinism, collision resistance
└── integration.test.ts                analytics.ts → both PostHog AND CAPI fire with same event_id

src/modules/advertising/senior-buyer/__tests__/
├── policies/
│   ├── phase-a.test.ts                ~10 cases
│   ├── phase-b.test.ts                ~25 cases — 8 exceptions × edge + Q5 transitions
│   ├── phase-c.test.ts                ~30 cases — Q8 × Q9 × Q11 matrix × maturity gating
│   ├── phase-d.test.ts                ~15 cases — 4 triggers × 4 actions
│   └── account-emergency.test.ts      ~5 cases
├── data-maturity-classifier.test.ts   ~10 cases — boundary conditions for COLD_START/CALIBRATING/AUTONOMOUS
├── threshold-resolver.test.ts         ~12 cases — 4-step lookup chain (ad_set → campaign → global → code)
├── baseline-calculator.test.ts        ~15 cases — math, edge cases, outlier removal
├── auto-calibrator.test.ts            ~15 cases — weekly + drift, all 4 protections, threshold derivation
├── phase-evaluator.test.ts            Orchestration — mocks all policies
├── state-store.test.ts                DB CRUD with mocked Drizzle (Track 10 pattern)
├── comparable-window.test.ts          Z-score math, ≥15 cases
├── approval-router.test.ts            Q12 matrix × maturity-mode gating
└── orchestrator-maturity.test.ts      Full per-ad-set behavior across all 3 modes
```

Coverage targets: phase-evaluator ≥80%, state-store ≥85%, comparable-window 100%, approval-router 100%, threshold-resolver 100%, baseline-calculator 100%, data-maturity-classifier 100%, auto-calibrator ≥90%.

### Integration tests (DB-injection per Track 10 pattern)

Extends `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`:

- COLD_START ad set: only Phase B extreme failure pauses execute, all other decisions suppressed
- CALIBRATING ad set: scale decision routed via LOW_RISK approval; founder approve → executes
- AUTONOMOUS ad set: Q12 reversibility — pause auto, duplicate LOW_RISK, propose_new HIGH_RISK
- Maturity transition: ad set with `conversions_total >= 50` AND `days_with_pixel_data >= 14` auto-graduates COLD_START → CALIBRATING; verify via DB
- Threshold resolver: ad_set override beats campaign override beats global beats code default
- Auto-calibrator: weekly cron updates threshold; >2x change triggers HIGH_RISK approval flow
- Pixel + CAPI: Clerk webhook fires → both PostHog AND CAPI receive Lead event with matching event_id
- Stripe webhook fires → CAPI Subscribe event with `value`, `currency`, `predicted_ltv`

### Calibration test — live data validation

After Stage 0 ships:
- Verify Lead events appear in Meta Events Manager → Pixel within 24h
- Verify Subscribe events appear within 24h of first sub
- Verify dedupe working (`event_id` matches between fbq client and CAPI server)
- After 7 days: founder reviews `/admin/advertising/ad-set-state` page — sanity check phase distribution
- After 14 days: founder reviews auto-calibrator's first set of threshold updates in Telegram

### Pre-deploy gate

```bash
npx vitest run src/modules/advertising/meta-capi
npx vitest run src/modules/advertising/senior-buyer
npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts
npx vitest run src/modules/advertising  # regression
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/meta-capi src/modules/advertising/senior-buyer
```

### Manual verification post-deploy (Stage 0)

```bash
# Check Pixel loaded on site
curl -s https://estrevia.app/ | grep -E "fbq|pixel|connect.facebook"

# Trigger test events via Meta Events Manager Test Events page
# 1. Visit / → expect PageView in Test Events
# 2. Calculate chart → expect ViewContent
# 3. Sign up via Clerk → expect Lead (server CAPI)
# 4. Complete test Stripe sub → expect Subscribe (server CAPI)

# After 24h: verify in Events Manager that events are deduplicating
# (Test Events page shows event_id matches between client and server)
```

---

## Out of scope (revised)

- Calendar / seasonality awareness (add as JSON when Q4 approaches)
- Telegram inbound commands
- CBO migration
- Multi-creative ad sets with per-variant kill (single-creative assumption maintained)
- Variance-based seasonality auto-detection
- Auto-iteration on creative generation (CLAUDE.md gate ~month 3+)
- LTV measurement infrastructure (cohort tracking) — bootstrap with code-default $30 LTV
- Replacement of Tier 2/3 (preserved as Phase C signal sources)
- Audience size headroom checking (no Meta API endpoint wired)
- Per-campaign threshold overrides via config files (admin UI only)
- Advanced matching for CAPI (just basic external_id + email hash; advanced matching with IP/UA done in Stage 0 minimal but no full ECM yet)
- Conversions API offline events / direct-purchase upload (only event-based Pixel/CAPI flow)

---

## Open questions for plan-writing

These are decisions deferred to plan-writing, not unresolved spec ambiguity:

- **Migration of existing 2 ad sets** at agent activation: when seniorBuyerMode flips on, do existing ad sets enter COLD_START (treat as fresh) or get assigned a maturity from observed Meta history (`days_with_pixel_data` derived from Pixel install date)? Plan should specify reconciliation step in `triage-daily`.
- **Sentry tags for new modules**: extend the `{ subsystem, phase, ad_set_id, db_layer }` pattern from today's Track 9. Plan should make this concrete per-module.
- **Cron tick budget**: with 2 ad sets at MVP, parallel evaluation is trivial. Plan should specify the round-robin batching mechanism for >50 ad sets future case.
- **Thresholds admin UI specifics**: 2 new pages (thresholds list + ad-set state). Plan should specify the React Server Components structure matching existing `/admin/advertising/gates/` pattern.
- **CAPI test events code env var**: optional env `META_CAPI_TEST_EVENT_CODE` for routing dev/staging traffic to Meta Events Manager Test Events page. Plan should default off in production.
- **Meta `learning_stage_info` field reliability**: spec assumes it's authoritative for "did Meta exit learning?" but documentation notes it can be stale. Plan should specify fallback (use `conversions_meta_7d` count) when `learning_stage_info` returns null/UNKNOWN.

---

## Approval

Approved by founder via brainstorming session 2026-05-03 (revised after ground-truth audit).

**Decisions confirmed:**

| # | Decision | Choice |
|---|---|---|
| 1 | Spec scope | Single large spec covering all stages |
| 2 | Decide-layer structure | 4-phase lifecycle state machine (A/B/C/D) |
| 3 | Conversion event | Hybrid: `landing_page_view` → `Lead` → `Subscribe` graduation |
| 4 | Source of truth | Hybrid by purpose (Meta for phase, PostHog/Stripe for ROAS) |
| 5 | Phase B → C entry | 50/7d OR 30/14d OR flagged (Meta-attributed conversions) |
| 6 | Phase B exceptions | All 8 extreme-failure conditions |
| 7 | Phase C scaling | Duplicate-only |
| 8 | Phase C scale criteria | Moderate (ROAS ≥2x, freq <2.5, +50%, max 2 dupes) + budget discipline |
| 9 | Phase C pause criteria | Mixed (CPA >2x sustained 7d OR ROAS <0.5x sustained 14d OR freq >4) |
| 10 | Phase D actions | Mixed (refresh_creative + propose_new_ad_set + pause_for_rest) |
| 11 | Hybrid event switch | Auto, threshold-gated (50 Lead → switch; 100 Lead/wk + 10 Sub/wk → next switch) |
| 12 | Approval flow | Hybrid by reversibility |
| 13 | Data infrastructure | 4 normalized tables (state, metric_history, phase_transitions, thresholds) |
| 14 | Rollout | Per-ad-set data-maturity (replaces feature-gate stages); kill-switch only |
| 15 | Calendar awareness | Out of MVP scope |
| 16 | Pixel + CAPI integration | Minimal: next/script + custom CAPI client + dedupe via event_id |
| 17 | Threshold storage | Hybrid DB + code defaults |
| 18 | Auto-calibration | Weekly + drift-triggered with 4 protections |
| 19 | Cold-start defaults | Industry defaults in code (LTV-derived, $1.50/$10 CPA targets) |

Ready for plan-writing.
