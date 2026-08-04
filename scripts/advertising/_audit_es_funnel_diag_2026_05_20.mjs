// /es/ funnel diagnostic — why 0% lead→signup for ES vs 8.6% for EN?
// Pulls PostHog HogQL by locale super-property.
// Run: node scripts/advertising/_audit_es_funnel_diag_2026_05_20.mjs
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const HOST = 'https://us.posthog.com';
const WINDOW_START = '2026-05-17T00:00:00';  // Lead campaign activation

async function hogql(query, label) {
  const r = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const d = await r.json();
  if (!r.ok) {
    console.log(`ERR ${label}:`, JSON.stringify(d).slice(0, 400));
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

// ─── 0. Sanity — is `locale` super-property actually populated? ─────────────
const sanity = await hogql(`
  SELECT properties.locale, COUNT() AS n
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
  GROUP BY properties.locale
  ORDER BY n DESC
`, 'locale-sanity');
table('0. Locale super-property coverage (since 2026-05-17)', sanity?.results, ['locale', 'n']);

// ─── 1. Full funnel — event volume per locale ───────────────────────────────
const funnel = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    event,
    COUNT() AS n,
    COUNT(DISTINCT distinct_id) AS unique_users
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND event IN (
      '$pageview', 'landing_view',
      'cookie_consent_accepted', 'cookie_consent_declined',
      'chart_calculated',
      'email_gate_viewed', 'email_lead_submitted', 'email_gate_dismissed',
      'paywall_cta_viewed', 'paywall_opened', 'paywall_trial_clicked',
      'checkout_auth_redirect', 'checkout_auto_started', 'checkout_stripe_redirected',
      'anonymous_checkout_started',
      'user_signed_up', 'user_signed_in',
      'chart_reading_generated', 'passport_created'
    )
  GROUP BY locale, event
  ORDER BY locale, n DESC
`, 'funnel');
table('1. Funnel events × locale (since campaign start)', funnel?.results, ['locale', 'event', 'n', 'unique_users']);

// ─── 2. Per-locale: event-count funnel ───────────────────────────────────────
const steps = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    countIf(event = 'landing_view') AS landing,
    countIf(event = 'cookie_consent_accepted') AS consent_yes,
    countIf(event = 'chart_calculated') AS chart_calc,
    countIf(event = 'email_gate_viewed') AS gate_view,
    countIf(event = 'email_lead_submitted') AS lead_submit,
    countIf(event = 'paywall_cta_viewed') AS paywall_view,
    countIf(event = 'paywall_opened') AS paywall_open,
    countIf(event = 'paywall_trial_clicked') AS trial_clk,
    countIf(event = 'checkout_auth_redirect') AS auth_redir,
    countIf(event = 'anonymous_checkout_started') AS anon_chkt,
    countIf(event = 'checkout_stripe_redirected') AS stripe_go,
    countIf(event = 'user_signed_up') AS signup
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
  GROUP BY locale
  ORDER BY landing DESC
`, 'funnel-counts');
table('2. Funnel step COUNTS × locale', steps?.results,
  ['locale', 'landing', 'consent_yes', 'chart_calc', 'gate_view', 'lead_submit', 'paywall_view', 'paywall_open', 'trial_clk', 'auth_redir', 'anon_chkt', 'stripe_go', 'signup']);

// ─── 3. Per-locale unique-user funnel — distinct_id counts ──────────────────
const usersFunnel = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    uniqIf(distinct_id, event = '$pageview') AS pv_users,
    uniqIf(distinct_id, event = 'chart_calculated') AS chart_users,
    uniqIf(distinct_id, event = 'email_lead_submitted') AS gate_submit_users,
    uniqIf(distinct_id, event = 'paywall_opened') AS paywall_users,
    uniqIf(distinct_id, event = 'paywall_trial_clicked') AS trial_users,
    uniqIf(distinct_id, event = 'checkout_auth_redirect') AS auth_users,
    uniqIf(distinct_id, event = 'checkout_stripe_redirected') AS stripe_users,
    uniqIf(distinct_id, event = 'user_signed_up') AS signup_users
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
  GROUP BY locale
  ORDER BY pv_users DESC
`, 'unique-users');
table('3. UNIQUE-USER funnel × locale', usersFunnel?.results,
  ['locale', 'pv_users', 'chart_users', 'gate_submit_users', 'paywall_users', 'trial_users', 'auth_users', 'stripe_users', 'signup_users']);

// ─── 4. ES leads → next event (does email_lead_submitted ever convert?) ─────
const esJourney = await hogql(`
  SELECT
    distinct_id,
    arraySort(groupArray((toString(timestamp), event))) AS journey
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND properties.locale = 'es'
    AND distinct_id IN (
      SELECT distinct_id FROM events
      WHERE event = 'email_lead_submitted' AND properties.locale = 'es'
        AND timestamp >= '${WINDOW_START}'
    )
  GROUP BY distinct_id
  ORDER BY length(journey) DESC
  LIMIT 15
`, 'es-journeys');
console.log('\n═══ 4. Sample ES distinct_id journeys (post-gate) — 15 most-active ═══');
if (esJourney?.results?.length) {
  for (const [did, journey] of esJourney.results) {
    const events = journey.map(([t, e]) => `${t.slice(11, 19)} ${e}`).join(' → ');
    console.log(`  ${did.slice(0, 12).padEnd(12)} (${journey.length} ev): ${events}`);
  }
} else {
  console.log('  (no ES gate-submit journeys found)');
}

// ─── 5. EN counterpart — what does a successful EN funnel look like? ────────
const enJourney = await hogql(`
  SELECT
    distinct_id,
    arraySort(groupArray((toString(timestamp), event))) AS journey
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND properties.locale = 'en'
    AND distinct_id IN (
      SELECT distinct_id FROM events
      WHERE event = 'user_signed_up' AND properties.locale = 'en'
        AND timestamp >= '${WINDOW_START}'
    )
  GROUP BY distinct_id
  LIMIT 10
`, 'en-journeys');
console.log('\n═══ 5. EN signup journeys — what worked ═══');
if (enJourney?.results?.length) {
  for (const [did, journey] of enJourney.results) {
    const events = journey.map(([t, e]) => `${t.slice(11, 19)} ${e}`).join(' → ');
    console.log(`  ${did.slice(0, 12).padEnd(12)} (${journey.length} ev): ${events}`);
  }
} else {
  console.log('  (no EN signup journeys)');
}

// ─── 6. Cookie consent rates per locale ─────────────────────────────────────
const consent = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    countIf(event = 'cookie_consent_accepted') AS accepted,
    countIf(event = 'cookie_consent_declined') AS declined,
    uniqIf(distinct_id, event = 'cookie_consent_accepted') AS accept_users,
    uniqIf(distinct_id, event = 'cookie_consent_declined') AS decline_users
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
  GROUP BY locale
`, 'consent');
table('6. Cookie-consent split × locale', consent?.results,
  ['locale', 'accepted', 'declined', 'accept_users', 'decline_users']);

// ─── 7. UTM × locale ────────────────────────────────────────────────────────
const utmLocale = await hogql(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    properties.utm_source,
    properties.utm_campaign,
    COUNT() AS n,
    uniqIf(distinct_id, event = 'email_lead_submitted') AS gate_users,
    uniqIf(distinct_id, event = 'user_signed_up') AS signup_users
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND properties.utm_source IS NOT NULL
  GROUP BY locale, properties.utm_source, properties.utm_campaign
  HAVING n > 5
  ORDER BY n DESC
  LIMIT 25
`, 'utm-locale');
table('7. UTM × locale (top 25, ≥5 events)', utmLocale?.results,
  ['locale', 'utm_source', 'utm_campaign', 'events', 'gate_users', 'signup_users']);

// ─── 8. ES pathname distribution — where do they land/drop? ─────────────────
const pathDrops = await hogql(`
  SELECT
    properties.$pathname AS pathname,
    countIf(event = '$pageview') AS pv,
    countIf(event = 'chart_calculated') AS chart,
    countIf(event = 'email_gate_viewed') AS gate_view,
    countIf(event = 'email_lead_submitted') AS gate_submit
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND properties.locale = 'es'
    AND properties.$pathname IS NOT NULL
  GROUP BY pathname
  HAVING pv > 5
  ORDER BY pv DESC
  LIMIT 20
`, 'es-paths');
table('8. ES top pathnames — where do they land/calculate/gate?', pathDrops?.results,
  ['pathname', 'pv', 'chart', 'gate_view', 'gate_submit']);

// ─── 9. EN counterpart for comparison ───────────────────────────────────────
const enPaths = await hogql(`
  SELECT
    properties.$pathname AS pathname,
    countIf(event = '$pageview') AS pv,
    countIf(event = 'chart_calculated') AS chart,
    countIf(event = 'email_gate_viewed') AS gate_view,
    countIf(event = 'email_lead_submitted') AS gate_submit
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND properties.locale = 'en'
    AND properties.$pathname IS NOT NULL
  GROUP BY pathname
  HAVING pv > 3
  ORDER BY pv DESC
  LIMIT 20
`, 'en-paths');
table('9. EN top pathnames (compare to ES)', enPaths?.results,
  ['pathname', 'pv', 'chart', 'gate_view', 'gate_submit']);

// ─── 10. ES users who hit gate_view but NOT gate_submit ─────────────────────
const esDrop = await hogql(`
  WITH es_users AS (
    SELECT distinct_id, MIN(timestamp) AS first_seen
    FROM events
    WHERE properties.locale = 'es' AND timestamp >= '${WINDOW_START}'
    GROUP BY distinct_id
  ),
  gate_viewed AS (
    SELECT DISTINCT distinct_id
    FROM events
    WHERE event = 'email_gate_viewed'
      AND properties.locale = 'es'
      AND timestamp >= '${WINDOW_START}'
  ),
  gate_submitted AS (
    SELECT DISTINCT distinct_id
    FROM events
    WHERE event = 'email_lead_submitted'
      AND properties.locale = 'es'
      AND timestamp >= '${WINDOW_START}'
  )
  SELECT
    (SELECT COUNT() FROM gate_viewed) AS viewed,
    (SELECT COUNT() FROM gate_submitted) AS submitted,
    (SELECT COUNT() FROM gate_viewed) - (SELECT COUNT() FROM gate_submitted) AS dropped
`, 'es-drop-at-gate');
table('10. ES email-gate VIEW→SUBMIT drop', esDrop?.results, ['viewed', 'submitted', 'dropped']);

// ─── 11. Country breakdown (geo) — есть ли странность? ───────────────────────
const geo = await hogql(`
  SELECT
    properties.locale AS locale,
    properties.$geoip_country_code AS country,
    COUNT() AS n,
    uniqIf(distinct_id, event = 'email_lead_submitted') AS gate_subs,
    uniqIf(distinct_id, event = 'user_signed_up') AS signups
  FROM events
  WHERE timestamp >= '${WINDOW_START}'
    AND properties.$geoip_country_code IS NOT NULL
  GROUP BY locale, country
  HAVING n > 50
  ORDER BY n DESC
  LIMIT 30
`, 'geo');
table('11. Country × locale × conversion (top 30, ≥50 events)', geo?.results,
  ['locale', 'country', 'events', 'gate_subs', 'signups']);

console.log('\n— End diagnostic —');
