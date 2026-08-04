// READ-ONLY probe part 2: gatito invoices, charges window, Meta retry with META_ACCESS_TOKEN
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const since0529 = Math.floor(Date.UTC(2026, 4, 29) / 1000);

console.log('=== STRIPE: gatito66679 invoices + sub detail ===');
const search = await stripe.customers.search({ query: `email~"gatito66679"`, limit: 5 });
for (const c of search.data) {
  console.log(`customer ${c.id} | ${c.email}`);
  const cSubs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 10 });
  for (const sub of cSubs.data) {
    console.log(`  sub ${sub.id} status=${sub.status} cape=${sub.cancel_at_period_end} canceled_at=${sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : '-'} ended_at=${sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : '-'}`);
    if (sub.cancellation_details) console.log(`  cancellation_details: ${JSON.stringify(sub.cancellation_details)}`);
  }
  const invoices = await stripe.invoices.list({ customer: c.id, limit: 10 });
  for (const inv of invoices.data) {
    console.log(`  invoice ${new Date(inv.created * 1000).toISOString().slice(0, 10)} amount_paid=${inv.amount_paid} status=${inv.status}`);
  }
}

console.log('\n=== STRIPE: charges >= 2026-05-29 ===');
let n = 0;
for await (const ch of stripe.charges.list({ created: { gte: since0529 }, limit: 100 })) {
  n++;
  console.log(`${new Date(ch.created * 1000).toISOString().slice(0, 10)} | ${ch.amount} ${ch.currency} | ${ch.status} | ${ch.billing_details?.email ?? '-'} | ${ch.outcome?.seller_message ?? ''}`);
}
console.log('total charges in window:', n);

console.log('\n=== META retry with META_ACCESS_TOKEN ===');
for (const [name, tok] of [['META_ACCESS_TOKEN', process.env.META_ACCESS_TOKEN], ['META_MARKETING_API_TOKEN', process.env.META_MARKETING_API_TOKEN]]) {
  if (!tok) { console.log(name, ': unset'); continue; }
  try {
    const u = new URL(`https://graph.facebook.com/v21.0/act_1435842067150024/insights`);
    u.searchParams.set('time_range', JSON.stringify({ since: '2026-05-24', until: '2026-07-10' }));
    u.searchParams.set('time_increment', '7');
    u.searchParams.set('fields', 'spend,impressions');
    u.searchParams.set('access_token', tok);
    const r = await fetch(u);
    const j = await r.json();
    if (j.error) console.log(`${name}: ERROR ${j.error.code} ${j.error.message.slice(0, 120)}`);
    else if (!j.data?.length) console.log(`${name}: OK — NO ROWS ($0 spend whole window)`);
    else { console.log(`${name}: OK`); for (const row of j.data) console.log(`  ${row.date_start}→${row.date_stop}: $${row.spend} impr=${row.impressions ?? 0}`); }
  } catch (e) { console.log(`${name}: fetch failed ${e.message}`); }
}
