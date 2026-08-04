/**
 * CRO audit 2026-07-10 — Sector: Postgres (Neon) — lead funnel + drip state + product usage.
 * STRICTLY READ-ONLY: SELECT only. No writes, no sends.
 *
 * Windows used:
 *  - "post-pause"   = created_at >= 2026-05-25 (Meta account dark since 2026-05-24 13:29 UTC)
 *  - "post-baseline"= created_at >= 2026-05-30 (last audit 2026-05-29; last pushed commit de39cee 05-30)
 *  - trailing 30d / 45d where labeled
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const h = (t) => console.log(`\n\n═══════════ ${t} ═══════════`);

// ---------------------------------------------------------------------------
h('0. TABLE EXISTENCE + MIGRATION STATE');
// ---------------------------------------------------------------------------
const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`;
console.log('public tables:', tables.map((t) => t.table_name).join(', '));

const drizzleSchemas = await sql`
  SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE '%drizzle%'
`;
console.log('drizzle schemas:', JSON.stringify(drizzleSchemas));
try {
  const migs = await sql`
    SELECT id, hash, created_at, to_timestamp(created_at/1000) AS applied_at
    FROM drizzle.__drizzle_migrations ORDER BY id
  `;
  console.log(`drizzle.__drizzle_migrations rows: ${migs.length}`);
  console.table(migs.map((m) => ({ id: m.id, applied_at: m.applied_at, hash: String(m.hash).slice(0, 12) })));
} catch (e) {
  console.log('drizzle.__drizzle_migrations read failed:', e.message);
}

// Columns that prove specific migrations landed
const cols = await sql`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='public' AND (
    (table_name='email_leads' AND column_name IN ('paywall_teaser_variant','email_undeliverable','nurture_step'))
  )
`;
console.log('migration-proof columns on email_leads:', JSON.stringify(cols));

// ---------------------------------------------------------------------------
h('1. EMAIL_LEADS — totals, daily flow, provenance');
// ---------------------------------------------------------------------------
const [tot] = await sql`
  SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE created_at >= '2026-05-25')::int AS post_pause,
    COUNT(*) FILTER (WHERE created_at >= '2026-05-30')::int AS post_baseline,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last_30d,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7d,
    MAX(created_at) AS newest_lead
  FROM email_leads
`;
console.log(JSON.stringify(tot, null, 2));

const leadsDaily = await sql`
  SELECT DATE(created_at) AS day, COUNT(*)::int AS n,
    COUNT(*) FILTER (WHERE locale='es')::int AS es,
    string_agg(DISTINCT COALESCE(utm_source,'-'), ',') AS utm_sources
  FROM email_leads
  WHERE created_at >= '2026-05-20'
  GROUP BY day ORDER BY day
`;
console.table(leadsDaily);

const leadProvenance = await sql`
  SELECT COALESCE(utm_source,'(null)') AS utm_source, COALESCE(utm_medium,'(null)') AS utm_medium,
    COALESCE(utm_campaign,'(null)') AS utm_campaign, source, locale, COUNT(*)::int AS n
  FROM email_leads
  WHERE created_at >= '2026-05-25'
  GROUP BY 1,2,3,4,5 ORDER BY n DESC
`;
console.log('post-pause lead provenance (>= 2026-05-25):');
console.table(leadProvenance);

// ---------------------------------------------------------------------------
h('2. LEAD → USER CONVERSION');
// ---------------------------------------------------------------------------
const convCohorts = await sql`
  SELECT
    CASE WHEN created_at < '2026-05-30' THEN 'pre-2026-05-30' ELSE 'post-2026-05-30' END AS cohort,
    locale,
    COUNT(*)::int AS leads,
    COUNT(converted_to_user_id)::int AS converted,
    ROUND(100.0*COUNT(converted_to_user_id)/NULLIF(COUNT(*),0),1) AS pct
  FROM email_leads
  GROUP BY 1,2 ORDER BY 1,2
`;
console.table(convCohorts);

const recentConversions = await sql`
  SELECT DATE(converted_at) AS day, COUNT(*)::int AS n, string_agg(locale, ',') AS locales
  FROM email_leads
  WHERE converted_at >= '2026-05-25'
  GROUP BY day ORDER BY day
`;
console.log('lead conversions (converted_at) since 2026-05-25 by day:');
console.table(recentConversions);

const [convTot] = await sql`
  SELECT COUNT(*)::int AS converted_total, MAX(converted_at) AS latest_conversion
  FROM email_leads WHERE converted_to_user_id IS NOT NULL
`;
console.log(JSON.stringify(convTot));

// ---------------------------------------------------------------------------
h('3. USERS — growth, tier, status, activity');
// ---------------------------------------------------------------------------
const [uTot] = await sql`
  SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE created_at >= '2026-05-30')::int AS created_post_baseline,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS created_30d,
    COUNT(*) FILTER (WHERE subscription_tier='premium')::int AS premium,
    COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '7 days')::int AS seen_7d,
    COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '30 days')::int AS seen_30d
  FROM users
`;
console.log(JSON.stringify(uTot, null, 2));

const usersWeekly = await sql`
  SELECT DATE_TRUNC('week', created_at)::date AS week, COUNT(*)::int AS new_users,
    COUNT(*) FILTER (WHERE locale='es')::int AS es
  FROM users WHERE created_at >= '2026-05-01'
  GROUP BY week ORDER BY week
`;
console.table(usersWeekly);

const statusBreak = await sql`
  SELECT subscription_tier, COALESCE(subscription_status,'(null)') AS status, plan, COUNT(*)::int AS n
  FROM users GROUP BY 1,2,3 ORDER BY 1 DESC, n DESC
`;
console.table(statusBreak);

const premiumUsers = await sql`
  SELECT id, LEFT(email, 3) || '***' || RIGHT(email, POSITION('@' IN REVERSE(email))) AS email_masked,
    subscription_status, plan, trial_end, current_period_end, locale,
    created_at::date AS created, last_seen_at, stripe_subscription_id IS NOT NULL AS has_sub
  FROM users WHERE subscription_tier='premium'
  ORDER BY created_at
`;
console.log('premium users (all):');
console.table(premiumUsers);

// ---------------------------------------------------------------------------
h('4. DRIP STATE — sent_lead_emails + nurture pipeline');
// ---------------------------------------------------------------------------
const dripByType = await sql`
  SELECT email_type, COUNT(*)::int AS sends,
    COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int AS null_msgid,
    MIN(sent_at)::date AS first, MAX(sent_at) AS latest
  FROM sent_lead_emails GROUP BY email_type ORDER BY email_type
`;
console.table(dripByType);

const dripDaily = await sql`
  SELECT DATE(sent_at) AS day, COUNT(*)::int AS sends,
    string_agg(DISTINCT REPLACE(email_type,'lead_',''), ',') AS types
  FROM sent_lead_emails
  WHERE sent_at >= '2026-05-25'
  GROUP BY day ORDER BY day
`;
console.log('drip sends per day since 2026-05-25:');
console.table(dripDaily);

const nurtureDist = await sql`
  SELECT nurture_step, COUNT(*)::int AS leads,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int AS converted,
    COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsub,
    COUNT(*) FILTER (WHERE email_undeliverable)::int AS undeliverable,
    MIN(nurture_next_at) AS min_next, MAX(nurture_next_at) AS max_next
  FROM email_leads GROUP BY nurture_step ORDER BY nurture_step
`;
console.table(nurtureDist);

const dueBacklog = await sql`
  SELECT COUNT(*)::int AS due_now, MIN(nurture_next_at) AS oldest_due
  FROM email_leads
  WHERE nurture_step < 4 AND converted_to_user_id IS NULL AND unsubscribed_at IS NULL
    AND email_undeliverable = false AND nurture_next_at <= NOW()
`;
console.log('nurture due-backlog (index condition, nurture_next_at <= now):', JSON.stringify(dueBacklog));

// other email logs
for (const t of ['sent_trial_emails', 'sent_cart_abandon_emails', 'sent_dunning_emails', 'sent_emails']) {
  try {
    const r = await sql(`SELECT COUNT(*)::int AS n, MAX(sent_at) AS latest FROM ${t}`);
    console.log(`${t}: ${JSON.stringify(r[0])}`);
  } catch (e) {
    console.log(`${t}: ERROR ${e.message}`);
  }
}
try {
  const tr = await sql`SELECT step, COUNT(*)::int AS n, MAX(sent_at) AS latest FROM sent_trial_emails GROUP BY step`;
  console.table(tr);
  const dn = await sql`SELECT dunning_step, COUNT(*)::int AS n, MAX(sent_at) AS latest FROM sent_dunning_emails GROUP BY dunning_step`;
  console.table(dn);
} catch (e) { console.log('trial/dunning detail failed:', e.message); }

// ---------------------------------------------------------------------------
h('5. DISCOUNT BLAST — sent_discount_blast_emails (was HALF50 ever sent?)');
// ---------------------------------------------------------------------------
const [blastExists] = await sql`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='sent_discount_blast_emails'
  ) AS table_exists
`;
console.log('sent_discount_blast_emails exists in prod:', blastExists.table_exists);
if (blastExists.table_exists) {
  const r = await sql`SELECT COUNT(*)::int AS n, MAX(sent_at) AS latest FROM sent_discount_blast_emails`;
  console.log('rows:', JSON.stringify(r[0]));
}

// ---------------------------------------------------------------------------
h('6. PRODUCT USAGE — charts, readings, retention proxy');
// ---------------------------------------------------------------------------
const chartsDaily = await sql`
  SELECT DATE_TRUNC('week', created_at)::date AS week, COUNT(*)::int AS charts,
    COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int AS by_users
  FROM natal_charts WHERE created_at >= '2026-05-01'
  GROUP BY week ORDER BY week
`;
console.log('natal_charts per week since 2026-05-01:');
console.table(chartsDaily);

const chartsRecentDaily = await sql`
  SELECT DATE(created_at) AS day, COUNT(*)::int AS charts
  FROM natal_charts WHERE created_at >= NOW() - INTERVAL '21 days'
  GROUP BY day ORDER BY day
`;
console.log('natal_charts per day last 21d:');
console.table(chartsRecentDaily);

const readings = await sql`
  SELECT DATE_TRUNC('week', generated_at)::date AS week, COUNT(*)::int AS readings,
    COUNT(*) FILTER (WHERE locale='es')::int AS es
  FROM chart_readings WHERE generated_at >= '2026-05-01'
  GROUP BY week ORDER BY week
`;
console.log('chart_readings (AI) per week since 2026-05-01:');
console.table(readings);

const [usageTot] = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM natal_charts) AS charts_total,
    (SELECT COUNT(*)::int FROM chart_readings) AS readings_total,
    (SELECT COUNT(*)::int FROM tarot_readings WHERE created_at >= '2026-05-30') AS tarot_post_baseline,
    (SELECT COUNT(*)::int FROM synastry_results WHERE created_at >= '2026-05-30') AS synastry_post_baseline
`;
console.log(JSON.stringify(usageTot, null, 2));

// Are premium/trialing users using the product? last_seen + recent charts
const premiumActivity = await sql`
  SELECT u.id, u.subscription_status, u.last_seen_at,
    (SELECT COUNT(*)::int FROM natal_charts nc WHERE nc.user_id = u.id) AS charts,
    (SELECT MAX(nc.created_at) FROM natal_charts nc WHERE nc.user_id = u.id) AS last_chart,
    (SELECT COUNT(*)::int FROM tarot_readings tr WHERE tr.user_id = u.id) AS tarot
  FROM users u WHERE u.subscription_tier='premium'
  ORDER BY u.last_seen_at DESC NULLS LAST
`;
console.log('premium user activity:');
console.table(premiumActivity);

// ---------------------------------------------------------------------------
h('7. INTEGRITY — NULL resend ids, orphan anon payers, dup stripe customers');
// ---------------------------------------------------------------------------
const [nullIds] = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM sent_lead_emails WHERE resend_message_id IS NULL) AS lead_emails_null_msgid,
    (SELECT COUNT(*)::int FROM sent_lead_emails WHERE resend_message_id IS NULL AND sent_at >= '2026-05-30') AS lead_emails_null_msgid_post,
    (SELECT COUNT(*)::int FROM sent_lead_emails) AS lead_emails_total
`;
console.log(JSON.stringify(nullIds, null, 2));

const orphans = await sql`
  SELECT id, email, stripe_customer_id, subscription_status, created_at::date AS created
  FROM users
  WHERE subscription_tier = 'premium'
    AND (id NOT LIKE 'user_%' OR email LIKE 'stripe-pending-%@placeholder.invalid')
`;
console.log(`orphan premium rows (repair-script criteria): ${orphans.length}`);
console.table(orphans.map((o) => ({ ...o, email: String(o.email).slice(0, 24) })));

const demoted = await sql`
  SELECT COUNT(*)::int AS n, string_agg(DISTINCT subscription_status, ',') AS statuses
  FROM users WHERE email LIKE 'stripe-pending-%@placeholder.invalid'
`;
console.log('placeholder-email rows total (any tier):', JSON.stringify(demoted[0] ?? demoted));

const dupCustomers = await sql`
  SELECT stripe_customer_id, COUNT(*)::int AS n
  FROM users WHERE stripe_customer_id IS NOT NULL
  GROUP BY 1 HAVING COUNT(*) > 1
`;
console.log(`duplicate stripe_customer_id across users: ${dupCustomers.length}`);
console.table(dupCustomers);

const anonKeyedRows = await sql`
  SELECT COUNT(*)::int AS non_clerk_id_rows FROM users WHERE id NOT LIKE 'user_%'
`;
console.log('users rows with non-Clerk id (anon-keyed):', JSON.stringify(anonKeyedRows[0]));

console.log('\nDONE (read-only).');
