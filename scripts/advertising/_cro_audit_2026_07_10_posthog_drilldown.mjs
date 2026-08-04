// CRO audit 2026-07-10 — PostHog sector drill-down.
// Read-only HogQL. Window: 2026-05-29T00:00:00 → now.
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const API_HOST = 'https://us.posthog.com';
const FROM = '2026-05-29T00:00:00';

async function hog(q, label) {
  const r = await fetch(`${API_HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error || d.detail) {
    console.error(`ERR ${label}: status=${r.status} ${JSON.stringify(d).slice(0, 300)}`);
    return null;
  }
  return d;
}
function table(label, results, columns) {
  console.log(`\n=== ${label} ===`);
  if (!results?.length) { console.log('  (no data)'); return; }
  const widths = columns.map((c, i) =>
    Math.max(c.length, ...results.map((r) => String(r[i] ?? '').length)));
  console.log('  ' + columns.map((c, i) => c.padEnd(widths[i])).join(' | '));
  for (const row of results) {
    console.log('  ' + row.map((v, i) => String(v ?? '').padEnd(widths[i])).join(' | '));
  }
}

// 1. subscription_started raw
const subs = await hog(`
  SELECT toString(timestamp) AS ts, substring(distinct_id, 1, 24) AS did,
    coalesce(toString(properties.plan), '') AS plan,
    coalesce(toString(properties.locale), '') AS locale,
    coalesce(toString(properties.$lib), '') AS lib
  FROM events WHERE event = 'subscription_started' AND timestamp >= '${FROM}'
  ORDER BY timestamp ASC
`, 'subs-raw');
table('1. subscription_started raw (window)', subs?.results, ['ts', 'distinct_id(24)', 'plan', 'locale', 'lib']);

// 2. Checkout chain raw — ordered
const chain = await hog(`
  SELECT toString(timestamp) AS ts, event, substring(distinct_id, 1, 24) AS did,
    coalesce(toString(properties.locale), '') AS locale,
    coalesce(toString(properties.$pathname), '') AS path
  FROM events
  WHERE timestamp >= '${FROM}'
    AND event IN ('anonymous_checkout_started','checkout_auto_started','checkout_stripe_redirected',
      'checkout_ticket_ready','checkout_ticket_timeout','checkout_recovery_attempted',
      'checkout_recovery_succeeded','checkout_recovery_failed','checkout_error',
      'subscription_started','user_registered')
  ORDER BY timestamp ASC LIMIT 60
`, 'chain');
table('2. Checkout-chain events (window, chronological)', chain?.results, ['ts', 'event', 'distinct_id(24)', 'locale', 'path']);

// 3. Consent events + rate proxy
const consent = await hog(`
  SELECT event, COUNT()::int AS n, uniq(distinct_id)::int AS users
  FROM events
  WHERE timestamp >= '${FROM}'
    AND event IN ('cookie_consent_accepted','cookie_consent_declined','$opt_in')
  GROUP BY event ORDER BY n DESC
`, 'consent');
table('3. Consent events (window)', consent?.results, ['event', 'n', 'users']);

// 4. trial-expiration utm detail
const trialUtm = await hog(`
  SELECT toString(timestamp) AS ts, substring(distinct_id, 1, 24) AS did,
    coalesce(toString(properties.$pathname), '') AS path,
    coalesce(toString(properties.utm_campaign), '') AS camp
  FROM events
  WHERE event = '$pageview' AND timestamp >= '${FROM}'
    AND properties.utm_source = 'trial-expiration'
  ORDER BY timestamp ASC
`, 'trial-utm');
table('4. utm_source=trial-expiration pageviews', trialUtm?.results, ['ts', 'distinct_id(24)', 'path', 'utm_campaign']);

// 5. /sign-in activity by day (post anon-payer fix de39cee pushed 05-30)
const signin = await hog(`
  SELECT toString(toStartOfDay(timestamp)) AS day, COUNT()::int AS pvs, uniq(distinct_id)::int AS users
  FROM events
  WHERE event = '$pageview' AND timestamp >= '${FROM}'
    AND properties.$pathname LIKE '%sign-in%'
  GROUP BY day ORDER BY day ASC
`, 'signin');
table('5. /sign-in pageviews by day (window)', signin?.results, ['day', 'pvs', 'users']);

// 6. Paywall step detail: cta_viewed -> opened -> trial_clicked per trigger/variant
const paywall = await hog(`
  SELECT coalesce(toString(properties.trigger), '(none)') AS trigger,
    countIf(event = 'paywall_cta_viewed')::int AS cta_viewed,
    countIf(event = 'paywall_opened')::int AS opened,
    countIf(event = 'paywall_trial_clicked')::int AS trial_clicked
  FROM events
  WHERE timestamp >= '${FROM}'
    AND event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked')
  GROUP BY trigger ORDER BY cta_viewed DESC
`, 'paywall-trigger');
table('6. Paywall events by trigger (window)', paywall?.results, ['trigger', 'cta_viewed', 'opened', 'trial_clicked']);

// 7. Baseline comparison: 14d window ending 2026-05-29 vs last 14d
const cmp = await hog(`
  SELECT
    uniqIf(distinct_id, event = '$pageview' AND timestamp >= '2026-05-15T00:00:00' AND timestamp < '2026-05-29T00:00:00')::int AS pv_users_may14d,
    countIf(event = '$pageview' AND timestamp >= '2026-05-15T00:00:00' AND timestamp < '2026-05-29T00:00:00')::int AS pv_may14d,
    uniqIf(distinct_id, event = '$pageview' AND timestamp > now() - INTERVAL 14 DAY)::int AS pv_users_now14d,
    countIf(event = '$pageview' AND timestamp > now() - INTERVAL 14 DAY)::int AS pv_now14d
  FROM events
`, 'baseline-cmp');
table('7. Traffic: 14d ending 05-29 vs last 14d', cmp?.results,
  ['pv_users_may14d', 'pv_may14d', 'pv_users_now14d', 'pv_now14d']);

// 8. email_lead_submitted: how many had ANY $pageview from same distinct_id (consent visibility)
const leadVis = await hog(`
  SELECT
    uniqIf(distinct_id, event = 'email_lead_submitted')::int AS lead_users,
    uniqIf(distinct_id, event = 'email_gate_viewed')::int AS gate_view_users
  FROM events WHERE timestamp >= '${FROM}'
`, 'lead-vis');
table('8. Server leads vs client gate-views (window)', leadVis?.results, ['lead_users(server)', 'gate_view_users(client)']);

// 9. ES paywall detail: pw_open by pathname for es
const esPw = await hog(`
  SELECT coalesce(toString(properties.$pathname), '(none)') AS path, event, COUNT()::int AS n
  FROM events
  WHERE timestamp >= '${FROM}' AND properties.locale = 'es'
    AND event IN ('paywall_opened','paywall_trial_clicked','checkout_stripe_redirected')
  GROUP BY path, event ORDER BY n DESC LIMIT 15
`, 'es-paywall');
table('9. ES paywall/checkout events by path (window)', esPw?.results, ['path', 'event', 'n']);

console.log('\n-- end --');
