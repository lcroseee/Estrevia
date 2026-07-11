#!/usr/bin/env node
/**
 * Create the SAVE50 trial-end save-offer coupon — 2026-07-10 (SP-C, D4)
 *
 * 50% off, duration: once (first charge only), both plans, NO redeem_by —
 * per-send urgency lives in the email copy, not coupon immutability (the
 * HALF50 7-day window expired before its blast ever went out).
 * Creates a Stripe Coupon (id = SAVE50) + a Promotion Code (SAVE50) so the
 * offer works BOTH via auto-apply deep-links (?coupon=SAVE50 →
 * discounts:[{coupon}]) and as a typed code (allow_promotion_codes path).
 *
 * Idempotent: skips creation if the coupon / promotion code already exists.
 * DRY-RUN by default; pass --apply to actually write to Stripe (founder-authorized).
 *   node scripts/advertising/_create_save50_coupon_2026_07_10.mjs            # preview
 *   node scripts/advertising/_create_save50_coupon_2026_07_10.mjs --apply    # create (LIVE)
 */
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

const APPLY = process.argv.includes('--apply');
const COUPON_ID = 'SAVE50';
const PROMO_CODE = 'SAVE50';
const PERCENT_OFF = 50;

console.log(`SAVE50 coupon — ${PERCENT_OFF}% off, duration=once, no redeem_by. APPLY=${APPLY}\n`);

// 1) Coupon -----------------------------------------------------------------
let coupon = null;
try {
  coupon = await stripe.coupons.retrieve(COUPON_ID);
  console.log(`coupon ${COUPON_ID} already exists (percent_off=${coupon.percent_off}, duration=${coupon.duration}, valid=${coupon.valid}) — skip create`);
} catch (e) {
  if (e?.statusCode !== 404 && e?.code !== 'resource_missing') throw e;
  if (!APPLY) {
    console.log(`would CREATE coupon ${COUPON_ID}: percent_off=${PERCENT_OFF}, duration=once, no redeem_by`);
  } else {
    coupon = await stripe.coupons.create({
      id: COUPON_ID,
      percent_off: PERCENT_OFF,
      duration: 'once',
      name: '50% off — trial-end save offer',
    });
    console.log(`CREATED coupon ${coupon.id} (valid=${coupon.valid})`);
  }
}

// 2) Promotion code (typed-code path) ---------------------------------------
const existingPromos = await stripe.promotionCodes.list({ code: PROMO_CODE, limit: 1 });
if (existingPromos.data.length > 0) {
  const p = existingPromos.data[0];
  console.log(`promotion_code ${PROMO_CODE} already exists (${p.id}, active=${p.active}, coupon=${p.coupon?.id ?? p.coupon}) — skip create`);
} else if (!APPLY) {
  console.log(`would CREATE promotion_code ${PROMO_CODE} → coupon ${COUPON_ID}, no expiry`);
} else {
  const promo = await stripe.promotionCodes.create({
    coupon: COUPON_ID,
    code: PROMO_CODE,
  });
  console.log(`CREATED promotion_code ${promo.code} (${promo.id})`);
}

console.log('\n=== NEXT STEPS ===');
console.log(`  • Set Vercel prod env:  STRIPE_COUPON_SAVE50 = ${COUPON_ID}`);
console.log('  • Delivery is automatic: trial-expiration reminder_1d + trial_ended emails append &coupon=SAVE50 once the env var is set.');
console.log(APPLY ? '\nLIVE write complete.' : '\nDRY-RUN — no Stripe writes. Re-run with --apply to create.');
