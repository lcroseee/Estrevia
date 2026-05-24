# Dunning Sequence — Spec (T1)

Date: 2026-05-24

## Overview

4-email automated dunning sequence for involuntary churn recovery. Triggered by
Stripe `invoice.payment_failed` webhook. Target recovery rate: 70% soft /
20-30% hard declines.

## Trigger

Extend the existing no-op in `src/app/api/webhooks/stripe/route.ts`
`case 'invoice.payment_failed'`. The handler already has a TODO comment
("Phase 2 — Resend integration").

```
invoice.payment_failed
  → resolve user (stripeCustomerId lookup)
  → determine dunning step from invoice.attempt_count
  → idempotency check: sent_dunning_emails(subscription_id, step, period_start)
  → determine is_hard_decline from invoice.charge → payment_intent.last_payment_error
  → generate Stripe Billing Portal session (D0/D3 only)
  → render + send email via Resend
  → record sent (resend_message_id)
```

## Database schema

New table: `sent_dunning_emails`

```sql
CREATE TABLE sent_dunning_emails (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id     TEXT NOT NULL,
  stripe_invoice_id   TEXT NOT NULL,
  dunning_step        TEXT NOT NULL CHECK (dunning_step IN ('d0','d3','d7','d10')),
  billing_period_start DATE NOT NULL,   -- invoice.period_start as date
  is_hard_decline     BOOLEAN NOT NULL DEFAULT FALSE,
  resend_message_id   TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error       TEXT        -- populated on Resend error for debugging
);

CREATE UNIQUE INDEX sent_dunning_emails_idempotency_idx
  ON sent_dunning_emails (subscription_id, dunning_step, billing_period_start);

CREATE INDEX sent_dunning_emails_user_idx
  ON sent_dunning_emails (user_id, sent_at);
```

Drizzle migration: `drizzle/0014_dunning_emails.sql`

Schema entry appended to `src/shared/lib/schema.ts`.

## Step determination

| invoice.attempt_count | dunning_step | Email |
|-----------------------|-------------|-------|
| 1 | d0 | Friendly alert |
| 2 | d3 | Helpful reminder |
| 3 | d7 | Urgency warning |
| 4+ | d10 | Final warning + save offer |

`attempt_count > 4` collapses to `d10` (one final email, not repeated).

## Idempotency rules

1. Try INSERT into `sent_dunning_emails`. ON CONFLICT DO NOTHING.
2. If zero rows returned → already processed (either delivered or pending).
   - Check `resend_message_id`: NULL → retry Resend send; NOT NULL → skip.
3. If one row returned → new slot, proceed with Resend call.
4. After successful Resend response: UPDATE `resend_message_id`.
5. After Resend error: UPDATE `error` field; leave `resend_message_id` NULL
   (allows retry on next Stripe payment_failed event).

## Email templates

All in `src/emails/`. Use a simple white-background layout for deliverability.
New `DunningEmailLayout` component (minimal, transactional style).

### D0 — Friendly alert

Subject EN: "Your payment didn't go through — action needed"
Subject ES: "Tu pago no se procesó — acción necesaria"

Content:
- "Your payment for Estrevia Pro didn't go through." (NOT "you failed to pay")
- If hard decline: "Your card was declined. Please add a new payment method."
- If soft: "This is usually temporary. We'll retry automatically."
- "Update your payment method to keep your access."
- CTA: Stripe Billing Portal URL (one-time, generated at send-time)
- Secondary: plain link to `/settings`

### D3 — Helpful reminder

Subject EN: "Reminder: update your payment method"
Subject ES: "Recordatorio: actualiza tu método de pago"

Content:
- Brief recap: "We tried charging your card again."
- Feature reminder: "Keep access to your 240+ essays, synastry, and charts."
- CTA: Billing Portal URL
- Support mention: "Questions? hello@estrevia.app"

### D7 — Urgency

Subject EN: "Your Estrevia Pro access will pause in 3 days"
Subject ES: "Tu acceso a Estrevia Pro se pausará en 3 días"

Content:
- Urgency: "Your subscription is at risk."
- "Update your payment method to avoid losing access."
- List what they'll lose (short: essays, synastry, AI tarot)
- CTA: link to `/settings` (portal URL likely stale by now)
- Closing: "We want you to stay."

### D10 — Final warning + save offer

Subject EN: "Last chance — keep Estrevia Pro at 20% off"
Subject ES: "Última oportunidad — mantén Estrevia Pro con 20% de descuento"

Content:
- "This is our last attempt to reach you."
- "We're offering 20% off your next 2 months — reply to this email to redeem."
- CTA: link to `/settings`
- Closing: "— The Estrevia team"

## sendDunningEmail function

Location: `src/shared/lib/email.ts` (appended) or new
`src/modules/auth/email/dunning.ts`.

Decision: create `src/shared/lib/dunning-emails.ts` (mirrors `sent-lead-emails.ts` pattern).

```typescript
interface SendDunningEmailParams {
  userId: string;
  email: string;
  locale: 'en' | 'es';
  subscriptionId: string;
  stripeInvoiceId: string;
  dunningStep: 'd0' | 'd3' | 'd7' | 'd10';
  billingPeriodStart: Date;
  isHardDecline: boolean;
  billingPortalUrl?: string; // pre-generated for D0/D3
}

export async function sendDunningEmail(
  params: SendDunningEmailParams,
): Promise<{ sent: boolean; reason?: string; messageId?: string }>
```

Internal flow:
1. DRY_RUN check
2. tryInsertOneShotDunning (idempotency)
3. Render React Email template
4. Resend send (idempotencyKey: `dunning:${subscriptionId}:${dunningStep}:${billingPeriodStart}`)
5. recordDunningMessageId

## Stripe Billing Portal session creation

Helper in webhook handler:

```typescript
async function createBillingPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<string | null>
```

Calls `stripe.billingPortal.sessions.create({ customer, return_url })`.
Returns URL or null on error (non-fatal, falls back to /settings URL in email).

Only called for D0 and D3.

## Hard decline detection

```typescript
function isHardDecline(declineCode: string | null | undefined): boolean {
  const HARD_CODES = new Set([
    'card_not_supported',
    'stolen_card',
    'lost_card',
    'fraudulent',
    'do_not_honor',
    'restricted_card',
    'security_violation',
    'card_velocity_exceeded',
  ]);
  return !!declineCode && HARD_CODES.has(declineCode);
}
```

To get decline_code: expand `invoice.charge.payment_intent.last_payment_error` in
Stripe retrieve call. Or: check `invoice.payment_intent` and retrieve separately.

For MVP: call `stripe.invoices.retrieve(invoiceId, { expand: ['charge'] })` in the
webhook handler. Cost: 1 extra Stripe API call per payment failure. Acceptable at
current scale.

Fallback: if expansion fails (network, old invoice without charge), default
`isHardDecline = false` (treat as soft).

## DRY_RUN

`process.env.DUNNING_DRY_RUN === 'true'`:
- Log `[dunning] DRY_RUN: would send {step} to {userId}` (no email address in log)
- Skip Resend call
- Skip DB insert (don't poison idempotency state)
- Return `{ sent: false, reason: 'dry_run' }`

Default: DRY_RUN=false in production (env var not set).

## User resolution

In `invoice.payment_failed` handler:
1. `invoice.customer` → stripeCustomerId
2. DB lookup: `SELECT id, email, locale FROM users WHERE stripe_customer_id = ?`
3. If not found: log warning, skip (cannot send email to unknown user)

`invoice.subscription` → subscriptionId
`invoice.attempt_count` → dunning step
`invoice.period_start` → billingPeriodStart (Unix → Date)

## Locale handling

`users.locale` determines email language. Default 'en' if not set.
Both EN and ES copy in each template (same pattern as other emails).

## Error handling

- Resend error: update `error` field in DB row, log (no PII), capture Sentry.
  Return 200 to Stripe (don't retry webhook — next payment retry will fire D3).
- DB error on idempotency insert: return 500 to Stripe (forces webhook retry,
  which is correct — we haven't processed this event).
- Stripe portal session creation error: non-fatal, use `/settings` URL instead.

## Analytics

Track `dunning_email_sent` PostHog event:
```json
{ "dunning_step": "d0", "is_hard_decline": false }
```
No PII. User ID only (server-side PostHog call via `trackServerEvent`).

## Files to create/modify

**Create:**
- `drizzle/0014_dunning_emails.sql` — migration
- `src/emails/DunningAlertEmail.tsx` — D0
- `src/emails/DunningReminderEmail.tsx` — D3
- `src/emails/DunningUrgencyEmail.tsx` — D7
- `src/emails/DunningFinalEmail.tsx` — D10
- `src/emails/components/DunningEmailLayout.tsx` — white bg layout
- `src/shared/lib/dunning-emails.ts` — idempotency + send helper
- `src/emails/__tests__/DunningAlertEmail.test.tsx`
- `src/emails/__tests__/DunningFinalEmail.test.tsx`
- `src/shared/lib/__tests__/dunning-emails.test.ts`

**Modify:**
- `src/shared/lib/schema.ts` — add `sentDunningEmails` table export
- `src/app/api/webhooks/stripe/route.ts` — extend `invoice.payment_failed` case
- `src/app/api/webhooks/stripe/__tests__/route.test.ts` — add dunning tests

## Out of scope (T1)

- Coupon auto-application endpoint (D10 save offer is manual)
- Cron retry for missed D0 when Resend is down
- Pause/resume subscription (Stripe Billing Portal handles it)
- ES-specific A/B testing of dunning copy
- Payment method update confirmation email (separate spec)
