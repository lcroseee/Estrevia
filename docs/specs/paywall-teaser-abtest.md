# Paywall Teaser A/B Test — Spec

**Track:** T4  
**Date:** 2026-05-24  
**Status:** Ready for implementation  
**Migration:** 0014 (this track is T4; T2/T3 migrations may land before or after — see note below)

> **Migration numbering note:** At the time of writing, the latest merged migration on `main` is 0013.  
> T2 owns 0014 (if it lands before T4). T4 migration is written as 0014 in code but may need to be  
> renamed to 0015 if T2 merges first. The migration file should be renamed before merge.

---

## 1. Overview

Three variants of the `lead_paywall_teaser` (T+72h) email, assigned at lead creation via deterministic hash.

| Variant | Label | Change from control |
|---------|-------|---------------------|
| A | Control | Current template, unchanged |
| B | Personalized | Dominant-planet hook in subject + body body headline |
| C | Personalized + Discount | B + 20% off annual coupon, 48h urgency line |

---

## 2. Assignment algorithm

```typescript
import { createHash } from 'node:crypto';

export type PaywallTeaserVariant = 'A' | 'B' | 'C';

/**
 * Deterministic variant assignment: sha256(leadId) mod 3.
 * Variant is assigned once at INSERT time and never changed.
 * Existing leads (created before this migration) have NULL variant
 * and are excluded from all experiment analyses.
 */
export function assignPaywallTeaserVariant(leadId: string): PaywallTeaserVariant {
  const hash = createHash('sha256').update(leadId).digest();
  const bucket = hash[0] % 3; // first byte, 0–2
  return (['A', 'B', 'C'] as const)[bucket];
}
```

Assignment location: `POST /api/v1/leads` — synchronously at INSERT, stored in `email_leads.paywall_teaser_variant`.

---

## 3. DB schema change

Add column to `email_leads`:

```sql
ALTER TABLE email_leads
  ADD COLUMN paywall_teaser_variant TEXT;
-- NULL for pre-experiment rows; 'A'|'B'|'C' for new rows
-- No NOT NULL constraint — existing 208+ rows must remain valid
```

Drizzle schema change in `src/shared/lib/schema.ts`:

```typescript
paywallTeaserVariant: text('paywall_teaser_variant', {
  enum: ['A', 'B', 'C'],
}),
// nullable — NULL means pre-experiment, exclude from analysis
```

---

## 4. Variant B — Copy spec

### Subject (EN)
```
Your {sunSign} chart has a reading waiting — {planet} in {sign} caught our attention
```
Fallback (no chart): `Your sidereal chart has a reading waiting`

### Subject (ES)
```
Tu carta {sunSign} tiene una lectura esperándote — {planet} en {sign} llamó nuestra atención
```

### Body headline (EN)
```
Your {planet} in {sign} is one of the most telling placements in your chart.
```
House variant (when house is not null):
```
Your {planet} in {sign} (house {house}) is one of the most telling placements in your chart.
```

### Body headline (ES)
```
Tu {planet} en {sign} es uno de los posicionamientos más reveladores de tu carta.
```
House variant:
```
Tu {planet} en {sign} (casa {house}) es uno de los posicionamientos más reveladores de tu carta.
```

### Rest of body, teaser, CTA, trustline: same as Variant A (control).

### Planet name translation
Uses existing `PLANET_ES_NAMES` from `src/shared/lib/planet-i18n.ts` for ES locale.

---

## 5. Variant C — Copy spec

Everything from B, plus:

### Subject suffix (EN): ` — 20% off, 48h only`  
### Subject suffix (ES): ` — 20% de desc., solo 48h`

### Urgency block (inserted before Button, EN):
```
For the next 48 hours, your full reading is available at 20% off the annual plan.
```

### Urgency block (ES):
```
Por las próximas 48 horas, tu lectura completa está disponible con 20% de descuento en el plan anual.
```

### CTA text (EN): `Claim 20% off — start free trial`  
### CTA text (ES): `Reclamar 20% off — iniciar prueba gratis`

### Coupon mechanism
- Env var: `STRIPE_COUPON_TEASER20` (Stripe coupon ID, 20% off, `duration: once`, max_redemptions not set — controlled at checkout level).
- The `trialUrl` for variant C includes `&coupon=TEASER20` param.
- The checkout page (`/checkout/start`) reads `coupon` param and passes it as `discounts: [{ coupon: couponId }]` to `stripe.checkout.sessions.create`. This replaces `allow_promotion_codes: true` when a coupon is specified (to prevent stacking).
- If `STRIPE_COUPON_TEASER20` is not set (local dev), falls back to variant B behavior (no discount).

---

## 6. Template architecture

New file: `src/emails/LeadPaywallTeaserBEmail.tsx` — Variant B template  
New file: `src/emails/LeadPaywallTeaserCEmail.tsx` — Variant C template  
Existing: `src/emails/LeadPaywallTeaserEmail.tsx` — Variant A, unchanged

Alternative: single template with `variant` prop. Preferred for maintainability:  
**Decision: keep separate files** — each is independently testable, Resend preview works per file, no conditional rendering chains.

---

## 7. `sendLeadPaywallTeaserEmail` changes

The function signature adds `variant: PaywallTeaserVariant` param (with default `'A'` for backward compat):

```typescript
export async function sendLeadPaywallTeaserEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
  variant?: PaywallTeaserVariant;  // default 'A'
}): Promise<{ sent: boolean; reason?: string }>
```

The cron dispatch must pass `variant` from the DB column. The cron query adds `paywallTeaserVariant` to the SELECT.

### Subject variants

```typescript
lead_paywall_teaser_B: {
  en: (sunSign: string | null, planet: string, sign: string) =>
    sunSign
      ? `Your ${sunSign} chart has a reading waiting — ${planet} in ${sign} caught our attention`
      : `Your sidereal chart has a reading waiting — ${planet} in ${sign} caught our attention`,
  es: (sunSign: string | null, planet: string, signEs: string) =>
    sunSign
      ? `Tu carta ${sunSign} tiene una lectura esperándote — ${planet} en ${signEs} llamó nuestra atención`
      : `Tu carta sideral tiene una lectura esperándote — ${planet} en ${signEs} llamó nuestra atención`,
},
lead_paywall_teaser_C: {
  en: (sunSign: string | null, planet: string, sign: string) =>
    `${sunSign ? `Your ${sunSign} chart has a reading waiting` : 'Your sidereal chart has a reading waiting'} — 20% off, 48h only`,
  es: (sunSign: string | null, planet: string, signEs: string) =>
    `${sunSign ? `Tu carta ${sunSign} tiene una lectura esperándote` : 'Tu carta sideral tiene una lectura esperándote'} — 20% de desc., solo 48h`,
},
```

---

## 8. Cron changes

`src/app/api/cron/lead-nurture/route.ts`:
1. Add `paywallTeaserVariant` to the `candidates` SELECT.
2. Pass `variant: lead.paywallTeaserVariant ?? 'A'` to `sendLeadPaywallTeaserEmail` at step 3 dispatch.

---

## 9. Leads API changes

`src/app/api/v1/leads/route.ts`:
1. Import `assignPaywallTeaserVariant`.
2. At INSERT time, compute and store variant:
   ```typescript
   const variant = assignPaywallTeaserVariant(leadId);
   // include paywallTeaserVariant: variant in INSERT values
   ```

---

## 10. PostHog event tagging

In `sendLeadPaywallTeaserEmail`, after successful send, fire:

```typescript
await trackServerEvent(AnalyticsEvent.PaywallTeaserEmailSent, {
  experiment_variant: params.variant ?? 'A',
  locale: params.locale,
  // lead_id deliberately omitted — not logged per PII rules
});
```

Add `PaywallTeaserEmailSent = 'paywall_teaser_email_sent'` to `AnalyticsEvent` enum.

---

## 11. Checkout coupon injection

`src/app/api/v1/stripe/checkout/route.ts`:
- Add optional `coupon` field to `checkoutBodySchema` (max 64 chars, alphanumeric).
- If `coupon` is provided and `STRIPE_COUPON_TEASER20` matches, include `discounts: [{ coupon: couponValue }]` in session params and omit `allow_promotion_codes`.
- Security: only accept coupon values from an allowlist (`TEASER20`) — never pass raw user input to Stripe.

---

## 12. Analysis SQL

```sql
-- Primary metric: trial-start rate by variant
SELECT
  el.paywall_teaser_variant AS variant,
  COUNT(DISTINCT el.id)                                        AS total_sent,
  COUNT(DISTINCT CASE WHEN el.converted_at IS NOT NULL
    AND el.converted_at BETWEEN sle.sent_at AND sle.sent_at + INTERVAL '7 days'
    THEN el.id END)                                            AS trial_starts,
  ROUND(
    COUNT(DISTINCT CASE WHEN el.converted_at IS NOT NULL
      AND el.converted_at BETWEEN sle.sent_at AND sle.sent_at + INTERVAL '7 days'
      THEN el.id END)::numeric / NULLIF(COUNT(DISTINCT el.id),0) * 100,
    2
  )                                                            AS trial_start_pct
FROM email_leads el
JOIN sent_lead_emails sle ON sle.lead_id = el.id
  AND sle.email_type = 'lead_paywall_teaser'
WHERE el.paywall_teaser_variant IS NOT NULL  -- exclude pre-experiment
GROUP BY el.paywall_teaser_variant
ORDER BY variant;
```

```sql
-- Secondary: unsubscribe guardrail (rolling 14d)
SELECT
  el.paywall_teaser_variant,
  COUNT(*) FILTER (WHERE el.unsubscribed_at IS NOT NULL
    AND el.unsubscribed_at <= sle.sent_at + INTERVAL '14 days')::float
    / NULLIF(COUNT(*), 0) AS unsub_rate_14d
FROM email_leads el
JOIN sent_lead_emails sle ON sle.lead_id = el.id
  AND sle.email_type = 'lead_paywall_teaser'
WHERE el.paywall_teaser_variant IS NOT NULL
GROUP BY el.paywall_teaser_variant;
```

---

## 13. Env vars

| Var | Required for | Notes |
|-----|-------------|-------|
| `STRIPE_COUPON_TEASER20` | Variant C discount | Stripe coupon ID, 20% off, duration=once. If unset, C degrades to B. |

Add to `.env.example`.

---

## 14. Files touched

| File | Change |
|------|--------|
| `src/shared/lib/schema.ts` | Add `paywallTeaserVariant` column to `emailLeads` |
| `src/shared/lib/abtest.ts` | New: `assignPaywallTeaserVariant()` |
| `drizzle/0014_paywall_teaser_abtest.sql` | Migration: ADD COLUMN |
| `src/emails/LeadPaywallTeaserBEmail.tsx` | New: Variant B template |
| `src/emails/LeadPaywallTeaserCEmail.tsx` | New: Variant C template |
| `src/shared/lib/email.ts` | Update `sendLeadPaywallTeaserEmail`, add SUBJECTS, add PostHog event |
| `src/app/api/cron/lead-nurture/route.ts` | Pass variant from DB to send func |
| `src/app/api/v1/leads/route.ts` | Assign variant at INSERT |
| `src/app/api/v1/stripe/checkout/route.ts` | Accept + apply coupon param (Variant C) |
| `src/shared/lib/analytics.ts` | Add `PaywallTeaserEmailSent` event |
| `.env.example` | Add `STRIPE_COUPON_TEASER20` |
