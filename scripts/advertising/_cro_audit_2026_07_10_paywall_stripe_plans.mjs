// CRO audit 2026-07-10 — PAYWALL sector: Stripe plan-mix reality check (READ-ONLY, GET only).
// Question: the PaywallModal defaults to pro_annual ($34.99). Has ANY annual sub ever paid?
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const subs = [];
for await (const s of stripe.subscriptions.list({ status: 'all', limit: 100 })) subs.push(s);
console.log(`Total subscriptions ever: ${subs.length}`);
console.log('created | status | interval | amount | trial_end | cancel_at_period_end | canceled_at | ended_at | paid_total');

let paidByInterval = { month: 0, year: 0 };
let countByInterval = { month: 0, year: 0 };
for (const s of subs.sort((a, b) => a.created - b.created)) {
  const item = s.items.data[0];
  const interval = item?.price?.recurring?.interval ?? '?';
  const amount = (item?.price?.unit_amount ?? 0) / 100;
  countByInterval[interval] = (countByInterval[interval] ?? 0) + 1;
  // paid: sum of paid invoices > 0
  let paid = 0;
  try {
    const invs = await stripe.invoices.list({ subscription: s.id, limit: 20 });
    paid = invs.data.reduce((acc, i) => acc + (i.amount_paid ?? 0), 0) / 100;
  } catch {}
  if (paid > 0) paidByInterval[interval] = (paidByInterval[interval] ?? 0) + 1;
  const d = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '-');
  console.log(
    `${d(s.created)} | ${s.status} | ${interval} | $${amount} | ${d(s.trial_end)} | ${s.cancel_at_period_end} | ${d(s.canceled_at)} | ${d(s.ended_at)} | $${paid.toFixed(2)}`,
  );
}
console.log('\nSubs by interval:', JSON.stringify(countByInterval));
console.log('Subs with >$0 paid by interval:', JSON.stringify(paidByInterval));

// Checkout sessions in the audit window (05-29 → now): how many, completion, locale
const since = Math.floor(new Date('2026-05-29T00:00:00Z').getTime() / 1000);
const sessions = [];
for await (const cs of stripe.checkout.sessions.list({ created: { gte: since }, limit: 100 })) sessions.push(cs);
console.log(`\nCheckout sessions since 2026-05-29: ${sessions.length}`);
const byStatus = {};
for (const cs of sessions) {
  const k = `${cs.status}/${cs.payment_status}/${cs.locale ?? 'auto'}`;
  byStatus[k] = (byStatus[k] ?? 0) + 1;
}
console.log('status/payment_status/locale:', JSON.stringify(byStatus, null, 2));
for (const cs of sessions.filter((c) => c.status === 'complete')) {
  console.log('COMPLETED:', new Date(cs.created * 1000).toISOString().slice(0, 16),
    cs.locale, cs.customer_details?.email?.replace(/(.{3}).*(@.*)/, '$1***$2'),
    'amount_total=$' + (cs.amount_total ?? 0) / 100, 'utm_content=', cs.metadata?.utm_content ?? '-',
    'utm_source=', cs.metadata?.utm_source ?? '-');
}
