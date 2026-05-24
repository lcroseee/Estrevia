# Trial Expiration Email Sequence — Spec

_2026-05-24 | T2 | Status: approved-for-impl_

---

## Overview

3-email sequence for trial users approaching end of trial period:
- **T-72h** (`reminder_3d`): triggered by Stripe `customer.subscription.trial_will_end` webhook
- **T-24h** (`reminder_1d`): triggered by cron `/api/cron/trial-expiration` polling `sent_trial_emails`
- **T-0** (`trial_ended`): triggered by same cron after `trial_end < NOW()`

---

## New DB table: `sent_trial_emails`

```sql
CREATE TABLE "sent_trial_emails" (
  "id" serial PRIMARY KEY,
  "subscription_id" text NOT NULL,           -- Stripe subscription ID (sub_xxx)
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "step" text NOT NULL CHECK (step IN ('reminder_3d', 'reminder_1d', 'trial_ended')),
  "resend_message_id" text,
  "sent_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "sent_trial_emails_unique_idx"
  ON "sent_trial_emails" ("subscription_id", "step");
CREATE INDEX "sent_trial_emails_user_id_idx"
  ON "sent_trial_emails" ("user_id");
```

Migration: `drizzle/0014_trial_expiration_emails.sql`  
Schema: add `sentTrialEmails` table to `src/shared/lib/schema.ts`

---

## New library: `src/shared/lib/sent-trial-emails.ts`

Mirrors `sent-lead-emails.ts` pattern exactly.

```typescript
export type TrialEmailClaim = 'new' | 'retry' | 'delivered';
export type TrialEmailStep = 'reminder_3d' | 'reminder_1d' | 'trial_ended';

export async function tryInsertOneShotTrial(
  subscriptionId: string,
  step: TrialEmailStep,
): Promise<TrialEmailClaim>

export async function recordSentTrial(
  subscriptionId: string,
  step: TrialEmailStep,
  resendMessageId: string | null,
): Promise<void>
```

---

## Email templates

### Template 1: `TrialReminder3dEmail.tsx` (T-72h)

**Props:** `{ locale, trialEndDate, proUrl, billingPortalUrl }`

**EN copy:**
- Subject: `Your Estrevia Pro trial ends in 3 days`
- Preview: `You've calculated your full sidereal chart — keep your readings with Pro.`
- Heading: `Your trial ends in 3 days`
- Body (200-250 words):

> You started your Estrevia Pro trial a few days ago, and your full sidereal chart has been waiting for you.
>
> On [DATE], your trial ends. After that, you'll lose access to:
> - Your complete AI chart reading (Sun, Moon, Ascendant interpretation)
> - Saturn Return window and Dasha timing analysis
> - Unlimited synastry (compatibility readings)
> - Full moon calendar with Void-of-Course windows
> - AI tarot interpretation
> - Personalized Tree of Life
>
> Your chart won't disappear — but the deep reading will be locked until you subscribe.

- CTA primary (gold button): `Continue with Pro — $4.99/mo`
- CTA secondary (text link): `Manage subscription` → Billing Portal
- No discount.

**ES copy:** (español neutro LATAM, tú form — see below)

---

### Template 2: `TrialReminder1dEmail.tsx` (T-24h)

**Props:** `{ locale, trialEndDate, proUrl, billingPortalUrl }`

**EN copy:**
- Subject: `Last day: your Estrevia Pro trial ends tomorrow`
- Preview: `Your chart readings lock tomorrow — one click to keep them.`
- Heading: `Last day of your trial`
- Body (150-200 words):

> Tomorrow is the last day of your Estrevia Pro trial.
>
> After [TIME on DATE], your access to the full chart reading, Saturn timing, synastry, and tarot interpretation will be restricted. Your base chart stays free — the interpretation layer goes Pro-only.
>
> If you've been finding value in the readings, now is the moment to continue.
>
> If you'd rather not subscribe right now, you can pause or cancel anytime from your account settings.

- CTA primary (gold button): `Keep Pro access — $4.99/mo`
- CTA secondary (text link): `Manage subscription` → Billing Portal
- No discount.

---

### Template 3: `TrialEndedEmail.tsx` (T-0 win-back)

**Props:** `{ locale, proUrl, billingPortalUrl, couponCode?: string }`

**EN copy:**
- Subject: `Your Estrevia trial ended — your chart is still here`
- Preview: `Your sidereal chart is saved. Pick up where you left off.`
- Heading: `Your trial has ended`
- Body (200-250 words):

> Your Estrevia Pro trial ended. We hope you found your sidereal chart useful — the accurate positions using Lahiri ayanamsa, the houses, the planetary interpretations.
>
> Your base chart is still saved. What's Pro-only now:
> - Full AI chart reading (all 12 placements interpreted)
> - Saturn Return timing and Dasha windows
> - Synastry (compatibility) readings
> - AI tarot and personalized Tree of Life
>
> If you want to continue where you left off, you can restart anytime.
>
> [IF couponCode]: Use **[CODE]** at checkout for 10% off your first month.

- CTA primary (gold button): `Restart with Pro`
- CTA secondary (text link): `See what's free`  → chart page
- Discount coupon shown only if `TRIAL_WINBACK_COUPON_CODE` env var is set.

---

## ES translations (stubs — all marked `// TODO i18n`)

All three templates include ES strings object with `// TODO i18n` comment. ES template copy is a structural placeholder translated from EN to español neutro LATAM, tú form. Sign names untranslated. Planet names translated per `PLANET_ES_NAMES`.

**Template 1 ES (subject):** `Tu prueba de Estrevia Pro termina en 3 días`  
**Template 2 ES (subject):** `Último día: tu prueba de Estrevia Pro termina mañana`  
**Template 3 ES (subject):** `Tu prueba de Estrevia terminó — tu carta sigue aquí`

---

## Webhook handler changes (`src/app/api/webhooks/stripe/route.ts`)

Replace existing `customer.subscription.trial_will_end` case body:

```typescript
case 'customer.subscription.trial_will_end': {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // Resolve user
  const rows = await db.select({ id: users.id, email: users.email, locale: users.locale })
    .from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
  if (!rows[0]?.email) {
    console.warn('[stripe-webhook] trial_will_end: user not found', { customerId });
    break;
  }

  const { sendTrialExpirationEmail } = await import('@/shared/lib/trial-expiration-email');
  await sendTrialExpirationEmail({
    subscriptionId: sub.id,
    userId: rows[0].id,
    email: rows[0].email,
    locale: (rows[0].locale ?? 'en') as 'en' | 'es',
    step: 'reminder_3d',
    trialEndDate: sub.trial_end ? new Date(sub.trial_end * 1000) : new Date(),
    plan: derivePlan(sub),
  });
  break;
}
```

---

## New send function: `src/shared/lib/trial-expiration-email.ts`

```typescript
export interface TrialExpirationEmailParams {
  subscriptionId: string;
  userId: string;
  email: string;
  locale: 'en' | 'es';
  step: 'reminder_3d' | 'reminder_1d' | 'trial_ended';
  trialEndDate: Date;
  plan: 'pro_monthly' | 'pro_annual' | 'free';
}

export async function sendTrialExpirationEmail(params: TrialExpirationEmailParams): Promise<{
  sent: boolean;
  reason?: string;
}>
```

Internal logic:
1. Check `DRY_RUN=true` → return `{ sent: false, reason: 'dry_run' }` and log
2. `tryInsertOneShotTrial(subscriptionId, step)` → if 'delivered', skip
3. Build proUrl + billingPortalUrl
4. Render correct template based on `step`
5. Send via Resend with idempotency key `${subscriptionId}:trial:${step}`
6. `recordSentTrial(subscriptionId, step, result.data?.id ?? null)`
7. Throw on `result.error` (same pattern as lead emails)

---

## New cron: `/api/cron/trial-expiration`

Polls for users whose trial is ending within 24h (reminder_1d) or has ended (trial_ended) and haven't received the corresponding email yet.

```
GET /api/cron/trial-expiration
Authorization: Bearer CRON_SECRET (same as other crons)
```

Query:
```sql
SELECT u.id, u.email, u.locale, u.stripe_subscription_id, u.trial_end
FROM users u
WHERE u.subscription_status = 'trialing'
  AND u.trial_end IS NOT NULL
  AND u.stripe_subscription_id IS NOT NULL
  AND (
    -- reminder_1d: trial ends in 0..26h (not yet expired, within 26h window)
    -- reminder_trial_ended: trial ended within last 48h
  )
```

For each user:
- Check which steps are missing in `sent_trial_emails`
- Fire missing step(s) in order

Schedule: `vercel.json` cron `0 * * * *` (hourly, same as other crons).

---

## Backfill script: `scripts/qa/_send_trial_expiration_backfill.mjs`

For current cohort (durand + hailey, due 2026-05-26):

- Idempotent: checks `sent_trial_emails` before sending
- Default: DRY_RUN (logs only)
- `--live` flag: actually sends
- Hardcoded: only the 2 specific email addresses from current cohort
- Sends `reminder_3d` to both (T-72h, as the missed webhook would have)

---

## Billing Portal URL

```typescript
// Lazy-generate via Stripe API
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${SITE_URL}/${locale === 'es' ? 'es/' : ''}settings`,
});
const billingPortalUrl = portalSession.url;
```

For backfill script and cron: we can't generate per-user portal links without stripeCustomerId. Use static fallback: `https://billing.stripe.com/p/login/...` OR the settings page. For MVP: `proUrl = /checkout/start`, `billingPortalUrl = /settings`.

---

## vercel.json cron addition

```json
{
  "path": "/api/cron/trial-expiration",
  "schedule": "0 * * * *"
}
```
