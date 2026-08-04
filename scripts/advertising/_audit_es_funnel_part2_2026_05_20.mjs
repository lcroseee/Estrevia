// Part 2 of /es/ funnel diagnostic — focused queries based on Part 1 findings:
// 1) user_registered (the actual signup event) split by locale
// 2) Correct pathname property
// 3) $exception events (JS errors) per locale/pathname
// 4) ES-locale lead_submit followups
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const HOST = 'https://us.posthog.com';
const WINDOW_START = '2026-05-17T00:00:00';

async function hogql(q, label) {
  const r = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const d = await r.json();
  if (!r.ok) { console.log(`ERR ${label}:`, JSON.stringify(d).slice(0, 400)); return null; }
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

// 1. user_registered — real signup event
const reg = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    event,
    COUNT() AS n,
    uniq(distinct_id) AS users
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND event IN ('user_registered', 'user_signed_up', 'user_signed_in', '$identify')
  GROUP BY locale, event
  ORDER BY n DESC
`, 'user-events');
table('1. user_registered / user_signed_in / $identify', reg?.results, ['locale', 'event', 'n', 'users']);

// 2. All property keys present (to find proper pathname)
const props = await hogql(`
  SELECT
    JSONExtractKeys(toString(properties)) AS keys,
    COUNT() AS n
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND event = '$pageview'
  GROUP BY keys
  ORDER BY n DESC
  LIMIT 5
`, 'pageview-keys');
console.log('\n═══ 2. $pageview property keys sample (first 5 groups) ═══');
if (props?.results?.length) {
  for (const [keys, n] of props.results) {
    console.log(`  n=${n}: ${keys.filter((k) => k.startsWith('$')).slice(0, 15).join(', ')}`);
  }
}

// 3. Look at $current_url instead of $pathname (PostHog default)
const urls = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    substring(toString(properties.$current_url), 1, 60) AS url,
    countIf(event = '$pageview') AS pv,
    countIf(event = 'chart_calculated') AS chart,
    countIf(event = 'email_gate_viewed') AS gate_view,
    countIf(event = 'email_lead_submitted') AS gate_submit
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND properties.$current_url IS NOT NULL
  GROUP BY locale, url
  HAVING pv > 5 OR chart > 0 OR gate_view > 0 OR gate_submit > 0
  ORDER BY pv DESC
  LIMIT 30
`, 'urls');
table('3. URL × locale × funnel (top 30)', urls?.results,
  ['locale', 'url', 'pv', 'chart', 'gate_view', 'gate_submit']);

// 4. $exception events — JS errors
const errors = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    substring(toString(properties.$exception_message), 1, 80) AS msg,
    substring(toString(properties.$current_url), 1, 50) AS url,
    COUNT() AS n
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND event = '$exception'
  GROUP BY locale, msg, url
  ORDER BY n DESC
  LIMIT 20
`, 'exceptions');
table('4. $exception events × locale × URL', errors?.results,
  ['locale', 'msg', 'url', 'n']);

// 5. What happens AFTER lead_submit (per ES distinct_id, next 5 events)
const next = await hogql(`
  WITH es_leads AS (
    SELECT distinct_id, MIN(timestamp) AS submit_t
    FROM events
    WHERE event = 'email_lead_submitted'
      AND properties.locale = 'es'
      AND timestamp >= '${WINDOW_START}'
    GROUP BY distinct_id
  )
  SELECT
    e.event,
    COUNT() AS n,
    uniq(e.distinct_id) AS users
  FROM events e
  INNER JOIN es_leads ON e.distinct_id = es_leads.distinct_id
  WHERE e.timestamp > es_leads.submit_t
    AND e.timestamp < es_leads.submit_t + interval 1 hour
    AND e.event != '$pageleave'
  GROUP BY e.event
  ORDER BY n DESC
  LIMIT 25
`, 'next-after-submit-es');
table('5. ES lead_submit → next events within 1h (post-submit funnel)', next?.results,
  ['event', 'n', 'users']);

// 6. Same for EN
const nextEn = await hogql(`
  WITH en_leads AS (
    SELECT distinct_id, MIN(timestamp) AS submit_t
    FROM events
    WHERE event = 'email_lead_submitted'
      AND properties.locale = 'en'
      AND timestamp >= '${WINDOW_START}'
    GROUP BY distinct_id
  )
  SELECT
    e.event,
    COUNT() AS n,
    uniq(e.distinct_id) AS users
  FROM events e
  INNER JOIN en_leads ON e.distinct_id = en_leads.distinct_id
  WHERE e.timestamp > en_leads.submit_t
    AND e.timestamp < en_leads.submit_t + interval 1 hour
    AND e.event != '$pageleave'
  GROUP BY e.event
  ORDER BY n DESC
  LIMIT 25
`, 'next-after-submit-en');
table('6. EN lead_submit → next events within 1h (post-submit funnel)', nextEn?.results,
  ['event', 'n', 'users']);

// 7. Check anonymous_checkout_started details (this fires server OR client?)
const anon = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    properties.utm_source,
    properties.utm_campaign,
    COUNT() AS n,
    uniq(distinct_id) AS users
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND event = 'anonymous_checkout_started'
  GROUP BY locale, properties.utm_source, properties.utm_campaign
  ORDER BY n DESC
`, 'anon-checkout');
table('7. anonymous_checkout_started — split by locale + UTM', anon?.results,
  ['locale', 'utm_source', 'utm_campaign', 'n', 'users']);

// 8. Devices — mobile vs desktop split
const devices = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    properties.$device_type AS device,
    COUNT() AS n,
    uniqIf(distinct_id, event = 'email_lead_submitted') AS gate_subs,
    uniqIf(distinct_id, event = 'checkout_stripe_redirected') AS stripe_redirs
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND properties.$device_type IS NOT NULL
  GROUP BY locale, device
  ORDER BY n DESC
  LIMIT 20
`, 'devices');
table('8. Device × locale × conversion', devices?.results,
  ['locale', 'device', 'n', 'gate_subs', 'stripe_redirs']);

console.log('\n— End diagnostic part 2 —');
