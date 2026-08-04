/**
 * Deep conversion audit — read-only.
 * Pulls full-funnel numbers from DB + Stripe + PostHog where available.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';
import Stripe from 'stripe';

const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

console.log('═════ ALL-TIME totals ═════');
const totals = await sql`
  SELECT
    (SELECT COUNT(*) FROM email_leads)::int                                                    AS leads_all,
    (SELECT COUNT(*) FROM email_leads WHERE converted_to_user_id IS NOT NULL)::int             AS leads_converted_all,
    (SELECT COUNT(*) FROM users)::int                                                          AS users_all,
    (SELECT COUNT(*) FROM users WHERE subscription_tier = 'premium')::int                      AS premium_all,
    (SELECT COUNT(*) FROM users WHERE subscription_tier = 'premium' AND subscription_status = 'active')::int AS premium_active
`;
console.table(totals);

console.log('\n═════ Leads — Source breakdown (all-time) ═════');
const bySource = await sql`
  SELECT
    COALESCE(utm_source, '(none)') AS src,
    COALESCE(utm_campaign, '(none)') AS campaign,
    COUNT(*)::int AS n,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int AS converted
  FROM email_leads
  GROUP BY src, campaign
  ORDER BY n DESC
`;
console.table(bySource);

console.log('\n═════ Leads — Nurture state (current) ═════');
const nurtureState = await sql`
  SELECT
    nurture_step,
    COUNT(*)::int AS n,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int AS converted,
    COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsubscribed,
    COUNT(*) FILTER (WHERE email_undeliverable = true)::int AS undeliverable
  FROM email_leads
  GROUP BY nurture_step
  ORDER BY nurture_step
`;
console.table(nurtureState);

console.log('\n═════ Sent emails — actual delivery (resend_message_id presence) ═════');
const sentRows = await sql`
  SELECT
    email_type,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE resend_message_id IS NOT NULL)::int AS with_id,
    COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int AS null_id
  FROM sent_lead_emails
  GROUP BY email_type
  ORDER BY total DESC
`;
console.table(sentRows);

console.log('\n═════ Users by created_at — month buckets ═════');
const usersByMonth = await sql`
  SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(*)::int AS n
  FROM users
  GROUP BY month
  ORDER BY month DESC
  LIMIT 12
`;
console.table(usersByMonth);

console.log('\n═════ Chart readings (Pro upsell signal) ═════');
const chartReadings = await sql`
  SELECT
    COUNT(*)::int AS total_readings,
    COUNT(DISTINCT chart_id)::int AS distinct_charts,
    locale
  FROM chart_readings
  GROUP BY locale
`;
console.table(chartReadings);

console.log('\n═════ Natal charts created (top-of-funnel signal) ═════');
const charts = await sql`
  SELECT
    DATE(created_at) AS day,
    COUNT(*)::int AS n,
    COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int AS signed_in
  FROM natal_charts
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY day
  ORDER BY day DESC
  LIMIT 30
`;
console.table(charts);

const chartsTotal = await sql`
  SELECT
    COUNT(*)::int AS total_30d,
    COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int AS signed_in_30d,
    COUNT(*) FILTER (WHERE user_id IS NULL)::int AS anon_30d
  FROM natal_charts
  WHERE created_at >= NOW() - INTERVAL '30 days'
`;
console.table(chartsTotal);

console.log('\n═════ Stripe — ALL-time subscriptions ═════');
const allSubs = await stripe.subscriptions.list({ limit: 100, status: 'all' });
const subsBy = {};
for (const s of allSubs.data) subsBy[s.status] = (subsBy[s.status] || 0) + 1;
console.log(`Total subs ever (capped 100): ${allSubs.data.length}`);
console.table(subsBy);

console.log('\n═════ Stripe — ALL-time checkout sessions ═════');
const allSessions = await stripe.checkout.sessions.list({ limit: 100 });
const sessBy = {};
let revenueCents = 0;
for (const s of allSessions.data) {
  sessBy[s.status] = (sessBy[s.status] || 0) + 1;
  if (s.status === 'complete' && s.amount_total) revenueCents += s.amount_total;
}
console.log(`Total checkouts ever (capped 100): ${allSessions.data.length}`);
console.table(sessBy);
console.log(`Approx all-time revenue: $${(revenueCents / 100).toFixed(2)}`);

console.log('\n═════ Leads in last 7d with full lifecycle ═════');
const recentLeads = await sql`
  SELECT
    DATE(created_at) AS day,
    locale,
    utm_source,
    utm_campaign,
    nurture_step,
    CASE WHEN converted_to_user_id IS NOT NULL THEN 'YES' ELSE 'no' END AS converted,
    ROUND(EXTRACT(EPOCH FROM (NOW() - created_at))/3600)::int AS hours_old
  FROM email_leads
  WHERE created_at >= NOW() - INTERVAL '7 days'
  ORDER BY created_at DESC
  LIMIT 40
`;
console.table(recentLeads);

console.log('\n═════ Email-capture rate: charts vs leads ═════');
const captureRate = await sql`
  SELECT
    DATE(c.created_at) AS day,
    COUNT(DISTINCT c.id)::int AS charts,
    COUNT(DISTINCT l.id)::int AS leads,
    ROUND(100.0 * COUNT(DISTINCT l.id) / NULLIF(COUNT(DISTINCT c.id), 0), 1) AS capture_pct
  FROM natal_charts c
  LEFT JOIN email_leads l ON l.chart_id = c.id
  WHERE c.created_at >= NOW() - INTERVAL '14 days'
  GROUP BY day
  ORDER BY day DESC
`;
console.table(captureRate);

console.log('\n═════ Stripe — first 30d cohort: spend per acquired customer ═════');
console.log(`Meta spend 30d (per audit): ~$128 LPV pre-fix + $18 today Lead = ~$146`);
console.log(`Customers acquired: 1 paying`);
console.log(`CAC: ~$146 / 1 = $146 — break-even at $4.99 monthly = 29 months ❌`);
console.log(`(NOTE: only 1 day of clean OUTCOME_LEADS data — too early to judge true CAC)`);
