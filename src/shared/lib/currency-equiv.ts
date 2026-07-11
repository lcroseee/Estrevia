// src/shared/lib/currency-equiv.ts
/**
 * LATAM currency equivalents for the two Pro plans — SINGLE SOURCE OF TRUTH.
 *
 * Consumed by:
 *   - src/app/api/v1/stripe/checkout/route.ts — custom_text.submit on the
 *     hosted Stripe Checkout page for ES-locale callers.
 *   - messages/es.json pricing.{monthlyPriceEquiv,annualPriceEquiv} — the UI
 *     copy (PaywallModal + /pricing via CurrencyEquivNote). next-intl cannot
 *     import TS, so the JSON holds a byte-exact mirror; the sync test in
 *     __tests__/currency-equiv.test.ts fails the build when the two drift.
 *
 * HOW TO REFRESH (quarterly, and before any ES ad relaunch):
 *   1. Look up USD→{MXN, COP, CLP, PEN, UYU} mid-market rates (e.g. xe.com).
 *   2. Recompute: monthly = 4.99 × rate, annual = 34.99 × rate; round to
 *      marketing-friendly figures (~2 significant digits) and keep the format
 *      below — "≈ <n> MXN · <n> COP · <n> CLP · <n> PEN · <n> UYU" with
 *      NARROW NO-BREAK SPACE (U+202F — the space inside "21 000" below) as the thousands
 *      separator.
 *   3. Edit the two strings below (one line per plan) and paste the SAME
 *      values into messages/es.json pricing.monthlyPriceEquiv/annualPriceEquiv.
 *   4. `npx vitest run src/shared/lib/__tests__/currency-equiv.test.ts` must pass.
 *
 * [FOUNDER-VERIFY] The values below are the 2026-05-23 vintage (USD→MXN ≈ 18,
 * COP ≈ 4 210, CLP ≈ 950, PEN ≈ 3.8, UYU ≈ 40). Verify/refresh them before
 * re-enabling ES Meta spend — see the founder checklist in the SP-B plan Task 10.
 */

export type ProPlan = 'pro_monthly' | 'pro_annual';

export const CURRENCY_EQUIV: Record<ProPlan, string> = {
  pro_monthly: '≈ 90 MXN · 21 000 COP · 4 740 CLP · 19 PEN · 200 UYU',
  pro_annual: '≈ 630 MXN · 147 000 COP · 33 200 CLP · 133 PEN · 1 400 UYU',
};
