// Read-only probe: checkout-recovery + related new events (7d) for 2026-05-29 audit.
// Events shipped with checkout-recovery (commits 4cb0fa7..1c2c64a):
//   checkout_recovery_attempted / checkout_recovery_succeeded / checkout_recovery_failed
// Plus context events: checkout_ticket_timeout, checkout_auto_started, anonymous_checkout_started.
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
if (!KEY || !PROJECT) { console.error('missing env'); process.exit(1); }
const API_HOST = 'https://us.posthog.com';

async function hog(q, label) {
  const r = await fetch(`${API_HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const d = await r.json();
  if (!r.ok || d.error || d.detail) {
    console.error(`ERR ${label}: ${r.status} ${JSON.stringify(d).slice(0, 300)}`);
    return null;
  }
  return d;
}

function dump(label, d) {
  console.log(`\n=== ${label} ===`);
  if (!d?.results?.length) { console.log('  (no rows)'); return; }
  console.log('  cols:', d.columns?.join(' | '));
  for (const row of d.results) console.log('  ', row.map((v) => String(v ?? '')).join(' | '));
}

const q1 = `
SELECT event, count() AS cnt, count(DISTINCT distinct_id) AS users,
       min(timestamp) AS first_seen, max(timestamp) AS last_seen
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN ('checkout_recovery_attempted','checkout_recovery_succeeded','checkout_recovery_failed',
                'checkout_ticket_timeout','checkout_auto_started','anonymous_checkout_started')
GROUP BY event ORDER BY cnt DESC`;

const q2 = `
SELECT event, count() AS cnt
FROM events
WHERE timestamp >= now() - INTERVAL 14 DAY
  AND event IN ('checkout_recovery_attempted','checkout_recovery_succeeded','checkout_recovery_failed')
GROUP BY event ORDER BY cnt DESC`;

// daily breakdown of recovery + timeout to see whether timeouts produce recoveries
const q3 = `
SELECT toDate(timestamp) AS day,
  countIf(event='checkout_ticket_timeout') AS timeout,
  countIf(event='checkout_recovery_attempted') AS rec_attempt,
  countIf(event='checkout_recovery_succeeded') AS rec_ok,
  countIf(event='checkout_recovery_failed') AS rec_fail
FROM events
WHERE timestamp >= now() - INTERVAL 14 DAY
GROUP BY day ORDER BY day DESC`;

// Did any recovery_succeeded user also have subscription_started?
const q4 = `
SELECT distinct_id,
  countIf(event='checkout_recovery_attempted') AS attempt,
  countIf(event='checkout_recovery_succeeded') AS ok,
  countIf(event='checkout_recovery_failed') AS fail,
  countIf(event='subscription_started') AS sub
FROM events
WHERE timestamp >= now() - INTERVAL 14 DAY
  AND distinct_id IN (
    SELECT distinct_id FROM events
    WHERE timestamp >= now() - INTERVAL 14 DAY
      AND event IN ('checkout_recovery_attempted','checkout_recovery_succeeded','checkout_recovery_failed')
  )
GROUP BY distinct_id ORDER BY attempt DESC`;

dump('1. Recovery + context events, 7d', await hog(q1, 'q1'));
dump('2. Recovery events only, 14d', await hog(q2, 'q2'));
dump('3. Daily timeout->recovery, 14d', await hog(q3, 'q3'));
dump('4. Per-user recovery + sub correlation, 14d', await hog(q4, 'q4'));
