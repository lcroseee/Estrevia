// CRO audit 2026-07-10 — PostHog sector: behavioral funnel + drop-off location.
// Window: 2026-05-29T00:00:00 → now (~6 weeks, post last audit). Also 30d trailing where labeled.
// STRICTLY READ-ONLY: HogQL queries via Query API only. No capture.
//
// Event names verified fired in src (grep -v __tests__):
//   EmailGateModal.tsx: email_gate_viewed / email_gate_dismissed / email_lead_resubmitted
//   PaywallModal.tsx: paywall_opened / paywall_trial_clicked / checkout_stripe_redirected
//   PaywallCta.tsx: paywall_cta_viewed
//   plus server-side: email_lead_submitted (api/v1/leads), subscription_started (stripe webhook),
//   checkout_recovery_* (recover route), anonymous_checkout_started (stripe/checkout route).

import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
if (!KEY || !PROJECT) {
  console.error('missing POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID');
  process.exit(1);
}
const API_HOST = 'https://us.posthog.com';
const FROM = '2026-05-29T00:00:00'; // audit window start (last audit date)

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

console.log(`PostHog CRO audit sector · project=${PROJECT} · run=${new Date().toISOString()}`);
console.log(`Window: ${FROM} → now`);

const FUNNEL_EVENTS = [
  '$pageview', 'landing_view', 'chart_calculated',
  'email_gate_viewed', 'email_gate_dismissed', 'email_lead_submitted', 'email_lead_resubmitted',
  'paywall_cta_viewed', 'chart_reading_generated', 'paywall_opened', 'paywall_trial_clicked',
  'checkout_auth_redirect', 'checkout_auto_started', 'anonymous_checkout_started',
  'checkout_stripe_redirected', 'checkout_ticket_ready', 'checkout_ticket_timeout',
  'checkout_recovery_attempted', 'checkout_recovery_succeeded', 'checkout_recovery_failed',
  'checkout_error', 'user_registered', 'user_signed_up', 'user_signed_in', 'subscription_started',
];
const evList = FUNNEL_EVENTS.map((e) => `'${e}'`).join(',');

// 1. Full funnel — window + 30d trailing
const funnelWin = await hog(`
  SELECT event, COUNT()::int AS n, uniq(distinct_id)::int AS users
  FROM events WHERE timestamp >= '${FROM}' AND event IN (${evList})
  GROUP BY event ORDER BY n DESC
`, 'funnel-window');
table(`1A. Funnel events — ${FROM} → now`, funnelWin?.results, ['event', 'count', 'uniques']);

const funnel30 = await hog(`
  SELECT event, COUNT()::int AS n, uniq(distinct_id)::int AS users
  FROM events WHERE timestamp > now() - INTERVAL 30 DAY AND event IN (${evList})
  GROUP BY event ORDER BY n DESC
`, 'funnel-30d');
table('1B. Funnel events — trailing 30d', funnel30?.results, ['event', 'count', 'uniques']);

// 2. Daily trend — pv uniques + key steps per day over the window
const daily = await hog(`
  SELECT toString(toStartOfDay(timestamp)) AS day,
    uniqIf(distinct_id, event = '$pageview')::int AS pv_users,
    countIf(event = '$pageview')::int AS pv,
    countIf(event = 'chart_calculated')::int AS chart,
    countIf(event = 'email_gate_viewed')::int AS gate_v,
    countIf(event = 'email_lead_submitted')::int AS lead,
    countIf(event = 'paywall_trial_clicked')::int AS pw_click,
    countIf(event = 'checkout_stripe_redirected')::int AS stripe,
    countIf(event = 'subscription_started')::int AS sub
  FROM events WHERE timestamp >= '${FROM}'
  GROUP BY day ORDER BY day ASC
`, 'daily');
table('2. Daily trend (window)', daily?.results,
  ['day', 'pv_users', 'pv', 'chart', 'gate_v', 'lead', 'pw_click', 'stripe', 'sub']);

// 3. Locale set-rate per event (window)
const localeRate = await hog(`
  SELECT event,
    countIf(properties.locale IS NULL OR properties.locale = '')::int AS unset,
    countIf(properties.locale = 'en')::int AS en,
    countIf(properties.locale = 'es')::int AS es,
    COUNT()::int AS total
  FROM events WHERE timestamp >= '${FROM}' AND event IN (${evList})
  GROUP BY event HAVING total > 0 ORDER BY total DESC
`, 'locale-rate');
table('3. Locale tagging per event (window)', localeRate?.results, ['event', 'unset', 'en', 'es', 'total']);

// 4. EN vs ES funnel (distinct users, where locale set), window
const localeFunnel = await hog(`
  SELECT coalesce(properties.locale, '(unset)') AS locale,
    uniqIf(distinct_id, event = '$pageview')::int AS pv,
    uniqIf(distinct_id, event = 'chart_calculated')::int AS chart,
    uniqIf(distinct_id, event = 'email_gate_viewed')::int AS gate_v,
    uniqIf(distinct_id, event = 'email_lead_submitted')::int AS lead,
    uniqIf(distinct_id, event = 'paywall_cta_viewed')::int AS cta_v,
    uniqIf(distinct_id, event = 'paywall_opened')::int AS pw_open,
    uniqIf(distinct_id, event = 'paywall_trial_clicked')::int AS pw_click,
    uniqIf(distinct_id, event = 'checkout_stripe_redirected')::int AS stripe,
    uniqIf(distinct_id, event = 'user_registered')::int AS reg,
    uniqIf(distinct_id, event = 'subscription_started')::int AS sub
  FROM events WHERE timestamp >= '${FROM}'
  GROUP BY locale ORDER BY pv DESC
`, 'locale-funnel');
table('4. EN vs ES funnel (distinct users, window)', localeFunnel?.results,
  ['locale', 'pv', 'chart', 'gate_v', 'lead', 'cta_v', 'pw_open', 'pw_click', 'stripe', 'reg', 'sub']);

// 5. Device split per funnel step (window)
const device = await hog(`
  SELECT coalesce(properties.$device_type, '(unset)') AS device,
    uniqIf(distinct_id, event = '$pageview')::int AS pv,
    uniqIf(distinct_id, event = 'chart_calculated')::int AS chart,
    uniqIf(distinct_id, event = 'email_gate_viewed')::int AS gate_v,
    uniqIf(distinct_id, event = 'email_lead_submitted')::int AS lead,
    uniqIf(distinct_id, event = 'paywall_opened')::int AS pw_open,
    uniqIf(distinct_id, event = 'paywall_trial_clicked')::int AS pw_click,
    uniqIf(distinct_id, event = 'checkout_stripe_redirected')::int AS stripe,
    uniqIf(distinct_id, event = 'subscription_started')::int AS sub
  FROM events WHERE timestamp >= '${FROM}'
  GROUP BY device ORDER BY pv DESC
`, 'device');
table('5. Device split per step (distinct users, window)', device?.results,
  ['device', 'pv', 'chart', 'gate_v', 'lead', 'pw_open', 'pw_click', 'stripe', 'sub']);

// 6. Traffic sources — referring domain + utm_source (window, $pageview)
const sources = await hog(`
  SELECT coalesce(nullIf(properties.utm_source, ''), '(none)') AS utm_source,
    coalesce(nullIf(properties.$referring_domain, ''), '(direct)') AS ref,
    COUNT()::int AS pvs, uniq(distinct_id)::int AS users
  FROM events WHERE event = '$pageview' AND timestamp >= '${FROM}'
  GROUP BY utm_source, ref ORDER BY pvs DESC LIMIT 25
`, 'sources');
table('6A. Traffic sources — utm_source x referring_domain (window)', sources?.results,
  ['utm_source', 'referring_domain', 'pvs', 'users']);

const refOnly = await hog(`
  SELECT coalesce(nullIf(properties.$referring_domain, ''), '(direct)') AS ref,
    COUNT()::int AS pvs, uniq(distinct_id)::int AS users
  FROM events WHERE event = '$pageview' AND timestamp >= '${FROM}'
  GROUP BY ref ORDER BY pvs DESC LIMIT 20
`, 'ref-only');
table('6B. Referring domains (window)', refOnly?.results, ['referring_domain', 'pvs', 'users']);

// 6C. Weekly unique visitors trend (window)
const weekly = await hog(`
  SELECT toString(toStartOfWeek(timestamp)) AS week,
    uniqIf(distinct_id, event = '$pageview')::int AS pv_users,
    countIf(event = '$pageview')::int AS pvs,
    uniqIf(distinct_id, event = 'chart_calculated')::int AS chart_users,
    uniqIf(distinct_id, event = 'email_lead_submitted')::int AS leads
  FROM events WHERE timestamp >= '${FROM}'
  GROUP BY week ORDER BY week ASC
`, 'weekly');
table('6C. Weekly uniques (window)', weekly?.results, ['week', 'pv_users', 'pvs', 'chart_users', 'leads']);

// 7. Error-ish events since window start, with reasons
const errs = await hog(`
  SELECT event, coalesce(toString(properties.reason), toString(properties.error), '') AS reason,
    COUNT()::int AS n, uniq(distinct_id)::int AS users,
    toString(max(timestamp)) AS last_seen
  FROM events
  WHERE timestamp >= '${FROM}'
    AND event IN ('checkout_recovery_failed', 'checkout_error', 'checkout_ticket_timeout',
                  'avatar_generation_failed', 'checkout_auth_redirect', '$exception')
  GROUP BY event, reason ORDER BY n DESC LIMIT 25
`, 'errors');
table('7. Error-ish events (window)', errs?.results, ['event', 'reason', 'n', 'users', 'last_seen']);

// 8. Entry pages (window)
const entry = await hog(`
  SELECT properties.$pathname AS path, COUNT()::int AS pvs, uniq(distinct_id)::int AS users
  FROM events WHERE event = '$pageview' AND timestamp >= '${FROM}'
  GROUP BY path ORDER BY pvs DESC LIMIT 20
`, 'entry-pages');
table('8. Top pages (window)', entry?.results, ['path', 'pvs', 'users']);

// 9. Drip-attributed traffic (utm_source lead-nurture) in window
const drip = await hog(`
  SELECT coalesce(properties.utm_campaign, '') AS camp, coalesce(properties.utm_content, '') AS content,
    COUNT()::int AS pvs, uniq(distinct_id)::int AS users
  FROM events WHERE event = '$pageview' AND timestamp >= '${FROM}'
    AND properties.utm_source LIKE '%lead-nurture%'
  GROUP BY camp, content ORDER BY pvs DESC LIMIT 15
`, 'drip');
table('9. Drip-attributed pageviews (utm_source~lead-nurture, window)', drip?.results,
  ['utm_campaign', 'utm_content', 'pvs', 'users']);

console.log('\n-- end --');
