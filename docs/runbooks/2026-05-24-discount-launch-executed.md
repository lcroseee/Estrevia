# Discount-launch — EXECUTED 2026-05-24 19:50–20:05 UTC

Companion to [`2026-05-24-discount-launch.md`](2026-05-24-discount-launch.md). That doc was the **planned** runbook; this one records what **actually happened** when Claude (with explicit founder authorization "делай всё сам") executed it through DB + Vercel CLI/MCP.

---

## What ran successfully

### 1. DB migrations — all 4 applied via Neon Pool

```
ALTER TABLE email_leads ADD COLUMN paywall_teaser_variant text   ✅
CREATE TABLE sent_cart_abandon_emails (+ index)                  ✅
CREATE TABLE sent_trial_emails (+ unique idx + user idx)         ✅
CREATE TABLE sent_dunning_emails (+ unique idx + user idx)       ✅
```

**Detail:** initial attempt via `@neondatabase/serverless` HTTP `sql.unsafe()` reported success but **silently failed** (writes did not commit). Workaround: switched to `Pool` + `ws` (websocket) — DDL committed correctly. See `_send_trial_expiration_backfill_inline.mts` for the pattern.

### 2. Vercel env vars — 5 of 6 set via CLI

| Env var | Production | Preview | Development |
|---|---|---|---|
| `STRIPE_COUPON_TEASER20` = `TEASER20` | ✅ | ❌ v53 bug | ✅ |
| `CART_ABANDON_DRY_RUN` = `false` | ✅ | — | — |
| `TRIAL_EXPIRATION_DRY_RUN` = `false` | ✅ | — | — |
| `DUNNING_DRY_RUN` = `false` | ✅ | — | — |

**Preview failure:** Vercel CLI v53.2.0 has a known bug — `env add preview` silently fails with `git_branch_required` (see memory `feedback_vercel_cli_preview_yes_bug`). Production-only is fine for launch; preview env can be added later via Dashboard or after upgrading to CLI v54+.

### 3. Redeploy — `dpl_3tr5ZrBApCkWr6Fy8L9nohfiL9Zc` aliased to estrevia.app

Rebuild of same source commit `3f65f1b` but with new env vars applied. ~2 min build. No code change.

### 4. Trial-expiration backfill — 2 LIVE emails sent

| Email | resend_message_id | sent_at |
|---|---|---|
| durand.lisaanne@gmail.com (`sub_1Ta7mfDoVTUWyGzGg3IJpNWR`) | `c6095610-325a-4a21-afec-eb5ec623fbcb` | 19:56:36 UTC |
| haileyanda8399@icloud.com (`sub_1Ta5QQDoVTUWyGzGIYTrakB4`) | `755e76d6-a31a-4444-b368-ae13852cc08d` | 19:56:36 UTC |

Subject: "Your Estrevia Pro trial ends in 3 days". HTML ~5.3 KB / text 1 KB.

**Note:** the planned runbook referenced `_send_trial_expiration_backfill.mjs`, but that script has two bugs (imports `postgres` package not in deps; imports `server-only`-guarded module). I wrote a self-contained alternative `_send_trial_expiration_backfill_inline.mts` that:
- Uses `postgres` via `npm install --no-save` (doesn't pollute lockfile)
- Renders email templates directly via `@react-email/render` (no server-only path)
- Resolves the tsx double-default-export wrap (`mod.default.default`)
- Inserts row to `sent_trial_emails` with the Resend message id

### 5. Cart-abandon cron — endpoint smoke-tested

```
GET /api/cron/cart-abandon-daily
→ {"cohortSize":0,"sent":0,"skipped":0,"failed":0,"dryRun":false,"durationMs":957}
```

`dryRun: false` confirms env vars are live. `cohortSize: 0` is expected — PostHog cohort query requires lead to be in `email_leads` table AND have fired `paywall_opened`/`checkout_stripe_redirected` AND have NOT fired `subscription_started`. Most paywall-viewing users at audit time were anonymous (not email-captured), so the join filters them out. Tomorrow's 07:00 UTC cron will re-evaluate.

### 6. Trial-expiration cron — fired trial_ended for jaderising44

```
GET /api/cron/trial-expiration
→ {"ok":true,"processed":1,"sent":0,"skipped":1,"errors":[]}
```

Side effect noticed in DB: 3rd row in `sent_trial_emails`:
- `trial_ended | sub_1TZGVTDoVTUWyGzGXOb0UFey | jaderising44@gmail.com | 20:00:06 UTC`

Cron's response said "skipped: 1" but the DB row + `resend_message_id` not null confirms the email **was actually sent**. Minor metric-counting bug in cron route (it counts skipped where it should count sent). jaderising44 is `past_due` since 2026-05-23; sending `trial_ended` to her is the correct T2 behavior.

---

## Current DB state (2026-05-24 20:05 UTC)

```
sent_trial_emails:          3 rows
  - reminder_3d × 2 (durand, hailey, my backfill)
  - trial_ended × 1 (jaderising44, T2 cron auto-fire)
sent_cart_abandon_emails:   0 rows
sent_dunning_emails:        0 rows
email_leads.paywall_teaser_variant: 254 NULL (existing leads, by design)
```

Cart-abandon zero is expected. Dunning zero is expected (no `invoice.payment_failed` webhook has fired since I flipped `DUNNING_DRY_RUN=false`; next Stripe retry on destinig/jaderising will trigger it).

---

## Still founder action (Dashboard-only, not API-controllable)

### 🟡 Stripe Smart Retries

https://dashboard.stripe.com/settings/billing/automatic

Toggle "Smart Retries" ON. Optionally turn OFF Stripe's built-in dunning emails (T1 dunning replaces them with branded copy).

This step requires Stripe Dashboard — no API. ~30 seconds of clicking.

### 🟢 (Optional) Add preview env for STRIPE_COUPON_TEASER20

Either:
- Upgrade Vercel CLI: `npm i -g vercel@latest` → re-run `vercel env add STRIPE_COUPON_TEASER20 preview`
- Or click "Add" in Vercel Dashboard for the Preview environment

Only affects PR preview deployments, not production. Low priority.

### 🟢 (Optional) Enable trial-end win-back coupon

Set `TRIAL_WINBACK_COUPON_CODE=TEASER20` in Vercel → Production. After this, the T-0 trial_ended email will include a 20% off offer (same coupon as cart-abandon and paywall_teaser variant C).

---

## When users actually receive discount emails — updated forecast

| Channel | First send |
|---|---|
| T2 reminder_3d (durand, hailey) | ✅ ALREADY SENT 19:56 UTC today |
| T2 trial_ended (jaderising44) | ✅ ALREADY SENT 20:00 UTC today (T2 cron auto-fire) |
| T2 reminder_1d (durand) | ~2026-05-25 03:00 UTC (cron picks up when hours_until_trial_end ≤ 26) |
| T2 reminder_1d (hailey) | ~2026-05-25 00:30 UTC |
| T1 dunning D0 | Next `invoice.payment_failed` webhook for destinig/jaderising (per Stripe retry schedule — depends on Smart Retries setting) |
| T3 cart-abandon | **Tomorrow 2026-05-25 07:00 UTC** daily cron (cohort recomputed against live PostHog) |
| T4 paywall_teaser variant C | ~2026-05-31 (T+7d after first new lead created post-deploy gets assigned variant C) |

---

## Lessons captured for memory

1. **Neon HTTP `sql.unsafe()` silently fails on DDL** — use `Pool` + `ws` for migrations.
2. **tsx double-wraps CJS default exports** — `(mod.default?.default ?? mod.default)` for safe import.
3. **`server-only` package guard fires under tsx execution** — either remove the import for backfill scripts or render templates inline.
4. **Vercel CLI v53 `env add preview` silently fails** — workaround documented in memory.
5. **Cron response metric off-by-one** — `trial-expiration` cron returns `skipped` where it sent. Worth fixing in a follow-up but doesn't affect behavior.

---

## Total wall-clock execution

~15 min from "делай всё сам" → email delivery to durand+hailey. Compared to founder doing it manually: ~10-15 min same, but with auto-fix workarounds for the 5 papercuts above.
