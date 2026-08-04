// READ-ONLY probe: ES sector state for CRO audit 2026-07-10
// Windows: baseline→today (2026-05-29 → 2026-07-10) and 30d trailing.
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const PH_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID || '407908';

async function hogql(q) {
  const r = await fetch(`https://us.posthog.com/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PH_KEY}` },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const j = await r.json();
  if (!r.ok) { console.error('HogQL error:', JSON.stringify(j).slice(0, 500)); throw new Error('HogQL failed'); }
  return j;
}

// ── 1. DB: leads by locale, split by window ─────────────────────────────
console.log('=== DB email_leads by locale ===');
const leadWindows = await sql`
  SELECT
    locale,
    COUNT(*) FILTER (WHERE created_at >= '2026-05-29') AS since_0529,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS last_30d,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14 days') AS last_14d,
    COUNT(*) AS all_time,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL AND created_at >= '2026-05-29') AS conv_since_0529,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL) AS conv_all_time
  FROM email_leads
  GROUP BY locale
  ORDER BY locale
`;
console.table(leadWindows);

console.log('=== DB email_leads weekly since 2026-05-24 by locale ===');
const weekly = await sql`
  SELECT date_trunc('week', created_at)::date AS week, locale, COUNT(*) AS leads
  FROM email_leads
  WHERE created_at >= '2026-05-24'
  GROUP BY 1, 2 ORDER BY 1, 2
`;
console.table(weekly);

console.log('=== DB users created since 2026-05-29 (locale-ish via lead join) ===');
const usersNew = await sql`
  SELECT
    COUNT(*) AS users_since_0529,
    COUNT(*) FILTER (WHERE subscription_tier IS NOT NULL AND subscription_tier <> 'free') AS non_free
  FROM users WHERE created_at >= '2026-05-29'
`;
console.table(usersNew);

// ── 2. PostHog: funnel by locale — window 05-29→07-10 ──────────────────
const events = ['$pageview','chart_calculated','email_gate_viewed','email_lead_captured','paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected','anonymous_checkout_started','user_registered','subscription_started'];
const evList = events.map(e => `'${e}'`).join(',');

console.log('\n=== PostHog: funnel by locale-prop, 2026-05-29 → now ===');
const q1 = `
SELECT
  event,
  countIf(properties.locale = 'es') AS es_events,
  countIf(properties.locale = 'en') AS en_events,
  countIf(properties.locale IS NULL) AS null_locale,
  count(DISTINCT if(properties.locale = 'es', distinct_id, NULL)) AS es_users,
  count(DISTINCT if(properties.locale = 'en', distinct_id, NULL)) AS en_users
FROM events
WHERE timestamp >= toDateTime('2026-05-29 00:00:00')
  AND event IN (${evList})
GROUP BY event ORDER BY event
`;
const r1 = await hogql(q1);
console.table(r1.results.map(r => ({ event: r[0], es_ev: r[1], en_ev: r[2], null_loc: r[3], es_u: r[4], en_u: r[5] })));

console.log('\n=== PostHog: same, path-based ES detection (/es in url), 2026-05-29 → now ===');
const q2 = `
SELECT
  event,
  count() AS ev,
  count(DISTINCT distinct_id) AS u
FROM events
WHERE timestamp >= toDateTime('2026-05-29 00:00:00')
  AND event IN (${evList})
  AND (
    properties.locale = 'es'
    OR (properties.$pathname IS NOT NULL AND (properties.$pathname = '/es' OR positionUTF8(properties.$pathname, '/es/') = 1))
    OR (properties.$current_url IS NOT NULL AND positionUTF8(properties.$current_url, '/es/') > 0)
  )
GROUP BY event ORDER BY ev DESC
`;
const r2 = await hogql(q2);
console.table(r2.results.map(r => ({ event: r[0], ev: r[1], u: r[2] })));

console.log('\n=== PostHog: total event volume per week since 05-24 (is there ANY traffic?) ===');
const q3 = `
SELECT toStartOfWeek(timestamp) AS wk, count() AS ev, count(DISTINCT distinct_id) AS u,
  countIf(event='$pageview') AS pv
FROM events
WHERE timestamp >= toDateTime('2026-05-24 00:00:00')
GROUP BY wk ORDER BY wk
`;
const r3 = await hogql(q3);
console.table(r3.results.map(r => ({ week: r[0], events: r[1], users: r[2], pageviews: r[3] })));

console.log('\n=== PostHog: locale-null rate on $pageview, last 30d ===');
const q4 = `
SELECT countIf(properties.locale IS NULL) AS null_loc, count() AS total
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY AND event = '$pageview'
`;
const r4 = await hogql(q4);
console.log('null:', r4.results[0][0], '/ total:', r4.results[0][1]);
