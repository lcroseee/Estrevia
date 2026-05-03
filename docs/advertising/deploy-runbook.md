# Advertising Agent — Deploy Runbook

**Date:** 2026-05-03
**Audience:** founder + on-call

This runbook covers the three deployment stages: v3a pre-flight, v3b Stage 0
(Pixel + CAPI), and v3b autonomous flip. Run each stage's checks in order
and do NOT proceed until all green.

---

## Stage 1 — v3a Pre-flight (this spec)

**Pre-deploy:**

```bash
# 1. Clean local state
git status                                   # working tree clean on main
git pull --ff-only origin main

# 2. Local verification
npm install
NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck
npm run lint
npx vitest run src/modules/advertising src/app/api/cron/advertising scripts/advertising

# 3. Pre-launch script
npm run advertising:pre-launch-check
# Expect: 0 errors

# 4. Production env audit (must run vercel env pull first)
vercel env pull --environment=production
npm run advertising:verify-prod-state
# Expect: 0 errors. ADVERTISING_AGENT_DRY_RUN=true is REQUIRED for this stage.
```

**Deploy:**

```bash
git push origin main          # Vercel auto-deploys
```

**Post-deploy verification (T+15min):**

```bash
# Force-trigger each cron and inspect logs
vercel crons run /api/cron/advertising/triage-hourly
vercel crons run /api/cron/advertising/triage-daily
vercel crons run /api/cron/advertising/audience-refresh
vercel crons run /api/cron/advertising/retro-weekly
```

Verify in Vercel runtime logs:
- `audience-refresh`: summary shows non-zero `total_audiences` and zero `failed_audiences`
- `triage-daily`: reconciler did not suspend (or suspended deliberately if drift exists)
- `retro-weekly`: feature gate evaluation receives non-zero `total_impressions` / `days_running`
- No "Vision check failed" / "GEMINI_API_KEY not set" warnings

**Coordinator-only operational step (Track 11):**

```bash
# Verify the migration script runs in dry-run first
DRY_RUN=true vercel env pull --environment=production
DRY_RUN=true ENVIRONMENT=production npm run advertising:migrate-frequency-caps

# Founder confirms — then live run
npm run advertising:migrate-frequency-caps
```

Verify in Meta Ads Manager UI: Ad Set → Frequency Cap = 10/7 days for both EN and ES ad sets.

---

## Stage 2 — v3b Stage 0 (Pixel + CAPI)

**Hard prerequisite:** Stage 1 fully shipped + verified stable for 48h.

(Detailed checklist lives in v3b plan — this section is a placeholder
pointing to that runbook section.)

---

## Stage 3 — v3b Autonomous flip

**Hard prerequisite:** Stage 2 verified stable for 48h. Founder reviews
`/admin/advertising/ad-set-state` page — sanity check phase distribution.

(Detailed checklist lives in v3b plan.)
