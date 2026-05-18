# Advertising Agent Phase 1 — Env Flip Runbook

**Goal:** Safely flip `ADVERTISING_AGENT_ENABLED=true` in production while keeping `ADVERTISING_AGENT_DRY_RUN=true` (no real Meta API write actions).

**Pre-conditions:**
- Wave 3 Section 2 deployed (commits Tn for MIN_CONVERSIONS_BEFORE_ACTION).
- T4 seed script exists (per [[project-advertising-v3b-autonomy-fixes]] memory): `npm run seed:ad-set-states`.

## Step 1 — Verify env vars in Vercel production

In Vercel dashboard → Estrevia project → Settings → Environment Variables, confirm:

| Variable | Current | Action |
|---|---|---|
| `ADVERTISING_AGENT_ENABLED` | `false` | Note current — will change to `true` in Step 3 |
| `ADVERTISING_AGENT_DRY_RUN` | `true` | Keep `true` |
| `META_GRAPH_API_TOKEN` | (encrypted) | Verify not expired — Meta tokens roll every 90 days |
| `META_AD_ACCOUNT_ID` | `act_1435842067150024` | Per [[reference-meta-ad-account-id]] memory |
| `META_PAGE_ID` | `1087394517790815` | Per [[feedback-meta-page-selector-gotcha]] memory |
| `META_PIXEL_ID` | `1945750759636135` | Per [[project-advertising-audit-2026-05-17]] memory |

If `META_GRAPH_API_TOKEN` is missing or expired, refresh via Meta Business Manager → Business Settings → System Users → token rotation **before** continuing.

## Step 2 — Run T4 seed script

This seeds `advertising_ad_set_state` rows for currently live Meta ad sets so the phase machine has a starting state.

```bash
npm run seed:ad-set-states
```

**Expected output:** at least one row inserted per active Meta ad set. If zero, check `_audit_funnel_baseline.mjs` script for connectivity diagnostics.

**Verify in DB:**

```sql
SELECT COUNT(*) FROM advertising_ad_set_state;
```

Expected: ≥ 1.

## Step 3 — Flip ENABLED in Vercel env

Vercel dashboard → Settings → Environment Variables:

- `ADVERTISING_AGENT_ENABLED` → `true` (keep target: `Production`)
- Save → redeploy (Vercel will auto-redeploy on env change for production)

**Critical:** verify `ADVERTISING_AGENT_DRY_RUN=true` is still set after the redeploy. Open a fresh `vercel env ls` to confirm.

## Step 4 — Verify cron writes audit_actions

Wait 1 hour after redeploy. Then:

```sql
SELECT COUNT(*) AS recent_rows
FROM audit_actions
WHERE created_at >= NOW() - INTERVAL '1 hour';
```

**Expected:** ≥ 1.

If zero rows after 90 minutes:
- Check Vercel cron logs for `/api/cron/advertising/triage-hourly` — look for non-200 status or thrown errors
- Check `feature-gates` table — `seniorBuyerMode` gate may be off; agent in legacy tier-1-rules path is fine but verify decisions still write
- Manual trigger via `curl -X POST <prod-url>/api/cron/advertising/triage-hourly -H "Authorization: Bearer $CRON_SECRET"` and re-check

## Step 5 — Start weekly observation

Follow `docs/runbooks/advertising-agent-phase1-observability.md` every Friday.

## Step 6 (Wave 3.5, 4w+ later) — DRY_RUN=false

After 4 consecutive weeks satisfying observability acceptance criteria:
- Vercel env: `ADVERTISING_AGENT_DRY_RUN` → `false`
- Redeploy
- Monitor first 24h closely — agent now writes to real Meta API.

## Rollback plan

If anything looks wrong at any step:
- Vercel env: `ADVERTISING_AGENT_ENABLED` → `false` immediately
- Redeploy
- `audit_actions` rows already written are observation-only (no real Meta API actions in DRY_RUN), so no operational damage.

## Cross-references

- Spec §5: `docs/superpowers/specs/2026-05-17-wave-3-compound-growth-design.md`
- Observability runbook: `docs/runbooks/advertising-agent-phase1-observability.md`
- v3b ship: [[project-advertising-v3b-shipped]]
- v3b autonomy fixes: [[project-advertising-v3b-autonomy-fixes]]
