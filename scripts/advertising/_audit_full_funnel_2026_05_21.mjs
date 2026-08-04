// Comprehensive funnel audit — 2026-05-21
// Pulls: Stripe sessions/subscriptions, DB user state, lead conversion, cron pacing,
// landing→chart conversion proxies. Output digestible block-by-block for synthesis.

import { config } from 'dotenv';
config({ path: '.env' });
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = neon(process.env.DATABASE_URL);
// neon http does NOT need .end()

const since30 = Math.floor(Date.now() / 1000) - 30 * 86400;
const since7 = Math.floor(Date.now() / 1000) - 7 * 86400;
const since14 = Math.floor(Date.now() / 1000) - 14 * 86400;
const PAGE = 100;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  FULL FUNNEL AUDIT — 2026-05-21');
console.log('═══════════════════════════════════════════════════════════════\n');

// ───────────────── A. STRIPE SESSIONS (30d) ─────────────────
console.log('═══ A. STRIPE CHECKOUT SESSIONS — last 30d ═══');
let sessions = [];
let starting_after;
for (let i = 0; i < 30; i++) {
  const opts = { limit: PAGE, created: { gte: since30 } };
  if (starting_after) opts.starting_after = starting_after;
  const page = await stripe.checkout.sessions.list(opts);
  sessions.push(...page.data);
  if (!page.has_more) break;
  starting_after = page.data[page.data.length - 1].id;
}
console.log(`  Total sessions (30d): ${sessions.length}`);

const byStatus = {};
const byLocale = { en: 0, es: 0, other: 0 };
const completed = [];
const open = [];
const expired = [];
const utmSources = {};
const utmCampaigns = {};
const sessionsByDay = {};

for (const s of sessions) {
  byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  if (s.locale === 'en' || s.locale === 'auto') byLocale.en += 1;
  else if (s.locale === 'es') byLocale.es += 1;
  else byLocale.other += 1;

  const utm = s.metadata?.utm_source || '(none)';
  utmSources[utm] = (utmSources[utm] || 0) + 1;
  const camp = s.metadata?.utm_campaign || '(none)';
  utmCampaigns[camp] = (utmCampaigns[camp] || 0) + 1;

  const day = new Date(s.created * 1000).toISOString().slice(0, 10);
  sessionsByDay[day] = (sessionsByDay[day] || 0) + 1;

  if (s.status === 'complete') completed.push(s);
  if (s.status === 'open') open.push(s);
  if (s.status === 'expired') expired.push(s);
}

console.log(`  By status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', ')}`);
console.log(`  By locale: en=${byLocale.en} es=${byLocale.es} other=${byLocale.other}`);
console.log(`  Completed sessions: ${completed.length}`);
console.log(`  Open (abandoned): ${open.length}`);
console.log(`  Expired (timed out): ${expired.length}`);
console.log(`  Completion rate: ${((completed.length / sessions.length) * 100).toFixed(1)}%`);
console.log('');
console.log('  Top UTM sources:');
for (const [k, v] of Object.entries(utmSources).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`    ${String(k).padEnd(25)} ${v}`);
}
console.log('');
console.log('  Top UTM campaigns:');
for (const [k, v] of Object.entries(utmCampaigns).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`    ${String(k).padEnd(30)} ${v}`);
}
console.log('');
console.log('  Sessions per day (last 14 days):');
const days = Object.entries(sessionsByDay).sort();
for (const [day, n] of days.slice(-14)) {
  console.log(`    ${day}  ${'█'.repeat(Math.min(n, 30))}  ${n}`);
}

// ───────────────── B. ACTIVE SUBSCRIPTIONS ─────────────────
console.log('\n═══ B. ACTIVE SUBSCRIPTIONS in Stripe ═══');
const subs = await stripe.subscriptions.list({ limit: 100, status: 'all' });
const subByStatus = {};
for (const sub of subs.data) {
  subByStatus[sub.status] = (subByStatus[sub.status] || 0) + 1;
}
console.log(`  Total subs: ${subs.data.length}`);
console.log(`  By status: ${Object.entries(subByStatus).map(([k, v]) => `${k}=${v}`).join(', ')}`);
const trialsExpiringSoon = subs.data.filter(s => s.status === 'trialing' && s.trial_end && s.trial_end < Math.floor(Date.now() / 1000) + 3 * 86400);
console.log(`  Trials ending <3d: ${trialsExpiringSoon.length}`);
for (const sub of subs.data.filter(s => s.status === 'active' || s.status === 'trialing').slice(0, 10)) {
  const ends = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : '—';
  const amt = (sub.items.data[0]?.price?.unit_amount || 0) / 100;
  console.log(`    ${sub.id.slice(0, 24)}  status=${sub.status.padEnd(9)} trial_end=${ends} amt=$${amt}`);
}

// ───────────────── C. DB STATE — Users, Leads, Conversions ─────────────────
console.log('\n═══ C. DB STATE — Users, Leads, Subscriptions ═══');

const [{ total_users }] = await sql`SELECT COUNT(*)::int AS total_users FROM users`;
const [{ paid_users }] = await sql`SELECT COUNT(*)::int AS paid_users FROM users WHERE subscription_tier <> 'free' OR subscription_status = 'trialing'`;
const [{ trialing }] = await sql`SELECT COUNT(*)::int AS trialing FROM users WHERE subscription_status = 'trialing'`;
const [{ active }] = await sql`SELECT COUNT(*)::int AS active FROM users WHERE subscription_status = 'active'`;
const [{ canceled }] = await sql`SELECT COUNT(*)::int AS canceled FROM users WHERE subscription_status = 'canceled' OR subscription_status = 'incomplete'`;

console.log(`  total_users: ${total_users}`);
console.log(`  paid (tier<>free or trialing): ${paid_users}`);
console.log(`  trialing: ${trialing}`);
console.log(`  active (paid): ${active}`);
console.log(`  canceled/incomplete: ${canceled}`);

const dropouts = await sql`
  SELECT DATE_TRUNC('day', created_at)::date AS day, COUNT(*)::int AS users_created
  FROM users WHERE created_at > NOW() - INTERVAL '14 days'
  GROUP BY 1 ORDER BY 1
`;
console.log('\n  Users created per day (14d):');
for (const r of dropouts) {
  console.log(`    ${r.day.toISOString().slice(0, 10)}  ${'█'.repeat(Math.min(r.users_created, 30))}  ${r.users_created}`);
}

const ipBreakdown = await sql`
  SELECT COALESCE(lc.utm_source, '(none)') AS source,
         COALESCE(lc.utm_campaign, '(none)') AS campaign,
         COUNT(*)::int AS leads,
         COUNT(CASE WHEN lc.converted_to_user_id IS NOT NULL THEN 1 END)::int AS converted
  FROM email_leads lc
  WHERE lc.created_at > NOW() - INTERVAL '30 days'
  GROUP BY 1, 2 ORDER BY leads DESC LIMIT 12
`;
console.log('\n  Lead source breakdown (30d):');
for (const r of ipBreakdown) {
  const cvr = r.leads > 0 ? ((r.converted / r.leads) * 100).toFixed(1) : '0.0';
  console.log(`    ${r.source.padEnd(15)} ${r.campaign.padEnd(25)} ${String(r.leads).padStart(4)} → ${r.converted} (${cvr}%)`);
}

// Leads vs charts — drop-off
const [{ total_leads }] = await sql`SELECT COUNT(*)::int AS total_leads FROM email_leads WHERE created_at > NOW() - INTERVAL '14 days'`;
// chart_calculations doesn't exist; use natal_charts as proxy
const [{ total_charts }] = await sql`SELECT COUNT(*)::int AS total_charts FROM natal_charts WHERE created_at > NOW() - INTERVAL '14 days'`;
console.log(`\n  Drop-off (14d):`);
console.log(`    chart_calculations: ${total_charts}`);
console.log(`    lead_chart (with email): ${total_leads}`);
const captureRate = total_charts > 0 ? ((total_leads / total_charts) * 100).toFixed(1) : '0.0';
console.log(`    email-gate capture rate: ${captureRate}%`);

// ───────────────── D. CONVERSION ATTRIBUTION ─────────────────
console.log('\n═══ D. CONVERSION ATTRIBUTION ═══');
const recentSubs = await sql`
  SELECT u.id, u.email, u.subscription_tier, u.subscription_status, u.created_at, u.updated_at,
         lc.utm_source, lc.utm_campaign, lc.utm_content, lc.created_at AS lead_created_at,
         EXTRACT(EPOCH FROM (u.created_at - lc.created_at))/60 AS minutes_to_signup
  FROM users u
  LEFT JOIN email_leads lc ON lc.email = u.email
  WHERE u.subscription_tier <> 'free' OR u.subscription_status = 'trialing'
  ORDER BY u.created_at DESC
  LIMIT 20
`;
console.log(`  Paid/trialing users (recent):`);
for (const r of recentSubs) {
  console.log(`    ${(r.email || '?').padEnd(35)} tier=${r.subscription_tier} status=${r.subscription_status}`);
  console.log(`      utm: source=${r.utm_source || '(none)'} campaign=${r.utm_campaign || '(none)'}`);
  const m = r.minutes_to_signup != null ? Number(r.minutes_to_signup).toFixed(0) : 'N/A';
  console.log(`      user_created=${r.created_at.toISOString().slice(0, 19)} mins_after_lead=${m}`);
}

// ───────────────── E. CHART DROP-OFF BY LOCALE ─────────────────
console.log('\n═══ E. FUNNEL BY LOCALE (proxy via leads) ═══');
const localeFunnel = await sql`
  SELECT
    CASE WHEN locale IS NULL THEN '(none)' ELSE locale END AS locale,
    COUNT(*)::int AS leads,
    COUNT(CASE WHEN converted_to_user_id IS NOT NULL THEN 1 END)::int AS converted
  FROM email_leads
  WHERE created_at > NOW() - INTERVAL '14 days'
  GROUP BY 1
`;
for (const r of localeFunnel) {
  const cvr = r.leads > 0 ? ((r.converted / r.leads) * 100).toFixed(1) : '0.0';
  console.log(`  locale=${r.locale.padEnd(10)} leads=${String(r.leads).padStart(4)}  converted=${r.converted}  cvr=${cvr}%`);
}

// ───────────────── F. SUBSCRIPTION REVENUE ─────────────────
console.log('\n═══ F. ACTUAL REVENUE (Stripe charges, 30d) ═══');
const charges = await stripe.charges.list({ limit: 100, created: { gte: since30 } });
let grossRevenue = 0;
let refunded = 0;
for (const c of charges.data) {
  if (c.status === 'succeeded') grossRevenue += c.amount;
  if (c.refunded) refunded += c.amount_refunded;
}
console.log(`  Total successful charges: ${charges.data.filter(c => c.status === 'succeeded').length}`);
console.log(`  Gross revenue (30d): $${(grossRevenue / 100).toFixed(2)}`);
console.log(`  Refunds: $${(refunded / 100).toFixed(2)}`);
console.log(`  Net: $${((grossRevenue - refunded) / 100).toFixed(2)}`);

console.log('\n— End full funnel audit —');
