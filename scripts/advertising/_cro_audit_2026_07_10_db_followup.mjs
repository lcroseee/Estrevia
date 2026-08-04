/**
 * CRO audit 2026-07-10 — DB sector follow-up probes. STRICTLY READ-ONLY.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const h = (t) => console.log(`\n\n═══════════ ${t} ═══════════`);

h('A. Placeholder-email rows + non-Clerk-id rows (repair evidence)');
const ph = await sql`
  SELECT id, email, subscription_tier, subscription_status, plan,
    stripe_customer_id, stripe_subscription_id, created_at, updated_at, email_undeliverable
  FROM users
  WHERE email LIKE 'stripe-pending-%' OR id NOT LIKE 'user_%'
  ORDER BY created_at
`;
console.table(ph.map((r) => ({
  id: String(r.id).slice(0, 30), email: String(r.email).slice(0, 40),
  tier: r.subscription_tier, status: r.subscription_status, plan: r.plan,
  cus: r.stripe_customer_id, sub: r.stripe_subscription_id ? 'yes' : null,
  created: r.created_at, updated: r.updated_at, undeliv: r.email_undeliverable,
})));

h('B. chart_readings — exact latest + all rows since 2026-06-01');
const cr = await sql`
  SELECT generated_at, locale, chart_id,
    (SELECT nc.user_id FROM natal_charts nc WHERE nc.id = chart_readings.chart_id) AS user_id
  FROM chart_readings
  WHERE generated_at >= '2026-06-01'
  ORDER BY generated_at
`;
console.table(cr);
const [crLatest] = await sql`SELECT MAX(generated_at) AS latest FROM chart_readings`;
console.log('latest chart_reading ever:', JSON.stringify(crLatest));

h('C. Recent lead→user conversions (converted_at >= 2026-05-25) — outcomes');
const conv = await sql`
  SELECT el.id AS lead_id, el.locale, el.converted_at, el.converted_to_user_id,
    el.utm_source, el.created_at::date AS lead_created,
    u.subscription_tier, u.subscription_status, u.plan, u.last_seen_at, u.created_at AS user_created
  FROM email_leads el
  LEFT JOIN users u ON u.id = el.converted_to_user_id
  WHERE el.converted_at >= '2026-05-25'
  ORDER BY el.converted_at
`;
console.table(conv.map((r) => ({
  locale: r.locale, converted_at: r.converted_at, utm: r.utm_source,
  lead_created: r.lead_created, tier: r.subscription_tier, status: r.subscription_status,
  plan: r.plan, last_seen: r.last_seen_at,
})));

h('D. Trial + dunning email recipients (who got them, June cycle)');
const trials = await sql`
  SELECT ste.step, ste.sent_at, ste.subscription_id, ste.user_id,
    u.email LIKE '%placeholder.invalid' AS placeholder_email, u.subscription_status
  FROM sent_trial_emails ste LEFT JOIN users u ON u.id = ste.user_id
  WHERE ste.sent_at >= '2026-05-25' ORDER BY ste.sent_at
`;
console.table(trials.map((r) => ({
  step: r.step, sent: r.sent_at, user: String(r.user_id).slice(0, 24),
  placeholder: r.placeholder_email, status: r.subscription_status,
})));
const dun = await sql`
  SELECT sde.dunning_step, sde.sent_at, sde.user_id, sde.is_hard_decline, sde.error IS NOT NULL AS has_error,
    u.email LIKE '%placeholder.invalid' AS placeholder_email, u.subscription_status
  FROM sent_dunning_emails sde LEFT JOIN users u ON u.id = sde.user_id
  ORDER BY sde.sent_at
`;
console.table(dun.map((r) => ({
  step: r.dunning_step, sent: r.sent_at, user: String(r.user_id).slice(0, 24),
  hard: r.is_hard_decline, err: r.has_error, placeholder: r.placeholder_email, status: r.subscription_status,
})));

h('E. Post-baseline (>= 2026-05-30) 22 leads — drip progression + quality');
const newLeads = await sql`
  SELECT DATE(created_at) AS day, locale, COALESCE(utm_source,'direct') AS src, nurture_step,
    unsubscribed_at IS NOT NULL AS unsub, email_undeliverable AS undeliv,
    (SELECT COUNT(*)::int FROM sent_lead_emails sle WHERE sle.lead_id = email_leads.id) AS emails_got
  FROM email_leads WHERE created_at >= '2026-05-30' ORDER BY created_at
`;
console.table(newLeads);

h('F. sent_emails (transactional) + cart-abandon totals');
const se = await sql`
  SELECT email_type, COUNT(*)::int AS n, MAX(sent_at) AS latest FROM sent_emails GROUP BY email_type ORDER BY n DESC
`;
console.table(se);
const ca = await sql`SELECT COUNT(*)::int AS n, MAX(sent_at) AS latest FROM sent_cart_abandon_emails`;
console.log('sent_cart_abandon_emails:', JSON.stringify(ca[0]));

h('G. users email_undeliverable + leads undeliverable counts');
const [undeliv] = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM users WHERE email_undeliverable) AS users_undeliverable,
    (SELECT COUNT(*)::int FROM email_leads WHERE email_undeliverable) AS leads_undeliverable,
    (SELECT COUNT(*)::int FROM email_leads WHERE unsubscribed_at IS NOT NULL) AS leads_unsubscribed
`;
console.log(JSON.stringify(undeliv, null, 2));

h('H. usage_counters recent (premium feature usage proxy)');
try {
  const uc = await sql`
    SELECT * FROM usage_counters ORDER BY 1 DESC LIMIT 12
  `;
  console.table(uc);
} catch (e) { console.log('usage_counters read failed:', e.message); }

h('I. Charts: anon vs user split post-baseline (>= 2026-05-30)');
const [chartSplit] = await sql`
  SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int AS by_signed_in,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS distinct_users
  FROM natal_charts WHERE created_at >= '2026-05-30'
`;
console.log(JSON.stringify(chartSplit, null, 2));

h('J. divinelyguided (past_due) + active premium — full stripe/status detail');
const prem = await sql`
  SELECT id, email, subscription_tier, subscription_status, plan, trial_end,
    current_period_end, subscription_expires_at, stripe_customer_id, stripe_subscription_id,
    created_at, updated_at, last_seen_at, email_undeliverable
  FROM users
  WHERE subscription_status IN ('past_due','active','trialing') OR subscription_tier='premium'
  ORDER BY created_at
`;
console.log(JSON.stringify(prem, null, 2));

console.log('\nDONE (read-only).');
