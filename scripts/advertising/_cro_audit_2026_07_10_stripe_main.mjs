// READ-ONLY Stripe CRO audit — 2026-07-10
// Sector: revenue truth + checkout completion.
// Windows: SINCE_AUDIT = 2026-05-30T00:00:00Z (end of last audit 2026-05-29 ~23:20 UTC)
//          TRAIL_30D   = now - 30d
// Sections:
//   A. Checkout sessions since last audit: created vs completed, by locale, anon vs signed-in
//   B. Subscriptions: full disambiguated list + trial→paid cohort + real MRR
//   C. Failed invoices + decline codes since last audit
//   D. HALF50 coupon existence + redemptions
//   E. Duplicate customers (same email, multiple cus_)
//   F. payment_method_types on sessions since last audit
// STRICTLY read-only: list/retrieve only.

import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const NOW = Math.floor(Date.now() / 1000);
const SINCE_AUDIT = Math.floor(new Date('2026-05-30T00:00:00Z').getTime() / 1000);
const TRAIL_30D = NOW - 30 * 86400;

const fmt = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 19) : '—');
const usd = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const pct = (n, d) => (d > 0 ? ((n / d) * 100).toFixed(1) + '%' : 'n/a');

console.log('═══ STRIPE CRO AUDIT 2026-07-10 — READ-ONLY ═══');
console.log(`now=${fmt(NOW)}  since_audit=${fmt(SINCE_AUDIT)}  trail_30d=${fmt(TRAIL_30D)}\n`);

// ───────────────────────────────────────────────────────────────────────────
// A. CHECKOUT SESSIONS since last audit
// ───────────────────────────────────────────────────────────────────────────
console.log('═══ A. CHECKOUT SESSIONS since 2026-05-30T00:00Z ═══\n');
const sessions = [];
for await (const s of stripe.checkout.sessions.list({ created: { gte: SINCE_AUDIT }, limit: 100 })) {
  sessions.push(s);
}
console.log(`total sessions since audit: ${sessions.length}`);

const classify = (s) => {
  const ref = s.client_reference_id || '';
  if (ref.startsWith('user_')) return 'signed-in';
  if (s.metadata?.anonymous_id || ref) return 'anon';
  return 'unknown';
};

const agg = (list, keyFn) => {
  const out = {};
  for (const s of list) {
    const k = keyFn(s);
    if (!out[k]) out[k] = { total: 0, complete: 0, expired: 0, open: 0 };
    out[k].total++;
    out[k][s.status] = (out[k][s.status] || 0) + 1;
  }
  return out;
};
const printAgg = (title, obj) => {
  console.log(`\n  ${title}`);
  for (const [k, v] of Object.entries(obj).sort((a, b) => b[1].total - a[1].total)) {
    console.log(
      `    ${k.padEnd(22)} total=${String(v.total).padStart(3)}  complete=${String(v.complete).padStart(2)} (${pct(v.complete, v.total)})  expired=${v.expired || 0}  open=${v.open || 0}`
    );
  }
};

const statusAgg = agg(sessions, (s) => 'ALL');
printAgg('overall', statusAgg);
printAgg('by stripe locale (s.locale)', agg(sessions, (s) => s.locale || 'auto'));
printAgg('by metadata.locale', agg(sessions, (s) => s.metadata?.locale || '(none)'));
printAgg('by anon/signed-in', agg(sessions, classify));
printAgg('by mode', agg(sessions, (s) => s.mode));
printAgg('by utm_source', agg(sessions, (s) => s.metadata?.utm_source || '(none)'));

// 30d trailing subset
const s30 = sessions.filter((s) => s.created >= TRAIL_30D);
console.log(`\n  --- 30d trailing subset (since ${fmt(TRAIL_30D)}) ---`);
printAgg('30d overall', agg(s30, () => 'ALL'));
printAgg('30d by stripe locale', agg(s30, (s) => s.locale || 'auto'));

// full session log
console.log('\n  --- every session since audit (chronological) ---');
for (const s of sessions.sort((a, b) => a.created - b.created)) {
  const email = s.customer_email || s.customer_details?.email || '(no email)';
  const pm = (s.payment_method_types || []).join('+');
  console.log(
    `  ${fmt(s.created)}  ${s.status.padEnd(8)} ${classify(s).padEnd(9)} loc=${(s.locale || 'auto').padEnd(6)} mode=${s.mode.padEnd(12)} pm=${pm.padEnd(10)} amt=${usd(s.amount_total)} ${email}`
  );
  console.log(
    `      id=${s.id.slice(0, 30)}…  utm=${s.metadata?.utm_source || '-'}/${(s.metadata?.utm_content || '-').slice(0, 28)}  meta.locale=${s.metadata?.locale || '-'}  email_collected=${!!(s.customer_email || s.customer_details?.email)}  discounts=${JSON.stringify(s.discounts || [])}`
  );
}

// ───────────────────────────────────────────────────────────────────────────
// B. SUBSCRIPTIONS — full disambiguated list + cohort + MRR
// ───────────────────────────────────────────────────────────────────────────
console.log('\n\n═══ B. SUBSCRIPTIONS — all time, disambiguated ═══\n');
const subs = [];
for await (const s of stripe.subscriptions.list({ status: 'all', limit: 100 })) subs.push(s);
console.log(`total subs ever: ${subs.length}\n`);

let mrrCents = 0;
const mrrOwners = [];
for (const s of subs.sort((a, b) => a.created - b.created)) {
  const full = await stripe.subscriptions.retrieve(s.id, {
    expand: ['latest_invoice', 'customer'],
  });
  const cust = full.customer;
  const item = full.items.data[0];
  const amt = item?.price?.unit_amount || 0;
  const interval = item?.price?.recurring?.interval || '?';
  const inv = full.latest_invoice;
  const cpe = full.current_period_end ?? item?.current_period_end;
  const willRenew =
    full.status === 'active' && !full.cancel_at_period_end && !full.canceled_at;
  if (willRenew) {
    const monthly = interval === 'year' ? Math.round(amt / 12) : amt;
    mrrCents += monthly;
    mrrOwners.push(`${cust?.email} ${usd(amt)}/${interval}`);
  }
  console.log(`  ${full.id}  ${cust?.email || cust?.id}`);
  console.log(
    `    status=${full.status}  plan=${usd(amt)}/${interval}  created=${fmt(full.created)}  trial_start=${fmt(full.trial_start)}  trial_end=${fmt(full.trial_end)}`
  );
  console.log(
    `    cancel_at_period_end=${full.cancel_at_period_end}  canceled_at=${fmt(full.canceled_at)}  ended_at=${fmt(full.ended_at)}  current_period_end=${fmt(cpe)}  will_renew=${willRenew}`
  );
  if (inv) {
    console.log(
      `    latest_inv=${inv.id} status=${inv.status} paid=${usd(inv.amount_paid)} due=${usd(inv.amount_due)} attempts=${inv.attempt_count} next=${fmt(inv.next_payment_attempt)} reason=${inv.billing_reason}`
    );
  }
  console.log(`    discount=${full.discounts?.length ? JSON.stringify(full.discounts) : (full.discount?.coupon?.id || '—')}`);
}

console.log(`\n  REAL MRR (active, will-renew): ${usd(mrrCents)}/mo  [${mrrOwners.join(' | ') || 'none'}]`);

// Cohort: subs created since audit
const cohort = subs.filter((s) => s.created >= SINCE_AUDIT);
console.log(`\n  --- cohort: subs created since 2026-05-30: ${cohort.length} ---`);
for (const s of cohort) console.log(`    ${s.id} status=${s.status} created=${fmt(s.created)}`);

// Lifetime real money
console.log('\n  --- lifetime charges (succeeded) ---');
const charges = [];
for await (const c of stripe.charges.list({ limit: 100 })) charges.push(c);
let gross = 0, refunded = 0, nSucc = 0;
for (const c of charges) {
  if (c.paid && c.status === 'succeeded') { gross += c.amount; nSucc++; refunded += c.amount_refunded || 0; }
}
console.log(`  succeeded=${nSucc}  gross=${usd(gross)}  refunded=${usd(refunded)}  net=${usd(gross - refunded)}`);
for (const c of charges.filter((x) => x.status === 'succeeded' && x.paid).sort((a, b) => a.created - b.created)) {
  console.log(`    ${fmt(c.created)}  ${usd(c.amount)}  ${c.billing_details?.email || c.receipt_email || '?'}  refunded=${usd(c.amount_refunded)}  since_audit=${c.created >= SINCE_AUDIT}`);
}

// ───────────────────────────────────────────────────────────────────────────
// C. FAILED PAYMENTS since last audit — decline codes
// ───────────────────────────────────────────────────────────────────────────
console.log('\n\n═══ C. FAILED PAYMENTS since 2026-05-30 ═══\n');
console.log('  --- failed charges ---');
let nFailed = 0;
for (const c of charges.filter((x) => x.status === 'failed' && x.created >= SINCE_AUDIT).sort((a, b) => a.created - b.created)) {
  nFailed++;
  const code = c.outcome?.reason || c.failure_code || '—';
  console.log(
    `    ${fmt(c.created)}  ${usd(c.amount)}  pm=${c.payment_method_details?.type || '?'}  code=${code}  email=${c.billing_details?.email || '?'}  msg="${(c.failure_message || '').slice(0, 70)}"`
  );
}
console.log(`  failed charges since audit: ${nFailed}`);

console.log('\n  --- open/uncollectible invoices (all current) ---');
const openInv = [];
for await (const i of stripe.invoices.list({ status: 'open', limit: 100, expand: ['data.customer'] })) openInv.push(i);
for await (const i of stripe.invoices.list({ status: 'uncollectible', limit: 100, expand: ['data.customer'] })) openInv.push(i);
console.log(`  count=${openInv.length}`);
for (const i of openInv) {
  console.log(
    `    ${i.id}  ${i.customer?.email || i.customer}  status=${i.status}  due=${usd(i.amount_due)}  paid=${usd(i.amount_paid)}  attempts=${i.attempt_count}  created=${fmt(i.created)}  next=${fmt(i.next_payment_attempt)}`
  );
}

console.log('\n  --- invoices created since audit (all statuses) ---');
const invSince = [];
for await (const i of stripe.invoices.list({ created: { gte: SINCE_AUDIT }, limit: 100, expand: ['data.customer'] })) invSince.push(i);
console.log(`  count=${invSince.length}`);
for (const i of invSince.sort((a, b) => a.created - b.created)) {
  console.log(
    `    ${fmt(i.created)}  ${i.id}  ${i.customer?.email || i.customer}  status=${i.status}  due=${usd(i.amount_due)}  paid=${usd(i.amount_paid)}  attempts=${i.attempt_count}  reason=${i.billing_reason}`
  );
}

// ───────────────────────────────────────────────────────────────────────────
// D. HALF50 COUPON
// ───────────────────────────────────────────────────────────────────────────
console.log('\n\n═══ D. HALF50 COUPON ═══\n');
try {
  const coupon = await stripe.coupons.retrieve(process.env.STRIPE_COUPON_HALF50 || 'HALF50');
  console.log(`  EXISTS: id=${coupon.id}  ${coupon.percent_off}% off  duration=${coupon.duration}  valid=${coupon.valid}`);
  console.log(`  created=${fmt(coupon.created)}  redeem_by=${fmt(coupon.redeem_by)}  times_redeemed=${coupon.times_redeemed}  max_redemptions=${coupon.max_redemptions}`);
} catch (e) {
  console.log(`  NOT FOUND / error: ${e.message}`);
}
// any promotion codes?
try {
  const promos = await stripe.promotionCodes.list({ limit: 100 });
  console.log(`  promotion codes in account: ${promos.data.length}`);
  for (const p of promos.data) console.log(`    ${p.code} coupon=${p.coupon?.id} active=${p.active} times_redeemed=${p.times_redeemed}`);
} catch (e) {
  console.log(`  promo list error: ${e.message}`);
}
// all coupons
try {
  const coupons = await stripe.coupons.list({ limit: 100 });
  console.log(`  all coupons: ${coupons.data.map((c) => `${c.id}(${c.percent_off}%,redeemed=${c.times_redeemed})`).join(', ') || 'none'}`);
} catch (e) {
  console.log(`  coupon list error: ${e.message}`);
}

// ───────────────────────────────────────────────────────────────────────────
// E. DUPLICATE CUSTOMERS
// ───────────────────────────────────────────────────────────────────────────
console.log('\n\n═══ E. DUPLICATE CUSTOMERS (same email, multiple cus_) ═══\n');
const customers = [];
for await (const c of stripe.customers.list({ limit: 100 })) customers.push(c);
console.log(`  total customers: ${customers.length}`);
const byEmail = {};
for (const c of customers) {
  const e = (c.email || '').toLowerCase();
  if (!e) continue;
  (byEmail[e] = byEmail[e] || []).push(c);
}
let dupCount = 0;
let newDupSinceAudit = 0;
for (const [e, list] of Object.entries(byEmail)) {
  if (list.length > 1) {
    dupCount++;
    const anyNew = list.some((c) => c.created >= SINCE_AUDIT);
    if (anyNew && list.filter((c) => c.created >= SINCE_AUDIT).length >= 1 && list.length > 1) {
      // dup pair where at least one record was created since audit
      const newOnes = list.filter((c) => c.created >= SINCE_AUDIT).length;
      if (newOnes >= 1) newDupSinceAudit++;
    }
    console.log(`  DUP ${e}: ${list.length} records`);
    for (const c of list.sort((a, b) => a.created - b.created)) {
      console.log(`      ${c.id}  created=${fmt(c.created)}  since_audit=${c.created >= SINCE_AUDIT}`);
    }
  }
}
console.log(`  emails with >1 customer record: ${dupCount}  (of which involving a record created since audit: ${newDupSinceAudit})`);
const noEmail = customers.filter((c) => !c.email).length;
console.log(`  customers with NO email: ${noEmail}`);
const custSinceAudit = customers.filter((c) => c.created >= SINCE_AUDIT);
console.log(`  customers created since audit: ${custSinceAudit.length}`);
for (const c of custSinceAudit.sort((a, b) => a.created - b.created)) {
  console.log(`    ${c.id}  ${fmt(c.created)}  ${c.email || '(no email)'}  metadata=${JSON.stringify(c.metadata || {})}`);
}

// ───────────────────────────────────────────────────────────────────────────
// F. PAYMENT_METHOD_TYPES on sessions since audit
// ───────────────────────────────────────────────────────────────────────────
console.log('\n\n═══ F. PAYMENT_METHOD_TYPES on sessions since audit ═══\n');
const pmCount = {};
for (const s of sessions) {
  const key = `${s.mode}:${(s.payment_method_types || []).slice().sort().join('+')}`;
  pmCount[key] = (pmCount[key] || 0) + 1;
}
for (const [k, v] of Object.entries(pmCount).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(40)} ${v}`);
const WALLET_BAD = ['cashapp', 'klarna', 'amazon_pay', 'afterpay_clearpay', 'affirm'];
let violations = 0;
for (const s of sessions.filter((x) => x.mode === 'subscription')) {
  for (const bad of WALLET_BAD) {
    if ((s.payment_method_types || []).includes(bad)) {
      violations++;
      console.log(`  VIOLATION: ${s.id} ${fmt(s.created)} has '${bad}'`);
    }
  }
}
console.log(`  sub-mode wallet violations since audit: ${violations}`);

console.log('\n— END read-only audit —');
