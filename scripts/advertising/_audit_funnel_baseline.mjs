/**
 * Cross-source baseline: DB email_leads + Stripe subs + PostHog Lead events.
 * Read-only.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

console.log('═════ DB baseline ═════');

const leadsByDay = await sql`
  SELECT DATE(created_at) AS day, COUNT(*)::int AS n
  FROM email_leads
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY day
  ORDER BY day DESC
  LIMIT 30
`;
console.log('email_leads/day (last 30d):');
console.table(leadsByDay);

const usersByDay = await sql`
  SELECT DATE(created_at) AS day, COUNT(*)::int AS n
  FROM users
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY day
  ORDER BY day DESC
  LIMIT 30
`;
console.log('\nusers/day (last 30d):');
console.table(usersByDay);

const leadConverted = await sql`
  SELECT
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS total_30d,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND converted_to_user_id IS NOT NULL)::int AS converted_30d,
    COUNT(*)::int AS total_all
  FROM email_leads
`;
console.log('\nemail_leads conversion:');
console.table(leadConverted);

const subscribers = await sql`
  SELECT subscription_tier, subscription_status, COUNT(*)::int AS n
  FROM users
  WHERE subscription_tier IS NOT NULL
  GROUP BY subscription_tier, subscription_status
`;
console.log('\nusers by sub state:');
console.table(subscribers);

console.log('\n═════ Stripe baseline (last 30d) ═════');
const created_gte = Math.floor((Date.now() - 30 * 86400000) / 1000);

const subs = await stripe.subscriptions.list({ created: { gte: created_gte }, limit: 100, status: 'all' });
console.log(`Subscriptions created last 30d: ${subs.data.length}`);
const subsByStatus = {};
for (const s of subs.data) subsByStatus[s.status] = (subsByStatus[s.status] || 0) + 1;
console.table(subsByStatus);

const sessions = await stripe.checkout.sessions.list({ created: { gte: created_gte }, limit: 100 });
console.log(`Checkout sessions created last 30d: ${sessions.data.length}`);
const sessionsByStatus = {};
for (const s of sessions.data) sessionsByStatus[s.status] = (sessionsByStatus[s.status] || 0) + 1;
console.table(sessionsByStatus);

// Recent subs with UTM if any
console.log('\nRecent paid subs with UTM:');
const paidSubs = subs.data.filter((s) => s.status === 'active' || s.status === 'trialing');
for (const s of paidSubs.slice(0, 10)) {
  const md = s.metadata || {};
  const utm_source = md.utm_source || '-';
  const utm_campaign = md.utm_campaign || '-';
  const utm_content = md.utm_content || '-';
  const created = new Date(s.created * 1000).toISOString().slice(0, 10);
  const clerk = (md.clerkUserId || '-').slice(0, 12).padEnd(12);
  console.log(`  ${created} ${s.status.padEnd(10)} clerk=${clerk} utm=${utm_source}/${utm_campaign}/${utm_content}`);
}

console.log('\n═════ Stripe prices validity ═════');
try {
  const pm = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID_PRO_MONTHLY);
  console.log(`  ✓ monthly: ${pm.unit_amount/100} ${pm.currency} ${pm.recurring?.interval}  active=${pm.active}`);
} catch (e) { console.log(`  ✗ monthly: ${e.message}`); }
try {
  const pa = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID_PRO_ANNUAL);
  console.log(`  ✓ annual:  ${pa.unit_amount/100} ${pa.currency} ${pa.recurring?.interval}  active=${pa.active}`);
} catch (e) { console.log(`  ✗ annual:  ${e.message}`); }
