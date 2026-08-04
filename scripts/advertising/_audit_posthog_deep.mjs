/**
 * Deep PostHog audit via HogQL — full read access.
 * Pulls everything since US-migration commit (~2026-05-17T16:00 UTC).
 */
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const HOST = 'https://us.posthog.com';

async function hogql(query, label) {
  const r = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const d = await r.json();
  if (!r.ok) {
    console.log(`ERR ${label}:`, JSON.stringify(d).slice(0, 300));
    return null;
  }
  return d;
}

function table(label, results, columns) {
  console.log(`\n═══ ${label} ═══`);
  if (!results?.length) { console.log('  (no data)'); return; }
  const widths = columns.map((c, i) =>
    Math.max(c.length, ...results.map((r) => String(r[i] ?? '').length))
  );
  console.log('  ' + columns.map((c, i) => c.padEnd(widths[i])).join(' │ '));
  console.log('  ' + widths.map((w) => '─'.repeat(w)).join('─┼─'));
  for (const row of results) {
    console.log('  ' + row.map((v, i) => String(v ?? '').slice(0, widths[i]).padEnd(widths[i])).join(' │ '));
  }
}

// 1. ALL events ever ingested (we know migration was today)
const all = await hogql(`
  SELECT event, COUNT() AS n, MIN(timestamp) AS first_seen, MAX(timestamp) AS last_seen
  FROM events
  GROUP BY event
  ORDER BY n DESC
  LIMIT 50
`, 'all events');
table('ALL events ever in PostHog (post-US-migration)', all?.results, ['event', 'n', 'first_seen', 'last_seen']);

// 2. Unique visitors (distinct_id) ever
const visitors = await hogql(`
  SELECT
    COUNT(DISTINCT distinct_id) AS unique_visitors,
    COUNT(DISTINCT person_id) AS unique_persons,
    COUNT() AS total_events
  FROM events
`, 'visitors');
table('Unique visitor totals', visitors?.results, ['unique_visitors', 'unique_persons', 'total_events']);

// 3. Funnel events with UTM enrichment
const utm = await hogql(`
  SELECT
    properties.utm_source,
    properties.utm_campaign,
    event,
    COUNT() AS n
  FROM events
  WHERE event IN ('$pageview', 'landing_view', 'chart_calculated', 'email_lead_submitted',
                  'cookie_consent_accepted', 'cookie_consent_declined',
                  'paywall_opened', 'paywall_cta_viewed', 'paywall_trial_clicked',
                  'checkout_auth_redirect', 'checkout_stripe_redirected',
                  'subscription_started')
  GROUP BY properties.utm_source, properties.utm_campaign, event
  ORDER BY n DESC
  LIMIT 100
`, 'utm split');
table('UTM × event split', utm?.results, ['utm_source', 'utm_campaign', 'event', 'n']);

// 4. Per-visitor funnel — what's the longest journey?
const journeys = await hogql(`
  SELECT
    distinct_id,
    COUNT() AS events,
    arraySort(groupUniqArray(event)) AS event_types,
    MIN(timestamp) AS first,
    MAX(timestamp) AS last
  FROM events
  GROUP BY distinct_id
  HAVING events > 1
  ORDER BY events DESC
  LIMIT 20
`, 'journeys');
table('Top journeys by event count', journeys?.results, ['distinct_id', 'events', 'event_types', 'first', 'last']);

// 5. Funnel walkthrough — count distinct users at each step
const funnel = await hogql(`
  SELECT
    countDistinctIf(distinct_id, event = '$pageview') AS pv,
    countDistinctIf(distinct_id, event = 'cookie_consent_accepted') AS consent,
    countDistinctIf(distinct_id, event = 'landing_view') AS landing,
    countDistinctIf(distinct_id, event = 'chart_calculated') AS chart_calc,
    countDistinctIf(distinct_id, event = 'email_lead_submitted') AS lead,
    countDistinctIf(distinct_id, event = 'paywall_opened') AS paywall,
    countDistinctIf(distinct_id, event = 'paywall_trial_clicked') AS trial_click,
    countDistinctIf(distinct_id, event = 'checkout_auth_redirect') AS checkout
  FROM events
`, 'funnel');
table('Funnel (distinct visitors per step)', funnel?.results,
  ['pageview', 'consent', 'landing', 'chart_calc', 'lead', 'paywall', 'trial_click', 'checkout']);

// 6. Cookie consent rate
const consent = await hogql(`
  SELECT
    countIf(event = 'cookie_consent_accepted') AS accepted,
    countIf(event = 'cookie_consent_declined') AS declined,
    countDistinctIf(distinct_id, event = '$pageview') AS pageview_distinct
  FROM events
`, 'consent');
table('Cookie consent state', consent?.results, ['accepted', 'declined', 'pageview_distinct']);

// 7. Paywall — which pages trigger it
const paywall = await hogql(`
  SELECT
    properties.\$current_url,
    properties.paywall_source,
    properties.feature,
    COUNT() AS n
  FROM events
  WHERE event LIKE 'paywall%'
  GROUP BY properties.\$current_url, properties.paywall_source, properties.feature
  ORDER BY n DESC
`, 'paywall');
table('Paywall context (where it fires)', paywall?.results, ['url', 'source', 'feature', 'n']);

// 8. Page distribution (where visitors land)
const pages = await hogql(`
  SELECT
    properties.\$pathname AS path,
    COUNT() AS pv,
    COUNT(DISTINCT distinct_id) AS distinct_visitors
  FROM events
  WHERE event = '$pageview'
  GROUP BY path
  ORDER BY pv DESC
  LIMIT 20
`, 'pages');
table('Top landing paths', pages?.results, ['path', 'pageviews', 'distinct']);

// 9. Email lead detail
const leadDetail = await hogql(`
  SELECT
    timestamp,
    distinct_id,
    properties.utm_source,
    properties.utm_campaign,
    properties.utm_content,
    properties.locale,
    properties.\$current_url
  FROM events
  WHERE event = 'email_lead_submitted'
  ORDER BY timestamp DESC
  LIMIT 20
`, 'lead-detail');
table('Email lead submissions in detail', leadDetail?.results,
  ['timestamp', 'distinct_id', 'utm_source', 'utm_campaign', 'utm_content', 'locale', 'url']);

// 10. Sessions: time on site and exit pages
const sessions = await hogql(`
  SELECT
    distinct_id,
    MIN(timestamp) AS session_start,
    MAX(timestamp) AS session_end,
    dateDiff('second', MIN(timestamp), MAX(timestamp)) AS duration_sec,
    COUNT() AS events
  FROM events
  GROUP BY distinct_id
  HAVING duration_sec > 5
  ORDER BY duration_sec DESC
  LIMIT 15
`, 'sessions');
table('Longest visitor sessions', sessions?.results,
  ['distinct_id', 'session_start', 'session_end', 'duration_sec', 'events']);

// 11. Pageview by hour
const byHour = await hogql(`
  SELECT
    toStartOfHour(timestamp) AS hour,
    countIf(event = '$pageview') AS pv,
    countIf(event = 'email_lead_submitted') AS leads,
    countIf(event = 'paywall_opened') AS paywall,
    countIf(event = 'cookie_consent_accepted') AS consents,
    COUNT(DISTINCT distinct_id) AS visitors
  FROM events
  WHERE timestamp >= now() - INTERVAL 24 HOUR
  GROUP BY hour
  ORDER BY hour DESC
`, 'hourly');
table('Hourly activity (last 24h)', byHour?.results,
  ['hour', 'pv', 'leads', 'paywall', 'consents', 'distinct_visitors']);

// 12. Bot / synthetic check
const bots = await hogql(`
  SELECT
    properties.\$browser AS browser,
    properties.\$device_type AS device,
    properties.\$os AS os,
    COUNT() AS n,
    COUNT(DISTINCT distinct_id) AS distinct_visitors
  FROM events
  WHERE event = '$pageview'
  GROUP BY browser, device, os
  ORDER BY n DESC
  LIMIT 15
`, 'devices');
table('Browser/device breakdown', bots?.results, ['browser', 'device', 'os', 'pv', 'distinct']);
