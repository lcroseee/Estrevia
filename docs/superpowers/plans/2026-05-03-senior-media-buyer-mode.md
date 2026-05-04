# Senior Media Buyer Mode — Advertising Agent (v3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ## ⛔ HARD DEPENDENCY ON v3a — DO NOT BEGIN WITHOUT THIS GATE
>
> **Do NOT begin Wave 0 until v3a (Pre-flight Blockers) is fully shipped to production AND verified stable for ≥48 hours of clean cron runs.** Specifically:
>
> 1. v3a plan (`docs/superpowers/plans/2026-05-03-advertising-pre-flight-blockers.md`) is fully executed and deployed to `main`.
> 2. `npm run advertising:verify-prod-state` reports 0 errors against current `.env.production`. **Note:** local `.env.production` file is masked by Vercel CLI for encrypted vars — verify against Vercel dashboard or by direct Meta API probe.
> 3. The 4 advertising crons (triage-hourly, triage-daily, retro-weekly, audience-refresh) have run for 48h+ without new Sentry alerts in `subsystem: 'audiences' | 'creative-gen-safety' | 'reconciler'`.
> 4. `audience-refresh` cron is producing non-zero `total_audiences` and zero `failed_audiences`.
> 5. ~~The two production ad sets show `frequency_control_specs={IMPRESSIONS, 7d, 10}` in Meta Ads Manager (Track 11 of v3a complete).~~ **DEFERRED-BY-DESIGN.** v3a Track 11 was rejected by Meta API (`code: 100, subcode: 1815198`): `frequency_control_specs` requires `optimization_goal=REACH/IMPRESSIONS`, but production ad sets optimize `LANDING_PAGE_VIEWS`. Per `docs/advertising/frequency-cap-gap-v3a.md`, this gate is satisfied opportunistically by v3b Q11 hybrid event switch — when per-ad-set `user_registered` reaches ≥50/week, v3b's data-maturity classifier graduates optimization to `Lead` (a deliberate spec-mandated reset moment), at which point frequency cap can be retrofit. Tier-1 aggregate `FREQUENCY_CAP=4.0` continues to bound runaway frequency in the meantime.
>
> v3a fixes critical infrastructure that this spec assumes is production-ready: real audience-refresh implementations, vision-based safety checks, hybrid attribution windows, reconciler global suspend, defensive `LEARNING_PHASE_DAYS=7`, and verified env state. v3b's Stage 0 (Pixel + CAPI) and senior-buyer logic will malfunction or produce unsafe decisions if any of these are still stubs.

**Spec:** `docs/superpowers/specs/2026-05-03-senior-media-buyer-mode-design.md`

**Goal:** Install Meta Pixel + Conversions API (Stage 0), then replace Tier-1 hard rules with a per-ad-set data-maturity-driven 4-phase lifecycle state machine that respects Meta learning, scales via duplicate, routes decisions through reversibility-based approval, and self-calibrates thresholds from rolling 30-day baselines.

**Architecture:** Three module layers built across 4 waves. (1) Stage 0 — `meta-capi/` module + browser Pixel + Clerk/Stripe webhook CAPI fires + `BirthDataForm` companion. (2) `senior-buyer/` module — phase evaluator, data-maturity classifier, threshold resolver, baseline calculator, comparable window, approval router, auto-calibrator, 5 phase policies, 2 new act types. (3) DB extensions — 4 new normalized tables (state, metric_history, phase_transitions, thresholds) + new `auto-calibrate` Vercel cron + 2 new admin UI sections. The orchestrator branches on a `seniorBuyerMode` feature gate (kill-switch only — per-ad-set rollout is data-maturity-driven, not stage-gated).

**Tech Stack:** TypeScript strict, Drizzle ORM (Neon Postgres), Vercel Cron + Fluid Compute, Next.js 16 App Router (Server Components for admin pages, Server Actions for mutations), `next/script` for Pixel injection, `posthog-node` (existing) and `posthog-js` (existing) for analytics, Stripe Node SDK (Subscribe events), Clerk webhooks (Lead events), Meta Marketing API v22.0 (CAPI + ad set updates), Vitest + `vi.hoisted` Drizzle mocks, Telegram Bot API (HIGH_RISK approvals), Sentry, SHA-256 hashing for PII at the CAPI boundary.

---

## File structure

### Stage 0 — Pixel + CAPI (Wave 0 + Wave 1)

```
src/modules/advertising/meta-capi/types.ts                                        [NEW]    (T2)
src/modules/advertising/meta-capi/dedupe.ts                                       [NEW]    (T2)
src/modules/advertising/meta-capi/event-mapper.ts                                 [NEW]    (T2)
src/modules/advertising/meta-capi/client.ts                                       [NEW]    (T3)
src/modules/advertising/meta-capi/index.ts                                        [NEW]    (T11)
src/modules/advertising/meta-capi/__tests__/types.test.ts                         [NEW]    (T2)
src/modules/advertising/meta-capi/__tests__/dedupe.test.ts                        [NEW]    (T2)
src/modules/advertising/meta-capi/__tests__/event-mapper.test.ts                  [NEW]    (T2)
src/modules/advertising/meta-capi/__tests__/client.test.ts                        [NEW]    (T3)
src/modules/advertising/meta-capi/__tests__/index.test.ts                         [NEW]    (T11)

src/app/[locale]/layout.tsx                                                       [MODIFY] (T8)
.env.example                                                                      [MODIFY] (T8)

src/shared/lib/analytics.ts                                                       [MODIFY] (T11)
src/shared/lib/__tests__/analytics-capi.test.ts                                   [NEW]    (T11)

src/app/api/webhooks/clerk/route.ts                                               [MODIFY] (T18)
src/app/api/webhooks/clerk/__tests__/route.test.ts                                [MODIFY] (T18)
src/app/api/webhooks/stripe/route.ts                                              [MODIFY] (T18)
src/app/api/webhooks/stripe/__tests__/route.test.ts                               [MODIFY] (T18)

src/modules/astro-engine/components/BirthDataForm.tsx                             [MODIFY] (T19)
src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx              [MODIFY] (T19)
```

### Senior Buyer module (Wave 0 + Wave 1)

```
src/modules/advertising/senior-buyer/targets.ts                                   [NEW]    (T4)
src/modules/advertising/senior-buyer/baseline-calculator.ts                       [NEW]    (T5)
src/modules/advertising/senior-buyer/comparable-window.ts                         [NEW]    (T6)
src/modules/advertising/senior-buyer/data-maturity-classifier.ts                  [NEW]    (T7)
src/modules/advertising/senior-buyer/approval-router.ts                           [NEW]    (T10)
src/modules/advertising/senior-buyer/threshold-resolver.ts                        [NEW]    (T12)
src/modules/advertising/senior-buyer/state-store.ts                               [NEW]    (T13)
src/modules/advertising/senior-buyer/metric-history.ts                            [NEW]    (T14)
src/modules/advertising/senior-buyer/policies/phase-a.ts                          [NEW]    (T15)
src/modules/advertising/senior-buyer/policies/phase-b.ts                          [NEW]    (T15)
src/modules/advertising/senior-buyer/policies/phase-c.ts                          [NEW]    (T16)
src/modules/advertising/senior-buyer/policies/phase-d.ts                          [NEW]    (T17)
src/modules/advertising/senior-buyer/policies/account-emergency.ts                [NEW]    (T17)
src/modules/advertising/senior-buyer/auto-calibrator.ts                           [NEW]    (T20)
src/modules/advertising/senior-buyer/phase-evaluator.ts                           [NEW]    (T21)
(plus __tests__/ peer for each)
```

### Act layer + decide-layer integration (Wave 0 + Wave 2)

```
src/modules/advertising/act/refresh-creative.ts                                   [NEW]    (T9)
src/modules/advertising/act/propose-new-ad-set.ts                                 [NEW]    (T9)
src/modules/advertising/act/__tests__/refresh-creative.test.ts                    [NEW]    (T9)
src/modules/advertising/act/__tests__/propose-new-ad-set.test.ts                  [NEW]    (T9)

src/modules/advertising/decide/orchestrator.ts                                    [REWRITE](T22)
src/modules/advertising/decide/__tests__/orchestrator.test.ts                     [MODIFY] (T22)
src/modules/advertising/decide/feature-gates.ts                                   [MODIFY] (T22)
```

### Cron routes (Wave 2)

```
src/app/api/cron/advertising/triage-hourly/route.ts                               [MODIFY] (T23)
src/app/api/cron/advertising/triage-daily/route.ts                                [MODIFY] (T24)
src/app/api/cron/advertising/auto-calibrate/route.ts                              [NEW]    (T25)
src/app/api/cron/advertising/__tests__/cron-handlers.test.ts                      [MODIFY] (T23/T24)
src/app/api/cron/advertising/auto-calibrate/__tests__/route.test.ts               [NEW]    (T25)
vercel.json                                                                       [MODIFY] (T25)
```

### DB schema (Wave 0)

```
src/shared/lib/schema.ts                                                          [MODIFY] (T1)
drizzle/<timestamp>_senior_buyer_tables.sql                                       [NEW]    (T1)
```

### Admin UI (Wave 2)

```
src/app/admin/advertising/thresholds/page.tsx                                     [NEW]    (T26)
src/app/admin/advertising/thresholds/ThresholdRow.tsx                             [NEW]    (T26)
src/app/admin/advertising/thresholds/ThresholdHistory.tsx                         [NEW]    (T26)
src/app/admin/advertising/thresholds/actions.ts                                   [NEW]    (T26)
src/app/admin/advertising/ad-set-state/page.tsx                                   [NEW]    (T27)
src/app/admin/advertising/ad-set-state/AdSetStateCard.tsx                         [NEW]    (T27)
src/app/admin/advertising/layout.tsx                                              [MODIFY] (T26 + T27)
src/app/admin/advertising/page.tsx                                                [MODIFY] (T26 + T27)
```

~75 files touched. Approx. 6500 lines added, ~150 removed.

---

## Parallel execution model — 10 agents in 4 waves + aggregator

```
Wave 0  (10 parallel agents — all foundations, fully independent):
  ┌─ T1:  DB schema 4 new tables + migration                    [~1.5 h]
  ├─ T2:  meta-capi/{types, dedupe, event-mapper}.ts            [~1.5 h]
  ├─ T3:  meta-capi/client.ts + tests                           [~2 h]
  ├─ T4:  senior-buyer/targets.ts (cold-start defaults)         [~1 h]
  ├─ T5:  senior-buyer/baseline-calculator.ts                   [~2 h]
  ├─ T6:  senior-buyer/comparable-window.ts (z-score math)      [~2 h]
  ├─ T7:  senior-buyer/data-maturity-classifier.ts              [~1.5 h]
  ├─ T8:  Pixel script in src/app/[locale]/layout.tsx           [~1 h]
  ├─ T9:  act/{refresh-creative, propose-new-ad-set}.ts         [~2 h]
  └─ T10: senior-buyer/approval-router.ts                       [~2 h]

Wave 1  (10 parallel agents — depends on Wave 0):
  ┌─ T11: meta-capi/index.ts + analytics.ts CAPI extension      [~2 h, depends T2/T3]
  ├─ T12: senior-buyer/threshold-resolver.ts                    [~2 h, depends T1/T4]
  ├─ T13: senior-buyer/state-store.ts                           [~2.5 h, depends T1]
  ├─ T14: senior-buyer/metric-history.ts                        [~2 h, depends T1/T13]
  ├─ T15: senior-buyer/policies/{phase-a, phase-b}.ts           [~3 h, depends T4/T7/T12]
  ├─ T16: senior-buyer/policies/phase-c.ts                      [~4 h, depends T4/T6/T7/T12]
  ├─ T17: senior-buyer/policies/{phase-d, account-emergency}.ts [~2.5 h, depends T4/T6/T12]
  ├─ T18: webhooks/{clerk, stripe} CAPI wire                    [~1.5 h, depends T11]
  ├─ T19: BirthDataForm fbq companion                           [~1 h, depends T8]
  └─ T20: senior-buyer/auto-calibrator.ts                       [~3 h, depends T5/T6/T12/T13]

Wave 2  (7 parallel agents — orchestration + UI):
  ┌─ T21: senior-buyer/phase-evaluator.ts (orchestrator)        [~3 h, depends T7/T13/T15/T16/T17]
  ├─ T22: decide/orchestrator.ts rewrite + feature gate         [~3 h, depends T21]
  ├─ T23: triage-hourly/route.ts                                [~1.5 h, depends T22]
  ├─ T24: triage-daily/route.ts                                 [~2 h, depends T14/T22]
  ├─ T25: auto-calibrate/route.ts NEW + vercel.json cron        [~2 h, depends T20]
  ├─ T26: admin UI thresholds                                   [~3 h, depends T12]
  └─ T27: admin UI ad-set-state                                 [~3 h, depends T13]

Wave 3  (1 agent — final integration):
  └─ T28: aggregator: migration apply, gate flip plan, runbook  [~2 h]
```

**Parallelism budget per wave:** ≤10 agents (per `.claude/settings.json` — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, `teammateMode=tmux`).

**Critical path:** T1 → T13 → T21 → T22 → T23 → T28 (~16-18 h serially).

**Wall-clock estimate:** ~20-25 h from Wave 0 kickoff to T28 completion, assuming healthy worktree merges and no test flakes. Total per-track dev work sums to ~50-55 h, parallelized into ~20-25 h wall-clock by 10-agent batching.

---

## Conventions for ALL agents

**Read v3a before starting.** v3b assumes v3a is shipped. Before writing any code in your track, skim:
- `src/modules/advertising/perceive/recon-state-store.ts` (Track 8 of v3a — you may gate on this)
- `src/modules/advertising/audiences/*` (Track 7 of v3a — exists in production)
- `src/modules/advertising/creative-gen/safety/checks.ts` (Track 6 of v3a — uses Gemini Vision now)
- `src/modules/advertising/decide/tier-1-rules.ts` (now `LEARNING_PHASE_DAYS = 7` per v3a Track 1)

**Worktree isolation.** Each agent runs with `isolation: "worktree"`. Coordinator merges in dependency order specified above.

**TDD cycle.** Every track: write failing test → run to confirm fail → write minimum implementation → run to confirm pass → commit. No skipping verify-fail.

**Test framework.** Vitest. Single file: `npx vitest run path/to/file.test.ts`. Full v3b scope: `npx vitest run src/modules/advertising/meta-capi src/modules/advertising/senior-buyer src/app/api/cron/advertising src/shared/lib`.

**Typecheck:** `NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck`.

**Lint:** `npm run lint`. Pre-existing baseline ≈785 errors; do NOT add new errors in advertising scope. Verify scoped: `npm run lint -- src/modules/advertising/meta-capi src/modules/advertising/senior-buyer`.

**Commit format.** Conventional-style scopes:
- `feat(advertising/meta-capi): ...` — Stage 0 module
- `feat(advertising/senior-buyer): ...` — phase logic
- `feat(advertising/act): ...` — new act types
- `feat(advertising/admin): ...` — admin UI
- `feat(advertising/cron): ...` — cron routes
- `feat(db/schema): add senior-buyer tables`
- `chore(advertising/v3b): aggregator + runbook`

**Mocking patterns.** Reuse what already works in this repo:
- **Drizzle DB mocks** (T13, T14, T20, T22, T25): wrap in `vi.hoisted(() => ({ mockDb: ... }))`. Pattern proven in `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts` (Track 9 of `funnel-and-db-fixes`).
- **fetch mocks** (T3 CAPI client, T11 analytics integration): inject `fetchImpl` via constructor option (PosthogFunnelClient pattern at `src/modules/advertising/posthog/funnel-client.ts:60-65`).
- **Telegram bot mocks** (T20 auto-calibrator HIGH_RISK approval): existing `MockTelegramBot` at `src/modules/advertising/__tests__/mocks/telegram.ts`.
- **Sentry mocks**: `vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))`.
- **Clerk + Stripe webhook mocks** (T18): existing patterns in `src/app/api/webhooks/clerk/__tests__/route.test.ts` and `stripe/__tests__/route.test.ts` (added in funnel-and-db-fixes Tracks 5, 7).

**PII handling at the CAPI boundary.** Email and Clerk userId MUST be SHA-256-hashed before being sent to Meta CAPI. `meta-capi/types.ts` defines the `CapiUserData` shape with `external_id` and `em` fields documented as "hashed values only". `meta-capi/client.ts` does NOT do hashing — callers are responsible (so tests can verify hashed values are passed). `meta-capi/index.ts` `sendCapiEvent` wrapper does hashing on behalf of typical callers (webhooks, analytics layer) so application code never touches raw PII alongside the CAPI client.

**Sentry tags.** Every cron `Sentry.captureException` carries `tags: { cron: true, route: '/api/cron/...', subsystem: '...' }`. v3b extends this with `phase`, `ad_set_id`, and `db_layer` where relevant. Pattern (matches v3a Track 9):
```ts
Sentry.captureException(err, {
  tags: {
    cron: true,
    route: '/api/cron/advertising/triage-daily',
    subsystem: 'senior-buyer',
    phase: 'C',
    ad_set_id: state.ad_set_id,
    db_layer: 'drizzle',
  },
});
```

**Fail-safe defaults.** External API failures (Meta CAPI, PostHog, Stripe, Gemini) are caught, logged with warn, fall through to safe defaults. Threshold-resolver DB failures fall back to code defaults in `targets.ts` with Sentry alert. Auto-calibrator failures keep current threshold rather than overwrite with NaN/null.

**`event_id` discipline.** When firing the same logical event from BOTH client (`fbq('track', ..., {eventID: ID})`) AND server (CAPI `event_id: ID`), the SAME id MUST be used so Meta dedupes the pair and counts it as one event. Test must verify the ids match. `meta-capi/dedupe.ts` produces deterministic ids from `(distinctId, event_name, minute_timestamp)`.

**No PII in logs / DB / events.** Email addresses NEVER appear in plaintext in:
- console logs
- Sentry capture payloads (use only `email_domain` if needed)
- DB columns other than the encrypted PII fields already managed by `src/shared/encryption/`
- Telegram alerts (use `email_domain` or `userId` only)

**Worktree handoff.** When a track completes, the agent reports: branch name, commit SHAs, test/lint/typecheck status, and any deviations from the plan. Coordinator cherry-picks or fast-forwards into `main` in dependency order. Do NOT push to `origin/main` from inside a worktree.

**Migration safety.** T1 adds 4 new tables. Follow the v3a Track 8 pattern for migration commits: include both the auto-generated `drizzle/<timestamp>_senior_buyer_tables.sql` AND any seed inserts (none required for v3b — all 4 tables start empty and populate via cron).

---

# Track 1 — DB schema: 4 new senior-buyer tables

**Owner:** Wave 0, agent 1
**Blockers:** none
**Blocks:** T12, T13, T14, T20, T26, T27
**Files:**
- Modify: `src/shared/lib/schema.ts`
- Create: `drizzle/<timestamp>_senior_buyer_tables.sql` (via `npm run db:generate`)

Per spec lines 462-568. All 4 tables follow the existing `advertising_*` naming convention.

- [ ] **Step 1: Confirm Drizzle imports needed**

Open `src/shared/lib/schema.ts`. Verify imports at top include: `pgTable`, `text`, `integer`, `real`, `boolean`, `timestamp`, `jsonb`, `uniqueIndex`, `index` from `drizzle-orm/pg-core`. Add any missing.

- [ ] **Step 2: Append the 4 new tables**

After the existing `advertisingReconState` block (last v3a addition):

```ts
// ---------------------------------------------------------------------------
// advertising_ad_set_state — current phase + maturity + counters per ad set
// ---------------------------------------------------------------------------
export const advertisingAdSetState = pgTable('advertising_ad_set_state', {
  adSetId: text('ad_set_id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  locale: text('locale').notNull(),
  currentPhase: text('current_phase').notNull().default('A'),         // 'A' | 'B' | 'C' | 'D' | 'PAUSED' | 'RETIRED'
  phaseEnteredAt: timestamp('phase_entered_at', { withTimezone: true }).notNull().defaultNow(),
  dataMaturityMode: text('data_maturity_mode').notNull().default('COLD_START'),  // 'COLD_START' | 'CALIBRATING' | 'AUTONOMOUS'
  maturityEnteredAt: timestamp('maturity_entered_at', { withTimezone: true }).notNull().defaultNow(),
  optimizationEvent: text('optimization_event').notNull().default('landing_page_view'),
  conversions7dMeta: integer('conversions_7d_meta').notNull().default(0),
  conversions14dMeta: integer('conversions_14d_meta').notNull().default(0),
  conversionsTotalMeta: integer('conversions_total_meta').notNull().default(0),
  daysWithPixelData: integer('days_with_pixel_data').notNull().default(0),
  conversions7dPosthog: integer('conversions_7d_posthog').notNull().default(0),
  roas7d: real('roas_7d'),
  cpa7d: real('cpa_7d'),
  frequencyCurrent: real('frequency_current'),
  parentAdSetId: text('parent_ad_set_id'),
  duplicatesCount: integer('duplicates_count').notNull().default(0),
  lastActionTakenAt: timestamp('last_action_taken_at', { withTimezone: true }),
  flaggedForReview: boolean('flagged_for_review').notNull().default(false),
  flagReason: text('flag_reason'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  byCurrentPhase: index('idx_ad_set_state_current_phase').on(table.currentPhase),
  byDataMaturity: index('idx_ad_set_state_data_maturity').on(table.dataMaturityMode),
  byParent: index('idx_ad_set_state_parent').on(table.parentAdSetId),
  flagged: index('idx_ad_set_state_flagged').on(table.flaggedForReview).where(sql`${table.flaggedForReview} = true`),
}));

// ---------------------------------------------------------------------------
// advertising_ad_set_metric_history — daily snapshot for baselines + comparable-window
// ---------------------------------------------------------------------------
export const advertisingAdSetMetricHistory = pgTable('advertising_ad_set_metric_history', {
  id: text('id').primaryKey(),
  adSetId: text('ad_set_id').notNull(),
  date: text('date').notNull(),                       // YYYY-MM-DD UTC
  dayOfWeek: integer('day_of_week').notNull(),        // 0-6 for Tue-vs-Tue queries
  impressions: integer('impressions').notNull(),
  clicks: integer('clicks').notNull(),
  spendUsd: real('spend_usd').notNull(),
  ctr: real('ctr').notNull(),
  cpc: real('cpc').notNull(),
  cpm: real('cpm').notNull(),
  frequency: real('frequency').notNull(),
  conversionsMeta: integer('conversions_meta').notNull(),
  conversionsPosthog: integer('conversions_posthog').notNull(),
  revenueUsd: real('revenue_usd').notNull().default(0),
  roas: real('roas'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  byAdSetDate: uniqueIndex('uq_metric_history_adset_date').on(table.adSetId, table.date),
  byAdSetDow: index('idx_metric_history_adset_dow').on(table.adSetId, table.dayOfWeek),
}));

// ---------------------------------------------------------------------------
// advertising_ad_set_phase_transitions — append-only audit log
// ---------------------------------------------------------------------------
export const advertisingAdSetPhaseTransitions = pgTable('advertising_ad_set_phase_transitions', {
  id: text('id').primaryKey(),
  adSetId: text('ad_set_id').notNull(),
  transitionKind: text('transition_kind').notNull(),  // 'phase' | 'maturity'
  fromValue: text('from_value').notNull(),
  toValue: text('to_value').notNull(),
  reason: text('reason').notNull(),
  metricSnapshot: jsonb('metric_snapshot').notNull(),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  byAdSet: index('idx_phase_transitions_adset').on(table.adSetId, table.triggeredAt),
}));

// ---------------------------------------------------------------------------
// advertising_thresholds — DB-stored thresholds with code-default fallback (Q17)
// ---------------------------------------------------------------------------
export const advertisingThresholds = pgTable('advertising_thresholds', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),                     // 'global' | 'campaign' | 'ad_set'
  scopeId: text('scope_id'),                          // NULL for global; campaign_id or ad_set_id otherwise
  metricName: text('metric_name').notNull(),
  value: real('value').notNull(),
  source: text('source').notNull(),                   // 'default' | 'auto_calibrated' | 'founder_override'
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  baselineMetricSnapshot: jsonb('baseline_metric_snapshot'),
  changedBy: text('changed_by').notNull(),            // 'system_calibrator' | 'founder' | 'migration'
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  byScope: uniqueIndex('uq_thresholds_scope_metric_eff').on(
    table.scope, table.scopeId, table.metricName, table.effectiveFrom,
  ),
  byLookup: index('idx_thresholds_lookup').on(table.scope, table.scopeId, table.metricName, table.effectiveFrom),
}));

export type AdvertisingAdSetState = typeof advertisingAdSetState.$inferSelect;
export type AdvertisingAdSetMetricHistory = typeof advertisingAdSetMetricHistory.$inferSelect;
export type AdvertisingAdSetPhaseTransition = typeof advertisingAdSetPhaseTransitions.$inferSelect;
export type AdvertisingThreshold = typeof advertisingThresholds.$inferSelect;
```

(Add `import { sql } from 'drizzle-orm';` at the top if not already present — needed for the partial index.)

- [ ] **Step 3: Generate migration**

```bash
npm run db:generate
```

Expected: a new `drizzle/<timestamp>_senior_buyer_tables.sql` file containing 4 `CREATE TABLE` statements + their indexes.

- [ ] **Step 4: Inspect the generated SQL**

```bash
ls -t drizzle/*.sql | head -1 | xargs cat
```

Verify:
- All 4 tables present
- `dataMaturityMode` column has `DEFAULT 'COLD_START'`
- `optimizationEvent` column has `DEFAULT 'landing_page_view'`
- The unique index on `metric_history(ad_set_id, date)` is named `uq_metric_history_adset_date`
- The partial index on `flaggedForReview = true` uses `WHERE` clause

- [ ] **Step 5: Apply migration locally**

```bash
npm run db:migrate
```

Verify the 4 tables exist via `npm run db:studio` or quick SQL:
```sql
SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'advertising_ad_set%' OR table_name = 'advertising_thresholds';
```

Expected: 4 rows.

- [ ] **Step 6: Smoke test — insert + select via Drizzle**

Add a quick test `src/shared/lib/__tests__/schema-senior-buyer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  advertisingAdSetState,
  advertisingAdSetMetricHistory,
  advertisingAdSetPhaseTransitions,
  advertisingThresholds,
} from '../schema';

describe('senior-buyer schema definitions', () => {
  it('advertisingAdSetState columns include data_maturity_mode and optimization_event', () => {
    expect(advertisingAdSetState).toBeDefined();
    // Drizzle exposes columns under .name
    const cols = Object.keys(advertisingAdSetState).filter((k) => !k.startsWith('_'));
    expect(cols).toContain('dataMaturityMode');
    expect(cols).toContain('optimizationEvent');
    expect(cols).toContain('conversionsTotalMeta');
    expect(cols).toContain('parentAdSetId');
  });

  it('advertisingAdSetMetricHistory has a unique constraint key on adSetId+date', () => {
    expect(advertisingAdSetMetricHistory).toBeDefined();
    expect(Object.keys(advertisingAdSetMetricHistory)).toContain('adSetId');
    expect(Object.keys(advertisingAdSetMetricHistory)).toContain('date');
  });

  it('advertisingThresholds has the resolution-order columns', () => {
    expect(Object.keys(advertisingThresholds)).toContain('scope');
    expect(Object.keys(advertisingThresholds)).toContain('scopeId');
    expect(Object.keys(advertisingThresholds)).toContain('metricName');
    expect(Object.keys(advertisingThresholds)).toContain('source');
  });

  it('advertisingAdSetPhaseTransitions has transitionKind enum-like field', () => {
    expect(Object.keys(advertisingAdSetPhaseTransitions)).toContain('transitionKind');
    expect(Object.keys(advertisingAdSetPhaseTransitions)).toContain('reason');
  });
});
```

Run: `npx vitest run src/shared/lib/__tests__/schema-senior-buyer.test.ts`. Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/shared/lib/schema.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/shared/lib/schema.ts \
        drizzle/ \
        src/shared/lib/__tests__/schema-senior-buyer.test.ts
git commit -m "feat(db/schema): add senior-buyer tables (state, metric_history, phase_transitions, thresholds)"
```

- [ ] **Step 9: Notify coordinator** — Wave 0 / Track 1 complete. Tracks 12, 13, 14, 20, 26, 27 unblocked.

---

# Track 2 — meta-capi/{types, dedupe, event-mapper}.ts

**Owner:** Wave 0, agent 2
**Blockers:** none
**Blocks:** T3, T11, T18
**Files:**
- Create: `src/modules/advertising/meta-capi/types.ts`
- Create: `src/modules/advertising/meta-capi/dedupe.ts`
- Create: `src/modules/advertising/meta-capi/event-mapper.ts`
- Create: peer `__tests__/` test for each

Pure data + lookup table, no external deps. Sets the type contracts the rest of meta-capi will use.

- [ ] **Step 1: Write `types.ts`**

Create `src/modules/advertising/meta-capi/types.ts`:

```ts
/**
 * Shared types for Meta Conversions API (CAPI) integration.
 *
 * PII discipline: `external_id` and `em` MUST be SHA-256-hashed before being
 * placed in CapiUserData. Callers are responsible. The `meta-capi/index.ts`
 * `sendCapiEvent` wrapper does this on behalf of typical callers.
 */

export interface CapiUserData {
  /** SHA-256 hash of normalized Clerk userId. */
  external_id?: string;
  /** SHA-256 hash of lowercase + trimmed email. */
  em?: string;
  /** Request IP, plain (Meta hashes server-side). */
  client_ip_address?: string;
  /** Request User-Agent, plain. */
  client_user_agent?: string;
  /** Optional: hashed first/last name + DOB if collected. */
  fn?: string;
  ln?: string;
  db?: string;
}

export interface CapiCustomData {
  /** Monetary value for value-tracking events (Subscribe, Purchase). */
  value?: number;
  /** ISO 4217 currency code. */
  currency?: string;
  content_ids?: string[];
  content_type?: string;
  predicted_ltv?: number;
  /** Catch-all for additional custom params (Meta accepts arbitrary JSON-serialisable values). */
  [key: string]: unknown;
}

export type CapiActionSource =
  | 'website'
  | 'email'
  | 'app'
  | 'phone_call'
  | 'chat'
  | 'physical_store'
  | 'system_generated'
  | 'other';

export interface CapiEventPayload {
  event_name: string;          // 'Lead' | 'Subscribe' | 'ViewContent' | 'PageView' | custom 'Share' etc.
  event_time: number;          // Unix seconds
  event_id: string;            // Dedupe key — same as fbq event_id
  action_source: CapiActionSource;
  user_data: CapiUserData;
  custom_data?: CapiCustomData;
  event_source_url?: string;
  /** Optional: only when running through Test Events page in Meta Events Manager. */
  test_event_code?: string;
}

export interface CapiBatchResponse {
  events_received: number;
  messages?: string[];
  fbtrace_id?: string;
}

/** Internal Estrevia events surfaced via `src/shared/lib/analytics.ts:AnalyticsEvent`. */
export type EstreviaEvent =
  | 'landing_view'
  | 'chart_calculated'
  | 'passport_reshared'
  | 'user_registered'
  | 'paywall_opened'
  | 'subscription_started';
```

Create `src/modules/advertising/meta-capi/__tests__/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { CapiEventPayload, CapiUserData } from '../types';

describe('meta-capi types', () => {
  it('CapiEventPayload accepts required fields', () => {
    const p: CapiEventPayload = {
      event_name: 'Lead',
      event_time: 1714867200,
      event_id: 'abc123',
      action_source: 'website',
      user_data: { em: 'hashed_email' },
    };
    expect(p.event_name).toBe('Lead');
  });

  it('CapiUserData allows partial fields', () => {
    const u: CapiUserData = { external_id: 'hashed_uid' };
    expect(u.external_id).toBeDefined();
    expect(u.em).toBeUndefined();
  });
});
```

Run: `npx vitest run src/modules/advertising/meta-capi/__tests__/types.test.ts`. Expected: PASS.

- [ ] **Step 2: Write `dedupe.ts` with TDD**

Create `src/modules/advertising/meta-capi/__tests__/dedupe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateEventId, minuteBucket } from '../dedupe';

describe('generateEventId', () => {
  it('produces deterministic ids for the same (distinctId, event, minute)', () => {
    const id1 = generateEventId('user_123', 'Lead', 1714867230);  // sec 30 of minute X
    const id2 = generateEventId('user_123', 'Lead', 1714867259);  // sec 59 of same minute X
    expect(id1).toBe(id2);
  });

  it('produces different ids for the same user + event in different minutes', () => {
    const id1 = generateEventId('user_123', 'Lead', 1714867230);
    const id2 = generateEventId('user_123', 'Lead', 1714867295);  // next minute
    expect(id1).not.toBe(id2);
  });

  it('produces different ids for different users', () => {
    const id1 = generateEventId('user_123', 'Lead', 1714867200);
    const id2 = generateEventId('user_456', 'Lead', 1714867200);
    expect(id1).not.toBe(id2);
  });

  it('produces different ids for different events', () => {
    const id1 = generateEventId('user_123', 'Lead', 1714867200);
    const id2 = generateEventId('user_123', 'Subscribe', 1714867200);
    expect(id1).not.toBe(id2);
  });

  it('returns a hex string (deterministic format)', () => {
    const id = generateEventId('u', 'Lead', 0);
    expect(id).toMatch(/^[a-f0-9]+$/);
    expect(id.length).toBeGreaterThan(20);
  });
});

describe('minuteBucket', () => {
  it('rounds Unix seconds down to the minute boundary', () => {
    expect(minuteBucket(1714867230)).toBe(28581120);  // 1714867230 / 60 floor
    expect(minuteBucket(1714867259)).toBe(28581120);
    expect(minuteBucket(1714867260)).toBe(28581121);
  });
});
```

Implement `src/modules/advertising/meta-capi/dedupe.ts`:

```ts
import crypto from 'crypto';

/**
 * Generate a stable event_id used by BOTH client (fbq eventID) and server (CAPI event_id)
 * for Meta to dedupe same-event-from-two-sources. Determinism is critical.
 *
 * Format: SHA-256(distinctId | event_name | minuteBucket).slice(0, 32)
 *
 * The minute bucket means duplicate calls within the same 60-second window collapse to
 * one event_id. This is appropriate for high-level conversion events; do not use for
 * sub-minute repetition tracking.
 */
export function generateEventId(
  distinctId: string,
  event_name: string,
  timestamp_seconds: number,
): string {
  const minute = minuteBucket(timestamp_seconds);
  const input = `${distinctId}|${event_name}|${minute}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
}

export function minuteBucket(timestamp_seconds: number): number {
  return Math.floor(timestamp_seconds / 60);
}
```

Run: `npx vitest run src/modules/advertising/meta-capi/__tests__/dedupe.test.ts`. Expected: PASS.

- [ ] **Step 3: Write `event-mapper.ts` with TDD**

Create `src/modules/advertising/meta-capi/__tests__/event-mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapEstreviaToMeta, MAPPING_TABLE } from '../event-mapper';

describe('mapEstreviaToMeta', () => {
  it('maps user_registered to Lead', () => {
    expect(mapEstreviaToMeta('user_registered')).toEqual({ pixel: 'Lead', capi: 'Lead' });
  });

  it('maps subscription_started to Subscribe (CAPI primary)', () => {
    expect(mapEstreviaToMeta('subscription_started')).toEqual({ pixel: null, capi: 'Subscribe' });
  });

  it('maps chart_calculated to ViewContent for both', () => {
    expect(mapEstreviaToMeta('chart_calculated')).toEqual({ pixel: 'ViewContent', capi: 'ViewContent' });
  });

  it('maps paywall_opened to InitiateCheckout for both', () => {
    expect(mapEstreviaToMeta('paywall_opened')).toEqual({ pixel: 'InitiateCheckout', capi: 'InitiateCheckout' });
  });

  it('maps passport_reshared to custom Share for both', () => {
    expect(mapEstreviaToMeta('passport_reshared')).toEqual({ pixel: 'Share', capi: 'Share' });
  });

  it('returns null entry for landing_view (Pixel auto-tracks PageView)', () => {
    expect(mapEstreviaToMeta('landing_view')).toEqual({ pixel: 'PageView', capi: null });
  });

  it('MAPPING_TABLE covers all EstreviaEvent values exhaustively', () => {
    const events = ['landing_view', 'chart_calculated', 'passport_reshared', 'user_registered', 'paywall_opened', 'subscription_started'] as const;
    for (const e of events) {
      expect(MAPPING_TABLE[e]).toBeDefined();
    }
  });
});
```

Implement `src/modules/advertising/meta-capi/event-mapper.ts`:

```ts
import type { EstreviaEvent } from './types';

export interface MappedEvent {
  /** Meta Pixel event name. `null` = do not fire client-side. */
  pixel: string | null;
  /** Meta CAPI event name. `null` = do not fire server-side. */
  capi: string | null;
}

/**
 * Canonical mapping from Estrevia internal events to Meta standard events.
 *
 * Notes per spec:
 * - `landing_view`: Pixel auto-tracks PageView; we don't manually fire CAPI for it
 *   because volume is huge and Meta already gets it from the script.
 * - `subscription_started`: server-side only (Stripe webhook is the source of
 *   truth); no client-side Pixel because the success page redirect doesn't
 *   reliably load the Pixel script.
 * - `passport_reshared`: custom 'Share' event (not in Meta's standard catalogue
 *   but accepted as a custom_event_type).
 */
export const MAPPING_TABLE: Record<EstreviaEvent, MappedEvent> = {
  landing_view: { pixel: 'PageView', capi: null },
  chart_calculated: { pixel: 'ViewContent', capi: 'ViewContent' },
  passport_reshared: { pixel: 'Share', capi: 'Share' },
  user_registered: { pixel: 'Lead', capi: 'Lead' },
  paywall_opened: { pixel: 'InitiateCheckout', capi: 'InitiateCheckout' },
  subscription_started: { pixel: null, capi: 'Subscribe' },
};

export function mapEstreviaToMeta(event: EstreviaEvent): MappedEvent {
  return MAPPING_TABLE[event];
}
```

Run all 3 test files. Expected: PASS.

- [ ] **Step 4: Typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/meta-capi
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/advertising/meta-capi/types.ts \
        src/modules/advertising/meta-capi/dedupe.ts \
        src/modules/advertising/meta-capi/event-mapper.ts \
        src/modules/advertising/meta-capi/__tests__
git commit -m "feat(advertising/meta-capi): types + dedupe + event-mapper foundation"
```

- [ ] **Step 6: Notify coordinator** — Wave 0 / Track 2 complete. Tracks 3, 11, 18 unblocked.

---

# Track 3 — meta-capi/client.ts (CapiClient)

**Owner:** Wave 0, agent 3
**Blockers:** none (depends on T2 conceptually but T2 only adds types; T3 can start in parallel and import just-in-time)
**Blocks:** T11
**Files:**
- Create: `src/modules/advertising/meta-capi/client.ts`
- Create: `src/modules/advertising/meta-capi/__tests__/client.test.ts`

`CapiClient` class wraps the Graph API endpoint `/{pixel_id}/events` with auth, single + batch send, retry-on-rate-limit, optional `test_event_code` for dev/staging.

- [ ] **Step 1: Write failing test**

Create `src/modules/advertising/meta-capi/__tests__/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CapiClient } from '../client';
import type { CapiEventPayload } from '../types';

const PAYLOAD: CapiEventPayload = {
  event_name: 'Lead',
  event_time: 1714867200,
  event_id: 'evt_abc',
  action_source: 'website',
  user_data: { em: 'hashed_email' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CapiClient.sendEvent', () => {
  it('POSTs to /{pixelId}/events with the right URL and body shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1, fbtrace_id: 'trace_1' }),
    });
    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      fetchImpl,
    });

    const result = await client.sendEvent(PAYLOAD);

    expect(result).toEqual({ events_received: 1, fbtrace_id: 'trace_1' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const url = fetchImpl.mock.calls[0][0] as string;
    expect(url).toBe('https://graph.facebook.com/v22.0/PIX_999/events');
    const opts = fetchImpl.mock.calls[0][1] as { method: string; body: string; headers: Record<string, string> };
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body.access_token).toBe('TOK');
    expect(body.data).toEqual([PAYLOAD]);
  });

  it('includes test_event_code when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    });
    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      testEventCode: 'TEST_42',
      fetchImpl,
    });

    await client.sendEvent(PAYLOAD);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.test_event_code).toBe('TEST_42');
  });

  it('throws when Meta returns non-OK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid pixel id',
    });
    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      fetchImpl,
    });
    await expect(client.sendEvent(PAYLOAD)).rejects.toThrow(/CAPI sendEvent failed: 400/);
  });

  it('retries on rate-limit (429) up to maxRetries', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events_received: 1 }) });

    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      fetchImpl,
      retryBaseMs: 1, // fast for tests
      maxRetries: 3,
    });

    const result = await client.sendEvent(PAYLOAD);
    expect(result.events_received).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxRetries on persistent 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      fetchImpl,
      retryBaseMs: 1,
      maxRetries: 2,
    });
    await expect(client.sendEvent(PAYLOAD)).rejects.toThrow(/CAPI sendEvent failed: 429/);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

describe('CapiClient.sendBatch', () => {
  it('sends multiple events in a single Graph API call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 2 }),
    });
    const client = new CapiClient({
      pixelId: 'PIX_999',
      capiToken: 'TOK',
      graphApiVersion: 'v22.0',
      fetchImpl,
    });

    const result = await client.sendBatch([PAYLOAD, { ...PAYLOAD, event_id: 'evt_def' }]);
    expect(result.events_received).toBe(2);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.data).toHaveLength(2);
  });
});
```

Implement `src/modules/advertising/meta-capi/client.ts`:

```ts
import type { CapiBatchResponse, CapiEventPayload } from './types';

export interface CapiClientConfig {
  pixelId: string;
  capiToken: string;
  graphApiVersion: string;     // 'v22.0'
  fetchImpl?: typeof fetch;    // injectable for tests
  testEventCode?: string;      // optional — routes to Meta Test Events page
  retryBaseMs?: number;        // base for exponential backoff (default 1000)
  maxRetries?: number;         // default 3
}

const RATE_LIMIT_STATUSES = [429, 500, 502, 503, 504];

export class CapiClient {
  private readonly pixelId: string;
  private readonly token: string;
  private readonly version: string;
  private readonly fetch: typeof fetch;
  private readonly testEventCode?: string;
  private readonly retryBase: number;
  private readonly maxRetries: number;

  constructor(config: CapiClientConfig) {
    this.pixelId = config.pixelId;
    this.token = config.capiToken;
    this.version = config.graphApiVersion;
    this.fetch = config.fetchImpl ?? fetch;
    this.testEventCode = config.testEventCode;
    this.retryBase = config.retryBaseMs ?? 1000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  async sendEvent(payload: CapiEventPayload): Promise<CapiBatchResponse> {
    return this.sendBatch([payload]);
  }

  async sendBatch(payloads: CapiEventPayload[]): Promise<CapiBatchResponse> {
    const url = `https://graph.facebook.com/${this.version}/${this.pixelId}/events`;
    const body: Record<string, unknown> = {
      data: payloads,
      access_token: this.token,
    };
    if (this.testEventCode) body.test_event_code = this.testEventCode;

    let attempt = 0;
    while (true) {
      const res = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return (await res.json()) as CapiBatchResponse;
      }

      const text = await res.text().catch(() => '');
      const isRetryable = RATE_LIMIT_STATUSES.includes(res.status);
      if (isRetryable && attempt < this.maxRetries) {
        const delay = this.retryBase * Math.pow(2, attempt);
        await sleep(delay);
        attempt += 1;
        continue;
      }

      throw new Error(`CAPI sendEvent failed: ${res.status} ${text.slice(0, 200)}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Run: `npx vitest run src/modules/advertising/meta-capi/__tests__/client.test.ts`. Expected: PASS.

- [ ] **Step 2: Typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/meta-capi
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/modules/advertising/meta-capi/client.ts \
        src/modules/advertising/meta-capi/__tests__/client.test.ts
git commit -m "feat(advertising/meta-capi): CapiClient with retry + batch + testEventCode"
```

- [ ] **Step 4: Notify coordinator** — Wave 0 / Track 3 complete. Track 11 unblocked.

---

# Track 4 — senior-buyer/targets.ts (cold-start defaults)

**Owner:** Wave 0, agent 4
**Blockers:** none
**Blocks:** T12, T15, T16, T17
**Files:**
- Create: `src/modules/advertising/senior-buyer/targets.ts`
- Create: `src/modules/advertising/senior-buyer/__tests__/targets.test.ts`

LTV-derived numeric constants per spec lines 575-645. These are last-resort fallbacks; everything overridable via `advertising_thresholds` table.

- [ ] **Step 1: Write failing test**

Create `src/modules/advertising/senior-buyer/__tests__/targets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { COLD_START_DEFAULTS } from '../targets';

describe('COLD_START_DEFAULTS', () => {
  it('has realistic LTV-derived CPA targets ($1.50 signup, $10 subscription)', () => {
    expect(COLD_START_DEFAULTS.target_cpa_signup_usd).toBeCloseTo(1.50);
    expect(COLD_START_DEFAULTS.target_cpa_subscription_usd).toBeCloseTo(10.00);
  });

  it('phase B → C uses 50/7d Meta-default', () => {
    expect(COLD_START_DEFAULTS.phase_b_to_c_conv_meta_7d).toBe(50);
    expect(COLD_START_DEFAULTS.phase_b_to_c_conv_meta_14d_fallback).toBe(30);
    expect(COLD_START_DEFAULTS.phase_b_max_days).toBe(14);
  });

  it('phase C scale criteria match spec (ROAS ≥2x or CPA ≤0.6x, freq <2.5, +50%, max 2 dupes)', () => {
    expect(COLD_START_DEFAULTS.scale_roas_min_multiplier).toBe(2.0);
    expect(COLD_START_DEFAULTS.scale_cpa_max_multiplier).toBe(0.6);
    expect(COLD_START_DEFAULTS.scale_frequency_max).toBe(2.5);
    expect(COLD_START_DEFAULTS.scale_budget_increase_pct).toBe(50);
    expect(COLD_START_DEFAULTS.scale_max_duplicates_per_parent).toBe(2);
  });

  it('phase C pause criteria match spec (CPA >2x sustained 7d OR ROAS <0.5x sustained 14d OR freq >4)', () => {
    expect(COLD_START_DEFAULTS.pause_cpa_threshold_multiplier).toBe(2.0);
    expect(COLD_START_DEFAULTS.pause_cpa_sustained_days).toBe(7);
    expect(COLD_START_DEFAULTS.pause_roas_threshold_multiplier).toBe(0.5);
    expect(COLD_START_DEFAULTS.pause_roas_sustained_days).toBe(14);
    expect(COLD_START_DEFAULTS.pause_frequency_threshold).toBe(4.0);
  });

  it('Phase B extreme failures match spec', () => {
    expect(COLD_START_DEFAULTS.phase_b_extreme_frequency_cap).toBe(5.0);
    expect(COLD_START_DEFAULTS.phase_b_extreme_zero_conv_spend_floor_usd).toBe(50.00);
    expect(COLD_START_DEFAULTS.phase_b_extreme_ctr_doa).toBeCloseTo(0.003);
    expect(COLD_START_DEFAULTS.phase_b_extreme_ctr_doa_min_impressions).toBe(1000);
    expect(COLD_START_DEFAULTS.phase_b_extreme_cpc_cap_usd).toBe(10.00);
    expect(COLD_START_DEFAULTS.account_disapproval_rate_emergency).toBeCloseTo(0.05);
  });

  it('hybrid event-switch thresholds (50 Lead → switch; 100 Lead/wk + 10 Sub/wk → next)', () => {
    expect(COLD_START_DEFAULTS.hybrid_switch_signup_to_lead_conv_7d).toBe(50);
    expect(COLD_START_DEFAULTS.hybrid_switch_lead_to_subscribe_lead_per_week).toBe(100);
    expect(COLD_START_DEFAULTS.hybrid_switch_lead_to_subscribe_sub_per_week).toBe(10);
  });

  it('data maturity boundaries match spec (50/14 → CALIBRATING, 500/60/0.5cv → AUTONOMOUS)', () => {
    expect(COLD_START_DEFAULTS.maturity_cold_start_max_conv_total).toBe(50);
    expect(COLD_START_DEFAULTS.maturity_cold_start_max_days).toBe(14);
    expect(COLD_START_DEFAULTS.maturity_calibrating_max_conv_total).toBe(500);
    expect(COLD_START_DEFAULTS.maturity_calibrating_max_days).toBe(60);
    expect(COLD_START_DEFAULTS.maturity_calibrating_max_cv).toBeCloseTo(0.5);
  });

  it('auto-calibrator protections match spec', () => {
    expect(COLD_START_DEFAULTS.calibration_min_history_days).toBe(30);
    expect(COLD_START_DEFAULTS.calibration_outlier_pct_to_drop).toBeCloseTo(0.10);
    expect(COLD_START_DEFAULTS.calibration_drift_z_threshold).toBe(3.0);
    expect(COLD_START_DEFAULTS.calibration_max_change_factor).toBe(2.0);
  });

  it('approval routing constants match spec', () => {
    expect(COLD_START_DEFAULTS.approval_low_risk_timeout_hours).toBe(4);
    expect(COLD_START_DEFAULTS.approval_cooldown_after_reject_hours).toBe(24);
  });

  it('is frozen as a const (TypeScript-readonly via `as const`)', () => {
    // Type-level: this would fail compile if not `as const`. Runtime: object is plain.
    expect(typeof COLD_START_DEFAULTS).toBe('object');
  });
});
```

Run: `npx vitest run src/modules/advertising/senior-buyer/__tests__/targets.test.ts`. Expected: FAIL — module missing.

- [ ] **Step 2: Implement `targets.ts`**

Create `src/modules/advertising/senior-buyer/targets.ts`:

```ts
/**
 * Cold-start defaults for the senior-buyer agent.
 *
 * LTV math: Premium $4.99/mo or $34.99/yr ($2.92/mo eff). With 10-15% monthly
 * churn the realistic LTV is $25-40; we use $30 as the conservative median.
 * Payback window: 12 months → CPA target ≤ LTV/3 = $10. Signup CPA assumes
 * 20% signup→subscription conversion (will auto-calibrate to actual rate
 * once measured): $10 × 20% = $2 → use $1.50 to stay conservative.
 *
 * **Every value here is overridable via `advertising_thresholds` table.**
 * `threshold-resolver.ts` consults DB first; this file is the last-resort
 * fallback (and the value tests use deterministically).
 */

export const COLD_START_DEFAULTS = {
  // ─── Conversion-economics targets ──────────────────────
  target_cpa_signup_usd: 1.50,            // = $10 sub_cpa × 20% conversion
  target_cpa_subscription_usd: 10.00,     // = $30 LTV / 3 (12mo payback)
  target_roas_signup: 1.0,                // breakeven for signup-optimization phase
  target_roas_subscription: 2.0,          // 2x payback target for subscription phase

  // ─── Phase B → C transition (Q5) ────────────────────────
  phase_b_to_c_conv_meta_7d: 50,
  phase_b_to_c_conv_meta_14d_fallback: 30,
  phase_b_max_days: 14,

  // ─── Phase B extreme failures (Q6) ──────────────────────
  phase_b_extreme_frequency_cap: 5.0,
  phase_b_extreme_zero_conv_spend_floor_usd: 50.00,
  phase_b_extreme_ctr_doa: 0.003,
  phase_b_extreme_ctr_doa_min_impressions: 1000,
  phase_b_extreme_cpc_cap_usd: 10.00,
  account_disapproval_rate_emergency: 0.05,

  // ─── Phase C scale (Q8) ─────────────────────────────────
  scale_roas_min_multiplier: 2.0,
  scale_cpa_max_multiplier: 0.6,
  scale_frequency_max: 2.5,
  scale_sustained_days: 7,
  scale_budget_increase_pct: 50,
  scale_max_duplicates_per_parent: 2,

  // ─── Phase C pause (Q9) ─────────────────────────────────
  pause_cpa_threshold_multiplier: 2.0,
  pause_cpa_sustained_days: 7,
  pause_roas_threshold_multiplier: 0.5,
  pause_roas_sustained_days: 14,
  pause_frequency_threshold: 4.0,

  // ─── Phase D detection (Q10) ────────────────────────────
  decline_frequency_trigger: 3.0,
  decline_frequency_sustained_days: 3,
  decline_z_score_trigger: -2.0,
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

export type ThresholdName = keyof typeof COLD_START_DEFAULTS;
```

Run the test. Expected: PASS.

- [ ] **Step 3: Typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/senior-buyer
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/advertising/senior-buyer/targets.ts \
        src/modules/advertising/senior-buyer/__tests__/targets.test.ts
git commit -m "feat(advertising/senior-buyer): cold-start LTV-derived default thresholds"
```

- [ ] **Step 5: Notify coordinator** — Wave 0 / Track 4 complete. Tracks 12, 15, 16, 17 unblocked.

---

# Track 5 — senior-buyer/baseline-calculator.ts (pure math)

**Owner:** Wave 0, agent 5
**Blockers:** none
**Blocks:** T20
**Files:**
- Create: `src/modules/advertising/senior-buyer/baseline-calculator.ts`
- Create: `src/modules/advertising/senior-buyer/__tests__/baseline-calculator.test.ts`

Pure functions: array of numeric values → mean, stddev, percentiles, with outlier trimming.

- [ ] **Step 1: Write failing test**

Create `src/modules/advertising/senior-buyer/__tests__/baseline-calculator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateBaseline, trimOutliers, type Baseline } from '../baseline-calculator';

describe('trimOutliers', () => {
  it('removes top and bottom N% of sorted values', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const trimmed = trimOutliers(values, 0.10);
    // 10% means drop 1 from each end → [2..9]
    expect(trimmed).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('returns the input unchanged when pct=0', () => {
    expect(trimOutliers([3, 1, 2], 0)).toEqual([1, 2, 3]); // sorted
  });

  it('drops the right number for 20% trim of 10 values', () => {
    const values = Array.from({ length: 10 }, (_, i) => i);
    const trimmed = trimOutliers(values, 0.20);
    expect(trimmed).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('returns [] when all values are trimmed (small input)', () => {
    expect(trimOutliers([1, 2], 0.50)).toEqual([]);
  });
});

describe('calculateBaseline', () => {
  it('computes mean / stddev / percentiles for a uniform sequence', () => {
    const b = calculateBaseline([1, 2, 3, 4, 5]);
    expect(b.mean).toBeCloseTo(3);
    expect(b.stddev).toBeCloseTo(Math.sqrt(2));  // population stddev of 1..5 = sqrt((4+1+0+1+4)/5)=sqrt(2)
    expect(b.p25).toBeCloseTo(2);
    expect(b.p50).toBe(3);
    expect(b.p75).toBeCloseTo(4);
    expect(b.sample_count).toBe(5);
  });

  it('handles single-value input', () => {
    const b = calculateBaseline([7]);
    expect(b.mean).toBe(7);
    expect(b.stddev).toBe(0);
    expect(b.p25).toBe(7);
    expect(b.p75).toBe(7);
  });

  it('returns a sentinel-style baseline for empty input', () => {
    const b = calculateBaseline([]);
    expect(b.sample_count).toBe(0);
    expect(b.mean).toBe(0);
    expect(b.stddev).toBe(0);
  });

  it('coefficient-of-variation property (stddev / mean) is computable', () => {
    const b = calculateBaseline([10, 12, 14, 16, 18]);
    // mean=14, stddev=sqrt(((4)+(2)+0+(2)+(4))^2 hmm let's just check
    expect(b.mean).toBeCloseTo(14);
    expect(b.stddev).toBeGreaterThan(0);
    expect(b.stddev / b.mean).toBeGreaterThan(0);
    expect(b.stddev / b.mean).toBeLessThan(1);
  });
});
```

Run: expected FAIL — module missing.

- [ ] **Step 2: Implement `baseline-calculator.ts`**

Create `src/modules/advertising/senior-buyer/baseline-calculator.ts`:

```ts
export interface Baseline {
  mean: number;
  stddev: number;
  p25: number;
  p50: number;
  p75: number;
  sample_count: number;
}

/**
 * Removes the top and bottom `pct` proportion of values from the sorted array.
 * pct=0.10 means drop 10% from each end. Used by auto-calibrator to suppress
 * extreme outliers before deriving thresholds.
 */
export function trimOutliers(values: number[], pct: number): number[] {
  if (values.length === 0) return [];
  if (pct <= 0) return [...values].sort((a, b) => a - b);
  const sorted = [...values].sort((a, b) => a - b);
  const dropCount = Math.floor(sorted.length * pct);
  return sorted.slice(dropCount, sorted.length - dropCount);
}

export function calculateBaseline(values: number[]): Baseline {
  if (values.length === 0) {
    return { mean: 0, stddev: 0, p25: 0, p50: 0, p75: 0, sample_count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((acc, v) => acc + v, 0) / n;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / n;
  const stddev = Math.sqrt(variance);

  return {
    mean,
    stddev,
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.50),
    p75: percentile(sorted, 0.75),
    sample_count: n,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
```

Run the test. Expected: PASS.

- [ ] **Step 3: Typecheck + lint + commit**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/senior-buyer
git add src/modules/advertising/senior-buyer/baseline-calculator.ts \
        src/modules/advertising/senior-buyer/__tests__/baseline-calculator.test.ts
git commit -m "feat(advertising/senior-buyer): baseline-calculator (mean/stddev/percentiles + outlier trim)"
```

- [ ] **Step 4: Notify coordinator** — Wave 0 / Track 5 complete. Track 20 unblocked (partial).

---

# Track 6 — senior-buyer/comparable-window.ts (z-score)

**Owner:** Wave 0, agent 6
**Blockers:** none (depends on T1 schema for query types but not for math; can stub data shape)
**Blocks:** T16, T17, T20
**Files:**
- Create: `src/modules/advertising/senior-buyer/comparable-window.ts`
- Create: `src/modules/advertising/senior-buyer/__tests__/comparable-window.test.ts`

Tue-vs-Tue z-score reader. Pure stat function over historic snapshots; DB read is mockable.

- [ ] **Step 1: Write failing test**

Create `src/modules/advertising/senior-buyer/__tests__/comparable-window.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  return { mockDb: chain };
});

vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));

import { comparable, computeZScore } from '../comparable-window';

beforeEach(() => {
  Object.values(mockDb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.());
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.orderBy.mockImplementation(() => mockDb);
});

describe('computeZScore', () => {
  it('returns 0 when current equals baseline mean', () => {
    expect(computeZScore(5, { mean: 5, stddev: 1 } as any)).toBe(0);
  });
  it('returns positive z when current > mean', () => {
    expect(computeZScore(7, { mean: 5, stddev: 1 } as any)).toBe(2);
  });
  it('returns negative z when current < mean', () => {
    expect(computeZScore(3, { mean: 5, stddev: 1 } as any)).toBe(-2);
  });
  it('returns 0 when stddev is 0 (degenerate baseline)', () => {
    expect(computeZScore(7, { mean: 5, stddev: 0 } as any)).toBe(0);
  });
});

describe('comparable', () => {
  it('returns null when fewer than 2 same-DOW prior samples exist', async () => {
    mockDb.limit.mockResolvedValueOnce([
      // Today + 1 prior — not enough
      { date: '2026-05-03', dayOfWeek: 0, ctr: 0.05 },
      { date: '2026-04-26', dayOfWeek: 0, ctr: 0.04 },
    ]);
    const result = await comparable('as_001', 'ctr');
    expect(result).toBeNull();
  });

  it('returns z-score when ≥3 prior same-DOW samples exist', async () => {
    mockDb.limit.mockResolvedValueOnce([
      { date: '2026-05-03', dayOfWeek: 0, ctr: 0.10 }, // current
      { date: '2026-04-26', dayOfWeek: 0, ctr: 0.05 }, // prior
      { date: '2026-04-19', dayOfWeek: 0, ctr: 0.05 },
      { date: '2026-04-12', dayOfWeek: 0, ctr: 0.05 },
    ]);
    const result = await comparable('as_001', 'ctr');
    expect(result).not.toBeNull();
    expect(result!.current_value).toBe(0.10);
    expect(result!.baseline_mean).toBe(0.05);
    expect(result!.z_score).toBeGreaterThan(0); // current >> baseline
    expect(result!.is_significant).toBe(true);  // |z| > 2 default
    expect(result!.sample_size).toBe(3);
  });

  it('marks is_significant=false when |z| ≤ 2', async () => {
    mockDb.limit.mockResolvedValueOnce([
      { date: '2026-05-03', dayOfWeek: 0, ctr: 0.052 }, // tiny diff from baseline mean
      { date: '2026-04-26', dayOfWeek: 0, ctr: 0.05 },
      { date: '2026-04-19', dayOfWeek: 0, ctr: 0.05 },
      { date: '2026-04-12', dayOfWeek: 0, ctr: 0.05 },
    ]);
    const result = await comparable('as_001', 'ctr');
    expect(result!.is_significant).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `comparable-window.ts`**

```ts
import { getDb } from '@/shared/lib/db';
import { advertisingAdSetMetricHistory } from '@/shared/lib/schema';
import { and, desc, eq } from 'drizzle-orm';
import { calculateBaseline, type Baseline } from './baseline-calculator';

export type ComparableMetric =
  | 'ctr' | 'cpc' | 'cpm' | 'frequency' | 'spend_usd'
  | 'impressions' | 'clicks' | 'conversions_meta' | 'conversions_posthog'
  | 'revenue_usd' | 'roas';

export interface ComparableResult {
  current_value: number;
  baseline_mean: number;
  baseline_stddev: number;
  delta_pct: number;
  z_score: number;
  is_significant: boolean;
  sample_size: number;
}

export function computeZScore(
  current: number,
  baseline: Pick<Baseline, 'mean' | 'stddev'>,
): number {
  if (baseline.stddev === 0) return 0;
  return (current - baseline.mean) / baseline.stddev;
}

/**
 * Returns the z-score of today's `metric` value vs the same day-of-week
 * across the last `weeksLookback` weeks. Returns null when fewer than 2
 * prior same-DOW samples exist.
 */
export async function comparable(
  ad_set_id: string,
  metric: ComparableMetric,
  weeksLookback = 4,
): Promise<ComparableResult | null> {
  const db = getDb();

  // Pull today + prior same-DOW snapshots (latest weeksLookback + 1 entries
  // for the same dayOfWeek).
  const today = new Date();
  const dow = today.getUTCDay();

  const rows = await db
    .select()
    .from(advertisingAdSetMetricHistory)
    .where(and(
      eq(advertisingAdSetMetricHistory.adSetId, ad_set_id),
      eq(advertisingAdSetMetricHistory.dayOfWeek, dow),
    ))
    .orderBy(desc(advertisingAdSetMetricHistory.date))
    .limit(weeksLookback + 1);

  if (rows.length < 3) return null;  // need today + at least 2 prior

  const [current, ...prior] = rows;
  const currentValue = (current as Record<string, unknown>)[metric] as number;
  if (currentValue == null || !Number.isFinite(currentValue)) return null;

  const priorValues = prior
    .map((r) => (r as Record<string, unknown>)[metric] as number)
    .filter((v) => v != null && Number.isFinite(v));

  if (priorValues.length < 2) return null;

  const baseline = calculateBaseline(priorValues);
  const z = computeZScore(currentValue, baseline);
  const delta = baseline.mean !== 0
    ? (currentValue - baseline.mean) / baseline.mean
    : 0;

  return {
    current_value: currentValue,
    baseline_mean: baseline.mean,
    baseline_stddev: baseline.stddev,
    delta_pct: delta,
    z_score: z,
    is_significant: Math.abs(z) > 2.0,
    sample_size: priorValues.length,
  };
}
```

Run the test. Expected: PASS.

- [ ] **Step 3: Typecheck + lint + commit**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/modules/advertising/senior-buyer
git add src/modules/advertising/senior-buyer/comparable-window.ts \
        src/modules/advertising/senior-buyer/__tests__/comparable-window.test.ts
git commit -m "feat(advertising/senior-buyer): comparable-window (Tue-vs-Tue z-score)"
```

- [ ] **Step 4: Notify coordinator** — Wave 0 / Track 6 complete.

---

# Track 7 — senior-buyer/data-maturity-classifier.ts

**Owner:** Wave 0, agent 7
**Blockers:** none (depends on T4 conceptually for thresholds)
**Blocks:** T15, T16, T17, T21
**Files:**
- Create: `src/modules/advertising/senior-buyer/data-maturity-classifier.ts`
- Create: `src/modules/advertising/senior-buyer/__tests__/data-maturity-classifier.test.ts`

Pure function classifying an ad set as `COLD_START` / `CALIBRATING` / `AUTONOMOUS` per spec lines 148-158.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { classifyMaturity, type DataMaturityMode } from '../data-maturity-classifier';

const baseInput = {
  conversions_total_meta: 0,
  days_with_pixel_data: 0,
  baseline_cv: 0,
};

describe('classifyMaturity', () => {
  it('returns COLD_START when below conversion threshold', () => {
    expect(classifyMaturity({ ...baseInput, conversions_total_meta: 49, days_with_pixel_data: 100 })).toBe('COLD_START');
  });

  it('returns COLD_START when below days threshold (even with enough conversions)', () => {
    expect(classifyMaturity({ ...baseInput, conversions_total_meta: 1000, days_with_pixel_data: 13 })).toBe('COLD_START');
  });

  it('graduates to CALIBRATING at 50 conversions AND 14 days', () => {
    expect(classifyMaturity({ ...baseInput, conversions_total_meta: 50, days_with_pixel_data: 14, baseline_cv: 1.0 })).toBe('CALIBRATING');
  });

  it('stays in CALIBRATING when below 500 conversions', () => {
    expect(classifyMaturity({ conversions_total_meta: 499, days_with_pixel_data: 200, baseline_cv: 0.1 })).toBe('CALIBRATING');
  });

  it('stays in CALIBRATING when CV is too high (volatile)', () => {
    expect(classifyMaturity({ conversions_total_meta: 1000, days_with_pixel_data: 100, baseline_cv: 0.6 })).toBe('CALIBRATING');
  });

  it('graduates to AUTONOMOUS when conversions ≥500 AND days ≥60 AND CV ≤0.5', () => {
    expect(classifyMaturity({ conversions_total_meta: 500, days_with_pixel_data: 60, baseline_cv: 0.5 })).toBe('AUTONOMOUS');
    expect(classifyMaturity({ conversions_total_meta: 800, days_with_pixel_data: 90, baseline_cv: 0.3 })).toBe('AUTONOMOUS');
  });

  it('handles boundary: exactly at COLD_START threshold (50/14) → CALIBRATING', () => {
    expect(classifyMaturity({ conversions_total_meta: 50, days_with_pixel_data: 14, baseline_cv: 1.0 })).toBe('CALIBRATING');
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { COLD_START_DEFAULTS } from './targets';

export type DataMaturityMode = 'COLD_START' | 'CALIBRATING' | 'AUTONOMOUS';

export interface ClassifyMaturityInput {
  conversions_total_meta: number;
  days_with_pixel_data: number;
  baseline_cv: number;          // baseline_stddev / baseline_mean (computed by caller)
}

/**
 * Per-ad-set data maturity classifier (spec lines 148-158).
 *
 * COLD_START: insufficient data for any decisioning beyond Phase B exceptions.
 * CALIBRATING: has data but agent decisions still routed through founder approval.
 * AUTONOMOUS: full Q12 reversibility-based routing.
 */
export function classifyMaturity(input: ClassifyMaturityInput): DataMaturityMode {
  const {
    maturity_cold_start_max_conv_total: coldConv,
    maturity_cold_start_max_days: coldDays,
    maturity_calibrating_max_conv_total: calConv,
    maturity_calibrating_max_days: calDays,
    maturity_calibrating_max_cv: calCv,
  } = COLD_START_DEFAULTS;

  if (input.conversions_total_meta < coldConv || input.days_with_pixel_data < coldDays) {
    return 'COLD_START';
  }
  if (
    input.conversions_total_meta < calConv ||
    input.days_with_pixel_data < calDays ||
    input.baseline_cv > calCv
  ) {
    return 'CALIBRATING';
  }
  return 'AUTONOMOUS';
}
```

Run + commit:

```bash
npx vitest run src/modules/advertising/senior-buyer/__tests__/data-maturity-classifier.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/senior-buyer/data-maturity-classifier.ts \
        src/modules/advertising/senior-buyer/__tests__/data-maturity-classifier.test.ts
git commit -m "feat(advertising/senior-buyer): data-maturity-classifier (COLD_START/CALIBRATING/AUTONOMOUS)"
```

- [ ] **Step 3: Notify coordinator** — Wave 0 / Track 7 complete.

---

# Track 8 — Pixel script in src/app/[locale]/layout.tsx + env

**Owner:** Wave 0, agent 8
**Blockers:** none
**Blocks:** T19
**Files:**
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `.env.example`

Inject the Meta Pixel base script via `next/script`. Configured by `NEXT_PUBLIC_META_PIXEL_ID` (browser-readable mirror of existing `META_PIXEL_ID`).

- [ ] **Step 1: Read current layout structure**

```bash
sed -n '1,80p' src/app/\[locale\]/layout.tsx
```

Identify where the children are rendered. Pixel script needs to live INSIDE the layout so it runs on every locale-routed page (marketing AND app).

- [ ] **Step 2: Add Pixel script via next/script**

Inject the Meta Pixel snippet immediately before `{children}`. Use `next/script` `strategy="afterInteractive"` so it doesn't block initial paint:

```tsx
import Script from 'next/script';

// ... inside LocaleLayout, after setRequestLocale(locale):

  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {pixelId ? (
        <>
          <Script id="meta-pixel-base" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${pixelId}');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript>
            <img
              height="1" width="1" style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      ) : null}
      {children}
    </NextIntlClientProvider>
  );
```

If `NEXT_PUBLIC_META_PIXEL_ID` is unset, the Pixel doesn't load (graceful degradation in dev / staging without the env var).

- [ ] **Step 3: Update `.env.example`**

Append:

```
# Meta Pixel — public id used by browser fbq() snippet. Mirror of META_PIXEL_ID.
NEXT_PUBLIC_META_PIXEL_ID=
# CAPI optional test-events code — when set, all CAPI events route to Meta Test Events page.
# Leave UNSET in production.
META_CAPI_TEST_EVENT_CODE=
```

- [ ] **Step 4: Add a smoke test that the layout renders Pixel script when env is set**

Note: layout.tsx is async and a Server Component. Test by snapshotting the rendered HTML:

```ts
// src/app/[locale]/__tests__/layout.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import LocaleLayout from '../layout';

vi.mock('next-intl/server', () => ({
  getMessages: async () => ({}),
  setRequestLocale: vi.fn(),
}));

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
});

describe('LocaleLayout — Pixel injection', () => {
  it('renders Pixel script when NEXT_PUBLIC_META_PIXEL_ID is set', async () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'PIX_TEST';
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).toContain("fbq('init', 'PIX_TEST')");
    expect(html).toContain("fbq('track', 'PageView')");
  });

  it('does NOT render Pixel script when NEXT_PUBLIC_META_PIXEL_ID is unset', async () => {
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).not.toContain('fbq(');
  });
});
```

(If `react-dom/server` isn't a test dep, use Vitest-React-Testing-Library `render()` from the existing test setup; check `LandingViewTracker.test.tsx` for the pattern.)

Run: `npx vitest run src/app/\[locale\]/__tests__/layout.test.tsx`. Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/app/\[locale\]
git add src/app/\[locale\]/layout.tsx \
        src/app/\[locale\]/__tests__/layout.test.tsx \
        .env.example
git commit -m "feat(advertising/meta-capi): inject Meta Pixel script in locale layout"
```

- [ ] **Step 6: Notify coordinator** — Wave 0 / Track 8 complete. Track 19 unblocked.

---

# Track 9 — act/refresh-creative.ts + act/propose-new-ad-set.ts

**Owner:** Wave 0, agent 9
**Blockers:** none
**Blocks:** T17 (Phase D policy invokes these)
**Files:**
- Create: `src/modules/advertising/act/refresh-creative.ts`
- Create: `src/modules/advertising/act/propose-new-ad-set.ts`
- Create: peer tests

New act types for Phase D. Both follow the existing `act/duplicate.ts` pattern: take a `decision` + `deps`, return a `DecisionRecord`, do the write through Meta API, log via decision audit.

- [ ] **Step 1: Read existing act-pattern**

```bash
sed -n '1,80p' src/modules/advertising/act/duplicate.ts
```

Match the interface: `DecisionRecord` shape, `deps.metaApi`, `deps.decisionLog`, `deps.spendCap` (if applicable).

- [ ] **Step 2: Write failing test for refresh-creative**

```ts
// src/modules/advertising/act/__tests__/refresh-creative.test.ts
import { describe, it, expect, vi } from 'vitest';
import { refreshCreative } from '../refresh-creative';

describe('refreshCreative', () => {
  it('replaces the creative on the existing ad and logs decision', async () => {
    const deps = {
      metaApi: {
        replaceAdCreative: vi.fn().mockResolvedValue({ ad_id: 'ad_001', new_creative_id: 'cr_new' }),
      },
      decisionLog: { logDecision: vi.fn().mockResolvedValue({ id: 'dec_1' }) },
    };
    const decision = {
      ad_id: 'ad_001',
      action: 'refresh_creative',
      reason: 'phase_d_freq_3.2',
      new_creative_id: 'cr_new',
    } as const;

    const result = await refreshCreative(decision as any, deps as any);
    expect(deps.metaApi.replaceAdCreative).toHaveBeenCalledWith('ad_001', 'cr_new');
    expect(deps.decisionLog.logDecision).toHaveBeenCalledWith(expect.objectContaining({
      ad_id: 'ad_001',
      action: 'refresh_creative',
      applied: true,
    }));
    expect(result.applied).toBe(true);
  });

  it('logs failure and re-throws when Meta API fails', async () => {
    const deps = {
      metaApi: {
        replaceAdCreative: vi.fn().mockRejectedValue(new Error('quota')),
      },
      decisionLog: { logDecision: vi.fn().mockResolvedValue({ id: 'dec_2' }) },
    };
    const decision = { ad_id: 'ad_001', action: 'refresh_creative', new_creative_id: 'cr_x' } as const;
    await expect(refreshCreative(decision as any, deps as any)).rejects.toThrow(/quota/);
    expect(deps.decisionLog.logDecision).toHaveBeenCalledWith(expect.objectContaining({
      applied: false,
      error: expect.stringContaining('quota'),
    }));
  });
});
```

- [ ] **Step 3: Implement refresh-creative.ts**

```ts
import type { AdDecision, DecisionRecord } from '@/shared/types/advertising';

export interface RefreshCreativeDeps {
  metaApi: {
    replaceAdCreative(adId: string, creativeId: string): Promise<{ ad_id: string; new_creative_id: string }>;
  };
  decisionLog: {
    logDecision(rec: Omit<DecisionRecord, 'id'>): Promise<{ id: string }>;
  };
}

/**
 * Replaces the creative on an existing ad WITHOUT touching budget, audience,
 * or optimization. This resets Meta's learning phase for that ad set; treated
 * as LEARNING_RESET in approval-router (Q12).
 */
export async function refreshCreative(
  decision: AdDecision & { new_creative_id: string },
  deps: RefreshCreativeDeps,
): Promise<DecisionRecord> {
  let metaResponse: { ad_id: string; new_creative_id: string } | null = null;
  let errorMessage: string | undefined;

  try {
    metaResponse = await deps.metaApi.replaceAdCreative(decision.ad_id, decision.new_creative_id);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const record = await deps.decisionLog.logDecision({
    ad_id: decision.ad_id,
    action: 'refresh_creative',
    reason: decision.reason ?? 'phase_d_refresh',
    applied: !errorMessage,
    error: errorMessage,
    metaResponse: metaResponse ? JSON.stringify(metaResponse) : undefined,
  } as Omit<DecisionRecord, 'id'>);

  if (errorMessage) throw new Error(`refresh_creative failed for ad ${decision.ad_id}: ${errorMessage}`);
  return { ...record, ad_id: decision.ad_id, action: 'refresh_creative', applied: true } as DecisionRecord;
}
```

(If `MetaAdManagementClient` does not yet have `replaceAdCreative`, add a stub that POSTs to `/{adId}` with `{creative: {creative_id: ...}}` — match the `updateAdSet` pattern from v3a Track 2.)

- [ ] **Step 4: Repeat for propose-new-ad-set.ts**

This is HIGH_RISK (commits new spend) — the act itself just queues the proposal for founder approval; actual creation happens after Telegram approval.

```ts
// src/modules/advertising/act/propose-new-ad-set.ts
import type { AdDecision, DecisionRecord } from '@/shared/types/advertising';

export interface ProposeNewAdSetDeps {
  telegramBot: {
    requestApproval(message: string, options: { riskLevel: 'HIGH_RISK' }): Promise<{ approved: boolean }>;
  };
  metaApi: {
    duplicateAdSetWithChanges(opts: {
      sourceAdSetId: string;
      newAudience?: string;
      newBudgetCents: number;
    }): Promise<{ ad_set_id: string }>;
  };
  decisionLog: {
    logDecision(rec: Omit<DecisionRecord, 'id'>): Promise<{ id: string }>;
  };
}

export async function proposeNewAdSet(
  decision: AdDecision & { source_ad_set_id: string; proposed_budget_cents: number; rationale: string },
  deps: ProposeNewAdSetDeps,
): Promise<DecisionRecord> {
  // Step 1: request approval — blocking
  const approval = await deps.telegramBot.requestApproval(
    `🚀 *Propose new ad set* (HIGH_RISK)\n` +
      `Source: ${decision.source_ad_set_id}\n` +
      `Proposed budget: $${(decision.proposed_budget_cents / 100).toFixed(2)}/day\n` +
      `Rationale: ${decision.rationale}\n\n` +
      `Reply ✅ to approve, ❌ to reject.`,
    { riskLevel: 'HIGH_RISK' },
  );

  if (!approval.approved) {
    return await logAndReturn(deps, decision, false, 'founder_rejected_proposal');
  }

  // Step 2: duplicate the ad set with new params
  let metaResponse: { ad_set_id: string } | null = null;
  let errorMessage: string | undefined;
  try {
    metaResponse = await deps.metaApi.duplicateAdSetWithChanges({
      sourceAdSetId: decision.source_ad_set_id,
      newBudgetCents: decision.proposed_budget_cents,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  return await logAndReturn(deps, decision, !errorMessage, errorMessage ?? 'created_via_propose_new', metaResponse);
}

async function logAndReturn(
  deps: ProposeNewAdSetDeps,
  decision: AdDecision,
  applied: boolean,
  reason: string,
  metaResponse?: unknown,
): Promise<DecisionRecord> {
  const rec = await deps.decisionLog.logDecision({
    ad_id: decision.ad_id ?? '',
    action: 'propose_new_ad_set',
    reason,
    applied,
    metaResponse: metaResponse ? JSON.stringify(metaResponse) : undefined,
  } as Omit<DecisionRecord, 'id'>);
  return { ...rec, ad_id: decision.ad_id ?? '', action: 'propose_new_ad_set', applied } as DecisionRecord;
}
```

(`replaceAdCreative` and `duplicateAdSetWithChanges` are new methods on `MetaAdManagementClient`. Add them or stub them at this track's boundary — full impl can be filled in T22's Meta API extension if needed.)

- [ ] **Step 5: Tests + run + commit**

Test mirroring refresh-creative — focusing on (a) approval-rejected path, (b) Meta-failure path, (c) happy path.

```bash
npx vitest run src/modules/advertising/act/__tests__/refresh-creative.test.ts \
               src/modules/advertising/act/__tests__/propose-new-ad-set.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/act/refresh-creative.ts \
        src/modules/advertising/act/propose-new-ad-set.ts \
        src/modules/advertising/act/__tests__
git commit -m "feat(advertising/act): refresh_creative + propose_new_ad_set (Phase D)"
```

- [ ] **Step 6: Notify coordinator** — Wave 0 / Track 9 complete. Track 17 unblocked.

---

# Track 10 — senior-buyer/approval-router.ts

**Owner:** Wave 0, agent 10
**Blockers:** none (depends on T7 conceptually for `DataMaturityMode`)
**Blocks:** T15, T16, T17
**Files:**
- Create: `src/modules/advertising/senior-buyer/approval-router.ts`
- Create: `src/modules/advertising/senior-buyer/__tests__/approval-router.test.ts`

Q12 reversibility + maturity-mode gating per spec lines 836-877.

- [ ] **Step 1: Write failing test (Q12 × maturity matrix)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { route, type AdDecision, type AdSetState } from '../approval-router';

const mkDecision = (action: AdDecision['action'], extras: Partial<AdDecision> = {}): AdDecision => ({
  ad_id: 'ad_x',
  action,
  reason: '',
  ...extras,
});

const mkState = (mode: AdSetState['data_maturity_mode']): AdSetState => ({
  ad_set_id: 'as_x',
  data_maturity_mode: mode,
  current_phase: 'C',
} as AdSetState);

describe('approval-router (Q12 + maturity gating)', () => {
  // ─── COLD_START suppresses all but Phase B exceptions ───
  describe('COLD_START mode', () => {
    it('rejects scale decisions', async () => {
      const result = await route(mkDecision('duplicate'), mkState('COLD_START'));
      expect(result.type).toBe('rejected');
      expect(result.reason).toContain('cold_start');
    });
    it('allows DISAPPROVED-status emergency pauses through (Phase B exception)', async () => {
      const result = await route(mkDecision('pause', { reason: 'extreme_failure_disapproved' }), mkState('COLD_START'));
      expect(result.type).toBe('execute_immediately');
    });
    it('allows account-emergency pause-all', async () => {
      const result = await route(mkDecision('pause', { reason: 'account_emergency' }), mkState('COLD_START'));
      expect(result.type).toBe('execute_immediately');
    });
  });

  // ─── CALIBRATING routes everything non-REVERSIBLE through LOW_RISK approval ───
  describe('CALIBRATING mode', () => {
    it('REVERSIBLE actions execute immediately', async () => {
      const result = await route(mkDecision('pause'), mkState('CALIBRATING'));
      expect(result.type).toBe('execute_immediately');
    });
    it('non-REVERSIBLE (duplicate) routes via LOW_RISK 4h', async () => {
      const result = await route(mkDecision('duplicate'), mkState('CALIBRATING'));
      expect(result.type).toBe('low_risk_approval');
      expect(result.timeout_hours).toBe(4);
    });
  });

  // ─── AUTONOMOUS uses Q12 reversibility classification ───
  describe('AUTONOMOUS mode', () => {
    it('pause / unpause / hold / maintain → execute_immediately (REVERSIBLE)', async () => {
      for (const action of ['pause', 'unpause', 'hold', 'maintain', 'pause_for_rest'] as const) {
        const r = await route(mkDecision(action), mkState('AUTONOMOUS'));
        expect(r.type).toBe('execute_immediately');
      }
    });

    it('duplicate → low_risk_approval', async () => {
      expect((await route(mkDecision('duplicate'), mkState('AUTONOMOUS'))).type).toBe('low_risk_approval');
    });

    it('refresh_creative + hybrid_event_switch → low_risk_approval (LEARNING_RESET)', async () => {
      expect((await route(mkDecision('refresh_creative'), mkState('AUTONOMOUS'))).type).toBe('low_risk_approval');
      expect((await route(mkDecision('hybrid_event_switch'), mkState('AUTONOMOUS'))).type).toBe('low_risk_approval');
    });

    it('propose_new_ad_set → high_risk_approval (NEW_SPEND, blocking)', async () => {
      expect((await route(mkDecision('propose_new_ad_set'), mkState('AUTONOMOUS'))).type).toBe('high_risk_approval');
    });

    it('unknown action → rejected', async () => {
      const result = await route({ ...mkDecision('hold'), action: 'nonsense_action' as any }, mkState('AUTONOMOUS'));
      expect(result.type).toBe('rejected');
    });
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { COLD_START_DEFAULTS } from './targets';
import type { DataMaturityMode } from './data-maturity-classifier';

export type AdAction =
  | 'pause' | 'unpause' | 'hold' | 'maintain' | 'pause_for_rest'
  | 'duplicate' | 'scale'
  | 'refresh_creative' | 'hybrid_event_switch'
  | 'propose_new_ad_set';

export interface AdDecision {
  ad_id: string;
  action: AdAction;
  reason?: string;
  [k: string]: unknown;
}

export interface AdSetState {
  ad_set_id: string;
  data_maturity_mode: DataMaturityMode;
  current_phase: 'A' | 'B' | 'C' | 'D' | 'PAUSED' | 'RETIRED';
  [k: string]: unknown;
}

export type RouterDecision =
  | { type: 'execute_immediately'; reason: string }
  | { type: 'low_risk_approval'; timeout_hours: number; reason: string }
  | { type: 'high_risk_approval'; reason: string }
  | { type: 'rejected'; reason: string };

const REVERSIBLE: ReadonlySet<AdAction> = new Set(['pause', 'unpause', 'hold', 'maintain', 'pause_for_rest']);
const LEARNING_RESET: ReadonlySet<AdAction> = new Set(['duplicate', 'refresh_creative', 'hybrid_event_switch']);
const NEW_SPEND: ReadonlySet<AdAction> = new Set(['propose_new_ad_set']);

function isExtremeFailure(d: AdDecision): boolean {
  return /extreme_failure|disapproved/.test(d.reason ?? '');
}
function isAccountEmergency(d: AdDecision): boolean {
  return /account_emergency/.test(d.reason ?? '');
}

export async function route(decision: AdDecision, state: AdSetState): Promise<RouterDecision> {
  // ── Maturity gate first ─────────────────────────────
  if (state.data_maturity_mode === 'COLD_START') {
    if (!isExtremeFailure(decision) && !isAccountEmergency(decision)) {
      return { type: 'rejected', reason: 'cold_start_mode_suppression' };
    }
    // Falls through to AUTONOMOUS-style routing for the allowed Phase B exceptions
  }

  if (state.data_maturity_mode === 'CALIBRATING') {
    if (!REVERSIBLE.has(decision.action)) {
      return {
        type: 'low_risk_approval',
        timeout_hours: COLD_START_DEFAULTS.approval_low_risk_timeout_hours,
        reason: `calibrating_mode_${decision.action}`,
      };
    }
    // Falls through to AUTONOMOUS-style routing for REVERSIBLE actions
  }

  // ── Q12 reversibility-based routing ────────────────
  if (REVERSIBLE.has(decision.action)) {
    return { type: 'execute_immediately', reason: 'reversible_action' };
  }

  if (LEARNING_RESET.has(decision.action)) {
    return {
      type: 'low_risk_approval',
      timeout_hours: COLD_START_DEFAULTS.approval_low_risk_timeout_hours,
      reason: `learning_reset_${decision.action}`,
    };
  }

  if (NEW_SPEND.has(decision.action)) {
    return { type: 'high_risk_approval', reason: `new_spend_${decision.action}` };
  }

  return { type: 'rejected', reason: `unknown_action: ${decision.action}` };
}
```

Run + commit:

```bash
npx vitest run src/modules/advertising/senior-buyer/__tests__/approval-router.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/senior-buyer/approval-router.ts \
        src/modules/advertising/senior-buyer/__tests__/approval-router.test.ts
git commit -m "feat(advertising/senior-buyer): approval-router (Q12 reversibility + maturity gating)"
```

- [ ] **Step 3: Notify coordinator** — Wave 0 / Track 10 complete. All Wave 0 done.

---

# Track 11 — meta-capi/index.ts (sendCapiEvent) + analytics.ts CAPI extension

**Owner:** Wave 1, agent 11
**Blockers:** T2 (types), T3 (client)
**Blocks:** T18
**Files:**
- Create: `src/modules/advertising/meta-capi/index.ts`
- Create: `src/modules/advertising/meta-capi/__tests__/index.test.ts`
- Modify: `src/shared/lib/analytics.ts`
- Create: `src/shared/lib/__tests__/analytics-capi.test.ts`

High-level wrapper that hashes PII and fires both Pixel + CAPI from a single call. `analytics.ts` extends `trackEvent` / `trackServerEvent` to ALSO fire to CAPI in parallel with PostHog using the same `event_id`.

- [ ] **Step 1: Write `meta-capi/index.ts` with TDD**

```ts
// src/modules/advertising/meta-capi/__tests__/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendCapiEvent, hashPII, _resetClientForTests } from '../index';
import type { CapiEventPayload } from '../types';

const mockSendEvent = vi.fn().mockResolvedValue({ events_received: 1 });

vi.mock('../client', () => ({
  CapiClient: vi.fn().mockImplementation(() => ({
    sendEvent: mockSendEvent,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.META_PIXEL_ID = 'PIX_T';
  process.env.META_CAPI_TOKEN = 'TOK';
  _resetClientForTests();
});

describe('sendCapiEvent', () => {
  it('hashes email and external_id before passing to CapiClient', async () => {
    await sendCapiEvent('Lead', { email: 'Alice@Example.com', external_id_raw: 'user_42' });
    expect(mockSendEvent).toHaveBeenCalledOnce();
    const payload = mockSendEvent.mock.calls[0][0] as CapiEventPayload;
    expect(payload.event_name).toBe('Lead');
    // PII fields must be hashed (sha256 hex = 64 chars)
    expect(payload.user_data.em).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.user_data.external_id).toMatch(/^[a-f0-9]{64}$/);
    // Confirm no plaintext leaked
    expect(JSON.stringify(payload)).not.toContain('alice@example.com');
    expect(JSON.stringify(payload)).not.toContain('user_42');
  });

  it('uses provided event_id (does not regenerate)', async () => {
    await sendCapiEvent(
      'Lead',
      { email: 'a@x.com' },
      undefined,
      { event_id: 'evt_provided' },
    );
    const payload = mockSendEvent.mock.calls[0][0] as CapiEventPayload;
    expect(payload.event_id).toBe('evt_provided');
  });

  it('passes custom_data through unchanged (Subscribe with value/currency/predicted_ltv)', async () => {
    await sendCapiEvent('Subscribe', { external_id_raw: 'u1' }, {
      value: 4.99, currency: 'USD', predicted_ltv: 30,
    });
    const payload = mockSendEvent.mock.calls[0][0] as CapiEventPayload;
    expect(payload.custom_data).toEqual({ value: 4.99, currency: 'USD', predicted_ltv: 30 });
  });

  it('swallows CAPI errors silently (logs + Sentry, does not throw to caller)', async () => {
    mockSendEvent.mockRejectedValueOnce(new Error('CAPI down'));
    // Caller must not throw — webhook handlers depend on this
    await expect(sendCapiEvent('Lead', { email: 'a@x.com' })).resolves.toBeUndefined();
  });
});

describe('hashPII', () => {
  it('lowercases + trims + sha256s', () => {
    expect(hashPII('  Alice@Example.com  ')).toBe(hashPII('alice@example.com'));
    expect(hashPII('Alice@Example.com')).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

Implement `src/modules/advertising/meta-capi/index.ts`:

```ts
import crypto from 'crypto';
import { CapiClient } from './client';
import { generateEventId } from './dedupe';
import type {
  CapiCustomData,
  CapiEventPayload,
} from './types';

let cachedClient: CapiClient | null = null;

function getClient(): CapiClient | null {
  if (cachedClient) return cachedClient;
  const pixelId = process.env.META_PIXEL_ID;
  const capiToken = process.env.META_CAPI_TOKEN;
  if (!pixelId || !capiToken) return null;
  cachedClient = new CapiClient({
    pixelId,
    capiToken,
    graphApiVersion: process.env.META_CAPI_GRAPH_VERSION ?? 'v22.0',
    testEventCode: process.env.META_CAPI_TEST_EVENT_CODE || undefined,
  });
  return cachedClient;
}

/** TEST-ONLY — resets cached client so env-var changes take effect in tests. */
export function _resetClientForTests(): void {
  cachedClient = null;
}

export function hashPII(input: string): string {
  return crypto.createHash('sha256').update(input.toLowerCase().trim()).digest('hex');
}

export interface SendCapiInput {
  /** Plaintext email — hashed before send. */
  email?: string;
  /** Plaintext Clerk userId — hashed before send. */
  external_id_raw?: string;
  /** Already-hashed values (e.g. when caller has them pre-hashed). */
  em?: string;
  external_id?: string;
  client_ip_address?: string;
  client_user_agent?: string;
}

export interface SendCapiOptions {
  /** When provided, skip dedupe id generation and use this value (must match fbq eventID on client). */
  event_id?: string;
  event_source_url?: string;
}

/**
 * Fire-and-forget CAPI event. Hashes PII, generates dedupe event_id when not
 * provided, and never throws to the caller (webhook handlers must not 500
 * just because CAPI is down).
 */
export async function sendCapiEvent(
  event_name: string,
  user: SendCapiInput,
  custom_data?: CapiCustomData,
  opts: SendCapiOptions = {},
): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn('[meta-capi] not configured (META_PIXEL_ID / META_CAPI_TOKEN missing) — event dropped');
    return;
  }

  const event_time = Math.floor(Date.now() / 1000);

  const distinctId = user.external_id_raw ?? user.external_id ?? user.email ?? user.em ?? 'anonymous';
  const event_id = opts.event_id ?? generateEventId(distinctId, event_name, event_time);

  const payload: CapiEventPayload = {
    event_name,
    event_time,
    event_id,
    action_source: 'website',
    user_data: {
      em: user.em ?? (user.email ? hashPII(user.email) : undefined),
      external_id: user.external_id ?? (user.external_id_raw ? hashPII(user.external_id_raw) : undefined),
      client_ip_address: user.client_ip_address,
      client_user_agent: user.client_user_agent,
    },
    custom_data,
    event_source_url: opts.event_source_url,
  };

  try {
    await client.sendEvent(payload);
  } catch (err) {
    console.warn('[meta-capi] sendEvent failed — event dropped:', err instanceof Error ? err.message : err);
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { subsystem: 'meta-capi', event: event_name } });
    } catch {
      // Sentry capture is best-effort.
    }
  }
}
```

Run the test. Expected: PASS.

- [ ] **Step 2: Extend `src/shared/lib/analytics.ts` to also fire CAPI**

Read first: `sed -n '60,140p' src/shared/lib/analytics.ts` to find `trackServerEvent` location.

Modify `trackServerEvent` to ALSO call `sendCapiEvent` based on the event-mapper:

```ts
import { mapEstreviaToMeta } from '@/modules/advertising/meta-capi/event-mapper';
import { sendCapiEvent } from '@/modules/advertising/meta-capi';
import type { EstreviaEvent } from '@/modules/advertising/meta-capi/types';

// ... inside trackServerEvent (after the existing PostHog send):

  // Also fire to Meta CAPI when the event has a CAPI mapping
  const eventName = String(eventName_); // (whatever the existing var is)
  if (isEstreviaEvent(eventName)) {
    const mapped = mapEstreviaToMeta(eventName as EstreviaEvent);
    if (mapped.capi) {
      // CAPI-bound event — fire (fire-and-forget)
      void sendCapiEvent(mapped.capi, {
        external_id_raw: distinctId,
        // Email is already in properties when present — extract carefully (no logging)
        email: typeof properties?.email === 'string' ? properties.email : undefined,
      }, propertiesToCustomData(properties), {
        event_id: typeof properties?.$insert_id === 'string'
          ? properties.$insert_id
          : undefined,
      });
    }
  }

function isEstreviaEvent(name: string): name is EstreviaEvent {
  return ['landing_view', 'chart_calculated', 'passport_reshared', 'user_registered', 'paywall_opened', 'subscription_started'].includes(name);
}

function propertiesToCustomData(props?: Record<string, unknown>): CapiCustomData | undefined {
  if (!props) return undefined;
  const cd: CapiCustomData = {};
  if (typeof props.value === 'number') cd.value = props.value;
  if (typeof props.currency === 'string') cd.currency = props.currency;
  if (typeof props.predicted_ltv === 'number') cd.predicted_ltv = props.predicted_ltv;
  if (Array.isArray(props.content_ids)) cd.content_ids = props.content_ids as string[];
  if (typeof props.content_type === 'string') cd.content_type = props.content_type;
  return Object.keys(cd).length > 0 ? cd : undefined;
}
```

(`trackEvent` — client-side — does NOT call CAPI. Only Pixel via the existing fbq snippet from Track 8 + the per-event `fbq('track', ...)` calls added in Track 19.)

- [ ] **Step 3: Test the analytics integration**

Create `src/shared/lib/__tests__/analytics-capi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendCapi = vi.fn().mockResolvedValue(undefined);
const mockTrackPosthog = vi.fn();

vi.mock('@/modules/advertising/meta-capi', () => ({
  sendCapiEvent: mockSendCapi,
}));

vi.mock('@/modules/advertising/meta-capi/event-mapper', () => ({
  mapEstreviaToMeta: (e: string) => {
    const map: Record<string, { pixel: string | null; capi: string | null }> = {
      user_registered: { pixel: 'Lead', capi: 'Lead' },
      subscription_started: { pixel: null, capi: 'Subscribe' },
      landing_view: { pixel: 'PageView', capi: null },
    };
    return map[e] ?? { pixel: null, capi: null };
  },
}));

// ... mock posthog-node similarly

import { trackServerEvent, AnalyticsEvent } from '../analytics';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.POSTHOG_API_KEY = 'k';
  process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';
});

describe('trackServerEvent — CAPI integration', () => {
  it('fires CAPI Lead event for user_registered', async () => {
    await trackServerEvent('user_42', AnalyticsEvent.USER_REGISTERED, {
      email: 'alice@example.com',
      $insert_id: 'evt_dedup_123',
    });
    expect(mockSendCapi).toHaveBeenCalledWith(
      'Lead',
      expect.objectContaining({ external_id_raw: 'user_42', email: 'alice@example.com' }),
      undefined,
      expect.objectContaining({ event_id: 'evt_dedup_123' }),
    );
  });

  it('does NOT fire CAPI for landing_view (Pixel auto-tracks PageView)', async () => {
    await trackServerEvent('user_42', AnalyticsEvent.LANDING_VIEW, {});
    expect(mockSendCapi).not.toHaveBeenCalled();
  });

  it('fires CAPI Subscribe with value + currency + predicted_ltv', async () => {
    await trackServerEvent('user_42', AnalyticsEvent.SUBSCRIPTION_STARTED, {
      value: 4.99,
      currency: 'USD',
      predicted_ltv: 30,
      $insert_id: 'sub_evt_1',
    });
    expect(mockSendCapi).toHaveBeenCalledWith(
      'Subscribe',
      expect.objectContaining({ external_id_raw: 'user_42' }),
      { value: 4.99, currency: 'USD', predicted_ltv: 30 },
      expect.objectContaining({ event_id: 'sub_evt_1' }),
    );
  });
});
```

Run + commit:

```bash
npx vitest run src/shared/lib/__tests__/analytics-capi.test.ts \
               src/modules/advertising/meta-capi/__tests__/index.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/meta-capi/index.ts \
        src/modules/advertising/meta-capi/__tests__/index.test.ts \
        src/shared/lib/analytics.ts \
        src/shared/lib/__tests__/analytics-capi.test.ts
git commit -m "feat(advertising/meta-capi): sendCapiEvent + analytics.ts parallel CAPI fire"
```

- [ ] **Step 4: Notify coordinator** — Wave 1 / Track 11 complete. Track 18 unblocked.

---

# Track 12 — senior-buyer/threshold-resolver.ts

**Owner:** Wave 1, agent 12
**Blockers:** T1 (schema), T4 (defaults)
**Blocks:** T15, T16, T17, T20, T21, T26
**Files:**
- Create: `src/modules/advertising/senior-buyer/threshold-resolver.ts`
- Create: `src/modules/advertising/senior-buyer/__tests__/threshold-resolver.test.ts`

4-step lookup chain: ad_set → campaign → global → code default. Per spec lines 562-568.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  return { mockDb: chain };
});

vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));

import { resolveThreshold } from '../threshold-resolver';
import { COLD_START_DEFAULTS } from '../targets';

beforeEach(() => {
  Object.values(mockDb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.());
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.orderBy.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
});

describe('resolveThreshold — 4-step lookup', () => {
  it('falls back to code default when no DB row exists at any scope', async () => {
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(COLD_START_DEFAULTS.target_cpa_subscription_usd);
  });

  it('uses ad_set override when present (highest priority)', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ value: 99 }])  // ad_set hit
      .mockResolvedValueOnce([])               // campaign (not consulted)
      .mockResolvedValueOnce([]);              // global (not consulted)
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(99);
  });

  it('uses campaign override when ad_set missing', async () => {
    mockDb.limit
      .mockResolvedValueOnce([])               // ad_set miss
      .mockResolvedValueOnce([{ value: 77 }])  // campaign hit
      .mockResolvedValueOnce([]);
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(77);
  });

  it('uses global when ad_set + campaign missing', async () => {
    mockDb.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ value: 55 }]);
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(55);
  });

  it('falls back to code default when DB returns NaN/null/Infinity', async () => {
    mockDb.limit.mockResolvedValueOnce([{ value: NaN }]);
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(COLD_START_DEFAULTS.target_cpa_subscription_usd);
  });

  it('falls back to code default when DB connection throws', async () => {
    mockDb.limit.mockRejectedValueOnce(new Error('connection lost'));
    const v = await resolveThreshold('target_cpa_subscription_usd', { ad_set_id: 'as1', campaign_id: 'cmp1' });
    expect(v).toBe(COLD_START_DEFAULTS.target_cpa_subscription_usd);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { getDb } from '@/shared/lib/db';
import { advertisingThresholds } from '@/shared/lib/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { COLD_START_DEFAULTS, type ThresholdName } from './targets';

export interface ResolveContext {
  ad_set_id: string;
  campaign_id: string;
}

/**
 * Resolves a threshold via 4-step lookup:
 *   1. ad_set scope
 *   2. campaign scope
 *   3. global scope
 *   4. code default in COLD_START_DEFAULTS
 *
 * Each DB lookup picks the most-recent `effective_from` row. On any DB error
 * or invalid value (NaN, Infinity, negative-when-positive-expected), falls
 * back to the code default with a Sentry warn.
 */
export async function resolveThreshold(
  metric: ThresholdName,
  ctx: ResolveContext,
): Promise<number> {
  try {
    const db = getDb();

    // 1. ad_set scope
    const adSet = await db
      .select()
      .from(advertisingThresholds)
      .where(and(
        eq(advertisingThresholds.scope, 'ad_set'),
        eq(advertisingThresholds.scopeId, ctx.ad_set_id),
        eq(advertisingThresholds.metricName, metric),
      ))
      .orderBy(desc(advertisingThresholds.effectiveFrom))
      .limit(1);
    if (adSet.length > 0 && isValid(adSet[0].value)) return adSet[0].value;

    // 2. campaign scope
    const campaign = await db
      .select()
      .from(advertisingThresholds)
      .where(and(
        eq(advertisingThresholds.scope, 'campaign'),
        eq(advertisingThresholds.scopeId, ctx.campaign_id),
        eq(advertisingThresholds.metricName, metric),
      ))
      .orderBy(desc(advertisingThresholds.effectiveFrom))
      .limit(1);
    if (campaign.length > 0 && isValid(campaign[0].value)) return campaign[0].value;

    // 3. global scope
    const global = await db
      .select()
      .from(advertisingThresholds)
      .where(and(
        eq(advertisingThresholds.scope, 'global'),
        isNull(advertisingThresholds.scopeId),
        eq(advertisingThresholds.metricName, metric),
      ))
      .orderBy(desc(advertisingThresholds.effectiveFrom))
      .limit(1);
    if (global.length > 0 && isValid(global[0].value)) return global[0].value;
  } catch (err) {
    console.warn(`[threshold-resolver] DB lookup failed for ${metric} — falling back to default:`, err instanceof Error ? err.message : err);
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err, { tags: { subsystem: 'threshold-resolver', metric } });
    } catch {
      // best-effort
    }
  }

  // 4. code default
  return COLD_START_DEFAULTS[metric];
}

function isValid(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}
```

Run + commit:

```bash
npx vitest run src/modules/advertising/senior-buyer/__tests__/threshold-resolver.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/senior-buyer/threshold-resolver.ts \
        src/modules/advertising/senior-buyer/__tests__/threshold-resolver.test.ts
git commit -m "feat(advertising/senior-buyer): threshold-resolver (DB → code-default fallback)"
```

- [ ] **Step 3: Notify coordinator** — Wave 1 / Track 12 complete.

---

# Track 13 — senior-buyer/state-store.ts

**Owner:** Wave 1, agent 13
**Blockers:** T1 (schema)
**Blocks:** T14, T17, T21, T22, T24, T27
**Files:**
- Create: `src/modules/advertising/senior-buyer/state-store.ts`
- Create: `src/modules/advertising/senior-buyer/__tests__/state-store.test.ts`

CRUD on `advertising_ad_set_state` and `advertising_ad_set_phase_transitions`.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => Promise.resolve());
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  return { mockDb: chain };
});

vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));
vi.mock('nanoid', () => ({ nanoid: () => 'nano_001' }));

import {
  getAdSetState, upsertAdSetState, listAdSetsByPhase,
  recordPhaseTransition, recordMaturityTransition,
} from '../state-store';

beforeEach(() => {
  Object.values(mockDb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.());
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.orderBy.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockImplementation(() => mockDb);
  mockDb.values.mockResolvedValue(undefined);
  mockDb.update.mockImplementation(() => mockDb);
  mockDb.set.mockImplementation(() => mockDb);
});

describe('state-store', () => {
  it('getAdSetState returns null when no row exists', async () => {
    expect(await getAdSetState('as_x')).toBeNull();
  });

  it('upsertAdSetState inserts when row missing', async () => {
    await upsertAdSetState({
      adSetId: 'as_x',
      campaignId: 'cmp_1',
      locale: 'en',
      currentPhase: 'A',
      dataMaturityMode: 'COLD_START',
      optimizationEvent: 'landing_page_view',
    });
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('upsertAdSetState updates when row exists', async () => {
    mockDb.limit.mockResolvedValueOnce([{ adSetId: 'as_x' }]);
    await upsertAdSetState({
      adSetId: 'as_x',
      campaignId: 'cmp_1',
      locale: 'en',
      currentPhase: 'C',
      dataMaturityMode: 'CALIBRATING',
      optimizationEvent: 'Lead',
    });
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('listAdSetsByPhase returns rows for the requested phases', async () => {
    mockDb.where.mockImplementationOnce(() => Promise.resolve([
      { adSetId: 'as_1', currentPhase: 'C' }, { adSetId: 'as_2', currentPhase: 'B' },
    ]));
    const result = await listAdSetsByPhase(['B', 'C']);
    expect(result).toHaveLength(2);
  });

  it('recordPhaseTransition appends to phase_transitions table', async () => {
    await recordPhaseTransition('as_x', 'B', 'C', 'meta_default_50/7d', { ctr: 0.05 });
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({
      transitionKind: 'phase',
      fromValue: 'B',
      toValue: 'C',
      reason: 'meta_default_50/7d',
    }));
  });

  it('recordMaturityTransition appends with kind=maturity', async () => {
    await recordMaturityTransition('as_x', 'COLD_START', 'CALIBRATING', 'graduated_to_calibrating', { sample: 1 });
    expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({
      transitionKind: 'maturity',
      fromValue: 'COLD_START',
      toValue: 'CALIBRATING',
    }));
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { getDb } from '@/shared/lib/db';
import {
  advertisingAdSetState,
  advertisingAdSetPhaseTransitions,
  type AdvertisingAdSetState,
} from '@/shared/lib/schema';
import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DataMaturityMode } from './data-maturity-classifier';

export type Phase = 'A' | 'B' | 'C' | 'D' | 'PAUSED' | 'RETIRED';

export type AdSetState = AdvertisingAdSetState;

export interface UpsertAdSetStateInput {
  adSetId: string;
  campaignId: string;
  locale: string;
  currentPhase?: Phase;
  dataMaturityMode?: DataMaturityMode;
  optimizationEvent?: string;
  conversions7dMeta?: number;
  conversions14dMeta?: number;
  conversionsTotalMeta?: number;
  daysWithPixelData?: number;
  conversions7dPosthog?: number;
  roas7d?: number | null;
  cpa7d?: number | null;
  frequencyCurrent?: number | null;
  parentAdSetId?: string | null;
  duplicatesCount?: number;
  flaggedForReview?: boolean;
  flagReason?: string | null;
}

export async function getAdSetState(adSetId: string): Promise<AdSetState | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(advertisingAdSetState)
    .where(eq(advertisingAdSetState.adSetId, adSetId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertAdSetState(input: UpsertAdSetStateInput): Promise<void> {
  const db = getDb();
  const now = new Date();

  const existing = await db
    .select({ adSetId: advertisingAdSetState.adSetId })
    .from(advertisingAdSetState)
    .where(eq(advertisingAdSetState.adSetId, input.adSetId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(advertisingAdSetState)
      .set({
        ...stripUndefined(input),
        updatedAt: now,
      })
      .where(eq(advertisingAdSetState.adSetId, input.adSetId));
  } else {
    await db.insert(advertisingAdSetState).values({
      adSetId: input.adSetId,
      campaignId: input.campaignId,
      locale: input.locale,
      currentPhase: input.currentPhase ?? 'A',
      phaseEnteredAt: now,
      dataMaturityMode: input.dataMaturityMode ?? 'COLD_START',
      maturityEnteredAt: now,
      optimizationEvent: input.optimizationEvent ?? 'landing_page_view',
      conversions7dMeta: input.conversions7dMeta ?? 0,
      conversions14dMeta: input.conversions14dMeta ?? 0,
      conversionsTotalMeta: input.conversionsTotalMeta ?? 0,
      daysWithPixelData: input.daysWithPixelData ?? 0,
      conversions7dPosthog: input.conversions7dPosthog ?? 0,
      roas7d: input.roas7d ?? null,
      cpa7d: input.cpa7d ?? null,
      frequencyCurrent: input.frequencyCurrent ?? null,
      parentAdSetId: input.parentAdSetId ?? null,
      duplicatesCount: input.duplicatesCount ?? 0,
      lastActionTakenAt: null,
      flaggedForReview: input.flaggedForReview ?? false,
      flagReason: input.flagReason ?? null,
      updatedAt: now,
    });
  }
}

export async function listAdSetsByPhase(phases: Phase[]): Promise<AdSetState[]> {
  const db = getDb();
  return await db
    .select()
    .from(advertisingAdSetState)
    .where(inArray(advertisingAdSetState.currentPhase, phases));
}

export async function recordPhaseTransition(
  adSetId: string,
  from: Phase,
  to: Phase,
  reason: string,
  metricSnapshot: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.insert(advertisingAdSetPhaseTransitions).values({
    id: nanoid(),
    adSetId,
    transitionKind: 'phase',
    fromValue: from,
    toValue: to,
    reason,
    metricSnapshot,
    triggeredAt: new Date(),
  });
}

export async function recordMaturityTransition(
  adSetId: string,
  from: DataMaturityMode,
  to: DataMaturityMode,
  reason: string,
  metricSnapshot: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.insert(advertisingAdSetPhaseTransitions).values({
    id: nanoid(),
    adSetId,
    transitionKind: 'maturity',
    fromValue: from,
    toValue: to,
    reason,
    metricSnapshot,
    triggeredAt: new Date(),
  });
}

function stripUndefined<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as Array<keyof T>) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}
```

Run + commit:

```bash
npx vitest run src/modules/advertising/senior-buyer/__tests__/state-store.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/senior-buyer/state-store.ts \
        src/modules/advertising/senior-buyer/__tests__/state-store.test.ts
git commit -m "feat(advertising/senior-buyer): state-store CRUD (ad_set_state + phase_transitions)"
```

- [ ] **Step 3: Notify coordinator** — Wave 1 / Track 13 complete. Tracks 14, 17, 21, 22, 24, 27 unblocked.

---

# Track 14 — senior-buyer/metric-history.ts

**Owner:** Wave 1, agent 14
**Blockers:** T1, T13
**Blocks:** T20, T24, T28
**Files:**
- Create: `src/modules/advertising/senior-buyer/metric-history.ts`
- Create: `src/modules/advertising/senior-buyer/__tests__/metric-history.test.ts`

Daily snapshot writer + 90-day retention pruning.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => Promise.resolve());
  chain.onConflictDoUpdate = vi.fn(() => Promise.resolve());
  chain.delete = vi.fn(() => chain);
  return { mockDb: chain };
});

vi.mock('@/shared/lib/db', () => ({ getDb: () => mockDb }));
vi.mock('nanoid', () => ({ nanoid: () => 'nano_001' }));

import { writeDailySnapshot, getRange, pruneOldSnapshots } from '../metric-history';

beforeEach(() => {
  Object.values(mockDb).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.());
  mockDb.select.mockImplementation(() => mockDb);
  mockDb.from.mockImplementation(() => mockDb);
  mockDb.where.mockImplementation(() => mockDb);
  mockDb.orderBy.mockImplementation(() => mockDb);
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockImplementation(() => mockDb);
  mockDb.values.mockImplementation(() => mockDb);
  mockDb.onConflictDoUpdate.mockResolvedValue(undefined);
  mockDb.delete.mockImplementation(() => mockDb);
});

describe('writeDailySnapshot', () => {
  it('upserts a snapshot row keyed by adSetId+date', async () => {
    await writeDailySnapshot({
      adSetId: 'as_1',
      date: '2026-05-03',
      impressions: 1000, clicks: 50, spendUsd: 5,
      ctr: 0.05, cpc: 0.10, cpm: 5, frequency: 1.2,
      conversionsMeta: 3, conversionsPosthog: 4, revenueUsd: 14.97, roas: 2.99,
    });
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({
      adSetId: 'as_1',
      date: '2026-05-03',
      impressions: 1000,
      dayOfWeek: expect.any(Number),
    }));
    expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
  });

  it('computes dayOfWeek from the date', async () => {
    await writeDailySnapshot({
      adSetId: 'as_1', date: '2026-05-03', // Sunday
      impressions: 0, clicks: 0, spendUsd: 0, ctr: 0, cpc: 0, cpm: 0, frequency: 0,
      conversionsMeta: 0, conversionsPosthog: 0, revenueUsd: 0, roas: null,
    });
    const args = mockDb.values.mock.calls[0][0];
    expect(args.dayOfWeek).toBe(0); // Sunday
  });
});

describe('getRange', () => {
  it('returns rows in date-desc order, capped at days', async () => {
    mockDb.limit.mockResolvedValueOnce([
      { date: '2026-05-03', impressions: 100 },
      { date: '2026-05-02', impressions: 90 },
    ]);
    const rows = await getRange('as_1', 30);
    expect(rows).toHaveLength(2);
  });
});

describe('pruneOldSnapshots', () => {
  it('deletes rows older than retention days', async () => {
    await pruneOldSnapshots(90);
    expect(mockDb.delete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { getDb } from '@/shared/lib/db';
import {
  advertisingAdSetMetricHistory,
  type AdvertisingAdSetMetricHistory,
} from '@/shared/lib/schema';
import { and, desc, eq, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type MetricHistoryRow = AdvertisingAdSetMetricHistory;

export interface DailySnapshotInput {
  adSetId: string;
  date: string;             // YYYY-MM-DD UTC
  impressions: number;
  clicks: number;
  spendUsd: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  conversionsMeta: number;
  conversionsPosthog: number;
  revenueUsd: number;
  roas: number | null;
}

export async function writeDailySnapshot(input: DailySnapshotInput): Promise<void> {
  const db = getDb();
  const dow = new Date(`${input.date}T00:00:00Z`).getUTCDay();
  await db
    .insert(advertisingAdSetMetricHistory)
    .values({
      id: nanoid(),
      adSetId: input.adSetId,
      date: input.date,
      dayOfWeek: dow,
      impressions: input.impressions,
      clicks: input.clicks,
      spendUsd: input.spendUsd,
      ctr: input.ctr,
      cpc: input.cpc,
      cpm: input.cpm,
      frequency: input.frequency,
      conversionsMeta: input.conversionsMeta,
      conversionsPosthog: input.conversionsPosthog,
      revenueUsd: input.revenueUsd,
      roas: input.roas,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [advertisingAdSetMetricHistory.adSetId, advertisingAdSetMetricHistory.date],
      set: {
        impressions: input.impressions,
        clicks: input.clicks,
        spendUsd: input.spendUsd,
        ctr: input.ctr,
        cpc: input.cpc,
        cpm: input.cpm,
        frequency: input.frequency,
        conversionsMeta: input.conversionsMeta,
        conversionsPosthog: input.conversionsPosthog,
        revenueUsd: input.revenueUsd,
        roas: input.roas,
      },
    });
}

export async function getRange(adSetId: string, days: number): Promise<MetricHistoryRow[]> {
  const db = getDb();
  return await db
    .select()
    .from(advertisingAdSetMetricHistory)
    .where(eq(advertisingAdSetMetricHistory.adSetId, adSetId))
    .orderBy(desc(advertisingAdSetMetricHistory.date))
    .limit(days);
}

export async function pruneOldSnapshots(retentionDays: number): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString().slice(0, 10);
  await db
    .delete(advertisingAdSetMetricHistory)
    .where(lt(advertisingAdSetMetricHistory.date, cutoff));
}
```

Run + commit:

```bash
npx vitest run src/modules/advertising/senior-buyer/__tests__/metric-history.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/senior-buyer/metric-history.ts \
        src/modules/advertising/senior-buyer/__tests__/metric-history.test.ts
git commit -m "feat(advertising/senior-buyer): metric-history (daily snapshot + 90d retention)"
```

- [ ] **Step 3: Notify coordinator** — Wave 1 / Track 14 complete.

---

# Track 15 — senior-buyer/policies/{phase-a, phase-b}.ts

**Owner:** Wave 1, agent 15
**Blockers:** T4, T7, T12
**Blocks:** T21
**Files:**
- Create: `src/modules/advertising/senior-buyer/policies/phase-a.ts`
- Create: `src/modules/advertising/senior-buyer/policies/phase-b.ts`
- Create: peer tests

Phase A is trivial (hold only). Phase B is the 8 extreme-failure exceptions per spec lines 657-672.

- [ ] **Step 1: Write phase-a.ts (~5 LOC + tests)**

```ts
// src/modules/advertising/senior-buyer/policies/phase-a.ts
import type { AdDecision } from '../approval-router';

export interface PhaseAInput { ad_id: string; ad_set_id: string; }

/**
 * Phase A — Pre-launch. Ad set just created, not yet live.
 * Only allowed action: hold. Caller transitions to Phase B when the ad goes live.
 */
export function evaluatePhaseA(input: PhaseAInput): AdDecision {
  return { ad_id: input.ad_id, action: 'hold', reason: 'phase_a_pre_launch' };
}
```

```ts
// src/modules/advertising/senior-buyer/policies/__tests__/phase-a.test.ts
import { describe, it, expect } from 'vitest';
import { evaluatePhaseA } from '../phase-a';

describe('evaluatePhaseA', () => {
  it('returns hold with reason phase_a_pre_launch', () => {
    expect(evaluatePhaseA({ ad_id: 'ad_1', ad_set_id: 'as_1' })).toEqual({
      ad_id: 'ad_1', action: 'hold', reason: 'phase_a_pre_launch',
    });
  });
});
```

- [ ] **Step 2: Write phase-b.ts**

```ts
// src/modules/advertising/senior-buyer/policies/phase-b.ts
import type { AdDecision } from '../approval-router';
import type { AdSetState } from '../state-store';
import { resolveThreshold } from '../threshold-resolver';

export interface PhaseBInput {
  ad_id: string;
  state: AdSetState;
  current: {
    status: 'ACTIVE' | 'DISAPPROVED' | 'PAUSED';
    frequency: number;
    spend_usd: number;
    impressions: number;
    ctr: number;
    cpc: number;
  };
  account: {
    disapproval_rate: number;
    quality_rating?: 'BELOW_AVERAGE' | 'AVERAGE' | 'ABOVE_AVERAGE';
    spend_cap_hit: boolean;
  };
}

/**
 * Phase B — Learning. 8 extreme-failure exceptions allow autonomous pauses.
 * Default: hold with reason learning_in_progress.
 *
 * Per spec lines 657-672 (Q6).
 */
export async function evaluatePhaseB(input: PhaseBInput): Promise<AdDecision> {
  const { ad_id, state, current, account } = input;
  const ctx = { ad_set_id: state.adSetId, campaign_id: state.campaignId };

  // 1. DISAPPROVED status
  if (current.status === 'DISAPPROVED') {
    return { ad_id, action: 'pause', reason: 'extreme_failure_disapproved' };
  }

  // 2. Frequency cap
  const freqCap = await resolveThreshold('phase_b_extreme_frequency_cap', ctx);
  if (current.frequency >= freqCap) {
    return { ad_id, action: 'pause', reason: `extreme_failure_frequency=${current.frequency.toFixed(2)} ≥ ${freqCap}` };
  }

  // 3. Zero-conversion spend floor
  const spendFloor = await resolveThreshold('phase_b_extreme_zero_conv_spend_floor_usd', ctx);
  if (current.spend_usd >= spendFloor && state.conversions7dMeta === 0) {
    return { ad_id, action: 'pause', reason: `extreme_failure_zero_conv_spend=${current.spend_usd.toFixed(2)}` };
  }

  // 4. CTR DOA
  const ctrDoa = await resolveThreshold('phase_b_extreme_ctr_doa', ctx);
  const minImpressions = await resolveThreshold('phase_b_extreme_ctr_doa_min_impressions', ctx);
  if (current.ctr < ctrDoa && current.impressions >= minImpressions) {
    return { ad_id, action: 'pause', reason: `extreme_failure_ctr_doa=${(current.ctr * 100).toFixed(2)}%` };
  }

  // 5. CPC cap
  const cpcCap = await resolveThreshold('phase_b_extreme_cpc_cap_usd', ctx);
  if (current.cpc >= cpcCap) {
    return { ad_id, action: 'pause', reason: `extreme_failure_cpc=${current.cpc.toFixed(2)}` };
  }

  // 6. Account disapproval rate
  const disapprovalLimit = await resolveThreshold('account_disapproval_rate_emergency', ctx);
  if (account.disapproval_rate > disapprovalLimit) {
    return { ad_id, action: 'pause', reason: 'account_emergency_disapproval_rate' };
  }

  // 7. Account quality rating
  if (account.quality_rating === 'BELOW_AVERAGE') {
    return { ad_id, action: 'pause', reason: 'account_emergency_quality_below_avg' };
  }

  // 8. Spend cap hit
  if (account.spend_cap_hit) {
    return { ad_id, action: 'pause', reason: 'spend_cap_hit' };
  }

  return { ad_id, action: 'hold', reason: 'learning_in_progress' };
}
```

Test phase-b.ts thoroughly — 8 cases for the 8 exceptions + 2 for boundary + happy path:

```ts
// src/modules/advertising/senior-buyer/policies/__tests__/phase-b.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../threshold-resolver', () => ({
  resolveThreshold: vi.fn(async (metric: string) => {
    const defaults: Record<string, number> = {
      phase_b_extreme_frequency_cap: 5.0,
      phase_b_extreme_zero_conv_spend_floor_usd: 50.0,
      phase_b_extreme_ctr_doa: 0.003,
      phase_b_extreme_ctr_doa_min_impressions: 1000,
      phase_b_extreme_cpc_cap_usd: 10.0,
      account_disapproval_rate_emergency: 0.05,
    };
    return defaults[metric];
  }),
}));

import { evaluatePhaseB } from '../phase-b';

const baseInput = {
  ad_id: 'ad_1',
  state: { adSetId: 'as_1', campaignId: 'cmp_1', conversions7dMeta: 0 } as any,
  current: { status: 'ACTIVE' as const, frequency: 1, spend_usd: 1, impressions: 100, ctr: 0.05, cpc: 0.5 },
  account: { disapproval_rate: 0, spend_cap_hit: false },
};

describe('evaluatePhaseB — 8 extreme failures', () => {
  it('1. DISAPPROVED → pause', async () => {
    const d = await evaluatePhaseB({ ...baseInput, current: { ...baseInput.current, status: 'DISAPPROVED' } });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('disapproved');
  });
  it('2. frequency >= 5 → pause', async () => {
    const d = await evaluatePhaseB({ ...baseInput, current: { ...baseInput.current, frequency: 5.0 } });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('frequency');
  });
  it('3. spend ≥ 50 + zero conversions → pause', async () => {
    const d = await evaluatePhaseB({ ...baseInput, current: { ...baseInput.current, spend_usd: 50.0 } });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('zero_conv_spend');
  });
  it('3a. spend ≥ 50 + non-zero conversions → does NOT pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      state: { ...baseInput.state, conversions7dMeta: 5 } as any,
      current: { ...baseInput.current, spend_usd: 50.0 },
    });
    expect(d.action).toBe('hold');
  });
  it('4. CTR < 0.3% AND impressions ≥ 1000 → pause', async () => {
    const d = await evaluatePhaseB({ ...baseInput, current: { ...baseInput.current, ctr: 0.002, impressions: 1000 } });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('ctr_doa');
  });
  it('4a. CTR < 0.3% but impressions < 1000 → does NOT pause (insufficient sample)', async () => {
    const d = await evaluatePhaseB({ ...baseInput, current: { ...baseInput.current, ctr: 0.002, impressions: 500 } });
    expect(d.action).toBe('hold');
  });
  it('5. CPC ≥ 10 → pause', async () => {
    const d = await evaluatePhaseB({ ...baseInput, current: { ...baseInput.current, cpc: 10.0 } });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('cpc');
  });
  it('6. account disapproval rate > 5% → pause', async () => {
    const d = await evaluatePhaseB({ ...baseInput, account: { ...baseInput.account, disapproval_rate: 0.06 } });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('account_emergency');
  });
  it('7. quality_rating BELOW_AVERAGE → pause', async () => {
    const d = await evaluatePhaseB({
      ...baseInput,
      account: { ...baseInput.account, quality_rating: 'BELOW_AVERAGE' },
    });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('quality_below');
  });
  it('8. spend_cap_hit → pause', async () => {
    const d = await evaluatePhaseB({ ...baseInput, account: { ...baseInput.account, spend_cap_hit: true } });
    expect(d.action).toBe('pause');
    expect(d.reason).toContain('spend_cap');
  });
  it('happy path → hold with learning_in_progress', async () => {
    const d = await evaluatePhaseB(baseInput);
    expect(d.action).toBe('hold');
    expect(d.reason).toBe('learning_in_progress');
  });
});
```

Run + commit:

```bash
npx vitest run src/modules/advertising/senior-buyer/policies/__tests__/
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/senior-buyer/policies/phase-a.ts \
        src/modules/advertising/senior-buyer/policies/phase-b.ts \
        src/modules/advertising/senior-buyer/policies/__tests__/phase-a.test.ts \
        src/modules/advertising/senior-buyer/policies/__tests__/phase-b.test.ts
git commit -m "feat(advertising/senior-buyer): phase-a + phase-b policies (8 extreme failures)"
```

- [ ] **Step 3: Notify coordinator** — Wave 1 / Track 15 complete.

---

# Track 16 — senior-buyer/policies/phase-c.ts

**Owner:** Wave 1, agent 16
**Blockers:** T4, T6, T7, T12
**Blocks:** T21
**Files:**
- Create: `src/modules/advertising/senior-buyer/policies/phase-c.ts`
- Create: peer test

Phase C: active ad set. Q9 pause checked first (frees budget), then Q8 scale (duplicate-only), then Q11 hybrid event switch, default maintain.

- [ ] **Step 1: Implement phase-c.ts**

```ts
// src/modules/advertising/senior-buyer/policies/phase-c.ts
import type { AdDecision } from '../approval-router';
import type { AdSetState } from '../state-store';
import { resolveThreshold } from '../threshold-resolver';
import { comparable } from '../comparable-window';

export interface PhaseCInput {
  ad_id: string;
  state: AdSetState;
  metric: {
    cpa_7d: number;
    roas_7d: number;
    roas_14d: number;
    frequency_current: number;
    sustained_days_above_cpa: number;
    sustained_days_below_roas14d: number;
    sustained_days_above_scale_criteria: number;
  };
  signups_per_week: { lead: number; subscribe: number };
}

/**
 * Phase C orchestrator. Order:
 *   1. Q9 pause (frees budget) — checked FIRST
 *   2. Q8 scale via duplicate
 *   3. Q11 hybrid event switch
 *   4. Default: maintain
 *
 * Per spec lines 676-734.
 */
export async function evaluatePhaseC(input: PhaseCInput): Promise<AdDecision> {
  const { ad_id, state, metric } = input;
  const ctx = { ad_set_id: state.adSetId, campaign_id: state.campaignId };

  // ── Q9 pause — evaluated FIRST to free spend ──────────
  const pauseCpaMult = await resolveThreshold('pause_cpa_threshold_multiplier', ctx);
  const pauseCpaSustainedDays = await resolveThreshold('pause_cpa_sustained_days', ctx);
  const targetCpaSubscription = await resolveThreshold('target_cpa_subscription_usd', ctx);
  if (
    metric.cpa_7d > pauseCpaMult * targetCpaSubscription &&
    metric.sustained_days_above_cpa >= pauseCpaSustainedDays
  ) {
    return { ad_id, action: 'pause', reason: `cpa_above_${pauseCpaMult}x_sustained_${pauseCpaSustainedDays}d` };
  }

  const pauseRoasMult = await resolveThreshold('pause_roas_threshold_multiplier', ctx);
  const pauseRoasSustainedDays = await resolveThreshold('pause_roas_sustained_days', ctx);
  const targetRoasSubscription = await resolveThreshold('target_roas_subscription', ctx);
  if (
    metric.roas_14d < pauseRoasMult * targetRoasSubscription &&
    metric.sustained_days_below_roas14d >= pauseRoasSustainedDays
  ) {
    return { ad_id, action: 'pause', reason: `roas_below_${pauseRoasMult}x_sustained_${pauseRoasSustainedDays}d` };
  }

  const pauseFrequency = await resolveThreshold('pause_frequency_threshold', ctx);
  if (metric.frequency_current > pauseFrequency) {
    // Frequency saturation → escalate to Phase D rather than direct pause
    return { ad_id, action: 'maintain', reason: `escalate_to_phase_d_frequency=${metric.frequency_current.toFixed(2)}` };
  }

  // ── Q11 hybrid event switch (auto-graduate optimization event) ──
  const switchToLeadConv7d = await resolveThreshold('hybrid_switch_signup_to_lead_conv_7d', ctx);
  if (
    state.optimizationEvent === 'landing_page_view' &&
    state.conversions7dMeta >= switchToLeadConv7d
  ) {
    return { ad_id, action: 'hybrid_event_switch', reason: `switch_to_Lead (conversions_7d_meta=${state.conversions7dMeta})` } as AdDecision;
  }

  const leadPerWeekTrigger = await resolveThreshold('hybrid_switch_lead_to_subscribe_lead_per_week', ctx);
  const subPerWeekTrigger = await resolveThreshold('hybrid_switch_lead_to_subscribe_sub_per_week', ctx);
  if (
    state.optimizationEvent === 'Lead' &&
    input.signups_per_week.lead >= leadPerWeekTrigger &&
    input.signups_per_week.subscribe >= subPerWeekTrigger
  ) {
    return { ad_id, action: 'hybrid_event_switch', reason: `switch_to_Subscribe (lead/wk=${input.signups_per_week.lead}, sub/wk=${input.signups_per_week.subscribe})` } as AdDecision;
  }

  // ── Q8 scale criteria — all must hold ────────────────
  const scaleRoasMult = await resolveThreshold('scale_roas_min_multiplier', ctx);
  const scaleCpaMult = await resolveThreshold('scale_cpa_max_multiplier', ctx);
  const scaleFreqMax = await resolveThreshold('scale_frequency_max', ctx);
  const scaleSustainedDays = await resolveThreshold('scale_sustained_days', ctx);
  const scaleMaxDupes = await resolveThreshold('scale_max_duplicates_per_parent', ctx);

  const meetsRoas = metric.roas_7d >= scaleRoasMult * targetRoasSubscription;
  const meetsCpa = metric.cpa_7d < scaleCpaMult * targetCpaSubscription;
  const sustained = metric.sustained_days_above_scale_criteria >= scaleSustainedDays;
  const underFreqMax = metric.frequency_current < scaleFreqMax;
  const dupesAvailable = state.duplicatesCount < scaleMaxDupes;

  if ((meetsRoas || meetsCpa) && underFreqMax && sustained && dupesAvailable) {
    return {
      ad_id,
      action: 'duplicate',
      reason: `scale_criteria_met (roas=${metric.roas_7d.toFixed(2)}, cpa=$${metric.cpa_7d.toFixed(2)}, freq=${metric.frequency_current.toFixed(2)})`,
    };
  }

  return { ad_id, action: 'maintain', reason: 'phase_c_steady_state' };
}
```

Tests for phase-c follow the same matrix shape as phase-b (10-15 cases). Cover: each pause condition fires; scale criteria all-met / one-missing; hybrid switch trigger / no-trigger; default maintain.

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/modules/advertising/senior-buyer/policies/__tests__/phase-c.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/senior-buyer/policies/phase-c.ts \
        src/modules/advertising/senior-buyer/policies/__tests__/phase-c.test.ts
git commit -m "feat(advertising/senior-buyer): phase-c policy (Q8 scale + Q9 pause + Q11 hybrid switch)"
```

- [ ] **Step 3: Notify coordinator** — Wave 1 / Track 16 complete.

---

# Track 17 — senior-buyer/policies/{phase-d, account-emergency}.ts

**Owner:** Wave 1, agent 17
**Blockers:** T4, T6, T9, T12, T13
**Blocks:** T21
**Files:**
- Create: `src/modules/advertising/senior-buyer/policies/phase-d.ts`
- Create: `src/modules/advertising/senior-buyer/policies/account-emergency.ts`
- Create: peer tests

Phase D actions per Q10 (refresh_creative + propose_new_ad_set + pause_for_rest); account-emergency cross-phase.

- [ ] **Step 1: Implement phase-d.ts**

```ts
// src/modules/advertising/senior-buyer/policies/phase-d.ts
import type { AdDecision } from '../approval-router';
import type { AdSetState } from '../state-store';
import { resolveThreshold } from '../threshold-resolver';
import { comparable } from '../comparable-window';

export interface PhaseDInput {
  ad_id: string;
  state: AdSetState;
  metric: {
    frequency_current: number;
    sustained_days_above_decline_freq: number;
    days_in_phase_c: number;
  };
}

/**
 * Phase D — Decline. Triggered from Phase C. Returns one of 3 actions
 * (refresh_creative, propose_new_ad_set, pause_for_rest) per Q10 mixed strategy.
 */
export async function evaluatePhaseD(input: PhaseDInput): Promise<AdDecision> {
  const { ad_id, state, metric } = input;
  const ctx = { ad_set_id: state.adSetId, campaign_id: state.campaignId };

  // 1. Frequency saturation → refresh creative
  const declineFreqTrigger = await resolveThreshold('decline_frequency_trigger', ctx);
  const declineFreqDays = await resolveThreshold('decline_frequency_sustained_days', ctx);
  if (
    metric.frequency_current > declineFreqTrigger &&
    metric.sustained_days_above_decline_freq >= declineFreqDays
  ) {
    return {
      ad_id,
      action: 'refresh_creative',
      reason: `frequency_saturation (${metric.frequency_current.toFixed(2)} > ${declineFreqTrigger})`,
    } as AdDecision;
  }

  // 2. CTR fade (z < -2)
  const ctrComparable = await comparable(state.adSetId, 'ctr');
  const declineZ = await resolveThreshold('decline_z_score_trigger', ctx);
  if (ctrComparable && ctrComparable.z_score < declineZ) {
    return {
      ad_id,
      action: 'refresh_creative',
      reason: `ctr_fade_z=${ctrComparable.z_score.toFixed(2)}`,
    } as AdDecision;
  }

  // 3. Conversion velocity drop (z < -2) → propose new ad set
  const convComparable = await comparable(state.adSetId, 'conversions_meta');
  if (convComparable && convComparable.z_score < declineZ) {
    return {
      ad_id,
      action: 'propose_new_ad_set',
      reason: `conv_velocity_drop_z=${convComparable.z_score.toFixed(2)}`,
    } as AdDecision;
  }

  // 4. Plateau ≥30d AND no duplicates yet → pause for rest
  const plateauDays = await resolveThreshold('decline_plateau_days', ctx);
  if (metric.days_in_phase_c >= plateauDays && state.duplicatesCount === 0) {
    return {
      ad_id,
      action: 'pause_for_rest',
      reason: `plateau_${plateauDays}d_no_duplicates`,
    };
  }

  return { ad_id, action: 'maintain', reason: 'phase_d_no_action_yet' };
}
```

- [ ] **Step 2: Implement account-emergency.ts**

```ts
// src/modules/advertising/senior-buyer/policies/account-emergency.ts
import type { AdDecision } from '../approval-router';
import { resolveThreshold } from '../threshold-resolver';

export interface AccountEmergencyInput {
  ad_set_id: string;
  campaign_id: string;
  account: {
    disapproval_rate: number;
    quality_rating?: 'BELOW_AVERAGE' | 'AVERAGE' | 'ABOVE_AVERAGE';
    status?: 'ACTIVE' | 'DISABLED' | 'PENDING_REVIEW';
  };
}

/**
 * Cross-phase emergency check. If any of the 3 conditions trigger, EVERY ad set
 * gets a 'pause' decision with reason 'account_emergency_*'. Approval router
 * recognises this and lets it through even in COLD_START.
 */
export async function evaluateAccountEmergency(input: AccountEmergencyInput): Promise<AdDecision | null> {
  const { ad_set_id, campaign_id, account } = input;
  const ctx = { ad_set_id, campaign_id };

  if (account.status === 'DISABLED') {
    return { ad_id: '*', action: 'pause', reason: 'account_emergency_status_disabled' };
  }

  if (account.quality_rating === 'BELOW_AVERAGE') {
    return { ad_id: '*', action: 'pause', reason: 'account_emergency_quality_below_avg' };
  }

  const limit = await resolveThreshold('account_disapproval_rate_emergency', ctx);
  if (account.disapproval_rate > limit) {
    return { ad_id: '*', action: 'pause', reason: `account_emergency_disapproval_rate=${(account.disapproval_rate * 100).toFixed(1)}%` };
  }

  return null;
}
```

- [ ] **Step 3: Tests + run + commit**

Tests for both files following the same Vitest mock pattern as phase-b. Cover all 4 phase-d triggers + happy path; all 3 account-emergency conditions + clean-account null return.

```bash
npx vitest run src/modules/advertising/senior-buyer/policies/__tests__/
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/senior-buyer/policies/phase-d.ts \
        src/modules/advertising/senior-buyer/policies/account-emergency.ts \
        src/modules/advertising/senior-buyer/policies/__tests__/phase-d.test.ts \
        src/modules/advertising/senior-buyer/policies/__tests__/account-emergency.test.ts
git commit -m "feat(advertising/senior-buyer): phase-d + account-emergency policies"
```

- [ ] **Step 4: Notify coordinator** — Wave 1 / Track 17 complete.

---

# Track 18 — webhooks/{clerk, stripe} CAPI wire

**Owner:** Wave 1, agent 18
**Blockers:** T11
**Blocks:** none
**Files:**
- Modify: `src/app/api/webhooks/clerk/route.ts` (around line 100-110 — existing `trackServerEvent`)
- Modify: `src/app/api/webhooks/clerk/__tests__/route.test.ts`
- Modify: `src/app/api/webhooks/stripe/route.ts` (around line 250-265)
- Modify: `src/app/api/webhooks/stripe/__tests__/route.test.ts`

`trackServerEvent` (extended in T11) already fires CAPI when called. This track verifies that wiring works end-to-end and that the dedupe `event_id` is propagated correctly.

- [ ] **Step 1: Verify Clerk webhook fires CAPI Lead via the extended trackServerEvent**

The existing `trackServerEvent(data.id, AnalyticsEvent.USER_REGISTERED, {...})` at clerk/route.ts:104 will now ALSO fire CAPI thanks to T11. No code change required IF properties already include `$insert_id` (used as event_id for dedupe).

Check `clerk/route.ts:107`: existing code passes `$insert_id: \`${data.id}:user_registered\``. This becomes the dedupe `event_id` for both PostHog and CAPI. Good.

If `email` should be included for Meta Custom Audience matching, optionally add to properties:

```ts
trackServerEvent(data.id, AnalyticsEvent.USER_REGISTERED, {
  $insert_id: `${data.id}:user_registered`,
  email: data.email_addresses?.[0]?.email_address,  // ← NEW: for CAPI hashing in T11 wrapper
  // ... existing properties
});
```

(Email is hashed at the CAPI boundary in `meta-capi/index.ts:hashPII`. No raw email leaves the boundary.)

- [ ] **Step 2: Verify Stripe webhook fires CAPI Subscribe similarly**

`stripe/route.ts:255` already passes value/currency in properties. Verify properties include `value`, `currency`, and a `$insert_id`. T11's analytics extension will pick them up.

If `predicted_ltv` should be included (for Meta's LTV-based bidding), add:

```ts
trackServerEvent(clerkUserId, AnalyticsEvent.SUBSCRIPTION_STARTED, {
  $insert_id: `${stripeSubscriptionId ?? session.id}:subscription_started`,
  value: amountUsd,
  currency: 'usd',
  predicted_ltv: 30, // hardcoded $30 LTV per spec; auto-calibrate in v3b month 6+
  email: customerEmail,  // optional: for CAPI hashing
});
```

- [ ] **Step 3: Add integration tests verifying CAPI fire**

In `src/app/api/webhooks/clerk/__tests__/route.test.ts`:

```ts
vi.mock('@/modules/advertising/meta-capi', () => ({
  sendCapiEvent: vi.fn().mockResolvedValue(undefined),
}));

import { sendCapiEvent } from '@/modules/advertising/meta-capi';

  it('fires CAPI Lead with correct event_id matching the trackServerEvent insert_id', async () => {
    // ... existing svix signature setup + POST request setup
    await POST(req);
    // Wait for waitUntil-style fire-and-forget
    await new Promise((r) => setTimeout(r, 50));
    expect(sendCapiEvent).toHaveBeenCalledWith(
      'Lead',
      expect.objectContaining({ external_id_raw: 'user_test_clerk_id' }),
      undefined,
      expect.objectContaining({ event_id: 'user_test_clerk_id:user_registered' }),
    );
  });
```

Same pattern for Stripe.

- [ ] **Step 4: Run tests + typecheck + commit**

```bash
npx vitest run src/app/api/webhooks
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/app/api/webhooks/clerk/route.ts \
        src/app/api/webhooks/clerk/__tests__/route.test.ts \
        src/app/api/webhooks/stripe/route.ts \
        src/app/api/webhooks/stripe/__tests__/route.test.ts
git commit -m "feat(webhooks/clerk+stripe): wire CAPI Lead + Subscribe events"
```

- [ ] **Step 5: Notify coordinator** — Wave 1 / Track 18 complete.

---

# Track 19 — BirthDataForm fbq ViewContent companion

**Owner:** Wave 1, agent 19
**Blockers:** T8 (Pixel script must be loaded for fbq to exist)
**Blocks:** none
**Files:**
- Modify: `src/modules/astro-engine/components/BirthDataForm.tsx:127`
- Modify: `src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx`

Add a client-side fbq call alongside the existing `trackEvent('chart_calculated')` so Meta Pixel sees ViewContent in the browser.

- [ ] **Step 1: Add fbq call**

In `src/modules/astro-engine/components/BirthDataForm.tsx`, find the `trackEvent(AnalyticsEvent.CHART_CALCULATED, ...)` at line 127. Right after, add:

```ts
        // Pixel companion — Meta Pixel ViewContent (CAPI fires from server-side via trackEvent path)
        if (typeof window !== 'undefined' && (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq) {
          (window as unknown as { fbq: (...args: unknown[]) => void }).fbq(
            'track',
            'ViewContent',
            { content_type: 'natal_chart' },
            // eventID enables dedupe with CAPI (when CAPI fires for chart_calculated — currently CAPI off for this event)
          );
        }
```

(Per the event-mapper from T2, `chart_calculated` → ViewContent for both Pixel and CAPI. CAPI fires via the existing `trackEvent` path through analytics.ts T11 extension if `chart_calculated` ever runs server-side; for the client-only path this Pixel-only call is sufficient.)

- [ ] **Step 2: Update existing test**

In the existing test for `BirthDataForm`, add an `fbq` mock:

```ts
beforeEach(() => {
  (global as unknown as { window?: object }).window = (global as unknown as { window: { fbq: ReturnType<typeof vi.fn> } }).window ?? {};
  (window as unknown as { fbq: ReturnType<typeof vi.fn> }).fbq = vi.fn();
});

  it('fires fbq ViewContent on chart calculation', async () => {
    // ... existing setup
    expect((window as any).fbq).toHaveBeenCalledWith('track', 'ViewContent', { content_type: 'natal_chart' });
  });
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/astro-engine/components/BirthDataForm.tsx \
        src/modules/astro-engine/components/__tests__/BirthDataForm.test.tsx
git commit -m "feat(astro-engine/BirthDataForm): fbq ViewContent client companion"
```

- [ ] **Step 4: Notify coordinator** — Wave 1 / Track 19 complete.

---

# Track 20 — senior-buyer/auto-calibrator.ts

**Owner:** Wave 1, agent 20
**Blockers:** T5 (baseline-calculator), T6 (comparable-window), T12 (threshold-resolver), T13 (state-store), T14 (metric-history)
**Blocks:** T25 (cron route invokes this)
**Files:**
- Create: `src/modules/advertising/senior-buyer/auto-calibrator.ts`
- Create: peer test

Weekly cron + drift-triggered logic with 4 protections per spec lines 736-810.

- [ ] **Step 1: Implement**

```ts
// src/modules/advertising/senior-buyer/auto-calibrator.ts
import { getDb } from '@/shared/lib/db';
import { advertisingThresholds } from '@/shared/lib/schema';
import { nanoid } from 'nanoid';
import { listAdSetsByPhase, type Phase } from './state-store';
import { getRange } from './metric-history';
import { calculateBaseline, trimOutliers, type Baseline } from './baseline-calculator';
import { resolveThreshold } from './threshold-resolver';
import { COLD_START_DEFAULTS, type ThresholdName } from './targets';
import { comparable } from './comparable-window';

export interface AutoCalibratorDeps {
  telegramBot: {
    requestApproval(message: string, options: { riskLevel: 'HIGH_RISK' }): Promise<{ approved: boolean }>;
  };
}

const CALIBRATABLE_METRICS: Array<{ source: 'ctr' | 'cpa' | 'roas' | 'frequency'; threshold: ThresholdName; derive: (b: Baseline) => number }> = [
  { source: 'cpa', threshold: 'pause_cpa_threshold_multiplier', derive: (b) => 2.0 },        // multiplier metric — keep at 2.0 unless founder overrides
  { source: 'cpa', threshold: 'target_cpa_subscription_usd', derive: (b) => b.mean },         // baseline-derived target
  { source: 'roas', threshold: 'target_roas_subscription', derive: (b) => Math.max(b.mean, 1.0) },
  { source: 'frequency', threshold: 'pause_frequency_threshold', derive: (b) => Math.min(5.0, b.mean + 2 * b.stddev) },
];

export async function runWeeklyCalibration(deps: AutoCalibratorDeps): Promise<{
  ad_sets_processed: number;
  thresholds_updated: number;
  approvals_requested: number;
  errors: number;
}> {
  let ad_sets_processed = 0;
  let thresholds_updated = 0;
  let approvals_requested = 0;
  let errors = 0;

  const adSets = await listAdSetsByPhase(['B', 'C', 'D']);
  for (const adSet of adSets) {
    ad_sets_processed += 1;
    const history = await getRange(adSet.adSetId, COLD_START_DEFAULTS.calibration_min_history_days);

    // Protection 1: minimum samples
    if (history.length < COLD_START_DEFAULTS.calibration_min_history_days) continue;

    for (const cfg of CALIBRATABLE_METRICS) {
      try {
        const values = history
          .map((s) => Number((s as Record<string, unknown>)[metricToColumn(cfg.source)] ?? 0))
          .filter((v) => Number.isFinite(v));

        // Protection 2: outlier rejection
        const trimmed = trimOutliers(values, COLD_START_DEFAULTS.calibration_outlier_pct_to_drop);
        if (trimmed.length < 5) continue;

        const baseline = calculateBaseline(trimmed);
        const newThreshold = cfg.derive(baseline);

        // Protection 4: sanity
        if (!Number.isFinite(newThreshold) || newThreshold < 0) continue;

        const current = await resolveThreshold(cfg.threshold, {
          ad_set_id: adSet.adSetId,
          campaign_id: adSet.campaignId,
        });

        // Protection 3: bounded change
        const factor = Math.max(newThreshold / current, current / newThreshold);
        if (factor > COLD_START_DEFAULTS.calibration_max_change_factor) {
          await deps.telegramBot.requestApproval(
            `🔧 *Auto-calibrator: ${factor.toFixed(2)}× change proposal*\n` +
            `Ad set: ${adSet.adSetId}\n` +
            `Metric: ${cfg.threshold}\n` +
            `Current: ${current.toFixed(4)}\n` +
            `Proposed: ${newThreshold.toFixed(4)}\n` +
            `Baseline mean=${baseline.mean.toFixed(2)}, stddev=${baseline.stddev.toFixed(2)}, n=${baseline.sample_count}\n\n` +
            `Reply ✅ to apply, ❌ to keep current.`,
            { riskLevel: 'HIGH_RISK' },
          );
          approvals_requested += 1;
          continue;
        }

        await getDb().insert(advertisingThresholds).values({
          id: nanoid(),
          scope: 'ad_set',
          scopeId: adSet.adSetId,
          metricName: cfg.threshold,
          value: newThreshold,
          source: 'auto_calibrated',
          effectiveFrom: new Date(),
          baselineMetricSnapshot: baseline as unknown as Record<string, unknown>,
          changedBy: 'system_calibrator',
          createdAt: new Date(),
        });
        thresholds_updated += 1;
      } catch (err) {
        errors += 1;
        console.warn(`[auto-calibrator] ad_set=${adSet.adSetId} metric=${cfg.threshold} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return { ad_sets_processed, thresholds_updated, approvals_requested, errors };
}

export async function runDriftTriggeredCalibration(adSetId: string, campaignId: string): Promise<void> {
  // Check each candidate metric's z-score; if any > threshold, run focused recalibration
  for (const metric of ['ctr', 'cpa', 'roas'] as const) {
    const result = await comparable(adSetId, metric);
    if (!result) continue;
    if (Math.abs(result.z_score) > COLD_START_DEFAULTS.calibration_drift_z_threshold) {
      console.info(`[auto-calibrator] drift triggered on ${adSetId}/${metric} z=${result.z_score.toFixed(2)}`);
      // Re-run weekly calibration just for this ad set (the heavy logic is in runWeeklyCalibration)
      // Implementation simplified to share the loop body via filtering:
      // (For MVP, the drift trigger just logs + lets the next weekly cron pick it up. Aggressive
      //  re-calibration would risk thrashing.)
    }
  }
}

function metricToColumn(source: 'ctr' | 'cpa' | 'roas' | 'frequency'): string {
  switch (source) {
    case 'ctr': return 'ctr';
    case 'cpa': return 'cpa';     // not stored directly — derive in caller if needed
    case 'roas': return 'roas';
    case 'frequency': return 'frequency';
  }
}
```

(Note: `cpa` is computed (`spend / conversions`), not stored directly. For MVP simplification, the calibrator works off `roas` and `frequency` directly. CPA calibration falls out of `target_cpa_subscription_usd = baseline.mean(roas-implied-cpa)` derivation. If cleaner, derive CPA per-row in `getRange` post-processing.)

Tests cover: protection 1 (min samples), protection 2 (outlier rejection), protection 3 (>2× change → approval request), protection 4 (NaN rejection), happy path (writes new threshold row).

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/modules/advertising/senior-buyer/__tests__/auto-calibrator.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/senior-buyer/auto-calibrator.ts \
        src/modules/advertising/senior-buyer/__tests__/auto-calibrator.test.ts
git commit -m "feat(advertising/senior-buyer): auto-calibrator (weekly + 4 protections)"
```

- [ ] **Step 3: Notify coordinator** — Wave 1 / Track 20 complete. Wave 1 done. Track 25 unblocked.

---

# Track 21 — senior-buyer/phase-evaluator.ts (orchestrator)

**Owner:** Wave 2, agent 21
**Blockers:** T7, T13, T15, T16, T17
**Blocks:** T22
**Files:**
- Create: `src/modules/advertising/senior-buyer/phase-evaluator.ts`
- Create: peer test

Main per-ad-set orchestrator. Picks the right policy based on `state.currentPhase`, returns the decision. Maturity-mode gating happens later in approval-router (already implemented in T10).

- [ ] **Step 1: Implement**

```ts
// src/modules/advertising/senior-buyer/phase-evaluator.ts
import type { AdDecision } from './approval-router';
import type { AdSetState } from './state-store';
import { evaluatePhaseA } from './policies/phase-a';
import { evaluatePhaseB, type PhaseBInput } from './policies/phase-b';
import { evaluatePhaseC, type PhaseCInput } from './policies/phase-c';
import { evaluatePhaseD, type PhaseDInput } from './policies/phase-d';
import { evaluateAccountEmergency, type AccountEmergencyInput } from './policies/account-emergency';

export interface PhaseEvaluatorInput {
  ad_id: string;
  state: AdSetState;
  current: PhaseBInput['current'];
  account: AccountEmergencyInput['account'];
  metric: PhaseCInput['metric'] & PhaseDInput['metric'];
  signups_per_week: PhaseCInput['signups_per_week'];
}

/**
 * Per-ad-set phase evaluator. Account-emergency check first (cross-phase),
 * then route by current phase. Returns ONE decision. Caller passes it through
 * approval-router for final routing (REVERSIBLE / LOW_RISK / HIGH_RISK / rejected).
 */
export async function evaluatePhase(input: PhaseEvaluatorInput): Promise<AdDecision> {
  // Cross-phase account emergency
  const emergency = await evaluateAccountEmergency({
    ad_set_id: input.state.adSetId,
    campaign_id: input.state.campaignId,
    account: input.account,
  });
  if (emergency) {
    return { ...emergency, ad_id: input.ad_id };
  }

  switch (input.state.currentPhase) {
    case 'A':
      return evaluatePhaseA({ ad_id: input.ad_id, ad_set_id: input.state.adSetId });

    case 'B':
      return await evaluatePhaseB({
        ad_id: input.ad_id,
        state: input.state,
        current: input.current,
        account: { ...input.account, spend_cap_hit: false }, // wired separately by spend-cap layer
      });

    case 'C':
      return await evaluatePhaseC({
        ad_id: input.ad_id,
        state: input.state,
        metric: input.metric,
        signups_per_week: input.signups_per_week,
      });

    case 'D':
      return await evaluatePhaseD({
        ad_id: input.ad_id,
        state: input.state,
        metric: input.metric,
      });

    case 'PAUSED':
    case 'RETIRED':
      return { ad_id: input.ad_id, action: 'hold', reason: `phase_${input.state.currentPhase.toLowerCase()}` };

    default:
      return { ad_id: input.ad_id, action: 'hold', reason: `unknown_phase_${input.state.currentPhase}` };
  }
}
```

- [ ] **Step 2: Tests + run + commit**

Test covers: each phase routes to its policy; account-emergency overrides phase routing; PAUSED/RETIRED return hold; unknown phase falls through.

```bash
npx vitest run src/modules/advertising/senior-buyer/__tests__/phase-evaluator.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/senior-buyer/phase-evaluator.ts \
        src/modules/advertising/senior-buyer/__tests__/phase-evaluator.test.ts
git commit -m "feat(advertising/senior-buyer): phase-evaluator (per-ad-set orchestrator)"
```

- [ ] **Step 3: Notify coordinator** — Wave 2 / Track 21 complete.

---

# Track 22 — decide/orchestrator.ts rewrite + feature gate

**Owner:** Wave 2, agent 22
**Blockers:** T21
**Blocks:** T23
**Files:**
- Rewrite: `src/modules/advertising/decide/orchestrator.ts`
- Modify: `src/modules/advertising/decide/__tests__/orchestrator.test.ts`
- Modify: `src/modules/advertising/decide/feature-gates.ts` (extend `seniorBuyerMode` gate)

Branches on the `seniorBuyerMode` feature gate. Off → legacy Tier 1/2/3 path (untouched). On → new senior buyer flow.

- [ ] **Step 1: Add seniorBuyerMode gate to feature-gates.ts**

Locate `feature-gates.ts`. Add a new gate definition:

```ts
{
  id: 'seniorBuyerMode',
  description: 'Senior Buyer Mode — replaces Tier 1 hard rules with 4-phase per-ad-set state machine.',
  defaultMode: 'off',  // Initial: off until Stage 0 (Pixel + CAPI) verified live in production
  modes: ['off', 'on'],
}
```

- [ ] **Step 2: Rewrite decide/orchestrator.ts**

```ts
// src/modules/advertising/decide/orchestrator.ts (REWRITE)
import { applyTier1Rules } from './tier-1-rules';
import { getReconState } from '@/modules/advertising/perceive/recon-state-store';
import { listAdSetsByPhase, type AdSetState } from '@/modules/advertising/senior-buyer/state-store';
import { classifyMaturity } from '@/modules/advertising/senior-buyer/data-maturity-classifier';
import { evaluatePhase } from '@/modules/advertising/senior-buyer/phase-evaluator';
import { route as approvalRoute } from '@/modules/advertising/senior-buyer/approval-router';
import type { AdMetric, FeatureGate } from '@/shared/types/advertising';

export interface DecideResult {
  decisions: Array<{ ad_id: string; action: string; reason: string; routing: string }>;
  shadowLog: Array<unknown>;
}

export async function decide(
  metrics: AdMetric[],
  gates: FeatureGate[],
  deps: { senior_buyer_mode?: 'on' | 'off' } = {},
): Promise<DecideResult> {
  // Reconciler suspend gate (from v3a Track 8) — applies regardless of seniorBuyerMode
  const reconState = await getReconState();
  if (reconState.suspended) {
    const emergencyMetrics = metrics.filter((m) => m.status === 'DISAPPROVED');
    if (emergencyMetrics.length === 0) {
      return { decisions: [], shadowLog: [] };
    }
    metrics = emergencyMetrics;
  }

  const seniorMode = deps.senior_buyer_mode ?? gates.find((g) => g.id === 'seniorBuyerMode')?.mode ?? 'off';

  if (seniorMode === 'off') {
    // Legacy path — Tier 1 hard rules unchanged
    const decisions = metrics.map((m) => {
      const d = applyTier1Rules(m);
      return { ...d, routing: 'execute_immediately' };
    });
    return { decisions, shadowLog: [] };
  }

  // Senior buyer mode
  const adSetStates = await Promise.all(
    metrics.map(async (m) => {
      const states = await listAdSetsByPhase(['A', 'B', 'C', 'D', 'PAUSED']);
      return states.find((s) => s.adSetId === (m as unknown as { ad_set_id: string }).ad_set_id) ?? null;
    }),
  );

  const decisions: DecideResult['decisions'] = [];
  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i];
    const state = adSetStates[i];
    if (!state) {
      // No state row for this ad set yet → treat as new (Phase A, COLD_START)
      decisions.push({ ad_id: metric.ad_id, action: 'hold', reason: 'state_not_initialised', routing: 'execute_immediately' });
      continue;
    }

    // Per-ad-set maturity check (refresh in case it changed)
    const newMaturity = classifyMaturity({
      conversions_total_meta: state.conversionsTotalMeta,
      days_with_pixel_data: state.daysWithPixelData,
      baseline_cv: 0,  // re-computed in auto-calibrator path; default 0 for COLD_START
    });
    const stateWithMaturity: AdSetState = { ...state, dataMaturityMode: newMaturity };

    // Build PhaseEvaluatorInput from metric + state
    const phaseInput = buildPhaseInput(metric, stateWithMaturity);
    const decision = await evaluatePhase(phaseInput);

    // Route through approval-router (Q12 + maturity gating)
    const routing = await approvalRoute(decision, stateWithMaturity);

    decisions.push({
      ad_id: decision.ad_id,
      action: decision.action,
      reason: decision.reason ?? '',
      routing: routing.type,
    });
  }

  return { decisions, shadowLog: [] };
}

function buildPhaseInput(metric: AdMetric, state: AdSetState) {
  // Map AdMetric + state into PhaseEvaluatorInput shape
  return {
    ad_id: metric.ad_id,
    state,
    current: {
      status: metric.status,
      frequency: metric.frequency,
      spend_usd: metric.spend_usd,
      impressions: metric.impressions,
      ctr: metric.ctr,
      cpc: metric.cpc,
    },
    account: {
      disapproval_rate: 0,  // wired separately via account-health
      spend_cap_hit: false,
    },
    metric: {
      cpa_7d: state.cpa7d ?? 0,
      roas_7d: state.roas7d ?? 0,
      roas_14d: state.roas7d ?? 0,  // simplified — extend when 14d window aggregated
      frequency_current: state.frequencyCurrent ?? metric.frequency,
      sustained_days_above_cpa: 0,  // wired by metric-history aggregator
      sustained_days_below_roas14d: 0,
      sustained_days_above_scale_criteria: 0,
      sustained_days_above_decline_freq: 0,
      days_in_phase_c: 0,
    },
    signups_per_week: { lead: 0, subscribe: 0 },  // wired from PostHog HogQL (Q11)
  };
}
```

(Several `metric.` fields above are simplified placeholders — full wiring of the sustained-day counters and signups_per_week happens via metric-history aggregation in T24's triage-daily extension. Plan: cron computes those, persists to state, evaluator reads from state. For initial MVP, these can be zero and the evaluator falls through to `maintain` — safe.)

- [ ] **Step 3: Tests + run + commit**

Update `decide/__tests__/orchestrator.test.ts` to cover:
- `seniorBuyerMode='off'` → falls through to existing Tier-1 path (regression)
- `seniorBuyerMode='on'` → calls `evaluatePhase` + `approvalRoute`
- Reconciler-suspended path still applies in both modes

```bash
npx vitest run src/modules/advertising/decide
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/modules/advertising/decide/orchestrator.ts \
        src/modules/advertising/decide/__tests__/orchestrator.test.ts \
        src/modules/advertising/decide/feature-gates.ts
git commit -m "feat(advertising/decide): rewrite orchestrator with seniorBuyerMode gate"
```

- [ ] **Step 4: Notify coordinator** — Wave 2 / Track 22 complete. Track 23 unblocked.

---

# Track 23 — triage-hourly/route.ts wires the new evaluator

**Owner:** Wave 2, agent 23
**Blockers:** T22
**Blocks:** none
**Files:**
- Modify: `src/app/api/cron/advertising/triage-hourly/route.ts`
- Modify: `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`

Triage-hourly invokes `decide()` (already orchestrator-rewritten in T22). No structural changes needed; verify that the new code path works under `seniorBuyerMode=on`.

- [ ] **Step 1: Read the route**

```bash
sed -n '1,80p' src/app/api/cron/advertising/triage-hourly/route.ts
```

The route already calls `decide(metrics, gates, deps)`. Since `decide` now branches internally, the route may not need code changes.

- [ ] **Step 2: Add Sentry tags + a coverage test**

Confirm Sentry tags include `subsystem: 'senior-buyer'` when `seniorBuyerMode=on`. If not, add wrapping logic.

In `cron-handlers.test.ts`, add:
```ts
  it('triage-hourly under seniorBuyerMode=on routes through phase-evaluator', async () => {
    // Mock feature gate to return 'on' for seniorBuyerMode
    // Mock listAdSetsByPhase + evaluatePhase
    // Assert that decisions[0].routing is one of 'execute_immediately' | 'low_risk_approval' | ...
  });
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts -t "triage-hourly"
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/app/api/cron/advertising/triage-hourly/route.ts \
        src/app/api/cron/advertising/__tests__/cron-handlers.test.ts
git commit -m "feat(advertising/cron/triage-hourly): integration with senior-buyer phase-evaluator"
```

- [ ] **Step 4: Notify coordinator** — Wave 2 / Track 23 complete.

---

# Track 24 — triage-daily/route.ts: snapshot writer + drift trigger

**Owner:** Wave 2, agent 24
**Blockers:** T14, T22
**Blocks:** none
**Files:**
- Modify: `src/app/api/cron/advertising/triage-daily/route.ts`
- Modify: `src/app/api/cron/advertising/__tests__/cron-handlers.test.ts`

Daily snapshot writer + drift-triggered calibration check + ad-set state phase/maturity transitions.

- [ ] **Step 1: After existing fetchMetaInsights call, write snapshots + transitions**

```ts
import { writeDailySnapshot } from '@/modules/advertising/senior-buyer/metric-history';
import { listAdSetsByPhase, upsertAdSetState, recordPhaseTransition, recordMaturityTransition } from '@/modules/advertising/senior-buyer/state-store';
import { classifyMaturity } from '@/modules/advertising/senior-buyer/data-maturity-classifier';
import { runDriftTriggeredCalibration } from '@/modules/advertising/senior-buyer/auto-calibrator';

// After existing fetchMetaInsights / fetchFunnelSnapshot calls:

const today = new Date().toISOString().slice(0, 10);

for (const m of metaMetrics) {
  // Find or create state row
  // ... call upsertAdSetState with current snapshot fields

  await writeDailySnapshot({
    adSetId: m.ad_set_id ?? m.ad_id,
    date: today,
    impressions: m.impressions,
    clicks: m.clicks,
    spendUsd: m.spend_usd,
    ctr: m.ctr,
    cpc: m.cpc,
    cpm: m.cpm,
    frequency: m.frequency,
    conversionsMeta: m.conversions ?? 0,
    conversionsPosthog: 0,  // joined from PostHog snapshot below
    revenueUsd: 0,          // joined from Stripe attribution
    roas: null,
  });
}

// Drift-triggered calibration check
const adSets = await listAdSetsByPhase(['B', 'C', 'D']);
for (const adSet of adSets) {
  await runDriftTriggeredCalibration(adSet.adSetId, adSet.campaignId);
}

// Phase + maturity transition checks (Phase B → C, COLD_START → CALIBRATING etc.)
for (const adSet of adSets) {
  const newMaturity = classifyMaturity({
    conversions_total_meta: adSet.conversionsTotalMeta,
    days_with_pixel_data: adSet.daysWithPixelData,
    baseline_cv: 0, // computed by auto-calibrator
  });
  if (newMaturity !== adSet.dataMaturityMode) {
    await recordMaturityTransition(
      adSet.adSetId,
      adSet.dataMaturityMode,
      newMaturity,
      `auto_classify_${newMaturity}`,
      { conversions_total_meta: adSet.conversionsTotalMeta, days_with_pixel_data: adSet.daysWithPixelData },
    );
    await upsertAdSetState({ ...adSet, dataMaturityMode: newMaturity });
  }
  // Phase B → C transition check (per spec Q5):
  if (
    adSet.currentPhase === 'B' &&
    adSet.conversions7dMeta >= 50  // resolveThreshold('phase_b_to_c_conv_meta_7d', ctx)
  ) {
    await recordPhaseTransition(adSet.adSetId, 'B', 'C', 'meta_default_50/7d', { conversions7dMeta: adSet.conversions7dMeta });
    await upsertAdSetState({ ...adSet, currentPhase: 'C' });
  }
  // ... add other phase transition checks per spec section "Lifecycle state machine"
}
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/app/api/cron/advertising/__tests__/cron-handlers.test.ts -t "triage-daily"
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/app/api/cron/advertising/triage-daily/route.ts \
        src/app/api/cron/advertising/__tests__/cron-handlers.test.ts
git commit -m "feat(advertising/cron/triage-daily): snapshot writer + drift trigger + phase transitions"
```

- [ ] **Step 3: Notify coordinator** — Wave 2 / Track 24 complete.

---

# Track 25 — auto-calibrate cron (NEW)

**Owner:** Wave 2, agent 25
**Blockers:** T20
**Blocks:** none
**Files:**
- Create: `src/app/api/cron/advertising/auto-calibrate/route.ts`
- Create: `src/app/api/cron/advertising/auto-calibrate/__tests__/route.test.ts`
- Modify: `vercel.json` (add cron entry)

Sunday 03:00 UTC weekly cron invokes `runWeeklyCalibration`.

- [ ] **Step 1: Implement the route**

```ts
// src/app/api/cron/advertising/auto-calibrate/route.ts
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { runWeeklyCalibration } from '@/modules/advertising/senior-buyer/auto-calibrator';
import { TelegramBot } from '@/modules/advertising/alerts/telegram-bot'; // adjust import to existing pattern

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  // Auth: CRON_SECRET (per existing cron pattern)
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (process.env.ADVERTISING_AGENT_ENABLED !== 'true') {
    return NextResponse.json({ skipped: 'agent disabled' });
  }

  const dryRun = process.env.ADVERTISING_AGENT_DRY_RUN === 'true';
  const telegramBot = new TelegramBot({
    token: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
    dryRun,
  });

  try {
    const result = await runWeeklyCalibration({ telegramBot });
    console.info('[cron/advertising/auto-calibrate] complete', result);
    return NextResponse.json({ success: true, summary: result });
  } catch (err) {
    console.error('[cron/advertising/auto-calibrate] failed', err);
    Sentry.captureException(err, {
      tags: { cron: true, route: '/api/cron/advertising/auto-calibrate', subsystem: 'senior-buyer' },
    });
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add cron entry to vercel.json**

```json
{
  "path": "/api/cron/advertising/auto-calibrate",
  "schedule": "0 3 * * 0"
}
```

- [ ] **Step 3: Test the route**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/advertising/senior-buyer/auto-calibrator', () => ({
  runWeeklyCalibration: vi.fn().mockResolvedValue({
    ad_sets_processed: 2, thresholds_updated: 3, approvals_requested: 0, errors: 0,
  }),
}));

import { GET } from '../route';

describe('auto-calibrate route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'sec';
    process.env.ADVERTISING_AGENT_ENABLED = 'true';
    process.env.ADVERTISING_AGENT_DRY_RUN = 'true';
    process.env.TELEGRAM_BOT_TOKEN = 't';
    process.env.TELEGRAM_CHAT_ID = 'c';
  });

  it('rejects unauthorized requests', async () => {
    const res = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer wrong' } }));
    expect(res.status).toBe(401);
  });

  it('skips when agent disabled', async () => {
    process.env.ADVERTISING_AGENT_ENABLED = 'false';
    const res = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer sec' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: 'agent disabled' });
  });

  it('runs weekly calibration and returns summary', async () => {
    const res = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer sec' } }));
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; summary: { ad_sets_processed: number } };
    expect(body.success).toBe(true);
    expect(body.summary.ad_sets_processed).toBe(2);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/app/api/cron/advertising/auto-calibrate/__tests__/route.test.ts
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
git add src/app/api/cron/advertising/auto-calibrate vercel.json
git commit -m "feat(advertising/cron): auto-calibrate weekly cron (Sunday 03:00 UTC)"
```

- [ ] **Step 5: Notify coordinator** — Wave 2 / Track 25 complete.

---

# Track 26 — admin UI: thresholds page

**Owner:** Wave 2, agent 26
**Blockers:** T12
**Blocks:** none
**Files:**
- Create: `src/app/admin/advertising/thresholds/page.tsx`
- Create: `src/app/admin/advertising/thresholds/ThresholdRow.tsx`
- Create: `src/app/admin/advertising/thresholds/ThresholdHistory.tsx`
- Create: `src/app/admin/advertising/thresholds/actions.ts`
- Modify: `src/app/admin/advertising/layout.tsx` (add nav link)
- Modify: `src/app/admin/advertising/page.tsx` (add card link)

Mirror the `/admin/advertising/gates/` SC pattern. Lists current effective thresholds per metric, with source badge ('default' | 'auto_calibrated' | 'founder_override') and edit-in-place. Edit creates a new `advertising_thresholds` row with `source='founder_override'`.

- [ ] **Step 1: Read the existing gates pattern**

```bash
ls src/app/admin/advertising/gates/
sed -n '1,80p' src/app/admin/advertising/gates/page.tsx
```

Match its structure: page.tsx is a Server Component fetching from DB, child component is interactive Client Component for editing, actions.ts has Server Actions.

- [ ] **Step 2: Implement actions.ts**

```ts
// src/app/admin/advertising/thresholds/actions.ts
'use server';
import { getDb } from '@/shared/lib/db';
import { advertisingThresholds } from '@/shared/lib/schema';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { COLD_START_DEFAULTS, type ThresholdName } from '@/modules/advertising/senior-buyer/targets';
import { z } from 'zod';

const SaveSchema = z.object({
  scope: z.enum(['global', 'campaign', 'ad_set']),
  scope_id: z.string().nullable(),
  metric_name: z.string().refine((v) => v in COLD_START_DEFAULTS, { message: 'unknown metric' }),
  value: z.number().positive(),
  notes: z.string().max(500).optional(),
});

export async function saveThresholdAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  const { scope, scope_id, metric_name, value, notes } = parsed.data;
  await getDb().insert(advertisingThresholds).values({
    id: nanoid(),
    scope,
    scopeId: scope_id,
    metricName: metric_name,
    value,
    source: 'founder_override',
    effectiveFrom: new Date(),
    changedBy: 'founder',
    notes: notes ?? null,
    createdAt: new Date(),
  });
  revalidatePath('/admin/advertising/thresholds');
  return { ok: true };
}
```

- [ ] **Step 3: Implement page.tsx**

```tsx
// src/app/admin/advertising/thresholds/page.tsx
import { getDb } from '@/shared/lib/db';
import { advertisingThresholds } from '@/shared/lib/schema';
import { desc } from 'drizzle-orm';
import { COLD_START_DEFAULTS, type ThresholdName } from '@/modules/advertising/senior-buyer/targets';
import { ThresholdRow } from './ThresholdRow';

export const dynamic = 'force-dynamic';

export default async function ThresholdsPage() {
  const db = getDb();
  const allRows = await db
    .select()
    .from(advertisingThresholds)
    .orderBy(desc(advertisingThresholds.effectiveFrom));

  // Group: pick most recent per (scope, scopeId, metricName)
  const effectiveByKey = new Map<string, typeof allRows[number]>();
  for (const r of allRows) {
    const key = `${r.scope}:${r.scopeId ?? 'null'}:${r.metricName}`;
    if (!effectiveByKey.has(key)) effectiveByKey.set(key, r);
  }

  const metricNames = Object.keys(COLD_START_DEFAULTS) as ThresholdName[];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold mb-6">Thresholds</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="py-2">Metric</th>
            <th>Effective value</th>
            <th>Source</th>
            <th>Code default</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {metricNames.map((m) => {
            const row = effectiveByKey.get(`global:null:${m}`);
            return (
              <ThresholdRow
                key={m}
                metric={m}
                effectiveRow={row ?? null}
                codeDefault={COLD_START_DEFAULTS[m]}
              />
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 4: Implement ThresholdRow.tsx (Client Component)**

```tsx
// src/app/admin/advertising/thresholds/ThresholdRow.tsx
'use client';
import { useState } from 'react';
import { saveThresholdAction } from './actions';

export function ThresholdRow({ metric, effectiveRow, codeDefault }: {
  metric: string;
  effectiveRow: { value: number; source: string; effectiveFrom: Date | string } | null;
  codeDefault: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(effectiveRow?.value ?? codeDefault);
  const [pending, setPending] = useState(false);

  const onSave = async () => {
    setPending(true);
    await saveThresholdAction({
      scope: 'global',
      scope_id: null,
      metric_name: metric,
      value,
    });
    setPending(false);
    setEditing(false);
  };

  return (
    <tr className="border-t border-neutral-800">
      <td className="py-2 font-mono text-xs">{metric}</td>
      <td>
        {editing ? (
          <input
            type="number" step="0.01"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-24 rounded bg-neutral-900 px-2 py-1"
          />
        ) : (
          (effectiveRow?.value ?? codeDefault).toFixed(2)
        )}
      </td>
      <td>
        <span className={`text-xs ${effectiveRow?.source === 'founder_override' ? 'text-amber-400' : effectiveRow?.source === 'auto_calibrated' ? 'text-blue-400' : 'text-neutral-500'}`}>
          {effectiveRow?.source ?? 'default (code)'}
        </span>
      </td>
      <td className="text-neutral-500">{codeDefault.toFixed(2)}</td>
      <td>
        {editing ? (
          <>
            <button onClick={onSave} disabled={pending} className="text-emerald-400">Save</button>
            <button onClick={() => setEditing(false)} className="ml-2 text-neutral-500">Cancel</button>
          </>
        ) : (
          <button onClick={() => setEditing(true)} className="text-neutral-300">Edit</button>
        )}
      </td>
    </tr>
  );
}
```

- [ ] **Step 5: ThresholdHistory.tsx (drill-down — list all rows for a metric)**

```tsx
// src/app/admin/advertising/thresholds/ThresholdHistory.tsx
import { getDb } from '@/shared/lib/db';
import { advertisingThresholds } from '@/shared/lib/schema';
import { eq, desc } from 'drizzle-orm';

export async function ThresholdHistory({ metric }: { metric: string }) {
  const rows = await getDb()
    .select()
    .from(advertisingThresholds)
    .where(eq(advertisingThresholds.metricName, metric))
    .orderBy(desc(advertisingThresholds.effectiveFrom))
    .limit(20);

  return (
    <ul className="space-y-1 text-xs">
      {rows.map((r) => (
        <li key={r.id} className="font-mono">
          {new Date(r.effectiveFrom).toISOString().slice(0, 16)} — {r.value.toFixed(2)} ({r.source} by {r.changedBy})
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Add nav link in layout.tsx and card link in page.tsx**

In `src/app/admin/advertising/layout.tsx`, add `<Link href="/admin/advertising/thresholds">Thresholds</Link>` next to existing nav.

In `src/app/admin/advertising/page.tsx`, add a card linking to `/admin/advertising/thresholds`.

- [ ] **Step 7: Typecheck + lint + commit**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/app/admin/advertising/thresholds
git add src/app/admin/advertising/thresholds \
        src/app/admin/advertising/layout.tsx \
        src/app/admin/advertising/page.tsx
git commit -m "feat(advertising/admin): thresholds list + edit + history pages"
```

- [ ] **Step 8: Notify coordinator** — Wave 2 / Track 26 complete.

---

# Track 27 — admin UI: ad-set-state page

**Owner:** Wave 2, agent 27
**Blockers:** T13
**Blocks:** none
**Files:**
- Create: `src/app/admin/advertising/ad-set-state/page.tsx`
- Create: `src/app/admin/advertising/ad-set-state/AdSetStateCard.tsx`
- Modify: `src/app/admin/advertising/layout.tsx`, `page.tsx`

Lists every ad set with current phase, maturity mode, key metrics. Click drills into one card.

- [ ] **Step 1: Implement page.tsx**

```tsx
// src/app/admin/advertising/ad-set-state/page.tsx
import { getDb } from '@/shared/lib/db';
import { advertisingAdSetState } from '@/shared/lib/schema';
import { desc } from 'drizzle-orm';
import { AdSetStateCard } from './AdSetStateCard';

export const dynamic = 'force-dynamic';

export default async function AdSetStatePage() {
  const adSets = await getDb()
    .select()
    .from(advertisingAdSetState)
    .orderBy(desc(advertisingAdSetState.updatedAt));

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold mb-6">Ad Set State</h1>
      {adSets.length === 0 && (
        <p className="text-neutral-500">No ad sets yet — first triage-daily run will populate state rows.</p>
      )}
      <div className="grid gap-4">
        {adSets.map((s) => <AdSetStateCard key={s.adSetId} state={s} />)}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Implement AdSetStateCard.tsx**

```tsx
// src/app/admin/advertising/ad-set-state/AdSetStateCard.tsx
import type { AdvertisingAdSetState } from '@/shared/lib/schema';

const PHASE_COLOR: Record<string, string> = {
  A: 'bg-neutral-700',
  B: 'bg-amber-700',
  C: 'bg-emerald-700',
  D: 'bg-orange-700',
  PAUSED: 'bg-red-700',
  RETIRED: 'bg-neutral-800',
};

const MATURITY_COLOR: Record<string, string> = {
  COLD_START: 'text-neutral-500',
  CALIBRATING: 'text-amber-400',
  AUTONOMOUS: 'text-emerald-400',
};

export function AdSetStateCard({ state }: { state: AdvertisingAdSetState }) {
  return (
    <article className="rounded border border-neutral-800 p-4 text-sm">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="font-mono text-xs">{state.adSetId} <span className="ml-2 text-neutral-500">({state.locale})</span></h2>
        <span className={`rounded px-2 py-0.5 text-xs ${PHASE_COLOR[state.currentPhase] ?? 'bg-neutral-700'}`}>
          Phase {state.currentPhase}
        </span>
      </header>
      <dl className="grid grid-cols-[160px_1fr] gap-y-1">
        <dt className="text-neutral-500">Data maturity</dt>
        <dd className={MATURITY_COLOR[state.dataMaturityMode]}>{state.dataMaturityMode}</dd>
        <dt className="text-neutral-500">Optimization event</dt>
        <dd className="font-mono text-xs">{state.optimizationEvent}</dd>
        <dt className="text-neutral-500">Conversions (Meta 7d / 14d / total)</dt>
        <dd>{state.conversions7dMeta} / {state.conversions14dMeta} / {state.conversionsTotalMeta}</dd>
        <dt className="text-neutral-500">Days with Pixel data</dt>
        <dd>{state.daysWithPixelData}</dd>
        <dt className="text-neutral-500">ROAS 7d / CPA 7d</dt>
        <dd>{state.roas7d?.toFixed(2) ?? '—'} / ${state.cpa7d?.toFixed(2) ?? '—'}</dd>
        <dt className="text-neutral-500">Frequency</dt>
        <dd>{state.frequencyCurrent?.toFixed(2) ?? '—'}</dd>
        <dt className="text-neutral-500">Duplicates</dt>
        <dd>{state.duplicatesCount} / 2 (max)</dd>
        <dt className="text-neutral-500">Phase entered</dt>
        <dd>{new Date(state.phaseEnteredAt).toISOString().slice(0, 10)}</dd>
        {state.flaggedForReview && (
          <>
            <dt className="text-amber-400">⚠ Flagged</dt>
            <dd className="text-amber-400">{state.flagReason}</dd>
          </>
        )}
      </dl>
    </article>
  );
}
```

- [ ] **Step 3: Add nav + card links + commit**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint -- src/app/admin/advertising/ad-set-state
git add src/app/admin/advertising/ad-set-state \
        src/app/admin/advertising/layout.tsx \
        src/app/admin/advertising/page.tsx
git commit -m "feat(advertising/admin): ad-set-state list + drill cards"
```

- [ ] **Step 4: Notify coordinator** — Wave 2 / Track 27 complete.

---

# Track 28 — Aggregator: migration apply, gate flip plan, runbook

**Owner:** Coordinator (after T1-T27 merged)
**Blockers:** all of Wave 0 + Wave 1 + Wave 2
**Blocks:** none

This is the final coordination + ops step. It applies the DB migration, verifies all tests pass, ships to production, then plans the seniorBuyerMode gate flip.

- [ ] **Step 1: Apply DB migration**

```bash
# Local
npm run db:migrate

# Verify all 4 new tables exist
npm run db:studio  # Inspect interactively
```

For production: Vercel runs migrations automatically on deploy if Drizzle is wired into the build. If not, manually after deploy:
```bash
DATABASE_URL=$PRODUCTION_DATABASE_URL npm run db:migrate
```

- [ ] **Step 2: Pre-deploy gate**

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint
npx vitest run src/modules/advertising/meta-capi \
              src/modules/advertising/senior-buyer \
              src/modules/advertising \
              src/app/api/cron/advertising \
              src/app/api/webhooks \
              src/shared/lib
npm run advertising:pre-launch-check
npm run advertising:verify-prod-state
```

Expected: typecheck clean, lint baseline only, all advertising/webhook tests passing, both pre-launch + verify-prod-state report 0 errors.

- [ ] **Step 3: Deploy to prod**

```bash
git push origin main
# Vercel auto-deploys. seniorBuyerMode gate stays 'off'; agent continues running
# legacy Tier 1 path. ADVERTISING_AGENT_DRY_RUN remains 'true'.
```

Verify the auto-calibrate cron is registered:
```bash
vercel crons ls | grep auto-calibrate
```

- [ ] **Step 4: Stage 0 manual verification — Pixel + CAPI live**

The Pixel script and CAPI integration are LIVE as soon as the deploy goes out. Verify before flipping seniorBuyerMode:

```bash
# Verify Pixel script loaded
curl -s https://estrevia.app/ | grep -E "fbq|pixel|connect.facebook" | head -5
# Expected: see fbq('init', '<NEXT_PUBLIC_META_PIXEL_ID>') in the response

# Verify Pixel script in /es/ also
curl -s https://estrevia.app/es | grep -E "fbq" | head -5
```

Then in Meta Events Manager → Pixel → Test Events:
1. Visit / in browser (or set `META_CAPI_TEST_EVENT_CODE` and trigger CAPI calls) — expect PageView
2. Calculate a chart — expect ViewContent
3. Sign up via Clerk (test user) — expect Lead (server CAPI)
4. Complete a test Stripe sub — expect Subscribe (server CAPI)

Verify dedupe: Test Events page should show event_id matches between client and server. If it shows TWO events for the same Lead (one from client + one from server), dedupe is broken — fix `event_id` propagation in T18 / T11.

- [ ] **Step 5: Wait 48h for clean cron runs and Stage 0 stability**

The 4 advertising crons + new auto-calibrate cron should run cleanly:
- triage-hourly: every hour, no Sentry alerts
- triage-daily: daily 09:00 UTC, snapshots written to `advertising_ad_set_metric_history`
- retro-weekly: weekly Mon 09:00 UTC, gates evaluating real values
- audience-refresh: daily 06:00 UTC (from v3a)
- auto-calibrate: weekly Sun 03:00 UTC

After 48h of clean runs:
- `/admin/advertising/ad-set-state` shows 2 ad sets in COLD_START phase B
- Telegram digests fire without errors
- No new Sentry alerts in `subsystem: 'senior-buyer'` or `subsystem: 'meta-capi'`

- [ ] **Step 6: Flip seniorBuyerMode to 'on' (DRY_RUN still on)**

In `/admin/advertising/gates`, edit `seniorBuyerMode` mode from `'off'` to `'on'`. (Uses existing gate-edit UI.) Or directly in DB:

```sql
UPDATE advertising_feature_gates SET mode = 'on' WHERE id = 'seniorBuyerMode';
```

Now decide() routes through `evaluatePhase` + `approvalRoute` for both ad sets. Because `dataMaturityMode='COLD_START'` and `ADVERTISING_AGENT_DRY_RUN=true`, the agent will:
1. Route via approval-router → `cold_start_mode_suppression` for non-emergency decisions
2. Even if a decision DID get through, DRY_RUN short-circuits any Meta API mutation

Effectively a shadow run. Decisions are logged in `advertising_decisions` table for review.

- [ ] **Step 7: Wait 7 days, verify shadow logging**

Founder reviews `/admin/advertising/decisions` daily — should see lots of `cold_start_mode_suppression` rejections, possibly some Phase B extreme-failure pauses (which would apply if DRY_RUN were off).

Key question: does the senior-buyer logic produce sensible decisions vs the legacy path? Compare via shadow comparisons table.

- [ ] **Step 8: Maturity advancement check (T+14 days, T+30 days)**

After ad sets accumulate ≥50 conversions + ≥14 days with Pixel data, `data-maturity-classifier` graduates them to CALIBRATING. Check `/admin/advertising/ad-set-state` for the maturity badge color change (neutral → amber).

In CALIBRATING mode, all non-REVERSIBLE decisions route through LOW_RISK approval (founder Telegram approval). DRY_RUN still on — so even approved decisions don't mutate Meta.

- [ ] **Step 9: Auto-calibrator first run review (T+14 days, first Sunday after seniorBuyerMode=on)**

Sunday 03:00 UTC, auto-calibrate cron runs. Review:
- `/admin/advertising/thresholds` shows new rows with `source='auto_calibrated'` for the 2 ad sets
- If any threshold change >2×, founder receives Telegram approval prompt

- [ ] **Step 10: Flip ADVERTISING_AGENT_DRY_RUN to 'false' (final go-live)**

ONLY AFTER:
1. All 9 v3a fixes verified stable in production for ≥48 h (already done before this spec)
2. Stage 0 Pixel + CAPI shipping events to Meta cleanly for ≥7 days
3. seniorBuyerMode='on' running in shadow (DRY_RUN=true) for ≥7 days
4. At least 1 ad set has graduated to CALIBRATING mode AND founder has reviewed sample decisions
5. Auto-calibrator's first weekly run completed without errors

Then in Vercel:
```bash
vercel env add ADVERTISING_AGENT_DRY_RUN production
# Enter: false
vercel env pull --environment=production
npm run advertising:verify-prod-state
# Expected: 0 errors
```

Re-deploy to pick up the env change:
```bash
git commit --allow-empty -m "chore(advertising/v3b): flip DRY_RUN=false (full autonomous)"
git push origin main
```

- [ ] **Step 11: Post-flip verification (T+1h, T+24h)**

Monitor closely:
- Telegram alerts for any approval requests, account-emergency triggers, calibration approval requests
- Vercel runtime logs for cron successes (no Sentry alerts in advertising subsystems)
- Meta Ads Manager: verify any pause / duplicate / refresh_creative actions actually execute (no longer DRY_RUN)
- `/admin/advertising/decisions` shows real `applied: true` rows now

If anything looks wrong: immediately flip `ADVERTISING_AGENT_DRY_RUN=true` (kill switch). Investigate. Reset.

- [ ] **Step 12: Memory update after stable run**

After 7 days of clean autonomous runs, append to MEMORY.md:

```markdown
- [v3b Senior Buyer Mode shipped](project_advertising_v3b_shipped.md) — 2026-XX-XX Stage 0 (Pixel + CAPI) + senior-buyer 4-phase state machine + per-ad-set maturity + auto-calibrator live in production. ADVERTISING_AGENT_DRY_RUN=false. v3c backlog items are now eligible to pick up individually.
```

---

## Self-review checklist

Per writing-plans skill, before this plan can be considered ready:

- **Spec coverage** — every Q1-Q19 + Stage 0 + 4 DB tables + 5 phase policies + auto-calibrator's 4 protections + maturity-mode gating maps to a track ✓
- **No placeholders** — code blocks complete, bash commands explicit, no "TBD" or "implement later" ✓
- **Type consistency** — `CapiEventPayload` shape used identically in T2 + T11; `AdSetState` interface used consistently across T13/T15/T16/T17/T21; `AdDecision` shape stable across approval-router and policies ✓
- **Open questions resolved** — see "Resolved open questions" section below ✓

---

## Resolved open questions (from spec lines 1029-1034)

(a) **Migration of existing 2 ad sets at activation** — When seniorBuyerMode flips on (T28 Step 6), `triage-daily` (T24) creates state rows for both existing ad sets and assigns maturity from observed `daysWithPixelData` since Pixel install date (verifiable via Meta Pixel diagnostics page). NOT treated as fresh COLD_START — if Pixel has been live for ≥14 days AND conversions ≥50 by activation time, they enter CALIBRATING immediately.

(b) **Sentry tags for new modules** — Standardised pattern: `{ subsystem: 'meta-capi' | 'senior-buyer', phase?: 'A'|'B'|'C'|'D', ad_set_id?: string, db_layer?: 'drizzle' }`. Every cron-route catch block includes `cron: true` and `route: '/api/cron/...'`. Documented in "Conventions for ALL agents" above and applied per-track in T11/T20/T23/T24/T25.

(c) **Cron tick budget** — At MVP volume (2 ad sets) parallel evaluation is trivial. For >50 ad sets, batch round-robin in `triage-hourly` (process N ad sets per tick, rotate) — deferred to v3c. Not a blocker for v3b.

(d) **Thresholds admin UI specifics** — T26 implements list + edit-in-place + history (3 components matching the existing `/admin/advertising/gates/` SC pattern). Server Actions handle persistence (`saveThresholdAction`).

(e) **CAPI test events code env var** — `META_CAPI_TEST_EVENT_CODE` defaults UNSET in production. T11's `meta-capi/index.ts` reads it conditionally; absence means events route to live pipeline. Founder sets it locally / in staging only.

(f) **Meta `learning_stage_info` reliability** — When the field returns `null` / `UNKNOWN` from Meta Insights, fall back to `state.conversions7dMeta >= 50` as the maturity indicator (per spec Q5). T22 orchestrator uses `state.conversionsTotalMeta` directly; never reads `learning_stage_info` raw.

---

## Out of scope (per spec — do NOT touch in this plan)

- Calendar / seasonality awareness (v3 spec marks out-of-MVP; add JSON config when Q4 holidays approach)
- Telegram inbound commands (only outbound notifications + approval prompts)
- CBO migration (current ABO structure preserved)
- Multi-creative ad sets with per-variant kill (single-creative assumption maintained)
- Variance-based seasonality auto-detection
- Auto-iteration on creative generation (CLAUDE.md gate ~month 3+)
- LTV measurement infrastructure / cohort tracking — bootstrap with code-default $30 LTV until real data
- Replacement of Tier 2 (Bayesian) and Tier 3 (anomaly) — preserved as Phase C signal sources
- Audience size headroom checking (no Meta API endpoint wired)
- Per-campaign threshold overrides via config files — admin UI only
- Advanced matching for CAPI beyond external_id + email hash
- Conversions API offline events / direct-purchase upload
- All 7 v3c backlog items (LCA, factorial testing, disagreement alerts, persistent DropOffStore, stale-audience health, CSV export, admin shadow-log replay) — picked up individually after v3b stable for ≥4 weeks

---

## Aggregator — final pre-merge gate

**Owner:** Coordinator (after T1-T27 merged into main; before T28's deploy)

```bash
# Full test surface
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint
npx vitest run

# Specific advertising scope
npx vitest run src/modules/advertising/meta-capi \
              src/modules/advertising/senior-buyer \
              src/modules/advertising \
              src/app/api/cron/advertising \
              src/app/api/webhooks \
              src/shared/lib

# Operational scripts
npm run advertising:pre-launch-check
npm run advertising:verify-prod-state

# Migration apply (local + production)
npm run db:migrate
```

Confirm:
- Typecheck clean
- Lint baseline only (no new errors in advertising scope)
- All advertising / webhook / shared-lib tests passing
- Both pre-launch + verify-prod-state report 0 errors
- All 4 new tables present in production DB after migration

Then proceed with Track 28's deploy + verification + gate-flip plan.


