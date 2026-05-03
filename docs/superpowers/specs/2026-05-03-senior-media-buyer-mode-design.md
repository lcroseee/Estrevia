# Senior Media Buyer Mode — Advertising Agent Redesign

**Date:** 2026-05-03
**Author:** brainstorming session (founder + assistant)
**Scope:** redesign of `src/modules/advertising/decide/` and act-layer to behave like an experienced Meta media buyer. Replaces current Tier-1 hard-rules with a 4-phase ad-set lifecycle state machine. Introduces conversion-event tracking per ad set, comparable-window history, hybrid optimization-event switching, and 2 new act types (`refresh_creative`, `propose_new_ad_set`).
**Status:** approved for plan-writing.

---

## Context

The autonomous advertising agent (`src/modules/advertising/`) shipped to production on 2026-05-03 with `ADVERTISING_AGENT_ENABLED=true`. Today's deploy (`8c5922a`) wired real Drizzle DB into the spend-cap and audit factories — meaning the existing Tier-1 hard rules (`tier-1-rules.ts`) can now actually pause/scale/duplicate ads. Before today's deploy a `null as any` DB factory was an accidental killswitch via crash; that protection is now gone.

The existing Tier-1 logic is **too aggressive for Meta's learning phase**:

| Current constant | Problem |
|---|---|
| `LEARNING_PHASE_DAYS = 2` | Meta best practice is ≥7 days OR ≥50 conversions. Two days is "nervous beginner", not "experienced media buyer". |
| `FREQUENCY_CAP = 4.0` | Reasonable for fatigue, but pause-during-learning resets Meta's algorithm. |
| `CPC_HARD_CAP = $5.0` | Triggers during learning when CPC is naturally elevated → pauses healthy ad sets. |
| `SPEND_DAILY_OVERAGE = $25` | Safety rail (OK), but should not trigger pause during learning. |

Founder explicit requirement: **"the agent should work like an experienced Meta media buyer (`опытный таргетолог`) — that's why I created it"**. This means respecting Meta's learning phase, scaling via duplicate (not edit, which resets learning), statistical patience before reacting, and using the funnel reconciler we just fixed (today's `f679d3c`) as the source of revenue truth.

**Immediate safety:** `ADVERTISING_AGENT_DRY_RUN=true` was set in Vercel production env at the start of this session. Cron routes still execute decision logic and write to audit/state DB, but `isDryRun()` short-circuits all Meta API mutations. This is a temporary shield while this redesign ships.

---

## Goals

1. Replace Tier-1 hard rules with a 4-phase ad-set lifecycle state machine that respects Meta's learning phase and scales via duplicate.
2. Track conversion events per ad set (hybrid: `user_registered` for low-volume signal, `subscription_started` after volume threshold met).
3. Use Meta-attributed conversions for "did Meta exit learning?" decisions; use PostHog→Stripe attribution for ROAS / scale decisions.
4. Add 2 new act types (`refresh_creative`, `propose_new_ad_set`) gated behind reversibility-based approval flow.
5. Roll out via shadow mode (existing `feature-gates` infrastructure) to validate thresholds against real data before activating.

## Non-goals

- Calendar / seasonality awareness (Q4 holidays, Black Friday) — out for MVP, add manually as JSON config when reaching Q4.
- Telegram inbound commands — outbound notifications/approvals only (existing pattern).
- Auto-iteration loop (per CLAUDE.md: gated until winning patterns exist ~month 3+).
- CBO (Campaign Budget Optimization) — current ABO structure preserved.
- Multi-creative ad sets with per-variant kill (Q10 option C) — single creative per ad set assumption maintained for MVP.
- Variance-based auto-detection of seasonality (Q15 option D).

---

## Architecture

The advertising agent's `decide` layer is restructured around the **lifecycle phase of each ad set**, not global tiers. Each ad set occupies one of 4 phases at any time. Policies and allowed actions depend on the phase.

```
                    ┌───────────────────────────────────────────────┐
                    │  Vercel cron triage-hourly + triage-daily     │
                    │                                                │
                    │   Perceive (Meta + PostHog + Stripe)           │
                    │           │                                    │
                    │           ▼                                    │
                    │   Phase Evaluator (NEW)                        │
                    │     for each ad_set in parallel:               │
                    │       1. Read state from advertising_ad_set_state
                    │       2. Determine current phase               │
                    │       3. Check transition triggers             │
                    │       4. Apply phase-specific policy           │
                    │       5. Persist transitions + decisions       │
                    │           │                                    │
                    │           ▼                                    │
                    │   Feature Gate: seniorBuyerMode                │
                    │   off → shadow → active_proposal → active_auto │
                    │           │                                    │
                    │           ▼                                    │
                    │   Approval Router (Q12 reversibility)          │
                    │           │                                    │
                    │           ▼                                    │
                    │   Act layer: pause / scale / duplicate         │
                    │             + NEW refresh_creative             │
                    │             + NEW propose_new_ad_set           │
                    └───────────────────────────────────────────────┘
```

### Lifecycle state machine (per ad set)

```
              ┌─────────────────────────────────────────────────────┐
              │                                                      │
              ▼                                                      │
    [A: Pre-launch]                                                  │
    days_running = 0,                                                │
    creative checks                                                  │
              │                                                      │
              │ ad goes live → days_running = 1                     │
              ▼                                                      │
    [B: Learning]                                                    │
    Wait policy + 8 extreme-failure exceptions                       │
    ───┬──────────────────────────────────────                      │
       │                                                             │
       │ 50 conv/7d ─┐                                               │
       │ OR 30/14d   ├──→ [C: Active]                                │
       │             │    Q8 scale + Q9 pause + Q11 hybrid switch    │
       │             │       │                                       │
       │             │       │ Q8 scale → DUPLICATE creates          │
       │             │       │   new ad_set in [B] ─────────────────► (new ad_set)
       │             │       │                                       │
       │             │       │ frequency >3 / CTR fade /             │
       │             │       │ conv velocity drop / 30d plateau      │
       │             │       │ ──→ [D: Decline]                      │
       │             │       │     refresh_creative                  │
       │             │       │     OR propose_new_ad_set             │
       │             │       │     OR pause_for_rest 14d             │
       │             │       │       │                               │
       │             │       │       │ pause_for_rest done →         │
       │             │       │       └──────────────────────────────►[B] (re-enter)
       │             │       │                                       │
       │ <30/14d → [PAUSED] flagged_for_review (founder decides)     │
       └─→ [PAUSED]                                                  │
                                                                      │
       Account-emergency from any phase ──────────────────────────────► [PAUSED]
```

Existing Tier 2 (Bayesian, currently shadow-only) and Tier 3 (anomaly, currently skipped) are NOT removed. They become **signal sources** consumed by Phase C policy, not standalone tiers. Their outputs feed into Phase C decisions but don't make autonomous decisions of their own.

---

## Components

```
src/modules/advertising/senior-buyer/                                [NEW MODULE]
├── phase-evaluator.ts                  Main orchestrator per ad set, pure function
├── policies/
│   ├── phase-a.ts                      Pre-launch creative checks
│   ├── phase-b.ts                      Learning + 8 extreme-failure exceptions
│   ├── phase-c.ts                      Active scale/pause + hybrid event switch
│   ├── phase-d.ts                      Decline detection + 4 actions
│   └── account-emergency.ts            Account-level pause-all
├── state-store.ts                      DB CRUD for 3 new tables
├── metric-history.ts                   Daily snapshot writer + retention
├── comparable-window.ts                Tue-vs-Tue z-score reader
├── approval-router.ts                  Q12 reversibility-based routing
└── __tests__/
    ├── policies/                       Per-phase unit tests
    ├── phase-evaluator.test.ts         Orchestration test
    ├── state-store.test.ts             DB CRUD test
    ├── comparable-window.test.ts       Statistical math test
    └── fixtures/                       Mock factories per phase

src/modules/advertising/act/
├── refresh-creative.ts                 [NEW] Replace creative in existing ad set
├── propose-new-ad-set.ts               [NEW] Create new ad set with founder HIGH_RISK approval
├── pause.ts                            [unchanged]
├── scale.ts                            [unchanged but unused — Phase C uses duplicate-only]
└── duplicate.ts                        [unchanged]

src/modules/advertising/decide/
├── orchestrator.ts                     [REWRITE] Branches on seniorBuyerMode feature gate
├── tier-1-rules.ts                     [DEPRECATED but retained for off/shadow modes]
├── tier-2-bayesian.ts                  [unchanged — consumed as signal by phase-c]
├── tier-3-anomaly.ts                   [unchanged — consumed as signal by phase-c]
└── feature-gates.ts                    [extended with seniorBuyerMode entry]

src/modules/advertising/perceive/
├── posthog-funnel.ts                   [unchanged]
├── stripe-attribution.ts               [unchanged]
├── meta-insights.ts                    [extended — surface conversions and learning_stage from Meta API actions field]
└── account-health.ts                   [extended — surface disapproval_rate, quality_rating]

src/shared/lib/schema.ts                [extended — 3 new tables]
src/app/api/cron/advertising/
├── triage-hourly/route.ts              [extended — invokes phase evaluator]
├── triage-daily/route.ts               [extended — daily metric snapshot writer]
└── retro-weekly/route.ts               [extended — shadow comparison digest, history pruning]
```

### Key interfaces

```ts
// senior-buyer/phase-evaluator.ts
export interface AdSetEvalInput {
  ad_set_id: string;
  current_metrics: AdMetric;
  conversions_meta_7d: number;          // for "did Meta exit learning?" — Q4
  conversions_meta_14d: number;
  conversions_posthog_7d: number;       // for ROAS / scale — Q4
  revenue_usd_7d: number;               // from Stripe attribution
  revenue_usd_14d: number;
  account_status: AccountHealth;
}

export type Phase = 'A' | 'B' | 'C' | 'D' | 'PAUSED' | 'RETIRED';

export interface PhaseEvalOutput {
  ad_set_id: string;
  current_phase: Phase;
  transition?: { from: Phase; to: Phase; reason: string };
  decisions: AdDecision[];
}

export async function evaluateAdSet(
  input: AdSetEvalInput,
  deps: PhaseEvalDeps,
): Promise<PhaseEvalOutput>;

// senior-buyer/comparable-window.ts
export interface ComparableResult {
  current_value: number;
  baseline_mean: number;
  baseline_stddev: number;
  delta_pct: number;            // signed
  z_score: number;
  is_significant: boolean;      // |z| >= 2 AND sample_size >= 3
  sample_size: number;
}

export interface ComparableWindowReader {
  comparable(
    ad_set_id: string,
    metric: 'ctr' | 'cpa' | 'roas' | 'frequency' | 'conversions',
    weeks_lookback?: number,
  ): Promise<ComparableResult | null>;
}

// senior-buyer/approval-router.ts
export type RouterDecision =
  | { type: 'execute_immediately'; reason: string }
  | { type: 'low_risk_approval'; approval_id: string; auto_approve_at: Date }
  | { type: 'high_risk_approval'; approval_id: string; blocking: true }
  | { type: 'rejected'; reason: string };

export interface ApprovalRouter {
  route(decision: AdDecision): Promise<RouterDecision>;
}
```

---

## Data infrastructure

Three new Drizzle tables in `src/shared/lib/schema.ts`. All fields snake_case in SQL, camelCase in Drizzle.

### `advertising_ad_set_state`

One row per ad set. Source of truth for current phase + counters.

```sql
ad_set_id              TEXT PRIMARY KEY
current_phase          TEXT  -- 'A' | 'B' | 'C' | 'D' | 'PAUSED' | 'RETIRED'
phase_entered_at       TIMESTAMPTZ NOT NULL
optimization_event     TEXT  -- 'user_registered' | 'subscription_started'
conversions_7d_meta    INTEGER NOT NULL DEFAULT 0  -- Meta-attributed (Q4: phase detection, Q5/Q11 transitions)
conversions_14d_meta   INTEGER NOT NULL DEFAULT 0  -- Meta-attributed
conversions_7d_posthog INTEGER NOT NULL DEFAULT 0  -- PostHog→Stripe (Q4: ROAS / CPA / Phase C decisions)
roas_7d                REAL                         -- PostHog revenue / Meta spend
cpa_7d                 REAL                         -- Meta spend / PostHog conversions
frequency_current      REAL
parent_ad_set_id       TEXT  -- self-FK, NULL for original ad sets
duplicates_count       INTEGER NOT NULL DEFAULT 0
last_action_taken_at   TIMESTAMPTZ
flagged_for_review     BOOLEAN NOT NULL DEFAULT false
flag_reason            TEXT
updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Q4 source-of-truth split made explicit:**
- `conversions_*_meta` — used by Phase B → C transition logic (Q5) and Q11 hybrid switch trigger. Matches Meta's algorithm view.
- `conversions_7d_posthog` — used by Phase C scale criteria (Q8) and pause criteria (Q9). Matches actual revenue truth.
- `roas_7d` / `cpa_7d` — derived metrics using PostHog conversion counts as denominator. Phase C profitability decisions only.

Indexes: `(current_phase)`, `(parent_ad_set_id)`, `(flagged_for_review) WHERE flagged_for_review = true`.

### `advertising_ad_set_metric_history`

One row per ad set per day. Time-series for comparable-window queries.

```sql
id                     TEXT PRIMARY KEY  -- nanoid
ad_set_id              TEXT NOT NULL
date                   TEXT NOT NULL     -- YYYY-MM-DD UTC
day_of_week            INTEGER NOT NULL  -- 0-6 for Tue-vs-Tue queries
impressions            INTEGER NOT NULL
clicks                 INTEGER NOT NULL
spend_usd              REAL NOT NULL
ctr                    REAL NOT NULL
cpc                    REAL NOT NULL
cpm                    REAL NOT NULL
frequency              REAL NOT NULL
conversions            INTEGER NOT NULL
revenue_usd            REAL NOT NULL DEFAULT 0
roas                   REAL              -- nullable when spend = 0
created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
UNIQUE(ad_set_id, date)
```

Indexes: `(ad_set_id, date DESC)`, `(ad_set_id, day_of_week, date DESC)`.

Retention: 90 days. Pruning runs in `retro-weekly` cron.

### `advertising_ad_set_phase_transitions`

Append-only audit log of phase changes. Small volume (≤1 per ad set per week typical).

```sql
id                     TEXT PRIMARY KEY  -- nanoid
ad_set_id              TEXT NOT NULL
from_phase             TEXT NOT NULL
to_phase               TEXT NOT NULL
reason                 TEXT NOT NULL     -- e.g. 'meta_default_50/7d', 'frequency_saturation', 'account_emergency'
metric_snapshot        JSONB NOT NULL    -- AdMetric at time of transition
triggered_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Index: `(ad_set_id, triggered_at DESC)`.

Retention: forever (small volume, valuable for debugging).

---

## Decision policies — per phase

### Phase A — Pre-launch

Triggered when: `days_running = 0` AND ad set just created.

Allowed actions: `hold` (default). Creative-side validation only (already covered by `creative-gen` safety checks).

Transition out: ad goes live → `days_running = 1` → automatic transition to Phase B.

### Phase B — Learning

Triggered when: `days_running >= 1` AND not yet meeting Phase C entry criteria.

**8 extreme-failure exceptions** (any one triggers immediate `pause`):

1. `current_metrics.status === 'DISAPPROVED'` (Meta rejected the ad)
2. `current_metrics.frequency >= 5.0` (audience burned, learning broken anyway)
3. `current_metrics.spend_usd >= $50` AND `conversions_meta_7d === 0` (zero signal after meaningful spend)
4. `current_metrics.ctr < 0.003` AND `current_metrics.impressions >= 1000` (creative DOA — Meta cannot learn even with more data)
5. `current_metrics.cpc >= $10.0` (extreme cost, audience targeting clearly wrong)
6. `account_status.disapproval_rate > 0.05` (account-wide policy issue — pause ALL ad sets)
7. `account_status.quality_rating === 'BELOW_AVERAGE'` (account quality drop — pause ALL ad sets)
8. Spend cap hit (already enforced by existing `spend-cap.ts:140-158`)

**Phase B → Phase C transition** (Q5, Meta-attributed conversions per Q4):

- `state.conversions_7d_meta >= 50` → transition with reason `meta_default_50/7d`
- OR `days_in_b >= 14` AND `state.conversions_14d_meta >= 30` → transition with reason `mvp_adapted_30/14d`
- OR `days_in_b >= 14` AND `state.conversions_14d_meta < 30` → transition to PAUSED with `flagged_for_review = true`, reason `low_volume_failed_learning`

**Default action while in Phase B** (none of above triggered): `hold` with reason `learning_in_progress`.

**Forbidden in Phase B** (the agent must NEVER):
- Edit budget by ±20% (resets learning)
- Edit creative (resets learning)
- Edit audience or placements (resets learning)
- Pause based on slow-window metrics (CPA, ROAS) — insufficient statistical signal

### Phase C — Active

Triggered when: ad set transitioned from Phase B per Q5 criteria.

**Q9 pause criteria** (any one triggers `pause`, evaluated FIRST to free budget for scaling):

- `cpa_7d > 2.0 * target_cpa` AND consecutive 7 days above threshold → pause
- `roas_14d < 0.5 * target_roas` (longer window for revenue volatility) → pause
- `frequency_current > 4.0` → escalate to Phase D (transition, not pause)

**Q8 scale criteria** (all must hold to trigger `duplicate`):

- `roas_7d >= 2.0 * target_roas` OR `cpa_7d < 0.6 * target_cpa`
- `frequency_current < 2.5`
- Sustained 7 days (verified via `comparable-window.comparable` — z-score not dropping)
- `state.duplicates_count < 2` (Q8: max 2 duplicates per parent)

**Scale execution:**
- New duplicate created via existing `act/duplicate.ts` with `budget_usd_new = original_budget * 1.5` (Q8: +50%)
- Pre-flight: spend-cap check. If would exceed cap → orchestrator first pauses worst Phase C underperformer (CPA >1.5x target, weakest), then re-checks. If still blocked → defer to next tick + log digest entry.
- New ad set state row created with `parent_ad_set_id` set, phase = 'A' → automatic transition to 'B'

**Q11 hybrid event switch** (auto-trigger):

- If `state.optimization_event === 'user_registered'` AND `state.conversions_7d_meta >= 50`:
  - Decision: `hybrid_event_switch` from `user_registered` to `subscription_started`
  - Routed as LOW_RISK approval (4h auto-approve) — resets learning, must be deliberate
  - On execute: `metaApi.updateAdSetOptimizationEvent(ad_set_id, 'subscription_started')` + state transition back to Phase B (optimization change resets Meta learning)

**Phase C → Phase D transition** (any one):

- `frequency_current > 3.0` AND consecutive 3 days
- CTR fade: `comparable-window.comparable('ctr')` z-score < -2.0 over 7 days (current week vs prior weeks' same DOW average dropped >2σ)
- Conversion velocity drop: `comparable('conversions')` z-score < -2.0 over 7 days
- Plateau: `days_in_c >= 30` AND `state.duplicates_count === 0` (no scale events) → escalate

**Default action**: `maintain` with reason `within_phase_c_thresholds`.

### Phase D — Decline

Triggered when: ad set transitioned from Phase C per any decline trigger.

Action mapping (Q10 option E — Mixed):

| Trigger | Action | Approval |
|---|---|---|
| `frequency_current > 3.0` | `refresh_creative` (preserves audience, refreshes hook) | LOW_RISK 4h auto |
| CTR fade z-score < -2.0 | `refresh_creative` | LOW_RISK 4h auto |
| Conversion velocity drop z-score < -2.0 | `propose_new_ad_set` (different audience angle) | HIGH_RISK blocking |
| Plateau 30d no scale | `pause_for_rest` (pause 14d, then auto-unpause back to Phase B) | execute immediately |

**Phase D → re-entry to Phase B** (after any of above):
- `refresh_creative` succeeds → Meta treats creative change as significant edit (resets learning per Q12 LEARNING_RESET classification) → state transitions to Phase B with `phase_entered_at = now`
- `propose_new_ad_set` succeeds → original ad set transitions to PAUSED; new ad set enters at Phase A → B
- `pause_for_rest` after 14 days → ad set unpaused, transitions to Phase B with `phase_entered_at = now`

In all 3 cases the ad set re-enters Phase B (matching the diagram). Phase D is a transient "decline detection + treatment" phase, not a steady state.

### Account emergency (cross-phase)

Evaluated in `account-health-weekly` cron (existing) AND on every cron tick (cheap check):

- `account_status.disapproval_rate > 0.05` → pause-all (Phase B exception #6)
- `account_status.quality_rating === 'BELOW_AVERAGE'` → pause-all (Phase B exception #7)
- `account_status.status === 'DISABLED'` → pause-all + critical Telegram alert + Sentry

Pause-all execution: iterate `stateStore.listByPhase(['B', 'C', 'D'])`, queue `pause` decision for each. All execute immediately (REVERSIBLE per Q12). Founder receives single critical Telegram alert summarizing.

---

## Approval routing — Q12 hybrid by reversibility

```
Decision arrives at ApprovalRouter:

REVERSIBLE (can be undone trivially):
  pause, pause_for_rest, unpause, hold, maintain, account-emergency-pause-all
  → execute_immediately (no Telegram approval)

LEARNING_RESET (commits new spend OR resets Meta's algorithm):
  duplicate (new spend),
  refresh_creative (resets learning),
  hybrid_event_switch (resets learning)
  → low_risk_approval via TelegramBot.requestApproval(... 'LOW_RISK')
     - Auto-approve after 4h if no founder response
     - Founder rejects → action skipped, 24h cooldown before re-proposing same decision

NEW_SPEND (creates entirely new ad set):
  propose_new_ad_set
  → high_risk_approval via TelegramBot.requestApproval(... 'HIGH_RISK')
     - Blocks until founder responds
     - 7-day reminder, 14-day auto-reject

SAFETY ABORT:
  Any decision when seniorBuyerMode === 'off' (legacy path active)
  → rejected with reason 'feature_gate_off'
```

Idempotency: pending approvals stored with `UNIQUE(ad_set_id, action_type, decision_hash)` constraint to prevent duplicate Telegram messages on cron retry. Add new column `cooldown_until TIMESTAMPTZ` to `advertising_decisions` for the founder-rejected 24h cooldown.

---

## Comparable window math

Used for Phase C/D decisions that require comparing current performance to prior comparable periods (Tue-vs-Tue, not Tue-vs-Mon).

```ts
comparable(ad_set_id, 'ctr', weeks_lookback=4):
  current_dow = today.getDay()  // 0-6
  current_value = today_metric.ctr

  baseline_samples = metricHistory.getDayOfWeekHistory(ad_set_id, current_dow, weeks_lookback)
  // returns up to 4 prior same-DOW snapshots

  if baseline_samples.length < 2:
    return null  // insufficient signal

  baseline_mean = mean(baseline_samples.map(s => s.ctr))
  baseline_stddev = stddev(baseline_samples.map(s => s.ctr))

  if baseline_stddev === 0:
    is_significant = current_value !== baseline_mean
    z_score = current_value > baseline_mean ? Infinity : -Infinity
  else:
    z_score = (current_value - baseline_mean) / baseline_stddev

  delta_pct = (current_value - baseline_mean) / baseline_mean
  is_significant = abs(z_score) >= 2.0 AND baseline_samples.length >= 3
```

Interpretation:
- `z_score < -2.0` → metric dropped significantly (e.g. CTR fade in Phase C → Phase D)
- `z_score > +2.0` → metric improved significantly (sustained → scale candidate)
- `is_significant === false` → noise, not actionable

---

## Rollout — shadow mode via existing feature-gates (Q14)

Reuses existing `advertising_feature_gates` table and `feature-gates.ts:evaluateGates` logic.

### Gate config (added to `feature-gates.ts:featureGatesConfig`)

```ts
seniorBuyerMode: {
  initial_mode: 'shadow',
  activate_when: {
    min_days_running: 14,
    shadow_agreement_threshold: 0.7,  // 70% of decisions match what founder would have done
  },
}
```

### Mode behavior in `decide/orchestrator.ts`

| Mode | Legacy Tier 1/2/3 | Senior Buyer Phase Evaluator |
|---|---|---|
| `off` | RUNS, decisions executed | NOT RUN |
| `shadow` | RUNS, decisions executed (status quo) | RUNS in parallel, decisions logged with `shadow_component='senior_buyer'`, NOT executed |
| `active_proposal` | NOT RUN | RUNS, every decision routed via LOW_RISK approval (founder approves each) |
| `active_auto` | NOT RUN | RUNS, decisions routed per Q12 (mostly auto-execute) |

### Graduation criteria

After `min_days_running = 14` in `shadow`:
- Read pairs of (legacy_decision, senior_decision) per ad_set per timestamp from `advertising_decisions`
- Compute agreement rate (same `action` chosen)
- If `agreement >= 0.7` → auto-promote to `active_proposal`
- If `agreement < 0.7` → extend shadow by 7 days (max 4 weeks total), founder Telegram alert with disagreement examples
- After 4 weeks of shadow extension without graduation → require founder manual approval to graduate

After 5 founder-approved decisions in `active_proposal` → auto-promote to `active_auto`.

### Auto-demotion safety

In `active_auto`, if founder rejects 3+ LOW_RISK approvals in any 7-day window → auto-demote to `active_proposal`. Telegram critical alert. Manual founder action required to re-promote.

### DRY_RUN interaction

While `ADVERTISING_AGENT_DRY_RUN=true` (current state):
- All cron logic runs (perceive, evaluate, route, decide)
- DB writes for state and history STILL HAPPEN — accumulates dataset for shadow agreement analysis
- Act layer short-circuits Meta API calls via `isDryRun()` check (existing pattern in `act/pause.ts:50-65`)
- Decisions logged with new field `dry_run: true` on `advertising_decisions` (NEW column)

This means: shadow mode validation can begin BEFORE removing DRY_RUN. Once shadow agreement ≥70% reached, founder removes DRY_RUN and graduates seniorBuyerMode → active_proposal in same change.

---

## Error handling

Principle: **fail-safe defaults. On any error, the agent holds position rather than acting.**

### Perceive layer

| Failure | Behavior |
|---|---|
| `fetchMetaInsights` throws | Cron returns 500. Sentry. Next tick (1h) retry. No state mutation. |
| Meta returns partial data | Evaluate ONLY ad sets present. Missing ones → no decision this tick. Log warn. |
| `fetchPosthogConversions` for one ad set throws | Fall back to `metricHistory` previous-day snapshot. If absent → use 0 (conservative — won't trigger scale, may trigger Phase B exception #3 zero-conv). |
| `fetchStripeRevenue` throws | ROAS = null → Phase C scale criterion (ROAS ≥2x) cannot be met → no scale. Pause criterion (ROAS<0.5x) cannot trigger either. Effectively "hold" on revenue-based decisions. |
| All 3 sources fail | `PerceiveError` thrown. Cron 500. Sentry. |

### Phase Evaluator layer

| Failure | Behavior |
|---|---|
| Per-ad-set evaluation throws | Per-ad-set try/catch. Sentry with `{ad_set_id, phase}` tags. Other ad sets continue. State NOT mutated. |
| `stateStore.get()` returns null for new ad set | Initialize: `phase: 'A'`, `phase_entered_at: now`, `optimization_event: 'user_registered'`. Persist. |
| Phase policy returns invalid decision (no `action` field) | Validation gate at orchestrator boundary throws → caught per-ad-set. Decision discarded. Sentry. |
| Phase D triggered but no `refresh_creative` brief available | Fall back to `pause_for_rest` (Q10 option A). Founder digest entry. |

### DB layer

| Failure | Behavior |
|---|---|
| `stateStore.upsert()` after decision logged | Compensating action: read latest from audit log on next tick, infer state. Drift acceptable for ≤1 cron tick. Sentry on every drift. |
| `metricHistory.recordSnapshot()` fails in daily cron | Snapshot lost for that day. comparable-window has gap. Tomorrow proceeds normally. Phase D detection less sensitive while gap rolls out of 7-day window. Acceptable. |
| `recordTransition()` fails | State change in `state` succeeds (atomic upsert), audit entry missing. Sentry. Founder digest notes gap. |
| Concurrent cron + manual trigger | Drizzle `onConflictDoUpdate` makes per-row atomic. Last-write-wins. ≤1 tick stale acceptable. |

### Approval routing

| Failure | Behavior |
|---|---|
| `telegramBot.requestApproval` throws | Decision NOT executed. Logged `applied=false, apply_error='telegram_unreachable'`. Re-attempted next tick (each tick re-evaluates). Sentry. |
| LOW_RISK approval times out (4h) | Auto-execute per existing `waitForCallbackQuery` (`telegram-bot.ts:240-284`). Logged `metaResponse: { auto_approved: true, timed_out: true }`. |
| HIGH_RISK approval blocks >24h | Cron tick returns success (pending). Subsequent ticks find pending approval → skip re-issuing same decision. 7-day reminder, 14-day auto-reject + Sentry. |
| Founder rejects LOW_RISK | NOT executed. Logged `apply_error='founder_rejected'`. 24h cooldown via new `cooldown_until` column. |
| Two cron ticks queue same approval | Idempotency: `UNIQUE(ad_set_id, action_type, decision_hash)` constraint. Second insert no-ops. |

### Act layer

| Failure | Behavior |
|---|---|
| `pause()` Meta API fails | Existing `act/pause.ts:51-65` pattern — failed audit row written, re-throws. Caught per-decision. Other decisions continue. |
| `duplicate()` Meta succeeds, state.duplicates_count update fails | Reconciliation step in `triage-daily`: query Meta `getAdSetsByParent`, sync state. |
| `refresh_creative` returns NSFW asset | Asset rejected at safety gate (`advertisingCreatives.safety_checks`). NEW creative regenerated. Max 3 retries per request, then human review. |
| `propose_new_ad_set` Meta succeeds, DB insert fails | Reconciliation in `triage-daily` via Meta `listAdSets`. State initialized with `phase: 'B'`. |
| `checkSpendCap` blocks duplicate | Orchestrator pre-emptively pauses worst Phase C underperformer (CPA >1.5x target). Re-check cap. If still blocked → defer + digest. |

### Feature gate / shadow

| Failure | Behavior |
|---|---|
| Feature gate read fails | Default to `seniorBuyerMode: 'off'` (legacy path). Sentry. Founder alert: "senior_buyer degraded to legacy". |
| Shadow agreement <70% at week 14 | Auto-graduation BLOCKED. Founder alert with disagreement examples. Auto-extend max 4 weeks. After 4 weeks → manual approval required. |
| Founder rejects 3+ in active_auto in 7 days | Auto-demote `active_auto → active_proposal`. Critical Telegram + Sentry. Manual re-promotion. |

### Cross-cutting

| Concern | Behavior |
|---|---|
| `ADVERTISING_AGENT_ENABLED=false` mid-execution | Existing kill-switch — checked at top of cron route. In-flight decisions complete (single transaction); next tick blocked. |
| `ADVERTISING_AGENT_DRY_RUN=true` | `isDryRun()` short-circuits Meta API calls in act layer. State + history DB writes still happen (for shadow validation). |
| Cron route timeout (300s default per CLAUDE.md) | Per-ad-set evaluation parallelized via `Promise.allSettled`. Max ~50 ad sets per tick at <2s each. If >50, batch round-robin: each tick processes max 30 ad sets. |
| Sentry tags | Add to all new captures: `{ subsystem: 'senior_buyer', phase: <current_phase>, ad_set_id: <id>, db_layer: 'drizzle' }`. Continues today's Track 9 pattern. |

---

## Testing strategy

### Unit tests — per phase policy (TDD, Vitest)

```
src/modules/advertising/senior-buyer/policies/__tests__/
├── phase-a.test.ts          (~10 cases — creative checks)
├── phase-b.test.ts          (~25 cases — 8 exceptions × edge + Q5 transitions)
├── phase-c.test.ts          (~30 cases — Q8 scale × Q9 pause × Q11 hybrid switch matrix)
├── phase-d.test.ts          (~15 cases — 4 detection triggers × 4 actions)
└── account-emergency.test.ts (~5 cases — disapproval/quality thresholds)
```

Each phase policy is a pure function: `(input, state) → decision`. Tests are tables. Coverage target: **100%**.

### Unit tests — supporting modules

```
senior-buyer/__tests__/
├── phase-evaluator.test.ts        Orchestration test — mocks all 4 policies
├── state-store.test.ts            DB CRUD with vi.mock'd Drizzle (Track 10 pattern)
├── comparable-window.test.ts      Z-score math, edge cases (≥15 cases — math is critical)
├── approval-router.test.ts        Q12 matrix — every action × every routing outcome
└── orchestrator-shadow.test.ts    Shadow-mode dual-decision logging
```

Coverage targets: phase-evaluator ≥80%, state-store ≥85%, comparable-window 100%, approval-router 100%.

### Integration tests — DB-injection (Track 10 pattern)

Extends `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`:

- shadow mode: legacy + senior decisions BOTH logged, only legacy applied
- active_auto: senior decisions executed, legacy NOT run
- Q8 scale: Phase C with high ROAS triggers duplicate (LOW_RISK approval)
- Phase C pause precedes scale when budget cap would be exceeded
- refresh_creative respects 3-retry NSFW gate
- propose_new_ad_set HIGH_RISK blocks until founder responds

Mocking pattern matches Track 9: `vi.hoisted()` for `mockDrizzleDb` to avoid vitest hoisting `ReferenceError`. Mock chain supports `.insert().values().onConflictDoUpdate()`.

### Calibration test — shadow mode in production

Not a code test — live data validation over 14 days minimum. Metrics tracked in `retro-weekly` digest:

| Hypothesis | Metric | Threshold |
|---|---|---|
| Q5 thresholds reasonable | % ad sets reaching Phase C within 14 days | >50% |
| Q8 scale criteria not over-firing | Duplicate proposals per week | <3 |
| Q9 pause criteria not over-firing | Pause proposals per week | <5 |
| Q12 LOW_RISK approval scales | Founder approval response time | <4h median |
| Shadow agreement | % decisions matching founder's manual review | ≥70% |

Failure → tune thresholds → another 1-2 weeks shadow.

### Pre-deploy gate

```bash
npx vitest run src/modules/advertising/senior-buyer
npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts
npx vitest run src/modules/advertising  # regression
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/senior-buyer
```

### Manual verification post-deploy

```bash
# Force-trigger cron, inspect logs for:
# - Phase distribution (~30% B, 50% C, 15% D, 5% PAUSED at steady state)
# - Decision distribution (95% maintain, others per Q8/Q9/Q10)
# - Telegram approval latency (under 4h auto)

curl -H "Authorization: Bearer $CRON_SECRET" \
  https://estrevia.app/api/cron/advertising/triage-hourly
```

Telegram digest reviewed weekly (during shadow + first 4 weeks of active).

---

## Out of scope

- **Calendar / seasonality awareness** (Q15 option A). Add as JSON config when reaching Q4 holidays.
- **Telegram inbound commands** (Q15-C dropped). Outbound notifications/approvals only.
- **CBO migration** (Q7-C dropped). ABO structure preserved.
- **Multi-creative ad sets with per-variant kill** (Q10-C). Single creative per ad set assumption.
- **Variance-based seasonality auto-detection** (Q15-D). Statistical patience via comparable-window only.
- **Auto-iteration loop** (CLAUDE.md gate: ~month 3+).
- **Replacement of Tier 2 (Bayesian) and Tier 3 (anomaly)**. They become signal sources for Phase C, not removed.
- **Audience size headroom checking** (Q8-C dropped — needs Meta API not currently wired).
- **CPA/ROAS targets per ad set configuration**. MVP: hardcoded global defaults (CPA target = $5 for signup-optimized, $30 for subscription-optimized; ROAS target = 1.0 for signup phase, 2.0 for subscription phase). Future: per-campaign overrides.

---

## Known issues / open questions for plan

- **`target_cpa` / `target_roas` constants location.** Need a `src/modules/advertising/senior-buyer/targets.ts` config module with sensible MVP defaults. Plan should specify per-ad-set override mechanism for later.
- **`account-health.ts` does not exist yet** in `perceive/`. Currently `account-health-weekly` cron reads via existing `getAccountStatus()` on Meta client. Plan should define the perceive-layer adapter.
- **Reconciliation cron for Meta-vs-state drift** mentioned in error handling needs concrete implementation. Plan should add a step to `triage-daily` that queries Meta `listAdSets` and reconciles with `advertising_ad_set_state`.
- **Cron tick budget (300s)**. With current ~21 ad sets in production, parallel evaluation fits easily. Plan should specify the round-robin batching mechanism for >50 ad sets case.
- **Tier 2 (Bayesian) / Tier 3 (anomaly) integration into Phase C.** Spec defines them as "signal sources" but does not specify how Phase C combines those signals with its own logic. Plan should make this concrete (e.g. "Tier 2 disagreement raises confidence threshold for scale by 20%").

---

## Approval

Approved by founder via brainstorming session 2026-05-03. All 15 architectural decisions confirmed:

| # | Decision | Choice |
|---|---|---|
| 1 | Spec scope | Single large spec covering all 3 subsystems |
| 2 | Decide-layer structure | 4-phase lifecycle state machine (Phase A/B/C/D) |
| 3 | Conversion event | Hybrid: `user_registered` → `subscription_started` switch |
| 4 | Source of truth | Hybrid by purpose (Meta for phase detection, PostHog/Stripe for ROAS) |
| 5 | Phase B → C entry | 50/7d OR 30/14d OR flagged for review |
| 6 | Phase B exceptions | All 8 extreme-failure pause conditions |
| 7 | Phase C scaling | Duplicate-only (no edit) |
| 8 | Phase C scale criteria | Moderate (ROAS ≥2x or CPA <0.6x sustained 7d, freq <2.5, +50%, max 2 dupes) + budget discipline |
| 9 | Phase C pause criteria | Mixed (CPA >2x sustained 7d OR ROAS <0.5x sustained 14d OR freq >4) |
| 10 | Phase D actions | Mixed (refresh_creative + propose_new_ad_set + pause_for_rest) |
| 11 | Hybrid event switch threshold | 50 user_registered/week, automatic |
| 12 | Approval flow | Hybrid by reversibility (REVERSIBLE auto, LEARNING_RESET LOW_RISK 4h, NEW_SPEND HIGH_RISK blocking) |
| 13 | Data infrastructure | 3 normalized tables (state, metric_history, phase_transitions) |
| 14 | Rollout | Shadow mode through existing feature-gates infrastructure |
| 15 | Calendar awareness | Out of MVP scope |

Ready for plan-writing.
