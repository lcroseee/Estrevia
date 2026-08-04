// READ-ONLY probe — 2026-05-29
// Verify true paid state of the 2 "active" subs + cohort outcomes haileyanda8399 / durand.lisaanne.
// Confirms whether active subs have a paid (>$0) invoice or are merely in renewal grace.

import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const fmt = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 19) : '—');
const usd = (c) => `$${((c || 0) / 100).toFixed(2)}`;

const SUBS = [
  ['gatito66679 (ACTIVE)', 'sub_1TarHzDoVTUWyGzGNjywKMuL'],
  ['divinelyguided2626 (ACTIVE)', 'sub_1TagCXDoVTUWyGzGJzBZBH8B'],
  ['haileyanda8399', 'sub_1Ta5QQDoVTUWyGzGIYTrakB4'],
  ['durand.lisaanne', 'sub_1Ta7mfDoVTUWyGzGg3IJpNWR'],
];

for (const [label, id] of SUBS) {
  const s = await stripe.subscriptions.retrieve(id, {
    expand: ['latest_invoice', 'latest_invoice.payment_intent', 'customer'],
  });
  const cust = s.customer;
  const amt = s.items.data[0]?.price?.unit_amount || 0;
  const interval = s.items.data[0]?.price?.recurring?.interval || '?';
  console.log(`\n═══ ${label} — ${id}`);
  console.log(`  email                : ${cust?.email}`);
  console.log(`  status               : ${s.status}`);
  console.log(`  plan                 : ${usd(amt)}/${interval}`);
  console.log(`  cancel_at_period_end : ${s.cancel_at_period_end}`);
  console.log(`  canceled_at          : ${fmt(s.canceled_at)}`);
  console.log(`  ended_at             : ${fmt(s.ended_at)}`);
  console.log(`  trial_end            : ${fmt(s.trial_end)}`);
  console.log(`  current_period_start : ${fmt(s.current_period_start)}`);
  console.log(`  current_period_end   : ${fmt(s.current_period_end)}`);
  const inv = s.latest_invoice;
  if (inv) {
    console.log(`  latest_invoice       : ${inv.id} status=${inv.status} amount_paid=${usd(inv.amount_paid)} amount_due=${usd(inv.amount_due)} attempt=${inv.attempt_count}`);
    const pi = inv.payment_intent;
    if (pi?.last_payment_error) {
      console.log(`  pi.error             : code=${pi.last_payment_error.code} decline=${pi.last_payment_error.decline_code} msg=${pi.last_payment_error.message?.slice(0,80)}`);
    }
  }
  // All paid invoices for this customer to confirm REAL money collected
  const invs = await stripe.invoices.list({ customer: cust.id, limit: 20 });
  let totalPaid = 0;
  for (const i of invs.data) totalPaid += i.amount_paid || 0;
  console.log(`  lifetime amount_paid : ${usd(totalPaid)} across ${invs.data.length} invoices`);
  for (const i of invs.data) {
    console.log(`    inv ${i.id} status=${i.status} paid=${usd(i.amount_paid)} due=${usd(i.amount_due)} created=${fmt(i.created)} billing_reason=${i.billing_reason}`);
  }
}

// Total REAL money collected lifetime (charges, all-time)
console.log('\n\n═══ LIFETIME CHARGES (real money collected, all customers) ═══');
const charges = await stripe.charges.list({ limit: 100 });
let collected = 0, refunded = 0, succeeded = 0;
for (const c of charges.data) {
  if (c.paid && c.status === 'succeeded') { collected += c.amount; succeeded++; }
  refunded += c.amount_refunded || 0;
}
console.log(`  succeeded charges: ${succeeded}  gross collected: ${usd(collected)}  refunded: ${usd(refunded)}  net: ${usd(collected - refunded)}`);
for (const c of charges.data.filter(x => x.status === 'succeeded' && x.amount > 0)) {
  console.log(`    ${fmt(c.created)} ${usd(c.amount)} ${c.billing_details?.email || c.receipt_email || '?'} refunded=${usd(c.amount_refunded)}`);
}

console.log('\n— End cohort probe —');
