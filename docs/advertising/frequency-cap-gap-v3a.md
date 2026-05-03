# Frequency Cap Gap (v3a Track 11 — deferred)

**Date:** 2026-05-03
**Status:** deferred to v3b
**Spec source:** `docs/superpowers/specs/2026-05-03-advertising-pre-flight-blockers-design.md` Q3
**Plan source:** `docs/superpowers/plans/2026-05-03-advertising-pre-flight-blockers.md` Tracks 2 + 11

## What was attempted

v3a Track 2 + 11 set out to retrofit `frequency_control_specs={IMPRESSIONS, 7d, 10}` onto the two production ad sets (`META_LAUNCH_ADSET_ID_EN` and `META_LAUNCH_ADSET_ID_ES`) so Meta itself enforces a per-user impression cap, instead of relying solely on the post-fact tier-1 aggregate-frequency check.

## Why it failed

Meta API rejected the migration with:

```
code: 100
subcode: 1815198
httpStatus: 400
message: Invalid parameter
```

Root cause: `frequency_control_specs` is only accepted on ad sets whose `optimization_goal` is `REACH` (or, for some campaign objectives, `IMPRESSIONS`). Both production ad sets currently optimize for `LANDING_PAGE_VIEWS`:

```
EN — Launch — Sidereal interest    optimization_goal=LANDING_PAGE_VIEWS  billing_event=IMPRESSIONS
ES — Launch — Astrología sidérea   optimization_goal=LANDING_PAGE_VIEWS  billing_event=IMPRESSIONS
```

This is a Meta platform constraint that the v3a spec did not account for — neither the design nor the plan flagged it during brainstorming.

## Why we're not switching to REACH

Switching `optimization_goal` from `LANDING_PAGE_VIEWS` to `REACH` (or `IMPRESSIONS`) would allow `frequency_control_specs`, but it triggers a Meta learning-phase reset on the affected ad sets. With ~$20/day combined spend, a reset costs roughly 2 days × $20 = ~$40 of learning re-acquisition, *and* it changes the auction objective in a way that contradicts our acquisition funnel (LPV → user_registered → subscription_started). Senior-buyer principles (per memory `feedback_meta_learning_phase`) explicitly forbid actions that reset learning on a non-emergency basis.

## What protects us in the meantime

- **Tier-1 aggregate cap** (`src/modules/advertising/decide/tier-1-rules.ts`) still pauses ad sets when aggregate `frequency >= 4.0`. This is post-fact (some users may be at 6-8 impressions before aggregate hits 4.0) but it bounds the worst case.
- **Tier-1 learning-phase guard** (now `LEARNING_PHASE_DAYS = 7`, raised from 2 in Track 1) prevents premature pauses during Meta's calibration window.
- **Reconciler global suspend** (Track 8) automatically pauses all non-emergency decisions on critical Meta-vs-PostHog drift, with 24h auto-resume + admin UI override.

## Path forward

Two viable options for v3b:

1. **Hybrid event switch graduates optimization** (per spec Q11). When per-ad-set `user_registered` events reach ≥50/week, v3b's data-maturity classifier will switch optimization from `LANDING_PAGE_VIEWS` → `Lead`. Switching to `Lead` (a conversion event) is a deliberate spec-mandated reset moment. **At that point**, retrofit `frequency_control_specs` opportunistically — the learning is being reset anyway.
2. **Add per-user frequency control to v3b decide-layer** — track `frequency_per_user_distribution` from Meta Insights `actions` field and pause earlier (e.g., at p90 frequency >= 8) before aggregate hits 4.0. This is application-layer fallback for the Meta-platform feature we can't use today.

Both approaches are out of v3a scope. v3b spec already includes Q11 (hybrid event switch); the per-user frequency tracking can be an add-on to Phase B/C/D policies (`docs/superpowers/specs/2026-05-03-senior-media-buyer-mode-design.md`).

## Migration script status

`scripts/advertising/migrate-frequency-caps.ts` (created in Track 2) is left in place — it will be useful when v3b switches optimization goals. It is dry-run-able and idempotent, with an explicit "fail loud, half-migration is bad" semantic. No code change needed; just don't call it until Meta accepts the parameter.

## Detection summary (for future-me)

When `MetaValidationError` with `subcode: 1815198` surfaces from `updateAdSet({ frequencyControlSpecs })`, the ad set's `optimization_goal` is incompatible with frequency control. Check via:

```
GET /v22.0/<adset_id>?fields=optimization_goal,billing_event
```

If `optimization_goal != REACH` (and not the few other compatible objectives Meta documents), this code path is blocked at the platform level.
