// READ-ONLY probe: Meta account state + Stripe ES sessions/subs for CRO audit 2026-07-10
import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const META_TOKEN = process.env.META_MARKETING_API_TOKEN;
const ACCT = 'act_1435842067150024';

// ── 1. Meta: spend by week since 2026-05-24 ─────────────────────────────
console.log('=== META: account insights weekly 2026-05-24 → 2026-07-10 ===');
try {
  const u = new URL(`https://graph.facebook.com/v21.0/${ACCT}/insights`);
  u.searchParams.set('time_range', JSON.stringify({ since: '2026-05-24', until: '2026-07-10' }));
  u.searchParams.set('time_increment', '7');
  u.searchParams.set('fields', 'spend,impressions,reach,actions');
  u.searchParams.set('access_token', META_TOKEN);
  const r = await fetch(u);
  const j = await r.json();
  if (j.error) console.log('Meta error:', j.error.message);
  else if (!j.data || j.data.length === 0) console.log('NO DATA — $0 spend entire window');
  else for (const row of j.data) console.log(`${row.date_start}→${row.date_stop}: spend=$${row.spend} impr=${row.impressions ?? 0} reach=${row.reach ?? 0}`);
} catch (e) { console.log('Meta fetch failed:', e.message); }

console.log('\n=== META: campaign + adset statuses ===');
try {
  const u = new URL(`https://graph.facebook.com/v21.0/${ACCT}/campaigns`);
  u.searchParams.set('fields', 'name,status,effective_status,updated_time,adsets{name,status,effective_status,daily_budget,updated_time}');
  u.searchParams.set('limit', '25');
  u.searchParams.set('access_token', META_TOKEN);
  const r = await fetch(u);
  const j = await r.json();
  if (j.error) console.log('Meta error:', j.error.message);
  else for (const c of j.data ?? []) {
    console.log(`CAMPAIGN ${c.name} — ${c.effective_status} (updated ${c.updated_time})`);
    for (const a of c.adsets?.data ?? []) {
      console.log(`   adset ${a.name} — ${a.effective_status} budget=${a.daily_budget} (updated ${a.updated_time})`);
    }
  }
} catch (e) { console.log('Meta fetch failed:', e.message); }

// ── 2. Stripe: checkout sessions since 2026-05-29, by locale ────────────
const since0529 = Math.floor(Date.UTC(2026, 4, 29) / 1000);
console.log('\n=== STRIPE: checkout.sessions created >= 2026-05-29 UTC ===');
const sessions = [];
for await (const s of stripe.checkout.sessions.list({ created: { gte: since0529 }, limit: 100 })) {
  sessions.push(s);
}
console.log('total sessions in window:', sessions.length);
for (const s of sessions) {
  const d = new Date(s.created * 1000).toISOString().slice(0, 16);
  console.log(
    `${d} | ${s.id.slice(0, 22)} | locale=${s.locale ?? 'auto'} metaLocale=${s.metadata?.locale ?? '-'} | status=${s.status}/${s.payment_status} | email=${(s.customer_details?.email ?? s.customer_email ?? '-').slice(0, 28)} | amt=${s.amount_total} ${s.currency} | utm_src=${s.metadata?.utm_source ?? '-'}`
  );
}

// ── 3. Stripe: ALL subscriptions snapshot (status=all) ──────────────────
console.log('\n=== STRIPE: all subscriptions (ever) ===');
const subs = [];
for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) subs.push(sub);
console.log('total subs ever:', subs.length);
for (const sub of subs) {
  const created = new Date(sub.created * 1000).toISOString().slice(0, 10);
  console.log(
    `${created} | ${sub.id.slice(0, 18)} | status=${sub.status} | cape=${sub.cancel_at_period_end} | canceled_at=${sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString().slice(0, 10) : '-'} | ended_at=${sub.ended_at ? new Date(sub.ended_at * 1000).toISOString().slice(0, 10) : '-'} | locale=${sub.metadata?.locale ?? '-'} | cust=${typeof sub.customer === 'string' ? sub.customer.slice(0, 18) : '-'}`
  );
}

// ── 4. gatito66679 (first ES payer) — current state ─────────────────────
console.log('\n=== STRIPE: gatito66679 (first-ever ES payer, 5/28) ===');
const search = await stripe.customers.search({ query: `email~"gatito66679"`, limit: 5 });
for (const c of search.data) {
  console.log(`customer ${c.id} | ${c.email} | created ${new Date(c.created * 1000).toISOString().slice(0, 10)}`);
  const cSubs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 10 });
  for (const sub of cSubs.data) {
    console.log(`  sub ${sub.id} status=${sub.status} cape=${sub.cancel_at_period_end} canceled_at=${sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : '-'} ended_at=${sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : '-'} current_period_end=${new Date(sub.current_period_end * 1000).toISOString().slice(0, 10)}`);
  }
  const invoices = await stripe.invoices.list({ customer: c.id, limit: 10 });
  for (const inv of invoices.data) {
    console.log(`  invoice ${new Date(inv.created * 1000).toISOString().slice(0, 10)} amount_paid=${inv.amount_paid} status=${inv.status}`);
  }
}

// ── 5. Charges since 2026-05-29 (any real money in the window?) ─────────
console.log('\n=== STRIPE: charges >= 2026-05-29 ===');
for await (const ch of stripe.charges.list({ created: { gte: since0529 }, limit: 100 })) {
  console.log(`${new Date(ch.created * 1000).toISOString().slice(0, 10)} | ${ch.amount} ${ch.currency} | ${ch.status} | ${ch.billing_details?.email ?? '-'} | ${ch.outcome?.seller_message ?? ''}`);
}
