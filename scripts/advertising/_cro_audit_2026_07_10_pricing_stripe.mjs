// READ-ONLY CRO audit probe — pricing/checkout sector — 2026-07-10
// Stripe GET-only: sessions since 2026-05-29, all subscriptions, paid invoices,
// coupons + promotion codes. No writes anywhere.
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
const SINCE = Math.floor(new Date('2026-05-29T00:00:00Z').getTime() / 1000);
const mask = (e) => (e ? e.replace(/^(..).*(@.*)$/, '$1***$2') : null);

// ---------- 1. Checkout sessions since 2026-05-29 ----------
const sessions = [];
for await (const s of stripe.checkout.sessions.list({ created: { gte: SINCE }, limit: 100 })) {
  sessions.push(s);
}
console.log(`\n=== CHECKOUT SESSIONS since 2026-05-29 UTC (n=${sessions.length}) ===`);
const byLocale = {};
for (const s of sessions) {
  const loc = s.metadata?.locale ?? s.locale ?? 'auto';
  byLocale[loc] ??= { total: 0, complete: 0, open: 0, expired: 0 };
  byLocale[loc].total++;
  byLocale[loc][s.status] = (byLocale[loc][s.status] ?? 0) + 1;
}
console.log(JSON.stringify(byLocale, null, 1));
for (const s of sessions) {
  console.log(
    [
      new Date(s.created * 1000).toISOString().slice(0, 16),
      s.id.slice(0, 18),
      s.status,
      s.payment_status,
      `locale=${s.locale}`,
      `metaLocale=${s.metadata?.locale ?? '-'}`,
      `email=${mask(s.customer_details?.email)}`,
      `plan?amount=${s.amount_total}`,
      `utm_src=${s.metadata?.utm_source ?? '-'}`,
      `anon=${s.metadata?.anonymous_id ? 'Y' : 'N'}`,
      `discount=${s.total_details?.amount_discount ?? 0}`,
    ].join(' | '),
  );
}

// ---------- 2. All subscriptions (small account) ----------
console.log('\n=== SUBSCRIPTIONS (all statuses, full history) ===');
const subs = [];
for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) subs.push(sub);
for (const sub of subs.sort((a, b) => a.created - b.created)) {
  console.log(
    [
      new Date(sub.created * 1000).toISOString().slice(0, 10),
      sub.id.slice(0, 14),
      sub.status,
      `cape=${sub.cancel_at_period_end}`,
      `canceled_at=${sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString().slice(0, 10) : '-'}`,
      `ended=${sub.ended_at ? new Date(sub.ended_at * 1000).toISOString().slice(0, 10) : '-'}`,
      `trial_end=${sub.trial_end ? new Date(sub.trial_end * 1000).toISOString().slice(0, 10) : '-'}`,
      `price=${sub.items?.data?.[0]?.price?.id?.slice(-8)}`,
      `discount=${sub.discounts?.length ? 'Y' : 'N'}`,
    ].join(' | '),
  );
}
const statusCount = {};
for (const s of subs) statusCount[s.status] = (statusCount[s.status] ?? 0) + 1;
console.log('status counts:', JSON.stringify(statusCount));

// ---------- 3. Paid invoices since 2026-05-29 + lifetime ----------
console.log('\n=== PAID INVOICES ===');
let paidSince = 0, sumSince = 0, paidEver = 0, sumEver = 0;
for await (const inv of stripe.invoices.list({ status: 'paid', limit: 100 })) {
  if (inv.amount_paid > 0) {
    paidEver++; sumEver += inv.amount_paid;
    if (inv.created >= SINCE) {
      paidSince++; sumSince += inv.amount_paid;
      console.log(`  ${new Date(inv.created * 1000).toISOString().slice(0, 10)} $${(inv.amount_paid / 100).toFixed(2)} ${mask(inv.customer_email)} sub=${(typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id ?? '-').slice(0, 14)}`);
    }
  }
}
console.log(`since 5/29: ${paidSince} invoices, $${(sumSince / 100).toFixed(2)} | lifetime: ${paidEver} invoices, $${(sumEver / 100).toFixed(2)}`);

// ---------- 4. Coupons + promotion codes ----------
console.log('\n=== COUPONS ===');
for await (const c of stripe.coupons.list({ limit: 100 })) {
  console.log(
    `  ${c.id} | ${c.name ?? '-'} | ${c.percent_off ?? c.amount_off}${c.percent_off ? '%' : ''} | duration=${c.duration} | redeem_by=${c.redeem_by ? new Date(c.redeem_by * 1000).toISOString().slice(0, 10) : '-'} | redeemed=${c.times_redeemed} | valid=${c.valid}`,
  );
}
console.log('\n=== PROMOTION CODES (typable at checkout) ===');
let promoCount = 0;
for await (const p of stripe.promotionCodes.list({ limit: 100 })) {
  promoCount++;
  console.log(`  ${p.code} | coupon=${p.coupon?.id} | active=${p.active} | redeemed=${p.times_redeemed}`);
}
if (promoCount === 0) console.log('  (none — allow_promotion_codes field is useless: nothing can be typed)');
