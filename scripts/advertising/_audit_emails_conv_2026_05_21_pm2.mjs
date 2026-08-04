// Email + conversion status check — late afternoon 2026-05-21
// Focus: deltas in last 24h vs cumulative, drip→Stripe attribution, trial cohort movement.

import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = neon(process.env.DATABASE_URL);

const fmt = (d) => d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—';
const since24h = Math.floor(Date.now() / 1000) - 86400;
const since7d = Math.floor(Date.now() / 1000) - 7 * 86400;

console.log('═══════════════════════════════════════════════════════════════');
console.log(`  EMAIL + CONVERSION STATUS — ${new Date().toISOString().slice(0, 19)} UTC`);
console.log('═══════════════════════════════════════════════════════════════\n');

// ───────────────── A. EMAIL SENDS — 24h vs 7d ─────────────────
console.log('═══ A. DRIP EMAILS — sent_lead_emails ═══');
const driproot = await sql`
  SELECT email_type,
         COUNT(*)::int AS total_7d,
         COUNT(CASE WHEN sent_at > NOW() - INTERVAL '24 hours' THEN 1 END)::int AS last_24h,
         COUNT(CASE WHEN sent_at > NOW() - INTERVAL '6 hours' THEN 1 END)::int AS last_6h,
         COUNT(CASE WHEN resend_message_id IS NOT NULL THEN 1 END)::int AS with_msgid,
         MIN(sent_at) AS first_sent,
         MAX(sent_at) AS last_sent
  FROM sent_lead_emails
  WHERE sent_at > NOW() - INTERVAL '7 days'
  GROUP BY email_type
  ORDER BY last_sent DESC
`;

console.log('  type                       7d   24h   6h   msgid   first / last');
for (const r of driproot) {
  const t = r.email_type.padEnd(26);
  console.log(`  ${t} ${String(r.total_7d).padStart(4)}  ${String(r.last_24h).padStart(4)}  ${String(r.last_6h).padStart(3)}  ${String(r.with_msgid).padStart(5)}   ${fmt(r.first_sent)} → ${fmt(r.last_sent)}`);
}

const [{ total_drip }] = await sql`SELECT COUNT(*)::int AS total_drip FROM sent_lead_emails WHERE sent_at > NOW() - INTERVAL '7 days'`;
const [{ today_drip }] = await sql`SELECT COUNT(*)::int AS today_drip FROM sent_lead_emails WHERE sent_at > NOW() - INTERVAL '24 hours'`;
console.log(`  TOTAL 7d: ${total_drip}, last 24h: ${today_drip}`);

// ───────────────── B. LEAD STEP DISTRIBUTION ─────────────────
console.log('\n═══ B. LEAD NURTURE STEP DISTRIBUTION ═══');
const steps = await sql`
  SELECT nurture_step,
         COUNT(*)::int AS leads,
         COUNT(CASE WHEN converted_to_user_id IS NOT NULL THEN 1 END)::int AS converted,
         COUNT(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 END)::int AS unsub,
         COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END)::int AS rec24h
  FROM email_leads
  GROUP BY 1 ORDER BY 1
`;
console.log('  step  leads  conv  unsub  rec24h');
for (const r of steps) {
  console.log(`    ${r.nurture_step}    ${String(r.leads).padStart(4)}  ${String(r.converted).padStart(4)}  ${String(r.unsub).padStart(4)}  ${String(r.rec24h).padStart(5)}`);
}

// ───────────────── C. NEW LEADS in 24h ─────────────────
console.log('\n═══ C. NEW LEADS today (24h) ═══');
const newLeads = await sql`
  SELECT
    COALESCE(utm_source, '(none)') AS source,
    COALESCE(utm_campaign, '(none)') AS campaign,
    COUNT(*)::int AS leads
  FROM email_leads
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY 1,2
  ORDER BY leads DESC
`;
let totalNew = 0;
for (const r of newLeads) {
  totalNew += r.leads;
  console.log(`  ${r.source.padEnd(18)} ${r.campaign.padEnd(28)} ${r.leads}`);
}
console.log(`  TOTAL new leads in 24h: ${totalNew}`);

// ───────────────── D. STRIPE SESSIONS — 24h ─────────────────
console.log('\n═══ D. STRIPE CHECKOUT SESSIONS — last 24h ═══');
const sessions24h = (await stripe.checkout.sessions.list({ limit: 100, created: { gte: since24h } })).data;
console.log(`  Total: ${sessions24h.length}`);

const byStatus = {};
const bySource = {};
for (const s of sessions24h) {
  byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  const src = s.metadata?.utm_source || '(none)';
  bySource[src] = (bySource[src] || 0) + 1;
}
console.log(`  By status:  ${Object.entries(byStatus).map(([k,v]) => `${k}=${v}`).join(', ')}`);
console.log(`  By source:  ${Object.entries(bySource).map(([k,v]) => `${k}=${v}`).join(', ')}`);

console.log('\n  Sessions detail:');
for (const s of sessions24h.sort((a,b) => b.created - a.created).slice(0, 15)) {
  const created = fmt(s.created * 1000);
  const utm = `${s.metadata?.utm_source || '?'}/${s.metadata?.utm_campaign || '?'}/${(s.metadata?.utm_content || '?').slice(0,15)}`;
  const email = s.customer_email || s.customer_details?.email || '?';
  console.log(`  ${created} ${s.status.padEnd(8)} ${email.slice(0,28).padEnd(28)} ${utm}`);
}

// ───────────────── E. ACTIVE SUBSCRIPTIONS — current state ─────────────────
console.log('\n═══ E. ACTIVE/TRIALING/PAST_DUE SUBS ═══');
const allSubs = (await stripe.subscriptions.list({ limit: 100, status: 'all' })).data;
const live = allSubs.filter(s => ['active', 'trialing', 'past_due'].includes(s.status));
for (const s of live) {
  const cust = await stripe.customers.retrieve(s.customer).catch(() => ({}));
  const amt = (s.items.data[0]?.price?.unit_amount || 0) / 100;
  const intv = s.items.data[0]?.price?.recurring?.interval;
  const trialEnd = s.trial_end ? fmt(s.trial_end * 1000) : '—';
  const cap = s.cancel_at_period_end ? ' (cancel-at-period-end)' : '';
  console.log(`  ${(cust.email || s.customer).padEnd(35)} ${s.status.padEnd(9)} \$${amt}/${intv}  trial_end=${trialEnd}${cap}`);
}

// ───────────────── F. CONVERSIONS in 24h (new users) ─────────────────
console.log('\n═══ F. NEW USERS in 24h ═══');
const newUsers = await sql`
  SELECT u.email, u.created_at, u.subscription_tier, u.subscription_status,
         lc.utm_source, lc.utm_campaign,
         EXTRACT(EPOCH FROM (u.created_at - lc.created_at))/60 AS mins_after_lead
  FROM users u
  LEFT JOIN email_leads lc ON lc.email = u.email
  WHERE u.created_at > NOW() - INTERVAL '24 hours'
  ORDER BY u.created_at DESC
`;
if (newUsers.length === 0) console.log('  (no new users)');
for (const u of newUsers) {
  const mins = u.mins_after_lead != null ? Number(u.mins_after_lead).toFixed(0) : 'N/A';
  console.log(`  ${fmt(u.created_at)}  ${u.email.padEnd(36)} tier=${u.subscription_tier.padEnd(8)} status=${u.subscription_status.padEnd(9)}`);
  console.log(`    utm: ${u.utm_source || '?'}/${u.utm_campaign || '?'}  mins_after_lead=${mins}`);
}

// ───────────────── G. RESEND DELIVERABILITY — last 100 ─────────────────
console.log('\n═══ G. RESEND DELIVERABILITY — last 100 messages ═══');
try {
  const resendApi = 'https://api.resend.com/emails';
  const resp = await fetch(resendApi + '?limit=100', {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}`);
  const json = await resp.json();
  const msgs = json.data || [];
  console.log(`  Resend fetched: ${msgs.length} messages`);
  const stats = { delivered: 0, bounced: 0, complained: 0, opened: 0, clicked: 0 };
  for (const m of msgs) {
    if (m.last_event === 'delivered') stats.delivered += 1;
    if (m.last_event === 'bounced') stats.bounced += 1;
    if (m.last_event === 'complained') stats.complained += 1;
    if (m.opened_at || m.last_event === 'opened') stats.opened += 1;
    if (m.clicked_at || m.last_event === 'clicked') stats.clicked += 1;
  }
  console.log(`  delivered: ${stats.delivered}  bounced: ${stats.bounced}  complained: ${stats.complained}`);
  console.log(`  opened:    ${stats.opened}     clicked:  ${stats.clicked}`);
} catch (e) {
  console.log('  Resend fetch failed:', e.message);
}

console.log('\n— End emails+conv status —');
