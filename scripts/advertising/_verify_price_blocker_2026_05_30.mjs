// READ-ONLY verification — 2026-05-30
// Independently re-derive the load-bearing funnel numbers for the
// "is PRICE the binding constraint?" diagnosis. SELECT/COUNT only.
import { config } from 'dotenv';
config({ path: '.env' });
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (s, p) => pool.query(s, p);
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '—');

async function main() {
  // 1) Lead volume + conversion to FREE account, by locale (all-time + 14d)
  const leadsByLocale = await q(`
    SELECT locale,
           COUNT(*)::int AS leads,
           COUNT(converted_to_user_id)::int AS converted_users,
           COUNT(*) FILTER (WHERE created_at > now() - interval '14 days')::int AS leads_14d,
           COUNT(converted_to_user_id) FILTER (WHERE created_at > now() - interval '14 days')::int AS conv_14d
    FROM email_leads GROUP BY locale ORDER BY locale`);
  console.log('=== email_leads by locale (lead -> FREE account) ===');
  for (const r of leadsByLocale.rows) {
    console.log(`  ${r.locale}: leads=${r.leads} -> free_user=${r.converted_users} (${pct(r.converted_users, r.leads)}) | 14d: ${r.leads_14d} -> ${r.conv_14d} (${pct(r.conv_14d, r.leads_14d)})`);
  }

  // 2) Users by subscription status (real paid signal) + locale
  const usersByStatus = await q(`
    SELECT subscription_status, subscription_tier, COUNT(*)::int AS n
    FROM users GROUP BY subscription_status, subscription_tier
    ORDER BY n DESC`);
  console.log('\n=== users by subscription_status x tier ===');
  for (const r of usersByStatus.rows) {
    console.log(`  status=${r.subscription_status} tier=${r.subscription_tier}: ${r.n}`);
  }

  // 3) Plan distribution of anyone who ever got premium/paid plan
  const plans = await q(`
    SELECT plan, subscription_status, COUNT(*)::int AS n,
           COUNT(stripe_subscription_id)::int AS with_sub
    FROM users WHERE plan <> 'free' OR subscription_tier = 'premium'
    GROUP BY plan, subscription_status ORDER BY n DESC`);
  console.log('\n=== users with non-free plan or premium tier ===');
  for (const r of plans.rows) {
    console.log(`  plan=${r.plan} status=${r.subscription_status}: ${r.n} (with_stripe_sub=${r.with_sub})`);
  }

  // 4) lead -> PAID user join (real lead->paid by locale)
  const leadPaid = await q(`
    SELECT l.locale,
           COUNT(*)::int AS leads,
           COUNT(*) FILTER (WHERE u.subscription_status IN ('trialing','active','past_due'))::int AS reached_paid_intent,
           COUNT(*) FILTER (WHERE u.subscription_status = 'active')::int AS active_now
    FROM email_leads l
    LEFT JOIN users u ON u.id = l.converted_to_user_id
    GROUP BY l.locale ORDER BY l.locale`);
  console.log('\n=== lead -> paid-intent (trial/active/past_due) by locale ===');
  for (const r of leadPaid.rows) {
    console.log(`  ${r.locale}: leads=${r.leads} reached_paid_intent=${r.reached_paid_intent} (${pct(r.reached_paid_intent, r.leads)}) active_now=${r.active_now}`);
  }

  // 5) Anon-payer orphan check: premium/paid users whose id is NOT a Clerk user_ id
  const orphans = await q(`
    SELECT id, email, subscription_status, plan, created_at
    FROM users
    WHERE (subscription_tier = 'premium' OR subscription_status IN ('trialing','active','past_due'))
      AND id NOT LIKE 'user_%'
    ORDER BY created_at DESC`);
  console.log(`\n=== orphaned paid users (id NOT LIKE user_%) : ${orphans.rows.length} ===`);
  for (const r of orphans.rows) {
    console.log(`  id=${r.id.slice(0, 24)} email=${r.email} status=${r.subscription_status} plan=${r.plan} created=${new Date(r.created_at).toISOString().slice(0,10)}`);
  }

  // 6) email_undeliverable flag state (bounce suppression)
  const undel = await q(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE email_undeliverable)::int AS flagged FROM email_leads`);
  console.log(`\n=== bounce suppression: ${undel.rows[0].flagged}/${undel.rows[0].total} email_leads flagged undeliverable ===`);

  // 7) drip step distribution + recent lead recency (is funnel coasting?)
  const recency = await q(`
    SELECT
      COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS d1,
      COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS d7,
      COUNT(*) FILTER (WHERE created_at > now() - interval '14 days')::int AS d14,
      MAX(created_at) AS last_lead
    FROM email_leads`);
  const rr = recency.rows[0];
  console.log(`\n=== lead recency (acquisition off?) : 24h=${rr.d1} 7d=${rr.d7} 14d=${rr.d14} last_lead=${new Date(rr.last_lead).toISOString().slice(0,16)} ===`);

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
