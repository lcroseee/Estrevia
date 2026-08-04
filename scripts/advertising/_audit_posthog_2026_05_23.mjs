// PostHog audit 2026-05-23 — verify locale super-prop fix + 14d funnel + ES vs EN
// + anon-checkout fix verification + entry pages + drip attribution + consent rate.
// Read-only HogQL queries.
//
// Commit refs:
//   27322af  fix(posthog/T5): locale super-prop via init.loaded callback   (2026-05-21 20:48 UTC)
//   cf205a4  fix(pricing-anon): trust API success over Clerk signed-out    (2026-05-21 deploy)
//
// Post-fix cutoff for both: ~2026-05-21 21:00 UTC (deploy ~5-10 min after commit push).

import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');

if (!KEY || !PROJECT) {
  console.error('❌ POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID missing in .env');
  process.exit(1);
}

// Use US region for personal-API queries (proxy is browser-only per memory)
const API_HOST = 'https://us.posthog.com';

const POSTFIX = '2026-05-21T21:00:00';  // commit 27322af deployed ~21:00 UTC

async function hog(q, label) {
  const r = await fetch(`${API_HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  if (r.status === 429) {
    console.error(`⚠️  RATE LIMIT on ${label}: ${r.status}`);
    return null;
  }
  if (r.status === 401 || r.status === 403) {
    console.error(`⚠️  AUTH FAIL on ${label}: ${r.status} — check POSTHOG_PERSONAL_API_KEY`);
    return null;
  }
  const d = await r.json();
  if (!r.ok || d.error || d.detail) {
    console.error(`❌ ERR ${label}: status=${r.status} ${JSON.stringify(d).slice(0, 400)}`);
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
    console.log('  ' + row.map((v, i) => String(v ?? '').slice(0, Math.max(widths[i], 60)).padEnd(widths[i])).join(' │ '));
  }
}

console.log(`PostHog audit · project=${PROJECT} · api_host=${API_HOST}`);
console.log(`Run at: ${new Date().toISOString()}`);
console.log(`Post-fix cutoff (locale + anon-checkout): ${POSTFIX}\n`);

// ─── 1. LOCALE FIX VERIFICATION ──────────────────────────────────────────────
// Compare $pageview locale-tagging for POST-FIX 48h vs LAST 7d (mostly pre-fix)
const locale48h = await hog(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    COUNT() AS pvs,
    uniq(distinct_id) AS users
  FROM events
  WHERE event = '$pageview'
    AND timestamp >= '${POSTFIX}'
  GROUP BY locale
  ORDER BY pvs DESC
`, 'locale-48h-postfix');
table('1A. $pageview locale tagging — POST-FIX (since 2026-05-21 21:00 UTC)', locale48h?.results, ['locale', 'pageviews', 'users']);

const locale7d = await hog(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    COUNT() AS pvs,
    uniq(distinct_id) AS users
  FROM events
  WHERE event = '$pageview'
    AND timestamp > now() - INTERVAL 7 DAY
  GROUP BY locale
  ORDER BY pvs DESC
`, 'locale-7d');
table('1B. $pageview locale tagging — LAST 7d (mostly pre-fix)', locale7d?.results, ['locale', 'pageviews', 'users']);

// Compute % set vs unset
function pct(rows) {
  if (!rows?.length) return null;
  let total = 0, unset = 0;
  for (const r of rows) {
    const n = Number(r[1]) || 0;
    total += n;
    if (r[0] === '(unset)' || r[0] === '' || r[0] === 'null') unset += n;
  }
  return { total, unset, setPct: total ? ((total - unset) / total) * 100 : 0, unsetPct: total ? (unset / total) * 100 : 0 };
}
const p48 = pct(locale48h?.results);
const p7d = pct(locale7d?.results);
console.log('\n→ Locale-set % (lower unset is better — target ≤20% unset post-fix):');
if (p48) console.log(`  POST-FIX 48h: ${p48.setPct.toFixed(1)}% set (${p48.unsetPct.toFixed(1)}% unset), n=${p48.total}`);
if (p7d) console.log(`  LAST 7d:      ${p7d.setPct.toFixed(1)}% set (${p7d.unsetPct.toFixed(1)}% unset), n=${p7d.total}`);

// Per-event-type tagging post-fix
const perEvent48h = await hog(`
  SELECT
    event,
    countIf(properties.locale IS NULL OR properties.locale = '') AS unset,
    countIf(properties.locale = 'en') AS en,
    countIf(properties.locale = 'es') AS es,
    COUNT() AS total
  FROM events
  WHERE timestamp >= '${POSTFIX}'
  GROUP BY event
  HAVING total > 3
  ORDER BY total DESC
  LIMIT 25
`, 'per-event-postfix');
table('1C. Post-fix locale tagging per event (≥3)', perEvent48h?.results,
  ['event', 'unset', 'en', 'es', 'total']);

// ─── 2. 14D FUNNEL DELTA VS BASELINE ─────────────────────────────────────────
const funnel14d = await hog(`
  SELECT event, COUNT()::int AS n, uniq(distinct_id)::int AS users
  FROM events
  WHERE timestamp > now() - INTERVAL 14 DAY
    AND event IN (
      '$pageview',
      'chart_calculated',
      'email_gate_viewed',
      'email_gate_submitted',
      'paywall_trial_clicked',
      'checkout_stripe_redirected',
      'checkout_auth_redirect',
      'user_registered',
      'subscription_started'
    )
  GROUP BY event
  ORDER BY n DESC
`, 'funnel-14d');
table('2. Funnel events — LAST 14d', funnel14d?.results, ['event', 'count', 'uniques']);

// ─── 3. ES vs EN FUNNEL (POST-FIX 48h) ───────────────────────────────────────
const esEnFunnel = await hog(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    countDistinctIf(distinct_id, event = '$pageview') AS pageview,
    countDistinctIf(distinct_id, event = 'chart_calculated') AS chart,
    countDistinctIf(distinct_id, event = 'email_gate_viewed') AS gate_view,
    countDistinctIf(distinct_id, event = 'email_gate_submitted') AS gate_sub,
    countDistinctIf(distinct_id, event = 'paywall_trial_clicked') AS pw_click,
    countDistinctIf(distinct_id, event = 'checkout_stripe_redirected') AS stripe,
    countDistinctIf(distinct_id, event = 'user_registered') AS registered
  FROM events
  WHERE timestamp >= '${POSTFIX}'
  GROUP BY locale
  ORDER BY pageview DESC
`, 'es-vs-en-postfix');
table('3. ES vs EN funnel (POST-FIX 48h, distinct users)', esEnFunnel?.results,
  ['locale', 'pv', 'chart', 'gate_v', 'gate_s', 'pw_click', 'stripe', 'reg']);

// Also event-count version for finer granularity
const esEnFunnelCount = await hog(`
  SELECT
    coalesce(properties.locale, '(unset)') AS locale,
    countIf(event = '$pageview') AS pv,
    countIf(event = 'chart_calculated') AS chart,
    countIf(event = 'email_gate_viewed') AS gate_v,
    countIf(event = 'email_gate_submitted') AS gate_s,
    countIf(event = 'paywall_trial_clicked') AS pw_click,
    countIf(event = 'checkout_stripe_redirected') AS stripe,
    countIf(event = 'checkout_auth_redirect') AS auth_redir,
    countIf(event = 'user_registered') AS reg
  FROM events
  WHERE timestamp >= '${POSTFIX}'
  GROUP BY locale
  ORDER BY pv DESC
`, 'es-vs-en-postfix-counts');
table('3B. ES vs EN funnel (POST-FIX 48h, event counts)', esEnFunnelCount?.results,
  ['locale', 'pv', 'chart', 'gate_v', 'gate_s', 'pw_click', 'stripe', 'auth_redir', 'reg']);

// ─── 4. ANON-CHECKOUT FIX VERIFICATION (checkout_auth_redirect counts) ───────
// Baseline (2026-05-21 14:29 UTC) reported 6 events in last 14d. cf205a4 was deployed ~21:00 UTC same day.
const authRedirAll = await hog(`
  SELECT
    toString(toStartOfDay(timestamp)) AS day,
    countIf(event = 'checkout_auth_redirect') AS auth_redir
  FROM events
  WHERE event = 'checkout_auth_redirect'
    AND timestamp > now() - INTERVAL 14 DAY
  GROUP BY day
  ORDER BY day DESC
`, 'auth-redir-by-day');
table('4A. checkout_auth_redirect by day (14d)', authRedirAll?.results, ['day', 'auth_redir']);

const authRedirPostFix = await hog(`
  SELECT countIf(event = 'checkout_auth_redirect') AS n
  FROM events
  WHERE timestamp >= '${POSTFIX}'
`, 'auth-redir-postfix');
const postFixCount = authRedirPostFix?.results?.[0]?.[0] ?? null;
console.log(`\n→ 4B. checkout_auth_redirect since ${POSTFIX} (cf205a4 deploy): ${postFixCount === null ? 'N/A' : postFixCount}`);
console.log('   Baseline (2026-05-21 14:29 UTC) reported 6 events in 14d — pre-fix.');
console.log('   Target: 0 events since fix deploy.');

// ─── 5. ENTRY PAGES (top 15, last 14d) ───────────────────────────────────────
const entries = await hog(`
  SELECT properties.$pathname AS path,
         COUNT()::int AS pvs,
         uniq(distinct_id)::int AS users
  FROM events
  WHERE event = '$pageview' AND timestamp > now() - INTERVAL 14 DAY
  GROUP BY path
  ORDER BY pvs DESC
  LIMIT 15
`, 'entries-14d');
table('5. Top 15 entry pages (14d)', entries?.results, ['path', 'pvs', 'users']);

// Check programmatic SEO pages specifically
const seoEntries = await hog(`
  SELECT properties.$pathname AS path,
         COUNT()::int AS pvs,
         uniq(distinct_id)::int AS users
  FROM events
  WHERE event = '$pageview' AND timestamp > now() - INTERVAL 14 DAY
    AND (
      properties.$pathname LIKE '%compatibility%' OR
      properties.$pathname LIKE '%sidereal-dates%' OR
      properties.$pathname LIKE '%/cities/%' OR
      properties.$pathname LIKE '%/signs/%' OR
      properties.$pathname LIKE '%/synastry%'
    )
  GROUP BY path
  ORDER BY pvs DESC
  LIMIT 20
`, 'seo-entries');
table('5B. Programmatic SEO pageviews (14d)', seoEntries?.results, ['path', 'pvs', 'users']);

// ─── 6. DRIP ATTRIBUTION — utm_source=lead-nurture pageviews (7d) ───────────
const drip = await hog(`
  SELECT
    properties.utm_source AS src,
    properties.utm_campaign AS camp,
    properties.utm_content AS content,
    COUNT()::int AS pvs,
    uniq(distinct_id)::int AS users
  FROM events
  WHERE event = '$pageview' AND timestamp > now() - INTERVAL 7 DAY
    AND properties.utm_source LIKE '%lead-nurture%'
  GROUP BY src, camp, content
  ORDER BY pvs DESC
  LIMIT 20
`, 'drip-utm');
table('6A. Drip → site (utm_source=lead-nurture*) pageviews — last 7d', drip?.results,
  ['utm_source', 'utm_campaign', 'utm_content', 'pvs', 'users']);

const dripTotal = await hog(`
  SELECT
    countIf(properties.utm_source LIKE '%lead-nurture%') AS drip_pvs,
    countIf(properties.utm_source LIKE '%lead-nurture%' AND event = 'checkout_stripe_redirected') AS drip_to_stripe,
    countIf(properties.utm_source LIKE '%lead-nurture%' AND event = 'user_registered') AS drip_to_reg
  FROM events
  WHERE timestamp > now() - INTERVAL 7 DAY
`, 'drip-attribution');
const drip_pvs = dripTotal?.results?.[0]?.[0] ?? 0;
const drip_to_stripe = dripTotal?.results?.[0]?.[1] ?? 0;
const drip_to_reg = dripTotal?.results?.[0]?.[2] ?? 0;
console.log(`\n→ 6B. Drip-attributed events (7d): pageviews=${drip_pvs}, stripe_redirects=${drip_to_stripe}, registrations=${drip_to_reg}`);

// ─── 7. COOKIE CONSENT / OPT-IN — events post-consent vs pre-consent ────────
// PostHog only fires after consent in our setup (per CSP-PostHog Health hardening memory).
// Heuristic 1: count of $opt_in events (PostHog auto-fires when posthog.opt_in_capturing() called).
const optIn = await hog(`
  SELECT
    event,
    COUNT()::int AS n,
    uniq(distinct_id)::int AS users
  FROM events
  WHERE event IN ('$opt_in', '$opt_out', '$consent_given', 'cookie_consent_accepted', 'cookie_consent_declined')
    AND timestamp > now() - INTERVAL 14 DAY
  GROUP BY event
  ORDER BY n DESC
`, 'opt-in');
table('7A. Cookie consent events (14d)', optIn?.results, ['event', 'n', 'users']);

// Heuristic 2: distinct_id retention — fraction of distinct_ids that fire >1 event (i.e. consented + continued)
const distinctRetention = await hog(`
  SELECT
    sum(if(event_count = 1, 1, 0))::int AS single_event,
    sum(if(event_count BETWEEN 2 AND 5, 1, 0))::int AS two_to_five,
    sum(if(event_count > 5, 1, 0))::int AS six_plus,
    COUNT()::int AS total_distinct_ids
  FROM (
    SELECT distinct_id, COUNT() AS event_count
    FROM events
    WHERE timestamp > now() - INTERVAL 14 DAY
    GROUP BY distinct_id
  )
`, 'distinct-retention');
table('7B. Distinct-id event counts (14d) — proxy for consent stickiness', distinctRetention?.results,
  ['single_event', 'two_to_five', 'six_plus', 'total_distinct_ids']);

// Heuristic 3: ratio of $pageview to unique sessions (consent gate = 1 pageview before disappearing)
const pageviewSessions = await hog(`
  SELECT
    uniq(properties.$session_id)::int AS sessions,
    countIf(event = '$pageview')::int AS pageviews,
    uniq(distinct_id)::int AS users
  FROM events
  WHERE timestamp > now() - INTERVAL 14 DAY
`, 'pv-sessions');
table('7C. Sessions vs pageviews (14d) — low pv/session = consent friction', pageviewSessions?.results,
  ['sessions', 'pageviews', 'users']);

// ─── 8. DAY-OVER-DAY EVENT VOLUME (last 7d) — to spot fix-induced volume changes ─
const daily = await hog(`
  SELECT
    toString(toStartOfDay(timestamp)) AS day,
    countIf(event = '$pageview')::int AS pv,
    countIf(event = 'chart_calculated')::int AS chart,
    countIf(event = 'email_gate_viewed')::int AS gate_v,
    countIf(event = 'paywall_trial_clicked')::int AS pw_click,
    countIf(event = 'checkout_stripe_redirected')::int AS stripe,
    countIf(event = 'user_registered')::int AS reg,
    countIf(properties.locale = 'en')::int AS en_evts,
    countIf(properties.locale = 'es')::int AS es_evts,
    countIf(properties.locale IS NULL)::int AS unset_evts
  FROM events
  WHERE timestamp > now() - INTERVAL 7 DAY
  GROUP BY day
  ORDER BY day DESC
`, 'daily-7d');
table('8. Day-over-day events (7d)', daily?.results,
  ['day', 'pv', 'chart', 'gate_v', 'pw_click', 'stripe', 'reg', 'en', 'es', 'unset']);

console.log('\n— End PostHog audit 2026-05-23 —');
