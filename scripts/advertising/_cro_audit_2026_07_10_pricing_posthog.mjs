// READ-ONLY CRO audit probe — pricing/checkout sector — 2026-07-10
// PostHog HogQL query API (read-only) + Neon SELECT for orphan/dunning detail.
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const PH_HOST = 'https://us.posthog.com';
const PID = process.env.POSTHOG_PROJECT_ID;
const KEY = process.env.POSTHOG_PERSONAL_API_KEY;

async function hogql(query) {
  const res = await fetch(`${PH_HOST}/api/projects/${PID}/query/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

console.log('=== Checkout funnel events since 2026-05-29 (PostHog, all locales) ===');
const q1 = await hogql(`
  SELECT event, count() AS n, min(timestamp) AS first, max(timestamp) AS last
  FROM events
  WHERE timestamp >= toDateTime('2026-05-29 00:00:00')
    AND event IN ('paywall_trial_clicked','checkout_auth_redirect','checkout_auto_started',
                  'checkout_stripe_redirected','anonymous_checkout_started',
                  'anonymous_user_materialized','checkout_ticket_ready','checkout_ticket_timeout',
                  'checkout_recovery_attempted','checkout_recovery_succeeded','checkout_recovery_failed',
                  'checkout_error','subscription_started')
  GROUP BY event ORDER BY n DESC`);
for (const r of q1.results) console.log(`  ${r[0]}: ${r[1]} (first ${String(r[2]).slice(0,16)} last ${String(r[3]).slice(0,16)})`);

console.log('\n=== checkout_ticket_timeout detail (waited_ms, session) ===');
const q2 = await hogql(`
  SELECT timestamp, properties.session_id, properties.waited_ms
  FROM events WHERE event='checkout_ticket_timeout' AND timestamp >= toDateTime('2026-05-29 00:00:00')
  ORDER BY timestamp`);
console.log(q2.results.length ? q2.results.map(r => r.join(' | ')).join('\n') : '  (none)');

console.log('\n=== pricing page views + locale null-rate since 2026-05-29 ===');
const q3 = await hogql(`
  SELECT count() AS n,
         countIf(properties.locale IS NULL) AS locale_null,
         countIf(properties.locale = 'es') AS es
  FROM events
  WHERE event = '$pageview' AND timestamp >= toDateTime('2026-05-29 00:00:00')
    AND properties.$pathname LIKE '%/pricing%'`);
console.log('  pricing pageviews:', JSON.stringify(q3.results));

console.log('\n=== paywall_trial_clicked → redirect by source since 2026-05-29 ===');
const q4 = await hogql(`
  SELECT properties.source, properties.plan, count()
  FROM events WHERE event='paywall_trial_clicked' AND timestamp >= toDateTime('2026-05-29 00:00:00')
  GROUP BY properties.source, properties.plan`);
console.log(q4.results.length ? q4.results.map(r => '  ' + r.join(' | ')).join('\n') : '  (none)');

// ---------- Neon: orphan users + dunning ----------
const sql = neon(process.env.DATABASE_URL);
console.log('\n=== 4 placeholder-email users: do any have live subs? ===');
const orphans = await sql`
  SELECT id, subscription_status, plan, stripe_subscription_id IS NOT NULL AS has_sub,
         subscription_expires_at, created_at
  FROM users WHERE email LIKE 'stripe-pending-%@placeholder.invalid' ORDER BY created_at`;
console.log(JSON.stringify(orphans.map(o => ({ id: o.id.slice(0, 14) + '…', status: o.subscription_status, plan: o.plan, has_sub: o.has_sub, expires: o.subscription_expires_at, created: o.created_at })), null, 1));

console.log('\n=== dunning emails sent (table + counts) ===');
try {
  const d = await sql`SELECT step, count(*)::int AS n, max(sent_at) AS last FROM sent_dunning_emails GROUP BY step ORDER BY step`;
  console.log(JSON.stringify(d, null, 1));
} catch (e) { console.log('sent_dunning_emails:', e.message); }

console.log('\n=== users created since 2026-05-29 with premium tier (the 2 June payers) ===');
const newPayers = await sql`
  SELECT left(id, 12) AS id, subscription_status, plan, email LIKE '%placeholder%' AS placeholder,
         created_at::date AS created
  FROM users WHERE subscription_tier='premium' AND created_at >= '2026-05-29' ORDER BY created_at`;
console.log(JSON.stringify(newPayers, null, 1));
