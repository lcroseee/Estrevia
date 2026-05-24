# Dunning Sequence Brainstorm — T1

Date: 2026-05-24

## Problem statement

Two users are in `past_due` with $39.98 combined MRR at risk. Zero dunning emails have
been sent. Stripe retries automatically but does not send emails — that is our job.
Recovery target: 70% (soft declines) × $39.98 ≈ $28 expected.

## Known failure cases (audit-2026-05-24)

| User | Failure mode | Stripe PI state |
|------|-------------|-----------------|
| destinig7996 | Cash App push-confirm failed | `requires_confirmation` (soft) |
| jaderising44 | Card declined | `requires_payment_method` (hard — need new card) |

Both require different copy: destinig7996 just needs to re-confirm, jaderising44 needs
to update their payment method.

## Who triggers the dunning sequence

Primary trigger: `invoice.payment_failed` Stripe webhook. Already wired in
`src/app/api/webhooks/stripe/route.ts` at line 631 — **currently a no-op** (logs
only, Phase 2 comment). We extend it.

Retry events: Stripe fires `invoice.payment_failed` again for each retry attempt.
`attempt_count` on the invoice object tells us which retry this is (1, 2, 3, 4…).
We map attempt_count → dunning step rather than scheduling our own timers.

## Audience cardinality

- Today: 2 users
- Month 3 target: ~50 active subs → ~2-3 involuntary churn attempts/mo (typical 4-6% involuntary churn)
- Peak scenario: 500 subs → ~20-30/mo
- Conclusion: webhook-driven (per-failure-event) is the right model, not a cron batch

## Dunning step → email mapping

Per churn-prevention skill framework (D0/D3/D7/D10 cadence):

| Stripe attempt_count | Timing from first failure | Step key | Email tone |
|---------------------|--------------------------|----------|------------|
| 1 | Day 0 (immediate) | `dunning_d0` | Friendly — "payment didn't go through" |
| 2 | Day 3 | `dunning_d3` | Helpful — "here's how to update" |
| 3 | Day 7 | `dunning_d7` | Urgency — "3 days to pause" |
| 4 | Day 10 | `dunning_d10` | Final — save offer (20% off 2 months) |

Stripe Smart Retries (if enabled) varies timing. We key off `attempt_count` not
calendar days — simpler, resilient to Stripe retry schedule changes.

## Soft vs hard decline handling

Both cases reach the same webhook; we inspect the PaymentIntent's `last_payment_error.decline_code`:

- Hard decline codes (`card_not_supported`, `stolen_card`, `do_not_honor`, `lost_card`,
  `generic_decline` with `risk_level=highest`): skip retry CTA. Show "update card" only.
- Soft decline codes (`insufficient_funds`, `processing_error`, `try_again_later`):
  first try to re-confirm/retry; also offer "update card".
- Unknown/null: treat as soft.

For MVP we simplify: always show "update card" CTA (Stripe Billing Portal URL).
The distinction soft/hard affects only the opening sentence.

## Billing portal vs update-card link

Two options for the CTA:
1. Stripe Customer Portal (requires creating portal session server-side, returns
   one-time URL valid 5 minutes)
2. Hardcoded `/settings` → billing tab (already exists, surfaces subscription state)

For dunning emails we generate a Stripe Billing Portal session server-side inside
`sendDunningEmail`, embed the one-time URL in the email. This gives direct
"update card" flow without login friction.

Concern: portal session URL is valid only 5 minutes. We generate it at send-time
(webhook handler), not at click-time. If user clicks >5 min after send, they get
Stripe "link expired" page. Mitigation: fall back to `/settings` with `?billing=1`
parameter so they can still reach billing.

Decision: generate portal URL for D0/D3 emails (high-urgency, likely opened quickly).
For D7/D10 link to `/settings` (user is less engaged, portal URL likely stale anyway).
This is the pragmatic MVP choice — improve with portal redirect proxy in v2 if needed.

## Idempotency design

`sent_dunning_emails` table with UNIQUE(subscription_id, dunning_step). Before
sending, INSERT … ON CONFLICT DO NOTHING — if conflict, skip. This survives:
- Stripe webhook retries (same event delivered twice)
- Network failures between DB write and Resend call (retry classification: if
  resend_message_id IS NULL → retry the Resend call)

Keyed on `subscription_id` + `dunning_step` (not invoice_id) because Stripe may
fire multiple invoices per subscription over its lifetime; we want one email per
step per subscription per billing cycle. Add `stripe_invoice_id` column for audit,
keyed on `(subscription_id, dunning_step)`.

Wait — billing cycle consideration: if user updates card, pays successfully, then
fails again on the NEXT billing cycle, we should send D0 again. Solution: add
`period_start` (Unix timestamp rounded to date) as part of the unique key:
UNIQUE(subscription_id, dunning_step, billing_period_start).

`billing_period_start` comes from `invoice.period_start` on the invoice object.

## Failure isolation

- Resend down: webhook returns 200 (event deduped), email not sent, resend_message_id
  NULL → Stripe retries next invoice.payment_failed → we classify as `retry` → send again.
  Wait — Stripe only retries the *payment*, not the webhook. So if Resend is down at
  D0, D0 email is silently lost unless we have a catch-up mechanism.
  
  Mitigation: keep dedup row state machine (new → pending → sent/failed). On next
  webhook delivery (attempt_count=2), check: was D0 actually sent (resend_message_id set)?
  If not, send D0 first, then D3. Or: have a Vercel Cron job sweep `sent_dunning_emails`
  rows with resend_message_id=NULL older than 30 minutes and retry them.
  
  MVP decision: accept the gap. If Resend is down at the exact moment of payment failure,
  D0 is missed. The fallback is D3/D7/D10 which still fire on subsequent Stripe retries.
  Add TODO comment for cron retry in v2.

- DB down: webhook returns 500 → Stripe retries → dedup row not inserted → may double-send
  on Stripe retry. Acceptable: idempotency row insert is first action; if it fails (DB
  down), return 500 to force Stripe retry.

- User not found in DB: log warning, skip email (can't send to unknown email).

## Copy tone

- Product: Estrevia (sidereal astrology PWA, esoteric, mystical brand)
- Audience: primarily EN-speaking (audit confirmed ES 0% checkout completion)
- Tone: NEVER "you failed to pay" — always "your payment didn't go through"
- Plain text preferred for dunning (better deliverability — do NOT use the dark/gold
  EmailLayout for dunning emails; use a simple light/neutral layout or plain text)
- Actually: react-email with minimal styling, white background, black text — standard
  transactional email look. The EmailLayout dark theme is appropriate for marketing/product
  emails but dunning should look like a standard bank notification.

Decision: create `DunningEmailLayout` with white background — or inline styles in the
dunning email components. Keep it simple.

## Save offer in D10

20% off next 2 months (not 50%). Mechanic: apply Stripe coupon to the subscription
on click. MVP: link to Billing Portal with a message "reply to apply discount". Cleaner
v2: coupon auto-application endpoint `/api/billing/apply-discount?token=...`.

MVP decision: include the offer verbally in D10 copy but instruct user to contact
`hello@estrevia.app` to redeem. No coupon automation in T1.

## Success metric

- Primary: `dunning_recovery_rate` = subscriptions that recovered within 14 days /
  total subscriptions that entered dunning
- Secondary: `dunning_d0_open_rate` via Resend webhook (already wired in
  `/api/webhooks/resend/route.ts`)
- Baseline: 0% (no dunning today)
- Target: 70% soft + 20-30% hard = estimated ~50% blended

## ES locale

Both current past_due users appear to be EN (destinig7996/jaderising44 names suggest
EN or ES). Since users table has `locale` column we look it up. If locale='es', render
ES copy. Templates support both locales.

## DRY_RUN flag

`process.env.DUNNING_DRY_RUN === 'true'` → log what would be sent, skip Resend call,
do NOT insert dedup row (so dry-run doesn't poison idempotency state).

## Summary of decisions

1. Trigger: extend existing `invoice.payment_failed` handler in stripe webhook
2. Step determination: `invoice.attempt_count` → dunning_step
3. Idempotency: `sent_dunning_emails` table, UNIQUE(subscription_id, dunning_step, billing_period_start)
4. Email templates: 4 React Email components (D0/D3/D7/D10), light background
5. CTA: Stripe Billing Portal session URL for D0/D3; `/settings` for D7/D10
6. Save offer: D10 copy only, manual redemption via email (no coupon API in T1)
7. Soft/hard: same template, hard-decline adds extra sentence "your card was declined"
8. DRY_RUN: env var gate
9. Migration: 0014_dunning_emails.sql (next after 0013)
10. No cron retry in T1 (v2 TODO)
