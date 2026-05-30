/**
 * Create the HALF50 launch-week coupon — 2026-05-30
 *
 * 50% off, duration: once (first post-trial charge only), 7-day window, both plans.
 * Creates a Stripe Coupon (id = HALF50) + a Promotion Code (HALF50) so the offer
 * works BOTH via auto-apply deep-links (?coupon=HALF50 → discounts:[{coupon}]) and
 * as a typed code (allow_promotion_codes path).
 *
 * Idempotent: skips creation if the coupon / promotion code already exists.
 * DRY-RUN by default; pass --apply to actually write to Stripe (founder-authorized).
 *   node scripts/advertising/_create_half50_coupon_2026_05_30.mjs            # preview
 *   node scripts/advertising/_create_half50_coupon_2026_05_30.mjs --apply    # create (LIVE)
 *   …--apply --days 10                                                       # custom window
 */
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

const APPLY = process.argv.includes('--apply');
const daysArg = process.argv.indexOf('--days');
const DAYS = daysArg !== -1 ? Number(process.argv[daysArg + 1]) : 7;
const COUPON_ID = 'HALF50';
const PROMO_CODE = 'HALF50';
const PERCENT_OFF = 50;

const nowSec = Math.floor(Date.now() / 1000);
const redeemBy = nowSec + DAYS * 24 * 60 * 60;
const expiryIso = new Date(redeemBy * 1000).toISOString();

console.log(`HALF50 coupon — ${PERCENT_OFF}% off, duration=once, window=${DAYS}d (expires ${expiryIso}). APPLY=${APPLY}\n`);

// 1) Coupon -----------------------------------------------------------------
let coupon = null;
try {
  coupon = await stripe.coupons.retrieve(COUPON_ID);
  console.log(`coupon ${COUPON_ID} already exists (percent_off=${coupon.percent_off}, duration=${coupon.duration}, valid=${coupon.valid}) — skip create`);
} catch (e) {
  if (e?.statusCode !== 404 && e?.code !== 'resource_missing') throw e;
  if (!APPLY) {
    console.log(`would CREATE coupon ${COUPON_ID}: percent_off=${PERCENT_OFF}, duration=once, redeem_by=${expiryIso}`);
  } else {
    coupon = await stripe.coupons.create({
      id: COUPON_ID,
      percent_off: PERCENT_OFF,
      duration: 'once',
      name: '50% off — launch week',
      redeem_by: redeemBy,
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
  console.log(`would CREATE promotion_code ${PROMO_CODE} → coupon ${COUPON_ID}, expires_at=${expiryIso}`);
} else {
  const promo = await stripe.promotionCodes.create({
    coupon: COUPON_ID,
    code: PROMO_CODE,
    expires_at: redeemBy,
  });
  console.log(`CREATED promotion_code ${promo.code} (${promo.id})`);
}

console.log('\n=== NEXT STEPS ===');
console.log(`  • Set Vercel prod env:  STRIPE_COUPON_HALF50 = ${COUPON_ID}`);
console.log(`  • Auto-apply deep-link:  /<locale>/checkout/start?plan=pro_monthly&coupon=HALF50`);
console.log(`  • Offer window: now … ${expiryIso} (${DAYS} days). Re-run to refresh if the send is delayed.`);
console.log(APPLY ? '\nLIVE write complete.' : '\nDRY-RUN — no Stripe writes. Re-run with --apply to create.');
