# Discount-launch runbook — 2026-05-24

**Goal:** activate 4 marketing email channels (T1 dunning, T2 trial-expire, T3 cart-abandon, T4 paywall_teaser A/B) shipped in commits 40865dc..d4b0434 today.

**Critical deadline:** 2026-05-26 02:36–05:07 UTC. `durand.lisaanne` + `haileyanda8399` trials expire. Without backfill in section 4, they receive zero warning.

**Execution time:** 10–15 min total.

---

## 0. Pre-flight (1 min)

```bash
cd /Users/kirillkovalenko/Documents/Projects/Estrevia
git pull origin main   # should be at 40865dc or later
git log --oneline -3
```

Expected: top commits are `40865dc chore(audit)...`, `d4b0434 refactor(marketing/T7)...`, `cdc69f6 fix(migrations/T6)...`.

---

## 1. Apply 4 DB migrations (3 min)

Order doesn't matter (independent tables), but run sequentially to surface errors clearly.

```bash
# Loads $DATABASE_URL from .env
export $(grep -v '^#' .env | grep DATABASE_URL | xargs)

psql "$DATABASE_URL" -f drizzle/0014_paywall_teaser_abtest.sql
psql "$DATABASE_URL" -f drizzle/0015_cart_abandon_emails.sql
psql "$DATABASE_URL" -f drizzle/0016_trial_expiration_emails.sql
psql "$DATABASE_URL" -f drizzle/0017_dunning_emails.sql
```

**Expected output:** each file prints `ALTER TABLE` (0014) or `CREATE TABLE` + `CREATE INDEX` (0015–0017). No errors.

**If any fail with "already exists":** migration was previously applied — safe to skip that one and continue.

**Verify all four applied:**
```bash
psql "$DATABASE_URL" -c "
  SELECT tablename FROM pg_tables
  WHERE schemaname='public'
    AND tablename IN ('sent_cart_abandon_emails','sent_trial_emails','sent_dunning_emails')
  ORDER BY tablename;
"
psql "$DATABASE_URL" -c "
  SELECT column_name FROM information_schema.columns
  WHERE table_name='email_leads' AND column_name='paywall_teaser_variant';
"
```

Expected: 3 tables listed, 1 column listed.

---

## 2. Set Vercel env vars (2 min)

Two new vars + one optional. All three environments (Production, Preview, Development).

### Via Vercel Dashboard

1. https://vercel.com/lcrose/estrevia/settings/environment-variables
2. Add:

   | Key | Value | Environments |
   |---|---|---|
   | `STRIPE_COUPON_TEASER20` | `TEASER20` | Production, Preview, Development |
   | `CART_ABANDON_DRY_RUN` | `false` | Production |
   | `TRIAL_EXPIRATION_DRY_RUN` | `false` | Production |
   | `DUNNING_DRY_RUN` | `false` | Production |
   | `TRIAL_WINBACK_COUPON_CODE` | `TEASER20` | Production (optional — enables 10% off in T-0 trial-end email) |

3. Click **Redeploy** on the latest deployment (env-var changes don't auto-redeploy)

### Via CLI (alternative)

Per memory `feedback_vercel_cli_preview_yes_bug`, CLI v53 has issues with `preview --yes`. Use Dashboard or upgrade to v54 first: `npm i -g vercel@latest`.

```bash
vercel env add STRIPE_COUPON_TEASER20 production
# Paste: TEASER20
vercel env add STRIPE_COUPON_TEASER20 preview
vercel env add STRIPE_COUPON_TEASER20 development

vercel env add CART_ABANDON_DRY_RUN production
# Paste: false
vercel env add TRIAL_EXPIRATION_DRY_RUN production
vercel env add DUNNING_DRY_RUN production

vercel --prod   # redeploy
```

---

## 3. Stripe Dashboard — enable Smart Retries (1 min)

https://dashboard.stripe.com/settings/billing/automatic

- **Smart Retries**: ON
- Retry schedule: default (Stripe's optimized curve hits the right days for T1 dunning sequence)

Optional but recommended:
- Customer emails for failed payments: OFF (T1 dunning handles this with branded copy)
- Reminder for expiring trials: OFF (T2 handles this)

---

## 4. Backfill durand+hailey — TRIAL EXPIRATION EMAILS (2 min) 🔴 TIME-CRITICAL

These two have trials expiring in <30 hours. Without this they get zero warning.

**Dry-run first:**
```bash
node scripts/qa/_send_trial_expiration_backfill.mjs
```

Expected output: lists 2 subscriptions (`durand.lisaanne`, `haileyanda8399`), shows which step each would receive (`reminder_3d`), confirms no rows would be written.

**If dry-run looks correct, send real:**
```bash
node scripts/qa/_send_trial_expiration_backfill.mjs --live
```

Expected: 2 emails sent, 2 rows in `sent_trial_emails`.

**Verify in Resend dashboard:** https://resend.com/emails — top 2 entries should be to durand+hailey, subject ~"Your trial ends in 3 days".

---

## 5. Smoke-test cart-abandon cron (2 min)

Hit the endpoint manually to confirm it parses the cohort correctly. With `CART_ABANDON_DRY_RUN=false` (just set in step 2), the next call WILL send real emails. So this MUST be done AFTER step 2 finishes redeploying.

```bash
# Fetch CRON_SECRET from Vercel env
CRON_SECRET=$(grep CRON_SECRET .env | cut -d= -f2)
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://estrevia.app/api/cron/cart-abandon-daily
```

Expected response: JSON with `cohort_size`, `sent_count`, `skipped_count`. First real run should hit ~14 cohort (10 EN + 4 ES per audit).

**If cohort > 50** — STOP and re-flip `CART_ABANDON_DRY_RUN=true`. Something wrong with PostHog query (false positives).

---

## 6. Verify everything fired (1 min)

```bash
# Trial expiration sends
psql "$DATABASE_URL" -c "
  SELECT subscription_id, step, sent_at, resend_message_id IS NOT NULL AS sent_ok
  FROM sent_trial_emails ORDER BY sent_at DESC LIMIT 5;
"

# Cart-abandon sends
psql "$DATABASE_URL" -c "
  SELECT lead_id, sent_at, resend_message_id IS NOT NULL AS sent_ok
  FROM sent_cart_abandon_emails ORDER BY sent_at DESC LIMIT 5;
"

# Dunning (fires on Stripe invoice.payment_failed)
psql "$DATABASE_URL" -c "
  SELECT subscription_id, dunning_step, billing_period_start, sent_at
  FROM sent_dunning_emails ORDER BY sent_at DESC LIMIT 5;
"

# Paywall_teaser variant assignment (new leads from now on)
psql "$DATABASE_URL" -c "
  SELECT paywall_teaser_variant, COUNT(*)
  FROM email_leads
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY 1;
"
```

---

## When users actually receive emails

| Channel | First send |
|---|---|
| T2 trial backfill (durand+hailey) | **Within 5 min of step 4** |
| T2 trial-expiration (new trials) | On next Stripe `customer.subscription.trial_will_end` webhook (~3 days before any new trial ends) |
| T1 dunning | On next Stripe `invoice.payment_failed` webhook (could fire on destinig/jaderising next retry attempt — Stripe retries Smart-schedule) |
| T3 cart-abandon | **Tomorrow at 07:00 UTC** (2026-05-25 07:00 UTC) — daily cron |
| T4 paywall_teaser variant C | **~7 days after step 1** — only for NEW leads created AFTER migration 0014 applied (existing 200+ leads have NULL variant) |

---

## Rollback (if anything goes wrong)

```bash
# Re-arm DRY_RUN on any specific channel
vercel env rm CART_ABANDON_DRY_RUN production
vercel env add CART_ABANDON_DRY_RUN production
# Paste: true
vercel --prod
```

Migrations: all 4 are additive (ADD TABLE / ADD COLUMN). To rollback:
```bash
psql "$DATABASE_URL" -c "DROP TABLE sent_dunning_emails CASCADE;"
psql "$DATABASE_URL" -c "DROP TABLE sent_trial_emails CASCADE;"
psql "$DATABASE_URL" -c "DROP TABLE sent_cart_abandon_emails CASCADE;"
psql "$DATABASE_URL" -c "ALTER TABLE email_leads DROP COLUMN paywall_teaser_variant;"
```

⚠️ Dropping tables loses send-audit log. Only do this if a migration was applied wrong.

---

## Done criteria

- [ ] 4 migrations applied (verified by SELECT in step 1)
- [ ] 4 env vars set in Vercel Production (verified in Dashboard)
- [ ] Stripe Smart Retries: ON
- [ ] durand+hailey received trial reminder (verified in Resend Dashboard)
- [ ] Cart-abandon cron smoke-test returned cohort_size ≤ 50
- [ ] No errors in Vercel logs for last 5 min

---

## Next 7 days — what to watch

Resend Dashboard → Emails → Filter by tag:
- **dunning-***: should see destinig/jaderising emails when Stripe retries
- **trial-expiration-***: should see new trial_will_end fires
- **cart-abandon**: 07:00 UTC daily, count = current cohort

Stripe Dashboard → Subscriptions → past_due:
- destinig7996, jaderising44 — should either recover (card updated → succeeded) or move to canceled after 4 retries

PostHog:
- New `subscription_started` events should attribute via `metadata.utm_source=cart-abandon` (T3) or `utm_source=email` + `experiment_variant=C` (T4)

---

## Reference

- Commits: `cdc69f6..40865dc` on main
- Specs: `docs/specs/{cart-abandon-email,trial-expiration,paywall-teaser-abtest}.md`
- T1 spec: `docs/superpowers/specs/2026-05-24-dunning-sequence-design.md`
- T5 pricing audit: `docs/audits/pricing-audit-2026-05-24.md`
- Audit reports: `tmp/audit-2026-05-24/{meta,posthog,stripe,resend}.md` (gitignored, in local worktree)
