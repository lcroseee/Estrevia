/**
 * Coupon registry — single source of truth for internal discount codes.
 *
 * Imported by BOTH the checkout API route (server) and CheckoutStartClient
 * (client) so plan-eligibility is config-driven, not hardcoded literals. This
 * replaces the scattered `=== 'TEASER20'` string checks that previously made
 * any newly-created coupon silently no-op on the client and the annual guard.
 *
 * To add a coupon: create it in Stripe, add an entry here + a `STRIPE_COUPON_*`
 * env var holding the Stripe coupon id, and (for marketing emails) append
 * `&coupon=<CODE>` to the CTA deep-link.
 */

export const ALLOWED_COUPON_CODES = ['TEASER20', 'HALF50', 'SAVE50'] as const;
export type AllowedCouponCode = (typeof ALLOWED_COUPON_CODES)[number];

type Plan = 'pro_monthly' | 'pro_annual';

interface CouponConfig {
  /** Env var holding the Stripe coupon id to attach via `discounts`. */
  envVar: string;
  /** Plans this coupon may attach to. TEASER20 is annual-only by design (anchoring). */
  allowedPlans: ReadonlyArray<Plan>;
}

export const COUPON_CONFIG: Record<AllowedCouponCode, CouponConfig> = {
  // Acquisition discount — annual only (keeps annual the anchor; see d4b0434).
  TEASER20: { envVar: 'STRIPE_COUPON_TEASER20', allowedPlans: ['pro_annual'] },
  // Launch-week 50%-off — both plans, first charge only (duration: once), 7-day window.
  HALF50: { envVar: 'STRIPE_COUPON_HALF50', allowedPlans: ['pro_monthly', 'pro_annual'] },
  // Trial-end save offer — both plans, first charge only (duration: once).
  // NO redeem_by: per-send urgency lives in the email copy, not in coupon
  // immutability (the HALF50 7-day window expired unsent — lesson learned).
  SAVE50: { envVar: 'STRIPE_COUPON_SAVE50', allowedPlans: ['pro_monthly', 'pro_annual'] },
};

export function isAllowedCouponCode(value: string | null | undefined): value is AllowedCouponCode {
  return value != null && (ALLOWED_COUPON_CODES as readonly string[]).includes(value);
}

/**
 * Resolve the Stripe coupon id to attach for a given code + plan, or `null`
 * when the code is absent, not eligible for this plan, or its env var is unset.
 * A `null` result means the caller should fall back to `allow_promotion_codes`.
 */
export function resolveCouponId(
  code: AllowedCouponCode | undefined,
  plan: Plan,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (!code) return null;
  const config = COUPON_CONFIG[code];
  if (!config.allowedPlans.includes(plan)) return null;
  return env[config.envVar] ?? null;
}
