# Paywall Teaser A/B Test — Plan

**Track:** T4  
**Date:** 2026-05-24  
**Spec:** `docs/specs/paywall-teaser-abtest.md`  
**Branch:** `claude/jolly-bell-da067a`

---

## Tasks

### T4.1 — Assignment function + tests  
**File:** `src/shared/lib/abtest.ts`  
Create `assignPaywallTeaserVariant(leadId: string): 'A' | 'B' | 'C'`.  
**Tests:** `src/shared/lib/__tests__/abtest.test.ts`  
- T4.1a: determinism — same leadId always returns same variant.  
- T4.1b: distribution — 1000 nanoid-style IDs produce ~333 each bucket (within ±5%).  
- T4.1c: all three variants are reachable.  
- T4.1d: empty string does not throw.  
Commit: `feat(abtest/T4): deterministic variant assignment via sha256`  
Test commit: `test(abtest/T4): assignment determinism + distribution`

---

### T4.2 — DB schema + migration  
**Files:**  
- `src/shared/lib/schema.ts` — add `paywallTeaserVariant` column  
- `drizzle/0014_paywall_teaser_abtest.sql` — ADD COLUMN migration  

Migration SQL:
```sql
ALTER TABLE "email_leads" ADD COLUMN "paywall_teaser_variant" text;
```
No default, no NOT NULL — NULL is intentional for pre-experiment rows.  
Commit: `feat(abtest/T4): add paywall_teaser_variant column + migration 0014`

---

### T4.3 — Variant B email template  
**File:** `src/emails/LeadPaywallTeaserBEmail.tsx`  
Props: `{ locale, sunSign, moonSign, ascSign, trialUrl, dominantPlanet, dominantSign, dominantHouse }`  
Where `dominantHouse: number | null`.  
Subject copy per spec section 4.  
Body: replace heading with dominant-planet hook; rest identical to Variant A.  
Commit: `feat(abtest/T4): LeadPaywallTeaserBEmail — personalized planet hook`

---

### T4.4 — Variant C email template  
**File:** `src/emails/LeadPaywallTeaserCEmail.tsx`  
Props: same as B + `discountText: string` (pre-rendered urgency line).  
Extends B visually; adds urgency block before Button.  
Commit: `feat(abtest/T4): LeadPaywallTeaserCEmail — personalized + discount urgency`

---

### T4.5 — Analytics event  
**File:** `src/shared/lib/analytics.ts`  
Add `PaywallTeaserEmailSent = 'paywall_teaser_email_sent'` to `AnalyticsEvent` enum.  
Commit: folded into T4.6 (same commit touching email.ts).

---

### T4.6 — Update `sendLeadPaywallTeaserEmail`  
**File:** `src/shared/lib/email.ts`  
1. Add `variant?: PaywallTeaserVariant` param (default `'A'`).  
2. Add SUBJECTS for B and C variants.  
3. Route to correct template based on variant.  
4. Variant C: build trialUrl with `&coupon=TEASER20` when `STRIPE_COUPON_TEASER20` is set.  
5. After successful send, fire `trackServerEvent(AnalyticsEvent.PaywallTeaserEmailSent, { experiment_variant, locale })`.  
**Tests:** extend `src/shared/lib/__tests__/email-lead.test.ts`  
- T4.6a: variant A renders control template (existing test passes, no change).  
- T4.6b: variant B renders `LeadPaywallTeaserBEmail` and subject contains planet name.  
- T4.6c: variant C renders `LeadPaywallTeaserCEmail`, subject contains "20%", URL contains coupon param when env var set.  
- T4.6d: variant C falls back to B template (no coupon in URL) when `STRIPE_COUPON_TEASER20` is not set.  
- T4.6e: PostHog `paywall_teaser_email_sent` fired with `experiment_variant` property.  
Commit: `feat(abtest/T4): sendLeadPaywallTeaserEmail — variant routing + analytics`  
Test commit: `test(abtest/T4): email variant routing + PostHog event`

---

### T4.7 — Cron: pass variant from DB  
**File:** `src/app/api/cron/lead-nurture/route.ts`  
1. Add `paywallTeaserVariant` to `candidates` SELECT.  
2. At step 3 dispatch, pass `variant: lead.paywallTeaserVariant ?? 'A'`.  
Commit: `feat(abtest/T4): cron passes paywall_teaser_variant to send func`

---

### T4.8 — Leads API: assign variant at INSERT  
**File:** `src/app/api/v1/leads/route.ts`  
1. Import `assignPaywallTeaserVariant`.  
2. Compute variant before INSERT.  
3. Include `paywallTeaserVariant: variant` in INSERT values.  
**Tests:** `src/app/api/v1/leads/__tests__/route.test.ts`  
- T4.8a: new lead POST → DB row has `paywall_teaser_variant` set to 'A', 'B', or 'C'.  
Commit: `feat(abtest/T4): assign variant at lead creation`

---

### T4.9 — Checkout: coupon param (Variant C)  
**File:** `src/app/api/v1/stripe/checkout/route.ts`  
1. Add optional `coupon` to `checkoutBodySchema` with enum allowlist `['TEASER20']`.  
2. If `coupon === 'TEASER20'` and `STRIPE_COUPON_TEASER20` is set:  
   - include `discounts: [{ coupon: process.env.STRIPE_COUPON_TEASER20 }]`  
   - omit `allow_promotion_codes: true`  
3. If coupon not provided, existing behavior unchanged.  
Commit: `feat(abtest/T4): checkout accepts TEASER20 coupon for variant C`

---

### T4.10 — Env var + docs  
**Files:**  
- `.env.example`: add `STRIPE_COUPON_TEASER20=`  
- `docs/specs/paywall-teaser-abtest.md`: mark spec as implemented  
Commit: `docs(abtest/T4): env var + spec status update`

---

## Test count summary

| Task | Test count |
|------|-----------|
| T4.1 (assignment) | 4 |
| T4.6 (email routing) | 5 |
| T4.8 (leads API) | 1 |
| **Total new tests** | **≥10** |
| Existing email-lead tests | must keep passing |

---

## Execution order

T4.1 → T4.2 (parallel possible) → T4.3 → T4.4 → T4.5+T4.6 → T4.7 → T4.8 → T4.9 → T4.10  
T4.1 and T4.2 can run in parallel (no dependency).  
T4.3 and T4.4 depend on T4.1 (for type import).  
T4.6 depends on T4.3, T4.4, T4.5.  
T4.7, T4.8 depend on T4.2 (schema type) and T4.1.  
T4.9 is independent (only touches checkout route).

---

## Expected timeline

~2h implementation (solo agent).

---

## Go / no-go dates

| Checkpoint | Date | Metric | Threshold |
|-----------|------|--------|-----------|
| Open rate signal | 2026-06-07 (2 weeks) | Open rate per variant | B or C +15% relative over A → promising |
| CTR signal | 2026-06-07 | CTR per variant | B or C +20% relative over A → promising |
| Guardrail check | Weekly | C unsub rate 14d rolling | >2% → kill C |
| Primary interim | 2026-08-16 (12 weeks) | Trial-start rate | p < 0.025 per variant vs A |
| Full analysis | ~2026-10-01 (~18 weeks, ~9000 sends if growth holds) | Trial-start rate | p < 0.05 winner declare |
