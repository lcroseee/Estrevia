// CRO audit 2026-07-10 — PAYWALL sector: per-trigger paywall funnel.
// Windows: A) 2026-05-29 → now (~6wk, post last audit)  B) all-time since 2026-05-13 (paywall CRO ship).
// STRICTLY READ-ONLY: HogQL Query API only. No capture.
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
if (!KEY || !PROJECT) { console.error('missing PostHog env'); process.exit(1); }
const API = 'https://us.posthog.com';
const FROM_WIN = '2026-05-29T00:00:00';
const FROM_ALL = '2026-05-13T00:00:00';

async function hog(q, label) {
  const r = await fetch(`${API}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error || d.detail) { console.error(`ERR ${label}: ${r.status} ${JSON.stringify(d).slice(0,300)}`); return null; }
  return d;
}
function table(label, results, columns) {
  console.log(`\n=== ${label} ===`);
  if (!results?.length) { console.log('  (no data)'); return; }
  const w = columns.map((c,i)=>Math.max(c.length, ...results.map(r=>String(r[i]??'').length)));
  console.log('  ' + columns.map((c,i)=>c.padEnd(w[i])).join(' | '));
  for (const row of results) console.log('  ' + row.map((v,i)=>String(v??'').padEnd(w[i])).join(' | '));
}

console.log(`Paywall funnel probe · run=${new Date().toISOString()}`);

for (const [name, FROM] of [['WINDOW 05-29→now', FROM_WIN], ['ALL since 05-13 (paywall ship)', FROM_ALL]]) {
  // Per-trigger paywall funnel: cta_viewed → opened → trial_clicked → stripe_redirected
  const t = await hog(`
    SELECT coalesce(toString(properties.trigger), '(none)') AS trg,
      countIf(event='paywall_cta_viewed')::int AS cta_viewed,
      uniqIf(distinct_id, event='paywall_cta_viewed')::int AS cta_viewed_u,
      countIf(event='paywall_opened')::int AS opened,
      uniqIf(distinct_id, event='paywall_opened')::int AS opened_u,
      countIf(event='paywall_trial_clicked')::int AS trial_clicked,
      uniqIf(distinct_id, event='paywall_trial_clicked')::int AS trial_clicked_u,
      countIf(event='checkout_stripe_redirected')::int AS stripe_redir,
      uniqIf(distinct_id, event='checkout_stripe_redirected')::int AS stripe_redir_u
    FROM events
    WHERE timestamp >= '${FROM}'
      AND event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected')
    GROUP BY trg ORDER BY cta_viewed DESC
  `, `trigger-funnel ${name}`);
  table(`Per-trigger paywall funnel — ${name}`, t?.results,
    ['trigger','cta_v','cta_v_u','opened','opened_u','clicked','clicked_u','stripe','stripe_u']);

  // Same by locale (pathname-derived, since locale super-prop had a race)
  const l = await hog(`
    SELECT
      multiIf(toString(properties.$pathname) LIKE '/es%', 'es',
              toString(properties.locale) = 'es', 'es', 'en') AS loc,
      coalesce(toString(properties.trigger), '(none)') AS trg,
      countIf(event='paywall_cta_viewed')::int AS cta_viewed,
      countIf(event='paywall_opened')::int AS opened,
      countIf(event='paywall_trial_clicked')::int AS trial_clicked,
      countIf(event='checkout_stripe_redirected')::int AS stripe_redir
    FROM events
    WHERE timestamp >= '${FROM}'
      AND event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected')
    GROUP BY loc, trg ORDER BY loc, cta_viewed DESC
  `, `locale-trigger ${name}`);
  table(`Locale × trigger — ${name}`, l?.results, ['loc','trigger','cta_v','opened','clicked','stripe']);

  // Plan chosen at trial click
  const p = await hog(`
    SELECT coalesce(toString(properties.plan),'(none)') AS plan,
      coalesce(toString(properties.trigger),'(none)') AS trg, COUNT()::int AS n
    FROM events WHERE timestamp >= '${FROM}' AND event='paywall_trial_clicked'
    GROUP BY plan, trg ORDER BY n DESC
  `, `plan ${name}`);
  table(`Plan at paywall_trial_clicked — ${name}`, p?.results, ['plan','trigger','n']);
}

// Modal abandonment: users who opened paywall but never clicked trial (window)
const ab = await hog(`
  SELECT
    uniqIf(distinct_id, event='paywall_opened')::int AS opened_u,
    uniqIf(distinct_id, event='paywall_trial_clicked')::int AS clicked_u,
    uniqIf(distinct_id, event='checkout_stripe_redirected')::int AS stripe_u
  FROM events WHERE timestamp >= '${FROM_WIN}'
`, 'abandon');
table('Modal abandonment (uniques, window 05-29→now)', ab?.results, ['opened_u','clicked_u','stripe_u']);

// Where do paywall_opened events happen (pathname)
const paths = await hog(`
  SELECT coalesce(toString(properties.$pathname),'(none)') AS path,
    coalesce(toString(properties.trigger),'(none)') AS trg, COUNT()::int AS n
  FROM events WHERE timestamp >= '${FROM_ALL}' AND event='paywall_opened'
  GROUP BY path, trg ORDER BY n DESC LIMIT 25
`, 'paths');
table('paywall_opened by pathname (since 05-13)', paths?.results, ['pathname','trigger','n']);

// Device split for paywall steps (mobile CTA-below-fold hypothesis)
const dev = await hog(`
  SELECT coalesce(toString(properties.$device_type),'(unset)') AS device,
    countIf(event='paywall_opened')::int AS opened,
    countIf(event='paywall_trial_clicked')::int AS clicked,
    countIf(event='checkout_stripe_redirected')::int AS stripe
  FROM events WHERE timestamp >= '${FROM_ALL}'
    AND event IN ('paywall_opened','paywall_trial_clicked','checkout_stripe_redirected')
  GROUP BY device ORDER BY opened DESC
`, 'device');
table('Device split (since 05-13)', dev?.results, ['device','opened','clicked','stripe']);

// pricing-page CTA path vs paywall path into checkout: checkout_auto_started + anonymous_checkout_started
const src = await hog(`
  SELECT event, coalesce(toString(properties.trigger),'(none)') AS trg, COUNT()::int AS n,
    toString(max(timestamp)) AS last_seen
  FROM events WHERE timestamp >= '${FROM_ALL}'
    AND event IN ('anonymous_checkout_started','checkout_auto_started','checkout_auth_redirect',
                  'subscription_started','checkout_ticket_ready','checkout_ticket_timeout')
  GROUP BY event, trg ORDER BY n DESC
`, 'checkout-src');
table('Checkout-adjacent events (since 05-13)', src?.results, ['event','trigger','n','last_seen']);

console.log('\n-- end --');
