# Advertising Agent — Future Enhancements Backlog (v3c)

**Date:** 2026-05-03
**Author:** brainstorming session (founder + assistant)
**Scope:** observability, advanced features, and "nice-to-haves" deferred from v3a (Pre-flight Blockers) and v3b (Senior Buyer Mode). Each item below is independent; prioritization happens when v3a + v3b are stable in production and real data informs which is most valuable.
**Status:** **NOT approved for plan-writing.** Each item requires its own brainstorm + spec when picked up. This file is a tracked backlog, not an implementation spec.

**Depends on:** v3a + v3b shipped to production and stable for ≥4 weeks. Do not pick up items here while v3a/v3b are still being deployed/calibrated.

---

## Context

Today's audit (2026-05-03) identified 13+ functional/observability gaps in the advertising agent. After scope decomposition discussion with founder, items were split:
- **v3a Pre-flight Blockers (must ship before agent autonomous):** 9 critical fixes
- **v3b Senior Buyer Mode (the autonomous logic):** 4-phase state machine + auto-calibration
- **v3c Future Enhancements (this file):** 7 deferred items below

Each item here is non-blocking for going live. They become valuable when:
- v3a + v3b are stable (~4 weeks of clean production runs)
- Real data exists to validate that each enhancement solves a real problem (vs theoretical)
- Founder has bandwidth and observed need

---

## Backlog items

### Item 1 — Lookalike Audiences (LCA 1%, 5%, 10%)

**Source:** audit point #3.

**Problem:** Comment in `audience-refresh/route.ts:6` promises "rebuild lookalike seed audiences" but no LCA code exists. Senior media buyer would launch LCA 1%, 5%, 10% from existing customer seed in the first 2 weeks of a new campaign. Without LCA, expansion is limited to interest-based targeting + retargeting (small audiences).

**Trigger to pick up:** Existing customer seed audience (built by v3a fix #2) reaches ≥1000 emails. Below that, Meta refuses to create LCA reliably.

**Estimated effort:** 6-8 hours
- New `audiences/lookalike-builder.ts` module
- Meta Custom Audiences API: `customaudiences/{seed_id}/lookalikes` POST endpoint
- Per-locale LCA: EN markets (US/GB/CA/AU) and ES markets (MX/CO/CL/PE) need separate LCA per Meta API behavior
- LCA refresh cadence: weekly (existing customer churn requires re-build to stay accurate)
- New campaign-level wiring: agent should propose new ad set targeting LCA 1% as Phase D `propose_new_ad_set` action when Phase C exhaustion detected

**Open questions for the brainstorm:**
- Single LCA tier (just 1%) vs cascade (1% → 5% → 10% as 1% saturates)?
- Manual founder approval per LCA creation OR auto via v3b approval router?
- LCA from active subscribers seed vs paying-customers-LTV-weighted seed?

### Item 2 — Creative Testing Matrix (factorial A/B framework)

**Source:** audit point #7.

**Problem:** Tier 2 Bayesian compares full ad sets, not factorial design. No systematic A/B by `copy × image × CTA`. Winners determined empirically, not via structured testing framework.

**Trigger to pick up:** ≥3 winning creatives identified in production AND founder asks "what made these work" — that's the moment factorial testing pays off (need to isolate variables).

**Estimated effort:** 16+ hours (significant new system)
- Factorial design engine: pick 2-4 hooks × 2-4 images × 2-3 CTAs → 24-48 variants
- Multi-armed bandit allocation (vs full factorial — practical for budget)
- Per-variant tracking using Meta `ad_id` as factorial cell ID
- Win attribution via comparable-window from v3b
- Admin UI: factorial design builder, winner identification, automatic next-test suggestion

**Open questions for the brainstorm:**
- Bandit algorithm (Thompson sampling vs UCB1)?
- Budget split: dedicated factorial test pool vs hijacking existing winning ad set's spend?
- How to feed winners back into v3b (manual founder review vs auto-promote via duplicate)?

### Item 3 — Real-time Telegram alerts on Tier 2/3 disagreement

**Source:** audit point #12.

**Problem:** When Tier 2 (Bayesian) suggests scale but Phase C policy in v3b decides hold (or vice versa), this is a high-signal moment. Currently logged in `decisions` table but only surfaces in weekly retro digest — most valuable signal lost in noise.

**Trigger to pick up:** v3b Tier 2/3 actively contributing as Phase C signal sources (not just shadow). Until then there's nothing to disagree about.

**Estimated effort:** 2-3 hours
- New `senior-buyer/disagreement-alerter.ts` module
- After each Phase C decision, compare v3b output vs Tier 2 / Tier 3 outputs
- If signed disagreement (one says scale, other says pause): Telegram info alert with both reasonings
- Rate-limit: max 5 disagreement alerts per ad set per week (avoid spam during exploration)

### Item 4 — Persistent DropOffStore (Drizzle-backed)

**Source:** audit point #13.

**Problem:** `retro-weekly/route.ts` uses `new InMemoryDropOffStore()` per run. Each weekly retro starts with empty store. If anomaly arose Tuesday and resolved Wednesday, weekly retro on Monday doesn't see it.

**Trigger to pick up:** First time founder asks "did anything weird happen mid-week?" and the answer is "we have no record".

**Estimated effort:** 2-3 hours
- New `advertising_drop_off_baselines` Drizzle table
- Replace `InMemoryDropOffStore` with `DrizzleDropOffStore` (same interface)
- Append-only writes during daily ticks, weekly retro reads full history
- Retention: 90 days (similar to metric_history in v3b)

### Item 5 — Stale-audience health check

**Source:** audit point #15.

**Problem:** If `audience-refresh` cron silently degrades (no audiences created or stale `last_refreshed_at`), no alert fires. Currently the cron returns success even when 0 audiences updated — fix #2 in v3a partially addresses by counting `failed_audiences > 0`, but doesn't catch the case where everything succeeds with empty data.

**Trigger to pick up:** v3a fix #2 stable in production. Once we have real audience data flowing, stale detection becomes meaningful.

**Estimated effort:** 2 hours
- `account-health-weekly` cron extension: query `advertising_audiences.last_refreshed_at`
- Alert if any audience kind hasn't been refreshed in ≥7 days
- Telegram warning with affected audience kinds + last successful refresh timestamp

### Item 6 — Decision-log CSV/JSON export from admin UI

**Source:** audit point #16.

**Problem:** Daily digest is text-only Telegram. Serious post-mortem (e.g. founder wants to analyze "why did we pause ad_X 3 weeks ago?") requires clicking individual rows in admin UI — no bulk export.

**Trigger to pick up:** Founder runs first post-mortem + finds the manual click-through painful. Until then, premature feature.

**Estimated effort:** 2 hours
- New admin route `/admin/advertising/decisions/export` — Server Action
- Query `advertising_decisions` table with date range filter
- Stream CSV (or JSON) response with all fields including `metricsSnapshot`, `metaResponse`
- Date range default: last 30 days, configurable in URL params

### Item 7 — Admin UI shadow-log replay verification

**Source:** audit point #17.

**Problem:** Admin UI dashboard exists (creatives, decisions, gates, spend sections) but no verified ability to filter / replay shadow-log entries (legacy decision vs senior buyer decision when both ran in shadow mode).

**Trigger to pick up:** When v3b runs in shadow mode (per maturity classifier — happens for every new ad set in COLD_START / CALIBRATING stages), founder needs to review shadow comparisons. Verify if existing UI handles this; build only if missing.

**Estimated effort:** 1-3 hours (verify-only) OR 4-6 hours (if missing — build new component)
- First check: does existing `decisions/page.tsx` filter by `shadow_component`?
- If yes: add explicit "Show shadow comparisons" tab
- If no: NEW component `decisions/ShadowComparisonView.tsx` paired side-by-side with active decisions
- Sortable by ad_set_id, timestamp, agreement (true/false)

---

## Cross-cutting future considerations

These are not specific items but principles that influence future v3c work:

### Cost monitoring expansion

v3a introduces vision API calls (~$0.0002 per check). Future enhancements (LCA, factorial testing, additional Vision use cases) will increase cost. When monthly Meta + Vision + Claude API spend crosses $50/mo, build cost dashboard.

### Per-locale customization

Current spec assumes EN and ES ad sets behave similarly. Reality: LATAM market differs (lower CPM, longer consideration windows, different cultural triggers). When ES ad set conversion data ≥3 months exists, brainstorm per-locale threshold tuning.

### Multi-account support

Current spec assumes single Meta ad account. If Estrevia ever adds a second product or geographic expansion, multi-account support becomes relevant. Defer until business decision triggers it.

### LTV measurement loop

v3a/v3b assume LTV = $30 (median estimate from price math). Real LTV needs cohort data: 6+ months of subscription cycles + churn analysis. When founder says "we have 6 months of subscriber data", build LTV measurement infrastructure (cohort retention curves, ARPU evolution, LTV recalibration in `senior-buyer/targets.ts`).

---

## How to pick up an item from this backlog

1. Verify trigger condition met (each item lists its own).
2. Brainstorm the item separately via `superpowers:brainstorming` skill.
3. Save resulting spec to `docs/superpowers/specs/YYYY-MM-DD-<item-slug>-design.md`.
4. Spec → plan → implementation per standard workflow.
5. Update this file: mark the item as "promoted to spec YYYY-MM-DD-..." OR delete entry if shipped.

---

## Approval

This backlog itself does NOT require approval — it's a tracked deferral list, not a deliverable. Items are picked up individually with their own brainstorm + spec + plan cycles.

Original audit by founder 2026-05-03; scope decomposition agreed via Variant 2 (split into v3a/v3b/v3c).
