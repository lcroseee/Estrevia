# HALF50 — 50%-off launch-week discount — Design

**Date:** 2026-05-30
**Status:** approved (founder chose audience/plan/duration/delivery via scoping Q&A)
**Author:** Claude (Opus 4.8)

## Goal

Stand up a **50%-off, first-charge-only, 7-day** discount and offer it to the full addressable
lead/user base — coupon + auto-apply links built now; the email blast prepared but **sent only
after (a) the CAN-SPAM postal-address footer fix lands and (b) the founder gives explicit OK**.

## Founder decisions (scoping Q&A, 2026-05-30)

| Axis | Decision | Consequence |
|---|---|---|
| **Audience** | All addressable leads (~260) | Blast to leads + free users + recoverable subs; exclude active/trialing payers, unsubscribed, undeliverable; dedupe by email |
| **Plans** | Both monthly + annual | Must remove the `plan === 'pro_annual'` guard for the new code (keep it for TEASER20) |
| **Duration** | First charge only (`duration: once`) | 50% off one post-trial cycle, then full price — minimal margin hit |
| **Delivery** | Coupon + links now; emails after CAN-SPAM fix + OK | Email SEND is gated; coupon creation + code + links are not |

## Context the design must respect (from this session's audits)

- **Price is not the funnel blocker.** Failures are funding-source declines: 9/14 `insufficient_funds`,
  4/14 issuer-rule, 1 wallet — 100% `issuer_declined`. A discount does **not** cure an empty card.
  The founder is launching this anyway, targeting **new/undecided** leads (where 50% may move the
  decision), not the failing payers. This is a legitimate, scoped use — we are not claiming it fixes churn.
- **Discount infra already exists** (TEASER20: `coupon` + `promotion_code`, auto-apply via
  `?coupon=` deep-links, `allow_promotion_codes` else-branch). We extend that pattern — minimal net-new code.
- **TEASER20 stays annual-only** (`d4b0434` anchoring rationale). HALF50 is the new, both-plans code.
- The 3-day trial is `$0`, so the coupon applies to the **first charge AFTER the trial** — copy must say so.

## Architecture

### 1. Shared coupon registry — `src/shared/lib/coupons.ts` (NEW)

Single source of truth, imported by both the checkout API route (server) and `CheckoutStartClient`
(client). Removes the two hardcoded `=== 'TEASER20'` literals that previously made any new code
silently no-op.

```ts
export const ALLOWED_COUPON_CODES = ['TEASER20', 'HALF50'] as const;
export type AllowedCouponCode = (typeof ALLOWED_COUPON_CODES)[number];

interface CouponConfig {
  envVar: string;                                          // Stripe coupon id lives here
  allowedPlans: ReadonlyArray<'pro_monthly' | 'pro_annual'>;
}
export const COUPON_CONFIG: Record<AllowedCouponCode, CouponConfig> = {
  TEASER20: { envVar: 'STRIPE_COUPON_TEASER20', allowedPlans: ['pro_annual'] },
  HALF50:   { envVar: 'STRIPE_COUPON_HALF50',   allowedPlans: ['pro_monthly', 'pro_annual'] },
};

export function isAllowedCouponCode(v: string | null | undefined): v is AllowedCouponCode { … }

/** Stripe coupon id to attach, or null if not applicable for this plan / env unset. */
export function resolveCouponId(
  code: AllowedCouponCode | undefined,
  plan: 'pro_monthly' | 'pro_annual',
  env: NodeJS.ProcessEnv = process.env,
): string | null { … }                                     // honors allowedPlans; null when env var unset
```

### 2. Checkout route — `src/app/api/v1/stripe/checkout/route.ts` (MODIFY)

- Replace the inline `ALLOWED_COUPON_CODES` + type with imports from `coupons.ts`.
- Replace BOTH attach blocks (auth ~253, anon ~369):
  ```ts
  const resolvedCoupon = resolveCouponId(couponCode, plan);
  ...(resolvedCoupon
    ? { discounts: [{ coupon: resolvedCoupon }] }
    : { allow_promotion_codes: true }),
  ```
  This preserves TEASER20→annual-only (via `allowedPlans`) and enables HALF50 on both plans.
  Stacking stays prevented (discounts XOR allow_promotion_codes).

### 3. Checkout client — `src/app/[locale]/checkout/start/CheckoutStartClient.tsx` (MODIFY)

```ts
const coupon = isAllowedCouponCode(couponRaw) ? couponRaw : undefined;
```
(Client imports only `isAllowedCouponCode` — never `resolveCouponId`, which reads `process.env`.)

### 4. CAN-SPAM footer — `src/emails/components/EmailLayout.tsx` (MODIFY)

Add a real physical postal address line below the tagline, for **commercial** emails. CAN-SPAM §5
requires a valid physical postal address in every commercial email; the current footer has only a
tagline. The address string is **founder-provided** (registered agent / PO box) — a placeholder is
NOT acceptable for a live send. Render it for all emails (transactional may include it; promo must).

> **BLOCKER for SEND, not for code:** the actual postal address must be supplied by the founder
> before any commercial blast. Tracked as a gate on the email step.

### 5. Promo email template — `src/emails/DiscountLaunchEmail.tsx` (NEW)

One-off promotional template (EN + ES, español neutro LATAM, `tú`). Content:
- Headline: 50% off your first month/year — 7 days only.
- Body: continuation-of-value framing ("your sidereal chart is ready — unlock the full reading"),
  NOT a generic "SALE". States the discount applies to the first charge after the free 3-day trial.
- CTA → `/{locale}/checkout/start?plan=pro_monthly&coupon=HALF50` (monthly default; annual link variant optional).
- Uses `EmailLayout` with `unsubscribeUrl` (one-click List-Unsubscribe, RFC 8058) — marketing footer.

### 6. Idempotent send log — `sent_discount_blast_emails` (NEW table + migration)

Mirrors `sent_cart_abandon_emails` / `sent_dunning_emails`:
`id`, `recipient` (email, for dedupe across leads+users), `lead_id?`, `user_id?`,
`resend_message_id`, `coupon_code`, `sent_at`. Migration is **founder-applied** before send.

### 7. Gated send script — `scripts/advertising/_send_discount_blast_2026_05_30.mjs` (NEW)

- DRY-RUN by default; `--apply` to send. Even with `--apply`, intended to run only after founder OK.
- Audience query (exact filters from the 2026-05-30 audience probe):
  - leads: `converted_to_user_id IS NULL AND unsubscribed_at IS NULL AND email_undeliverable = false`
  - users: `id LIKE 'user_%' AND subscription_tier='free' AND marketing_email_opt_in=true AND email_undeliverable=false`
    plus past_due/canceled-90d recoverables.
  - EXCLUDE active + trialing payers. Dedupe by email. Skip rows already in `sent_discount_blast_emails`.
- Throttle: batches of ~100/day; abort if Resend complaint signal > ~0.1% after batch 1.
- Sends via Resend with one-click `List-Unsubscribe` + `List-Unsubscribe-Post` headers (reuse `email.ts` path).

### 8. Stripe coupon creation — `scripts/advertising/_create_half50_coupon_2026_05_30.mjs` (NEW)

- Creates `coupon` (percent_off 50, duration once, `redeem_by` = now + 7d, name "50% off — launch week")
  and a `promotion_code` (`HALF50`, `expires_at` = now + 7d). Idempotent (skips if HALF50 promo exists).
- Prints the coupon id to set as `STRIPE_COUPON_HALF50` in Vercel prod + `.env.example`.
- Authorized by founder (Delivery = "create coupon + links now").

## Data flow

```
email link  /es/checkout/start?plan=pro_monthly&coupon=HALF50
   → CheckoutStartClient  isAllowedCouponCode('HALF50') ✓  → POST /api/v1/stripe/checkout {plan, coupon:'HALF50'}
   → route  resolveCouponId('HALF50','pro_monthly')  → STRIPE_COUPON_HALF50 id
   → Stripe Checkout  discounts:[{coupon}]  (50% off first charge after 3-day $0 trial)
   → Stripe enforces the 7-day window (promotion_code.expires_at / coupon.redeem_by)
```

## Error handling

- Env var unset in prod → `resolveCouponId` returns null → checkout degrades to `allow_promotion_codes:true`
  (no discount, but no break). Send script refuses to `--apply` if `STRIPE_COUPON_HALF50` is unset.
- Coupon expired (>7d) → Stripe rejects at redemption; checkout still completes at full price.
- Send script is idempotent + suppression-aware; a crash mid-batch never double-sends (sent-log checked first).

## Testing

- `coupons.test.ts`: resolveCouponId matrix (TEASER20 annual✓/monthly✗; HALF50 both✓; env-unset→null), isAllowedCouponCode.
- Update `checkout/__tests__/anonymous.test.ts`: TEASER20 annual still attaches; HALF50 monthly now attaches; HALF50 monthly with env unset → allow_promotion_codes.
- `DiscountLaunchEmail` render test (EN + ES, contains HALF50 link + trial-disclaimer copy + unsubscribe).
- Full suite + typecheck + lint green before any send.

## Out of scope / explicitly deferred

- Sitewide auto-apply banner on /pricing (founder chose lead-blast, not new-traffic auto-apply).
- Re-enabling Meta ads (separate founder action).
- `duration: repeating/forever` webhook smoke-test (we chose `once`, same shape as TEASER20).
