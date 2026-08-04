// CRO audit 2026-07-10 — Resend sector part 2. READ-ONLY (SQL SELECT + Stripe GET).
// A) Who are the stripe-pending-*@placeholder.invalid users receiving (and bouncing)
//    lifecycle/dunning emails? Do they have a real email anywhere (Stripe customer)?
// B) Drip → Stripe attribution since 2026-05-29: sessions with utm_source=lead-nurture /
//    cart-abandon; is utm_content present (finding #7 from 05-29 audit)?
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ---------------- A. placeholder users ----------------
const ph = await sql`
  SELECT id, email, subscription_status, plan, subscription_tier,
         stripe_customer_id, stripe_subscription_id, trial_end, created_at, email_undeliverable
  FROM users WHERE email LIKE 'stripe-pending-%' OR email LIKE '%placeholder.invalid%'
  ORDER BY created_at`;
console.log(`=== users with placeholder email: ${ph.length} ===`);
for (const u of ph) {
  console.log(`\nuser ${u.id}`);
  console.log(`  email: ${u.email}`);
  console.log(`  status=${u.subscription_status} plan=${u.plan} tier=${u.subscription_tier} undeliverable_flag=${u.email_undeliverable}`);
  console.log(`  stripe_customer=${u.stripe_customer_id} sub=${u.stripe_subscription_id}`);
  console.log(`  trial_end=${u.trial_end} created=${u.created_at}`);
  if (u.stripe_customer_id) {
    try {
      const cust = await stripe.customers.retrieve(u.stripe_customer_id);
      console.log(`  -> STRIPE customer real email: ${cust.email ?? '(none)'} name=${cust.name ?? ''}`);
    } catch (e) {
      console.log(`  -> stripe customer fetch failed: ${e.message}`);
    }
  }
  if (u.stripe_subscription_id) {
    try {
      const s = await stripe.subscriptions.retrieve(u.stripe_subscription_id);
      console.log(`  -> STRIPE sub status=${s.status} cancel_at_period_end=${s.cancel_at_period_end} canceled_at=${s.canceled_at ? new Date(s.canceled_at*1000).toISOString() : null} ended_at=${s.ended_at ? new Date(s.ended_at*1000).toISOString() : null}`);
    } catch (e) {
      console.log(`  -> stripe sub fetch failed: ${e.message}`);
    }
  }
}

// How many lifecycle emails went to placeholder addresses (dunning table joins users)
const dunPh = await sql`
  SELECT d.dunning_step, d.sent_at, u.email
  FROM sent_dunning_emails d JOIN users u ON u.id = d.user_id
  ORDER BY d.sent_at`;
const phDun = dunPh.filter((r) => r.email.includes('placeholder.invalid'));
console.log(`\n=== sent_dunning_emails total=${dunPh.length}, to placeholder=${phDun.length} ===`);
for (const r of phDun) console.log(`  ${r.sent_at.toISOString?.().slice(0,16) ?? r.sent_at} ${r.dunning_step} -> ${r.email.slice(0, 60)}`);

// Any other send-log tables that may target users (trial reminders / winback)?
const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name LIKE 'sent_%' ORDER BY table_name`;
console.log('\n=== sent_* tables in prod ===');
console.log(tables.map((t) => t.table_name).join(', '));

// ---------------- B. Stripe sessions since 05-29 ----------------
const since = Math.floor(new Date('2026-05-29T00:00:00Z').getTime() / 1000);
let sessions = [];
let starting_after;
for (let i = 0; i < 30; i++) {
  const opts = { limit: 100, created: { gte: since } };
  if (starting_after) opts.starting_after = starting_after;
  const page = await stripe.checkout.sessions.list(opts);
  sessions.push(...page.data);
  if (!page.has_more) break;
  starting_after = page.data[page.data.length - 1].id;
}
console.log(`\n=== Stripe checkout sessions since 2026-05-29: ${sessions.length} ===`);
const bySource = {};
for (const s of sessions) {
  const src = s.metadata?.utm_source ?? '(none)';
  bySource[src] = (bySource[src] || 0) + 1;
}
console.table(Object.entries(bySource).map(([k, v]) => ({ utm_source: k, n: v })));

const emailSess = sessions.filter((s) => ['lead-nurture', 'cart-abandon'].includes(s.metadata?.utm_source));
console.log(`Email-attributed sessions: ${emailSess.length}`);
console.table(emailSess.map((s) => ({
  id: s.id.slice(0, 20),
  campaign: s.metadata?.utm_campaign,
  content: s.metadata?.utm_content ?? '(NULL)',
  status: s.status,
  email: (s.customer_email || s.customer_details?.email || '').slice(0, 28),
  amount: s.amount_total,
  created: new Date(s.created * 1000).toISOString().slice(0, 16),
})));

// utm_content presence across ALL sessions since 05-29 (finding #7: drip sets none)
const withContent = sessions.filter((s) => s.metadata?.utm_content);
console.log(`Sessions with utm_content set: ${withContent.length}/${sessions.length}`);
const contentVals = {};
for (const s of withContent) contentVals[s.metadata.utm_content] = (contentVals[s.metadata.utm_content] || 0) + 1;
console.table(Object.entries(contentVals).map(([k, v]) => ({ utm_content: k.slice(0, 40), n: v })));

// completed sessions overall (context)
const complete = sessions.filter((s) => s.status === 'complete');
console.log(`\nCompleted sessions since 05-29: ${complete.length}`);
console.table(complete.map((s) => ({
  id: s.id.slice(0, 20),
  src: s.metadata?.utm_source ?? '(none)',
  campaign: s.metadata?.utm_campaign ?? '',
  email: (s.customer_email || s.customer_details?.email || '').slice(0, 30),
  mode: s.mode,
  amount: s.amount_total,
  created: new Date(s.created * 1000).toISOString().slice(0, 16),
})));

console.log('\nREAD-ONLY complete.');
