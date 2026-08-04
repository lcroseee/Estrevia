// Deep traffic audit — 2026-05-21 (afternoon refresh)
// Focus: trial cohort outcomes, creative-level Meta perf, drip attribution post-fix,
// new $34.99 trial product variant detection, Stripe-DB sync deltas.

import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = neon(process.env.DATABASE_URL);

const since30 = Math.floor(Date.now() / 1000) - 30 * 86400;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  TRAFFIC DEEP AUDIT — 2026-05-21 afternoon');
console.log('═══════════════════════════════════════════════════════════════\n');

// ───────────────── A. TRIAL COHORT OUTCOMES (the 3 ending today) ─────────────────
console.log('═══ A. TRIAL COHORT — ALL SUBS INCL. CANCELED/PAST_DUE ═══');
const allSubs = await stripe.subscriptions.list({ limit: 100, status: 'all' });
console.log(`  Total subs (lifetime): ${allSubs.data.length}`);
for (const sub of allSubs.data.sort((a, b) => b.created - a.created)) {
  const created = new Date(sub.created * 1000).toISOString().slice(0, 19);
  const ends = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString().slice(0, 19) : '—';
  const cancel = sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString().slice(0, 19) : '—';
  const amt = (sub.items.data[0]?.price?.unit_amount || 0) / 100;
  const interval = sub.items.data[0]?.price?.recurring?.interval || '?';
  const customer = await stripe.customers.retrieve(sub.customer).catch(() => ({}));
  console.log(`  ${sub.id.slice(0, 25)}`);
  console.log(`    status=${sub.status} amt=$${amt}/${interval}`);
  console.log(`    customer=${customer.email || sub.customer}`);
  console.log(`    created=${created} trial_end=${ends} canceled_at=${cancel}`);
  console.log(`    metadata=${JSON.stringify(sub.metadata || {})}`);
}

// ───────────────── B. RECENT CHECKOUT SESSIONS DETAIL ─────────────────
console.log('\n═══ B. RECENT CHECKOUT SESSIONS (last 14d) — utm + amount detail ═══');
const sessions = (await stripe.checkout.sessions.list({ limit: 100, created: { gte: since30 } })).data;
sessions.sort((a, b) => b.created - a.created);
console.log(`  Total: ${sessions.length}`);

const sub30d = sessions.filter(s => s.created > Math.floor(Date.now()/1000) - 14*86400);
for (const s of sub30d.slice(0, 30)) {
  const created = new Date(s.created * 1000).toISOString().slice(0, 19);
  const utm_src = s.metadata?.utm_source || '(none)';
  const utm_cam = s.metadata?.utm_campaign || '(none)';
  const utm_med = s.metadata?.utm_medium || '(none)';
  const utm_con = s.metadata?.utm_content || '(none)';
  const email = s.customer_email || s.customer_details?.email || '?';
  const amt = (s.amount_total || 0) / 100;
  const plan = s.metadata?.plan || s.metadata?.plan_id || '?';
  console.log(`  ${created} ${s.status.padEnd(8)} ${email.slice(0, 30).padEnd(30)} $${amt} plan=${plan}`);
  console.log(`    utm: src=${utm_src} med=${utm_med} cam=${utm_cam} content=${utm_con.slice(0, 30)}`);
}

// ───────────────── C. STRIPE PRICES — what plans are being sold? ─────────────────
console.log('\n═══ C. STRIPE PRICES (all active) ═══');
const prices = (await stripe.prices.list({ limit: 50, active: true, expand: ['data.product'] })).data;
for (const p of prices) {
  const amt = (p.unit_amount || 0) / 100;
  const interval = p.recurring?.interval || '?';
  const product_name = p.product?.name || p.product;
  console.log(`  ${p.id} $${amt}/${interval} product=${product_name}`);
}

// ───────────────── D. EMAIL DRIP SENDS — TODAY ─────────────────
console.log('\n═══ D. SENT_LEAD_EMAILS — break by type, last 7d ═══');
const drip = await sql`
  SELECT email_type, COUNT(*)::int AS n,
         MIN(created_at) AS first_sent, MAX(created_at) AS last_sent,
         COUNT(CASE WHEN resend_message_id IS NOT NULL THEN 1 END)::int AS with_msgid
  FROM sent_lead_emails
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY email_type
  ORDER BY n DESC
`;
for (const r of drip) {
  console.log(`  ${r.email_type.padEnd(28)} n=${String(r.n).padStart(4)} msgid=${r.with_msgid} first=${r.first_sent.toISOString().slice(0,19)} last=${r.last_sent.toISOString().slice(0,19)}`);
}

// ───────────────── E. LEAD NURTURE STATE — leads on which step? ─────────────────
console.log('\n═══ E. LEAD NURTURE STEPS — current state ═══');
const steps = await sql`
  SELECT nurture_step, COUNT(*)::int AS leads,
         COUNT(CASE WHEN converted_to_user_id IS NOT NULL THEN 1 END)::int AS converted,
         COUNT(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 END)::int AS unsub,
         COUNT(CASE WHEN email_undeliverable THEN 1 END)::int AS undeliverable,
         COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END)::int AS recent_24h
  FROM email_leads
  GROUP BY 1 ORDER BY 1
`;
for (const r of steps) {
  console.log(`  step=${r.nurture_step}  leads=${String(r.leads).padStart(4)}  conv=${r.converted}  unsub=${r.unsub}  undelv=${r.undeliverable}  rec24h=${r.recent_24h}`);
}

// ───────────────── F. CHARTS WITHOUT EMAIL CAPTURE ─────────────────
console.log('\n═══ F. CHART → EMAIL FUNNEL by locale & utm (14d) ═══');
const chartLocale = await sql`
  SELECT
    CASE WHEN locale IS NULL THEN '(none)' ELSE locale END AS locale,
    COUNT(*)::int AS charts,
    COUNT(DISTINCT lead_id) FILTER (WHERE lead_id IS NOT NULL)::int AS with_lead
  FROM natal_charts
  WHERE created_at > NOW() - INTERVAL '14 days'
  GROUP BY 1
`;
for (const r of chartLocale) {
  const captureRate = r.charts > 0 ? ((r.with_lead / r.charts) * 100).toFixed(1) : '0.0';
  console.log(`  locale=${r.locale.padEnd(10)} charts=${String(r.charts).padStart(4)} with_lead=${r.with_lead} (${captureRate}% capture)`);
}

// ───────────────── G. DRIP→STRIPE attribution chain (post-fix verify) ─────────────────
console.log('\n═══ G. DRIP→STRIPE — UTM chain check ═══');
const dripSessions = sessions.filter(s => (s.metadata?.utm_source || '').includes('lead-nurture'));
console.log(`  Lead-nurture Stripe sessions: ${dripSessions.length}`);
for (const s of dripSessions) {
  const created = new Date(s.created * 1000).toISOString().slice(0, 19);
  const email = s.customer_email || s.customer_details?.email || '?';
  console.log(`  ${created} ${s.status.padEnd(8)} ${email.slice(0, 35).padEnd(35)} utm: ${s.metadata?.utm_source}|${s.metadata?.utm_campaign}|${s.metadata?.utm_content}`);
}

// ───────────────── H. STRIPE-DB sync gap ─────────────────
console.log('\n═══ H. STRIPE↔USERS SYNC GAP ═══');
const stripeCustomers = new Set();
for (const sub of allSubs.data) {
  if (sub.status !== 'canceled') stripeCustomers.add(sub.customer);
}
const dbPaidEmails = await sql`
  SELECT email, stripe_customer_id, subscription_tier, subscription_status, updated_at
  FROM users WHERE subscription_tier <> 'free' OR subscription_status IN ('trialing','active','past_due')
`;
console.log(`  DB paid/trialing/past_due users: ${dbPaidEmails.length}`);
console.log(`  Stripe customers with non-canceled sub: ${stripeCustomers.size}`);
for (const u of dbPaidEmails) {
  const matches = stripeCustomers.has(u.stripe_customer_id);
  console.log(`    ${u.email.padEnd(38)} tier=${u.subscription_tier} status=${u.subscription_status} cust=${u.stripe_customer_id?.slice(0,18)} match=${matches}`);
}

// ───────────────── I. CONVERTED USERS DEEP LOOK ─────────────────
console.log('\n═══ I. ALL USERS (last 14d) — to spot conversion path ═══');
const allUsers = await sql`
  SELECT u.email, u.created_at, u.subscription_tier, u.subscription_status,
         lc.utm_source, lc.utm_campaign, lc.locale, lc.created_at AS lead_at,
         lc.converted_to_user_id IS NOT NULL AS marked_converted
  FROM users u
  LEFT JOIN email_leads lc ON lc.email = u.email
  WHERE u.created_at > NOW() - INTERVAL '14 days'
  ORDER BY u.created_at DESC
`;
for (const u of allUsers) {
  console.log(`  ${u.created_at.toISOString().slice(0, 19)}  ${(u.email||'').padEnd(38)} tier=${u.subscription_tier.padEnd(8)} status=${u.subscription_status.padEnd(9)}`);
  console.log(`    lead: utm=${u.utm_source || '?'}|${u.utm_campaign || '?'} locale=${u.locale || '?'} marked_conv=${u.marked_converted}`);
}

console.log('\n— End deep traffic audit —');
