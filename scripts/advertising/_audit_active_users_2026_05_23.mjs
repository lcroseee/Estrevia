// Snapshot: who is actually using Estrevia right now (2026-05-23).
// Categorises traffic into 5 cohorts and ranks signed-in users by real activity.
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function fmt(n) { return n?.toLocaleString?.('en-US') ?? String(n); }
function date(d) { return d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '—'; }

async function main() {
  console.log('================================================================');
  console.log(' ESTREVIA — Active Users Audit  (snapshot ' + new Date().toISOString() + ')');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1) Top-level counts
  // ---------------------------------------------------------------------------
  const top = (await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users)                                                                       AS users_total,
      (SELECT COUNT(*)::int FROM users WHERE subscription_status IN ('trialing','active'))                    AS users_paying,
      (SELECT COUNT(*)::int FROM users WHERE subscription_status = 'trialing')                                AS users_trialing,
      (SELECT COUNT(*)::int FROM users WHERE subscription_status = 'active')                                  AS users_active,
      (SELECT COUNT(*)::int FROM users WHERE subscription_status IN ('canceled','past_due','unpaid','incomplete')) AS users_lapsed,
      (SELECT COUNT(*)::int FROM users WHERE subscription_status = 'free')                                    AS users_free,
      (SELECT COUNT(*)::int FROM email_leads)                                                                 AS leads_total,
      (SELECT COUNT(*)::int FROM email_leads WHERE converted_to_user_id IS NULL)                              AS leads_unconverted,
      (SELECT COUNT(*)::int FROM email_leads WHERE converted_to_user_id IS NOT NULL)                          AS leads_converted,
      (SELECT COUNT(*)::int FROM email_leads WHERE unsubscribed_at IS NOT NULL)                               AS leads_unsubscribed,
      (SELECT COUNT(*)::int FROM natal_charts)                                                                AS charts_total,
      (SELECT COUNT(*)::int FROM natal_charts WHERE user_id IS NULL)                                          AS charts_anon,
      (SELECT COUNT(*)::int FROM natal_charts WHERE user_id IS NOT NULL)                                      AS charts_user,
      (SELECT COUNT(*)::int FROM chart_readings)                                                              AS readings_total,
      (SELECT COUNT(*)::int FROM synastry_results)                                                            AS synastry_total,
      (SELECT COUNT(*)::int FROM tarot_readings)                                                              AS tarot_total
  `)).rows[0];

  console.log('## 1) TOTALS');
  console.log(`  Users (signed up via Clerk):    ${fmt(top.users_total)}`);
  console.log(`    paying  (trialing+active):    ${fmt(top.users_paying)}   (trialing=${top.users_trialing}, active=${top.users_active})`);
  console.log(`    lapsed  (cancel/past_due/…):  ${fmt(top.users_lapsed)}`);
  console.log(`    free                           ${fmt(top.users_free)}`);
  console.log(`  Email leads (no account):       ${fmt(top.leads_unconverted)}   /  ${fmt(top.leads_total)} total  (converted=${top.leads_converted}, unsub=${top.leads_unsubscribed})`);
  console.log(`  Natal charts calculated:        ${fmt(top.charts_total)}   (anon=${top.charts_anon}, by-user=${top.charts_user})`);
  console.log(`  Chart readings (AI):            ${fmt(top.readings_total)}`);
  console.log(`  Synastry charts:                ${fmt(top.synastry_total)}`);
  console.log(`  Tarot readings:                 ${fmt(top.tarot_total)}`);

  // ---------------------------------------------------------------------------
  // 2) Paying cohort — full per-user state (every paying user matters)
  // ---------------------------------------------------------------------------
  console.log('\n## 2) PAYING COHORT  (trialing + active + past_due + canceled-but-period-not-ended)');
  const paying = (await pool.query(`
    SELECT
      u.id, u.email, u.locale, u.plan, u.subscription_status,
      u.trial_end, u.current_period_end, u.subscription_expires_at,
      u.created_at, u.last_seen_at, u.stripe_customer_id, u.stripe_subscription_id,
      (SELECT COUNT(*)::int FROM natal_charts c WHERE c.user_id = u.id)        AS charts,
      (SELECT COUNT(*)::int FROM chart_readings cr
        JOIN natal_charts nc ON nc.id = cr.chart_id
        WHERE nc.user_id = u.id)                                               AS readings,
      (SELECT COUNT(*)::int FROM synastry_results s WHERE s.user_id = u.id)    AS synastry,
      (SELECT COUNT(*)::int FROM tarot_readings t WHERE t.user_id = u.id)      AS tarot
    FROM users u
    WHERE u.subscription_status IN ('trialing','active','past_due','canceled','incomplete','unpaid')
       OR u.subscription_expires_at > NOW()
    ORDER BY
      CASE u.subscription_status
        WHEN 'active' THEN 1 WHEN 'trialing' THEN 2 WHEN 'past_due' THEN 3
        WHEN 'unpaid' THEN 4 WHEN 'incomplete' THEN 5 WHEN 'canceled' THEN 6 ELSE 9 END,
      u.created_at DESC
  `)).rows;

  if (paying.length === 0) {
    console.log('  (none — no paying or recently-paying users in DB)');
  } else {
    for (const r of paying) {
      console.log(
        `  • ${r.email.padEnd(38)} ${r.locale}  ${(r.plan || '—').padEnd(12)} ` +
        `${(r.subscription_status || '—').padEnd(10)} ` +
        `trial→${date(r.trial_end)}  period→${date(r.current_period_end)}  ` +
        `last_seen=${date(r.last_seen_at)}  charts=${r.charts} readings=${r.readings} syn=${r.synastry} tarot=${r.tarot}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 3) Signed-up FREE users by real activity (charts + readings + synastry + tarot)
  // ---------------------------------------------------------------------------
  console.log('\n## 3) SIGNED-UP FREE USERS — top by activity');
  const freeActive = (await pool.query(`
    SELECT
      u.id, u.email, u.locale, u.created_at, u.last_seen_at,
      (SELECT COUNT(*)::int FROM natal_charts c WHERE c.user_id = u.id)        AS charts,
      (SELECT COUNT(*)::int FROM chart_readings cr
        JOIN natal_charts nc ON nc.id = cr.chart_id
        WHERE nc.user_id = u.id)                                               AS readings,
      (SELECT COUNT(*)::int FROM synastry_results s WHERE s.user_id = u.id)    AS synastry,
      (SELECT COUNT(*)::int FROM tarot_readings t WHERE t.user_id = u.id)      AS tarot
    FROM users u
    WHERE u.subscription_status = 'free'
  `)).rows
    .map(r => ({ ...r, activity: r.charts + r.readings + r.synastry + r.tarot }))
    .sort((a, b) => b.activity - a.activity || new Date(b.last_seen_at ?? 0) - new Date(a.last_seen_at ?? 0));

  const activeFree = freeActive.filter(r => r.activity > 0);
  const dormantFree = freeActive.filter(r => r.activity === 0);

  console.log(`  Free users with ANY activity:  ${activeFree.length}  /  ${freeActive.length} total free`);
  console.log(`  Free users completely dormant: ${dormantFree.length}\n`);
  console.log('  Top 15 active free users:');
  for (const r of activeFree.slice(0, 15)) {
    console.log(
      `    • ${r.email.padEnd(38)} ${r.locale}  ` +
      `act=${String(r.activity).padStart(3)} (c=${r.charts} r=${r.readings} s=${r.synastry} t=${r.tarot})  ` +
      `signup=${date(r.created_at)}  last_seen=${date(r.last_seen_at)}`
    );
  }

  // ---------------------------------------------------------------------------
  // 4) Email leads — engagement signals (no account, only email + chart given)
  // ---------------------------------------------------------------------------
  console.log('\n## 4) EMAIL-ONLY LEADS  (no signup; gave email to see chart)');
  const leadStats = (await pool.query(`
    SELECT
      locale,
      COUNT(*)::int                                                          AS total,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int    AS last_7d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int   AS last_30d,
      COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int          AS converted,
      COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int               AS unsubscribed,
      COUNT(*) FILTER (WHERE email_undeliverable)::int                       AS undeliverable
    FROM email_leads
    GROUP BY locale ORDER BY locale
  `)).rows;
  for (const r of leadStats) {
    console.log(`  [${r.locale}] total=${r.total}  7d=${r.last_7d}  30d=${r.last_30d}  converted=${r.converted}  unsub=${r.unsubscribed}  undeliverable=${r.undeliverable}`);
  }
  const leadDrip = (await pool.query(`
    SELECT nurture_step, COUNT(*)::int AS n
    FROM email_leads WHERE converted_to_user_id IS NULL AND unsubscribed_at IS NULL
    GROUP BY nurture_step ORDER BY nurture_step
  `)).rows;
  console.log('  Lead drip funnel (only unconverted, unsubscribed=excluded):');
  for (const r of leadDrip) console.log(`    step ${r.nurture_step}: ${r.n} leads`);

  // ---------------------------------------------------------------------------
  // 5) Anonymous chart calculators — pure visitors (no email, no account)
  // ---------------------------------------------------------------------------
  console.log('\n## 5) ANONYMOUS CHART CALCULATORS  (no email, no account)');
  const anon = (await pool.query(`
    SELECT
      COUNT(*)::int                                                          AS total_anon,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int    AS last_7d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int   AS last_30d,
      COUNT(*) FILTER (WHERE status = 'saved')::int                          AS saved
    FROM natal_charts WHERE user_id IS NULL
  `)).rows[0];
  console.log(`  anon charts: total=${anon.total_anon}  7d=${anon.last_7d}  30d=${anon.last_30d}  saved=${anon.saved}`);

  // ---------------------------------------------------------------------------
  // 6) Funnel summary — single big-picture line
  // ---------------------------------------------------------------------------
  console.log('\n## 6) FUNNEL  (lifetime, all-time)');
  const f = top;
  const totalChartsCalc = f.charts_total;
  const totalLeads     = f.leads_total;
  const totalUsers     = f.users_total;
  const paid           = f.users_paying;
  console.log(`  ${fmt(totalChartsCalc)} chart calcs  →  ${fmt(totalLeads)} leads (${(totalLeads / Math.max(1, totalChartsCalc) * 100).toFixed(1)}%)`);
  console.log(`                            →  ${fmt(totalUsers)} users  (${(totalUsers / Math.max(1, totalLeads) * 100).toFixed(1)}% of leads)`);
  console.log(`                            →  ${fmt(paid)} paying  (${(paid / Math.max(1, totalUsers) * 100).toFixed(1)}% of users)`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
