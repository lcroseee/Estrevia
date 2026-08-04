// Adversarial verification of P0-1: Stripe 500-char metadata cap breaks anon-checkout + /recover.
// Independent re-derivation. Read-only HogQL.
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
if (!KEY || !PROJECT) { console.error('missing posthog env'); process.exit(1); }
const API_HOST = 'https://us.posthog.com';

async function hog(q, label) {
  const r = await fetch(`${API_HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const d = await r.json();
  if (!r.ok || d.error || d.detail) {
    console.error(`ERR ${label}: status=${r.status} ${JSON.stringify(d).slice(0, 500)}`);
    return null;
  }
  return d.results;
}

// 1. Counts of all 3 recovery events, last 14d AND all-time
const counts = await hog(`
  SELECT event, count() AS n, min(timestamp) AS first, max(timestamp) AS last
  FROM events
  WHERE event IN ('checkout_recovery_attempted','checkout_recovery_succeeded','checkout_recovery_failed')
  GROUP BY event ORDER BY event
`, 'recovery counts all-time');
console.log('\n=== Recovery events (ALL-TIME) ===');
console.log(counts);

// 2. The reason property on every failed event + distinct_id (to count cs_live ids)
const reasons = await hog(`
  SELECT timestamp, distinct_id,
         properties.reason AS reason,
         properties.session_id AS session_id
  FROM events
  WHERE event = 'checkout_recovery_failed'
  ORDER BY timestamp
`, 'failed reasons');
console.log('\n=== checkout_recovery_failed: every row ===');
console.log(reasons);

// 3. Distinct session_ids among failures
const sessions = await hog(`
  SELECT count() AS total_fail,
         count(DISTINCT properties.session_id) AS distinct_sessions
  FROM events WHERE event = 'checkout_recovery_failed'
`, 'distinct fail sessions');
console.log('\n=== fail totals / distinct sessions ===');
console.log(sessions);

// 4. Funnel numbers claimed: checkout_stripe_redirected vs subscription_started 14d
const funnel = await hog(`
  SELECT event, count() AS n
  FROM events
  WHERE event IN ('checkout_stripe_redirected','subscription_started','anonymous_user_materialized','checkout_ticket_ready')
    AND timestamp >= now() - INTERVAL 14 DAY
  GROUP BY event ORDER BY event
`, 'funnel 14d');
console.log('\n=== 14d funnel checkpoints ===');
console.log(funnel);

// 5. subscription_started ALL TIME vs anon materialized all time (to see if anon path EVER provisioned)
const anon = await hog(`
  SELECT event, count() AS n, min(timestamp) AS first, max(timestamp) AS last
  FROM events
  WHERE event IN ('subscription_started','anonymous_user_materialized','checkout_ticket_ready')
  GROUP BY event ORDER BY event
`, 'anon all-time');
console.log('\n=== anon path all-time ===');
console.log(anon);
