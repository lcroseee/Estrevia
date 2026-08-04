// Post-Quick-Wins-fix PostHog validation:
// - Locale tagging reliability after 2026-05-20 15:46 UTC
// - Founder distinct_ids identification
// - PostHog vs DB lead-submit gap analysis
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const HOST = 'https://us.posthog.com';
const POSTFIX_START = '2026-05-20T15:46:00';

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

// 1. Post-fix locale tagging reliability
const tagging = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    COUNT() AS n,
    uniq(distinct_id) AS users
  FROM events
  WHERE timestamp >= '${POSTFIX_START}'
  GROUP BY locale
  ORDER BY n DESC
`, 'postfix-tagging');
table('1. POST-FIX (since 15:46 UTC) locale tagging rate', tagging?.results, ['locale', 'events', 'users']);

// 2. Per-event-type post-fix tagging
const perEvent = await hogql(`
  SELECT
    event,
    countIf(properties.locale IS NULL OR properties.locale = '') AS unset,
    countIf(properties.locale = 'en') AS en,
    countIf(properties.locale = 'es') AS es,
    COUNT() AS total
  FROM events
  WHERE timestamp >= '${POSTFIX_START}'
  GROUP BY event
  HAVING total > 5
  ORDER BY total DESC
  LIMIT 25
`, 'per-event-tagging');
table('2. Post-fix tagging rate per event (≥5 events)', perEvent?.results,
  ['event', 'unset', 'en', 'es', 'total']);

// 3. Founder candidates — distinct_ids with high event count + recent
const founderCands = await hogql(`
  SELECT
    distinct_id,
    COUNT() AS n,
    uniq(event) AS unique_events,
    countIf(event = 'user_registered') AS registered,
    countIf(event = '$identify') AS identified,
    MIN(timestamp) AS first,
    MAX(timestamp) AS last
  FROM events
  WHERE timestamp >= '2026-05-17'
  GROUP BY distinct_id
  HAVING n > 20
  ORDER BY n DESC
  LIMIT 15
`, 'founder-cands');
table('3. Heavy distinct_ids (likely founder testing)', founderCands?.results,
  ['distinct_id', 'events', 'event_types', 'registered', 'identified', 'first', 'last']);

// 4. user_registered server events — split by associated session locale
//    (look at most recent prior $pageview locale for that distinct_id)
const registered = await hogql(`
  SELECT
    distinct_id,
    toString(timestamp) AS reg_t,
    properties.utm_source,
    properties.utm_campaign
  FROM events
  WHERE event = 'user_registered'
    AND timestamp >= '2026-05-17'
  ORDER BY timestamp DESC
  LIMIT 20
`, 'registered-detail');
console.log('\n═══ 4. All user_registered events (server-side from Clerk webhook) ═══');
if (registered?.results?.length) {
  console.log(`  ${'distinct_id'.padEnd(40)} │ ${'reg_t'.padEnd(20)} │ utm_source | utm_campaign`);
  console.log(`  ${'─'.repeat(40)}─┼─${'─'.repeat(20)}─┼─${'─'.repeat(40)}`);
  for (const [did, t, src, camp] of registered.results) {
    console.log(`  ${did.slice(0, 40).padEnd(40)} │ ${t.slice(0, 20).padEnd(20)} │ ${src ?? '—'} | ${camp ?? '—'}`);
  }
}

// 5. For each user_registered, find the PRIOR pageview/lead_submit locale
const enrich = await hogql(`
  WITH regs AS (
    SELECT distinct_id, MIN(timestamp) AS reg_t
    FROM events
    WHERE event = 'user_registered' AND timestamp >= '2026-05-17'
    GROUP BY distinct_id
  )
  SELECT
    r.distinct_id,
    r.reg_t,
    argMax(e.properties.locale, e.timestamp) AS last_session_locale,
    countIf(e.event = 'email_lead_submitted' AND e.properties.locale = 'es') AS es_submits,
    countIf(e.event = 'email_lead_submitted' AND e.properties.locale = 'en') AS en_submits,
    countIf(e.event = 'email_lead_submitted') AS any_submits
  FROM regs r
  LEFT JOIN events e ON e.distinct_id = r.distinct_id AND e.timestamp <= r.reg_t
  GROUP BY r.distinct_id, r.reg_t
  ORDER BY r.reg_t DESC
`, 'reg-locale-enrich');
table('5. user_registered enriched with pre-signup locale', enrich?.results,
  ['distinct_id', 'reg_t', 'last_session_locale', 'es_submits', 'en_submits', 'any_submits']);

// 6. POST-FIX paywall→signup funnel — does any ES user complete now?
const postFunnel = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    countIf(event = 'email_lead_submitted') AS gate_subs,
    countIf(event = 'paywall_cta_viewed') AS pw_view,
    countIf(event = 'paywall_opened') AS pw_open,
    countIf(event = 'paywall_trial_clicked') AS pw_click,
    countIf(event = 'checkout_stripe_redirected') AS stripe,
    countIf(event = 'user_registered') AS reg
  FROM events
  WHERE timestamp >= '${POSTFIX_START}'
  GROUP BY locale
  ORDER BY gate_subs DESC
`, 'post-funnel');
table('6. POST-FIX funnel × locale', postFunnel?.results,
  ['locale', 'gate_subs', 'pw_view', 'pw_open', 'pw_click', 'stripe', 'reg']);

console.log('\n— End postfix audit —');
