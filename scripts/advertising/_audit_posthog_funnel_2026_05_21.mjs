// PostHog funnel breakdown by locale + event diagnostics (last 14d)
import { config } from 'dotenv';
config({ path: '.env' });

const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');

if (!API_KEY || !PROJECT_ID) {
  console.log('❌ POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID missing');
  process.exit(0);
}

async function hog(query) {
  const r = await fetch(`${HOST}/api/projects/${PROJECT_ID}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const j = await r.json();
  if (j.error || j.detail) {
    console.log(`  ⚠️  PostHog error: ${j.error?.message || j.detail}`);
    return null;
  }
  return j;
}

console.log('═══ A. EVENT VOLUMES — last 14d ═══');
const events = await hog(`
  SELECT event, COUNT(*)::int AS n, COUNT(DISTINCT person_id)::int AS unique_users
  FROM events
  WHERE timestamp > now() - INTERVAL 14 DAY
    AND event IN (
      '$pageview',
      'chart_calculated',
      'email_gate_viewed',
      'email_gate_submitted',
      'lead_captured',
      'paywall_viewed',
      'paywall_trial_clicked',
      'checkout_stripe_redirected',
      'checkout_auth_redirect',
      'user_registered',
      'subscription_started'
    )
  GROUP BY event
  ORDER BY n DESC
`);
if (events?.results) {
  for (const r of events.results) {
    console.log(`  ${r[0].padEnd(32)} n=${String(r[1]).padStart(6)}  uniques=${r[2]}`);
  }
}

console.log('\n═══ B. PAGEVIEW BY LOCALE (super-prop) — last 14d ═══');
const pvLoc = await hog(`
  SELECT properties.locale AS locale, COUNT(*)::int AS pvs, COUNT(DISTINCT person_id)::int AS uniques
  FROM events
  WHERE event = '$pageview' AND timestamp > now() - INTERVAL 14 DAY
  GROUP BY locale
  ORDER BY pvs DESC
  LIMIT 10
`);
if (pvLoc?.results) {
  for (const r of pvLoc.results) {
    console.log(`  locale=${String(r[0]).padEnd(10)}  pvs=${String(r[1]).padStart(6)}  uniques=${r[2]}`);
  }
}

console.log('\n═══ C. CHART → EMAIL → PAYWALL → STRIPE BY LOCALE — last 14d ═══');
const funnel = await hog(`
  SELECT
    coalesce(properties.locale, 'unknown') AS locale,
    countDistinctIf(person_id, event = 'chart_calculated') AS chart,
    countDistinctIf(person_id, event = 'email_gate_submitted') AS email,
    countDistinctIf(person_id, event = 'paywall_viewed') AS paywall,
    countDistinctIf(person_id, event = 'paywall_trial_clicked') AS trial_click,
    countDistinctIf(person_id, event = 'checkout_stripe_redirected') AS stripe_redir,
    countDistinctIf(person_id, event = 'checkout_auth_redirect') AS auth_redir
  FROM events
  WHERE timestamp > now() - INTERVAL 14 DAY
  GROUP BY locale
  ORDER BY chart DESC
`);
if (funnel?.results) {
  console.log('  locale     chart  email  paywall  trial  stripe  auth_redir');
  for (const r of funnel.results) {
    console.log(`  ${String(r[0]).padEnd(10)} ${String(r[1]).padStart(5)}  ${String(r[2]).padStart(5)}  ${String(r[3]).padStart(7)}  ${String(r[4]).padStart(5)}  ${String(r[5]).padStart(6)}  ${String(r[6]).padStart(10)}`);
  }
}

console.log('\n═══ D. TOP UTM_SOURCE BY $PAGEVIEW — last 14d ═══');
const utm = await hog(`
  SELECT properties.utm_source AS src, properties.utm_campaign AS camp,
         COUNT(*)::int AS pvs, COUNT(DISTINCT person_id)::int AS users
  FROM events
  WHERE event = '$pageview' AND timestamp > now() - INTERVAL 14 DAY
    AND properties.utm_source IS NOT NULL
  GROUP BY src, camp
  ORDER BY pvs DESC
  LIMIT 12
`);
if (utm?.results) {
  for (const r of utm.results) {
    console.log(`  ${String(r[0]).padEnd(20)} ${String(r[1] || '(none)').padEnd(30)} pvs=${String(r[2]).padStart(5)} users=${r[3]}`);
  }
}

console.log('\n═══ E. PAYWALL VIEW → TRIAL CLICK → STRIPE — last 14d ═══');
const paywallFunnel = await hog(`
  SELECT
    coalesce(properties.source, 'unknown') AS surface,
    countDistinctIf(person_id, event = 'paywall_viewed') AS pv,
    countDistinctIf(person_id, event = 'paywall_trial_clicked') AS click,
    countDistinctIf(person_id, event = 'checkout_stripe_redirected') AS stripe,
    countDistinctIf(person_id, event = 'checkout_auth_redirect') AS auth
  FROM events
  WHERE event IN ('paywall_viewed', 'paywall_trial_clicked', 'checkout_stripe_redirected', 'checkout_auth_redirect')
    AND timestamp > now() - INTERVAL 14 DAY
  GROUP BY surface
  ORDER BY pv DESC
`);
if (paywallFunnel?.results) {
  for (const r of paywallFunnel.results) {
    console.log(`  source=${String(r[0]).padEnd(20)} view=${r[1]} click=${r[2]} stripe=${r[3]} auth_redir=${r[4]}`);
  }
}

console.log('\n═══ F. ENTRY PAGES — top URLs first-touched — last 14d ═══');
const entries = await hog(`
  SELECT properties.$pathname AS path, COUNT(*)::int AS n
  FROM events
  WHERE event = '$pageview' AND timestamp > now() - INTERVAL 14 DAY
  GROUP BY path
  ORDER BY n DESC
  LIMIT 15
`);
if (entries?.results) {
  for (const r of entries.results) {
    console.log(`  ${String(r[0]).padEnd(45)} n=${r[1]}`);
  }
}

console.log('\n— End PostHog funnel audit —');
