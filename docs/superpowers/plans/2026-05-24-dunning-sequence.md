# Dunning Sequence — Implementation Plan (T1)

Date: 2026-05-24
Spec: `docs/superpowers/specs/2026-05-24-dunning-sequence-design.md`
Commit prefix: `feat(churn/T1):`, `test(churn/T1):`, `chore(churn/T1):`

## Task breakdown

### T1.1 — DB schema + migration

**Files:**
- `src/shared/lib/schema.ts` — append `sentDunningEmails` table
- `drizzle/0014_dunning_emails.sql` — manual migration file

**Schema columns:**
```
id: serial PK
userId: text NOT NULL REFERENCES users(id) ON DELETE CASCADE
subscriptionId: text NOT NULL
stripeInvoiceId: text NOT NULL
dunningStep: text NOT NULL CHECK IN ('d0','d3','d7','d10')
billingPeriodStart: date NOT NULL
isHardDecline: boolean NOT NULL DEFAULT false
resendMessageId: text nullable
sentAt: timestamptz NOT NULL DEFAULT now()
error: text nullable
```

**Indexes:**
- UNIQUE(subscriptionId, dunningStep, billingPeriodStart) — idempotency
- INDEX(userId, sentAt)

**Test:** none for migration file itself; schema type tests covered by TypeScript.

---

### T1.2 — DunningEmailLayout component

**File:** `src/emails/components/DunningEmailLayout.tsx`

White background layout for deliverability. Minimal styling — looks like a standard
transactional notification.

Props: `{ preview?: string; locale: 'en' | 'es'; children: ReactNode; settingsUrl: string }`

Footer: plain text address + "Manage subscription" link.

---

### T1.3 — D0 email template: DunningAlertEmail

**File:** `src/emails/DunningAlertEmail.tsx`

Props: `{ locale: 'en' | 'es'; isHardDecline: boolean; billingPortalUrl?: string; settingsUrl: string }`

EN/ES copy per spec. CTA: billing portal URL (if provided) or `/settings`.

**Test:** `src/emails/__tests__/DunningAlertEmail.test.tsx`
- EN soft decline renders portal CTA
- EN hard decline renders "card was declined" sentence
- ES renders Spanish copy
- Produces non-empty plaintext

---

### T1.4 — D3 email template: DunningReminderEmail

**File:** `src/emails/DunningReminderEmail.tsx`

Props: `{ locale: 'en' | 'es'; billingPortalUrl?: string; settingsUrl: string }`

Feature reminder list. Portal URL CTA.

---

### T1.5 — D7 email template: DunningUrgencyEmail

**File:** `src/emails/DunningUrgencyEmail.tsx`

Props: `{ locale: 'en' | 'es'; settingsUrl: string }`

"3 days to pause" urgency. Links to `/settings` only.

---

### T1.6 — D10 email template: DunningFinalEmail

**File:** `src/emails/DunningFinalEmail.tsx`

Props: `{ locale: 'en' | 'es'; settingsUrl: string }`

Final warning + 20% save offer (manual redemption via email).

**Test:** `src/emails/__tests__/DunningFinalEmail.test.tsx`
- EN renders final warning copy
- EN contains save offer
- ES renders Spanish copy
- Produces non-empty plaintext

---

### T1.7 — dunning-emails.ts helper

**File:** `src/shared/lib/dunning-emails.ts`

Exports:
1. `tryInsertOneShotDunning(params) → 'new' | 'retry' | 'delivered'`
   - Same pattern as `tryInsertOneShotLead` in `sent-lead-emails.ts`
2. `recordDunningMessageId(subscriptionId, step, billingPeriodStart, messageId)`
3. `recordDunningError(subscriptionId, step, billingPeriodStart, error)`
4. `sendDunningEmail(params) → { sent: boolean; reason?: string; messageId?: string }`
   - Orchestrates: DRY_RUN check → tryInsertOneShotDunning → render → Resend → record

`sendDunningEmail` imports all 4 email template components, renders based on step.
Generates settingsUrl from locale (same pattern as other email.ts functions).

**Test:** `src/shared/lib/__tests__/dunning-emails.test.ts`
- `tryInsertOneShotDunning` returns 'new' on first call (mock DB)
- `tryInsertOneShotDunning` returns 'delivered' when resend_message_id set (mock DB)
- `sendDunningEmail` returns `{ sent: false, reason: 'dry_run' }` when DUNNING_DRY_RUN=true
- `sendDunningEmail` returns `{ sent: false, reason: 'already_sent' }` on 'delivered' claim
- `sendDunningEmail` calls Resend and records messageId on success (mock Resend)

---

### T1.8 — Extend Stripe webhook: invoice.payment_failed

**File:** `src/app/api/webhooks/stripe/route.ts`

Replace the no-op `case 'invoice.payment_failed'` with full implementation:

```typescript
case 'invoice.payment_failed': {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer : invoice.customer?.id;
  if (!customerId) break;

  // 1. Resolve user
  const userRow = await db.select({ id, email, locale })
    .from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
  if (!userRow.length) {
    console.warn('[stripe-webhook] payment_failed: user not found', { customerId });
    break;
  }

  // 2. Determine subscription + step
  const subscriptionId = typeof invoice.parent?.subscription_details?.subscription
    === 'string' ? ... : invoice.subscription (handle both SDK versions);
  const attemptCount = invoice.attempt_count ?? 1;
  const dunningStep = attemptCountToStep(attemptCount); // d0/d3/d7/d10
  const billingPeriodStart = new Date(invoice.period_start * 1000);

  // 3. Hard decline detection (expand charge)
  let isHardDecline = false;
  try {
    // invoice may have charge expanded or null
    const chargeId = typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id;
    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId, {
        expand: ['payment_intent.last_payment_error'],
      });
      const declineCode = charge.payment_intent?.last_payment_error?.decline_code;
      isHardDecline = isHardDeclineCode(declineCode);
    }
  } catch { /* non-fatal */ }

  // 4. Billing portal URL for D0/D3
  let billingPortalUrl: string | undefined;
  if (dunningStep === 'd0' || dunningStep === 'd3') {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `https://estrevia.app/${locale === 'es' ? 'es/' : ''}settings`,
      });
      billingPortalUrl = session.url;
    } catch { /* non-fatal */ }
  }

  // 5. Send dunning email
  const { sendDunningEmail } = await import('@/shared/lib/dunning-emails');
  await sendDunningEmail({
    userId: userRow[0].id,
    email: userRow[0].email,
    locale: userRow[0].locale,
    subscriptionId,
    stripeInvoiceId: invoice.id,
    dunningStep,
    billingPeriodStart,
    isHardDecline,
    billingPortalUrl,
  });

  // 6. Update users.subscriptionStatus = 'past_due' (may already be set by subscription.updated)
  await db.update(users).set({ subscriptionStatus: 'past_due', updatedAt: new Date() })
    .where(eq(users.stripeCustomerId, customerId));

  break;
}
```

Add helper functions `attemptCountToStep` and `isHardDeclineCode` near top of file
(or in a shared location).

**Test:** `src/app/api/webhooks/stripe/__tests__/route.test.ts` additions:
- `invoice.payment_failed` with attempt_count=1 → calls sendDunningEmail with step='d0'
- `invoice.payment_failed` with attempt_count=3 → step='d7'
- `invoice.payment_failed` user not found → skips email, returns 200
- `invoice.payment_failed` with unknown customerId → skips gracefully

---

### T1.9 — SUBJECTS + email.ts registration

**File:** `src/shared/lib/email.ts`

Add dunning subject lines to SUBJECTS map:

```typescript
dunning_d0: { en: "Your payment didn't go through — action needed", es: "Tu pago no se procesó — acción necesaria" },
dunning_d3: { en: "Reminder: update your payment method", es: "Recordatorio: actualiza tu método de pago" },
dunning_d7: { en: "Your Estrevia Pro access will pause in 3 days", es: "Tu acceso a Estrevia Pro se pausará en 3 días" },
dunning_d10: { en: "Last chance — keep Estrevia Pro at 20% off", es: "Última oportunidad — mantén Estrevia Pro con 20% de descuento" },
```

Note: `sendDunningEmail` is self-contained in `dunning-emails.ts` (imports Resend
directly like email.ts does). SUBJECTS map is referenced from dunning-emails.ts.
Or: duplicate subjects inline in dunning-emails.ts to avoid cross-module coupling.

Decision: inline subjects in `dunning-emails.ts` (simpler, no cross-module dep).

---

## Execution order

T1.1 (schema) → T1.2 (layout) → T1.3-T1.6 (templates) → T1.7 (helper) → T1.8 (webhook) → T1.9 (cleanup)

T1.3-T1.6 can be parallelized (different files, no deps on each other).

## Commit plan

```
feat(churn/T1): add sent_dunning_emails table + Drizzle schema      (T1.1)
feat(churn/T1): DunningEmailLayout + D0-D10 email templates          (T1.2-T1.6)
feat(churn/T1): sendDunningEmail helper + idempotency                (T1.7)
feat(churn/T1): wire invoice.payment_failed dunning handler          (T1.8)
test(churn/T1): dunning email templates + helper + webhook tests     (T1.3/T1.6/T1.7/T1.8 tests)
```

## Founder actions after merge

1. Apply migration: `psql $DATABASE_URL < drizzle/0014_dunning_emails.sql`
   (or: `npm run db:migrate` if drizzle metadata is up to date)
2. Verify `DUNNING_DRY_RUN` is NOT set (or set to 'false') in Vercel env
3. Smoke test: use Stripe Dashboard "Simulate payment failure" on a test subscription
4. Check Resend dashboard for delivered dunning email within 30 seconds
5. Enable Stripe Smart Retries (Dashboard → Settings → Subscriptions → Smart retries)
   if not already on — this is what drives D3/D7/D10 timing

## Environment variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DUNNING_DRY_RUN` | No | unset (=false) | Set to `'true'` for testing |
| `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` | Optional | unset | For custom portal config; leave unset to use Stripe default |

No new env vars required beyond what exists. `RESEND_API_KEY` and `STRIPE_SECRET_KEY`
are already set.
