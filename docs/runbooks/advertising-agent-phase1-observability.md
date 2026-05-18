# Advertising Agent Phase 1 — Observability Runbook

**Goal:** Monitor advertising-agent decisions weekly during the DRY_RUN observation period.

**Pre-conditions:**
- `ADVERTISING_AGENT_ENABLED=true` in production env
- `ADVERTISING_AGENT_DRY_RUN=true` in production env (no real Meta API actions)
- Cron `triage-hourly` running (writes to `audit_actions` table)
- Wave 3 Section 2 deployed (commits Tn for MIN_CONVERSIONS_BEFORE_ACTION)

## Weekly KPIs (run every Friday, ~10 min)

### 1. Decision count by action (proves agent is evaluating)

SQL against Neon (or copy-paste into Drizzle Studio):

```sql
SELECT
  action,
  COUNT(*) AS n
FROM audit_actions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY action
ORDER BY n DESC;
```

**Expected:** at least one row per active ad set per day in `hold`, `maintain`, `pause`, or `scale`. If zero rows, cron is broken.

### 2. False positive count (proves judgment match)

```sql
SELECT
  COUNT(*) AS n_overridden,
  100.0 * COUNT(*) / NULLIF(SUM(CASE WHEN action IN ('pause','scale','edit') THEN 1 ELSE 0 END), 0) AS pct
FROM audit_actions
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND founder_overridden = true;
```

**Target:** pct < 5%. If ≥ 5% two weeks in a row, surface to debug — likely tier-1-rules threshold or v3b phase logic miscalibrated.

(If `founder_overridden` column doesn't yet exist, manual review against Meta Ads Manager substitutes; add column in Wave 3.5.)

### 3. Hold reasons breakdown

```sql
SELECT
  CASE
    WHEN reason LIKE 'learning_phase%' THEN 'learning_phase'
    WHEN reason LIKE 'insufficient_conversions%' THEN 'insufficient_conversions'
    WHEN reason LIKE 'frequency_cap%' THEN 'frequency_cap'
    WHEN reason LIKE 'cpc_hard_cap%' THEN 'cpc_hard_cap'
    WHEN reason LIKE 'spend_daily_overage%' THEN 'spend_daily_overage'
    ELSE 'other'
  END AS reason_class,
  action,
  COUNT(*) AS n
FROM audit_actions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY n DESC;
```

**Expected:** `insufficient_conversions` should appear on every ad set with <50 weekly conversions during the first 1-2 weeks. If `insufficient_conversions` count is 0 but we know ad sets are underconverting, the new guard isn't wired into the active phase path (v3b senior buyer mode may bypass it — verify via orchestrator code).

### 4. Top-3 paused + top-3 scaled

```sql
(SELECT ad_id, action, reason, created_at
 FROM audit_actions
 WHERE action = 'pause' AND created_at >= NOW() - INTERVAL '7 days'
 ORDER BY created_at DESC LIMIT 3)
UNION ALL
(SELECT ad_id, action, reason, created_at
 FROM audit_actions
 WHERE action = 'scale' AND created_at >= NOW() - INTERVAL '7 days'
 ORDER BY created_at DESC LIMIT 3);
```

For each row, look up the ad creative in Meta Ads Manager and judge: does the decision match what you would do? If 3 in a row don't match, the agent is miscalibrated — open issue.

## Acceptance criterion for DRY_RUN=false flip

**4 consecutive weeks** with `pct < 5%` false positives + all 3 top-paused ads sanity-check as correct paws + all 3 top-scaled ads sanity-check as correct.

When met, proceed to Wave 3.5 Phase 2 — flip `ADVERTISING_AGENT_DRY_RUN=false` (real Meta API actions).

## Cross-references

- Spec §5: `docs/superpowers/specs/2026-05-17-wave-3-compound-growth-design.md`
- Env-flip runbook: `docs/runbooks/advertising-agent-phase1-env-flip.md`
- Memory: [[feedback-meta-learning-phase]] (stale on LEARNING_PHASE_DAYS=2; correct on conversion guard rationale)
