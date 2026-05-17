# Founder first-purchase smoke test

**Owner:** founder
**Duration:** ~1 hour
**Why:** `chart_readings = 0` at Wave 1 start (2026-05-17). Differentiate (a) no one wants to pay, (b) Stripe checkout broken, (c) post-purchase Pro flag not set, (d) AI Reading paywalled incorrectly. Without an end-to-end live test, Wave 2 paywall improvements are designed in the dark.

## Pre-flight

- [ ] Run the funnel baseline audit:
```bash
node scripts/advertising/_audit_funnel_baseline.mjs
```
Expected output includes a "Stripe prices validity" section showing `monthly` and `annual` both `active=true`, currency `usd`.

- [ ] Confirm Stripe is in **test mode** in the dashboard (top-right toggle). All steps below use a test card.

## Steps

1. **Open** `https://estrevia.app/en/pricing` in a fresh incognito window.

2. **Sign up** with a throwaway test email — suggested: `test+wave1-<YYYYMMDD>@estrevia.dev`. Complete Clerk sign-up flow.

3. **Click monthly upgrade.** Expected: redirect to Stripe Checkout within ~3 seconds. If a Clerk auth wall appears first, that is fine — sign in and continue.

4. **Fill Stripe Checkout** with test card:
   - Card number: `4242 4242 4242 4242`
   - Expiry: `12/30` (any future date)
   - CVC: `123`
   - ZIP: `10001` (any US ZIP for test mode)
   - Name on card: anything

5. **Submit payment.** Expected: success redirect to the Estrevia success page within ~5 seconds.

6. **Verify two emails in Resend dashboard** (https://resend.com/emails):
   - **After step 2 (sign-up):** `Welcome to Estrevia — your sidereal chart awaits` — from `src/emails/WelcomeEmail.tsx`, fired by Clerk webhook. Usually arrives within 30s of sign-up completion.
   - **After step 5 (purchase):** `Welcome to Estrevia Pro` — from `src/emails/PurchaseConfirmationEmail.tsx`, fired by Stripe webhook. Usually arrives within 1 minute of payment success.

7. **Verify DB state.** From a separate terminal in the project root (so `.env` is loadable). Substitute the literal date before running:

```bash
TEST_EMAIL='test+wave1-20260517@estrevia.dev'  # ← replace date with today
node --env-file=.env -e "
import('@neondatabase/serverless').then(async ({neon}) => {
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql('SELECT email, subscription_tier, subscription_status FROM users WHERE email = $1', [process.env.TEST_EMAIL]);
  console.log(rows);
});
" TEST_EMAIL=\"$TEST_EMAIL\"
```

Expected: `subscription_tier = 'premium'`, `subscription_status = 'active'`.

(Node 20+ has built-in `--env-file=.env` support, so no `dotenv` install needed.)

8. **Test AI Reading entitlement.** In the same incognito session:
   - Open `/en/chart`.
   - Submit a birth-data form (any synthetic birth data — do NOT use real PII).
   - On the chart page, locate the "Generate AI reading" CTA in `ChartReadingSection`.
   - Click it.
   - Expected: full reading content appears, **no paywall modal**.

## Cleanup

- [ ] In Stripe dashboard → Subscriptions → find the test sub → Cancel immediately (test mode is free; no charges, but keep the dashboard tidy).
- [ ] In Clerk dashboard → Users → find the test email → Delete user. (The `users` table has no soft-delete column; full deletion via Clerk cascades to the DB row via the existing user-deletion webhook.)
- [ ] **Safety:** double-check the test email string before any deletion — typing a real user's email will hard-delete that account.

## Outcome

Record one of the following inline below this section:

- [ ] **PASS** — all 8 steps succeeded. AI Reading appeared without paywall. Sub active in DB. Welcome email received.
- [ ] **FAIL at step N** — describe what happened. Capture screenshots / curl outputs / DB query results.
- [ ] **PARTIAL** — describe which steps passed, which failed.

### Outcome (fill in)

_Date:_ ___
_Result:_ ___
_Notes:_

---

If FAIL: open a Sentry issue with the smoke-test outcome attached and pause Wave 1 progression. The fix becomes a Wave 1 hotfix and writing-plans gets re-invoked.

If PASS: proceed to the rest of Wave 1 with confidence that the paid path is wired correctly end-to-end.
