// CRO audit 2026-07-10 — PostHog sector final verification probes. Read-only HogQL.
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
  if (!r.ok || d.error || d.detail) { console.error(`ERR ${label}: ${r.status} ${JSON.stringify(d).slice(0, 250)}`); return null; }
  return d;
}
function table(label, results, columns) {
  console.log(`\n=== ${label} ===`);
  if (!results?.length) { console.log('  (no data)'); return; }
  const widths = columns.map((c, i) => Math.max(c.length, ...results.map((r) => String(r[i] ?? '').length)));
  console.log('  ' + columns.map((c, i) => c.padEnd(widths[i])).join(' | '));
  for (const row of results) console.log('  ' + row.map((v, i) => String(v ?? '').padEnd(widths[i])).join(' | '));
}

// A. Data freshness — events per day last 7d (ALL events, incl. server-side)
const fresh = await hog(`
  SELECT toString(toStartOfDay(timestamp)) AS day, COUNT()::int AS all_events,
    countIf(properties.$lib = 'web')::int AS browser_events,
    countIf(properties.$lib = 'posthog-node')::int AS server_events,
    uniq(distinct_id)::int AS users
  FROM events WHERE timestamp > now() - INTERVAL 7 DAY
  GROUP BY day ORDER BY day ASC
`, 'freshness');
table('A. All events per day, last 7d (browser vs server)', fresh?.results,
  ['day', 'all_events', 'browser', 'server', 'users']);

// B. natal-chart paywall CTA -> open by device (users)
const pwDev = await hog(`
  SELECT coalesce(properties.$device_type, '(unset)') AS device,
    uniqIf(distinct_id, event = 'paywall_cta_viewed' AND properties.trigger = 'natal-chart')::int AS cta_users,
    uniqIf(distinct_id, event = 'paywall_opened')::int AS open_users,
    uniqIf(distinct_id, event = 'paywall_trial_clicked')::int AS click_users
  FROM events WHERE timestamp >= '${FROM}'
  GROUP BY device ORDER BY cta_users DESC
`, 'pw-device');
table('B. Paywall: natal-chart CTA viewers vs openers by device (users, window)', pwDev?.results,
  ['device', 'natal_cta_users', 'pw_open_users', 'trial_click_users']);

// C. Any discount/HALF50 utm traffic? (should be zero — blast never sent)
const disc = await hog(`
  SELECT coalesce(properties.utm_source, '(none)') AS src, coalesce(properties.utm_campaign, '') AS camp,
    COUNT()::int AS n
  FROM events WHERE timestamp >= '${FROM}'
    AND (properties.utm_campaign LIKE '%discount%' OR properties.utm_campaign LIKE '%half%'
         OR properties.utm_source LIKE '%discount%' OR properties.utm_source LIKE '%blast%')
  GROUP BY src, camp
`, 'discount');
table('C. Discount/HALF50-attributed events (window) — expect none', disc?.results, ['utm_source', 'utm_campaign', 'n']);

// D. user_3ECza74 (trial_ended clicker) full event trail
const trail = await hog(`
  SELECT toString(timestamp) AS ts, event, coalesce(toString(properties.$pathname), '') AS path
  FROM events WHERE timestamp >= '2026-05-28T00:00:00'
    AND distinct_id = (
      SELECT distinct_id FROM events
      WHERE event = '$pageview' AND properties.utm_source = 'trial-expiration' AND timestamp >= '${FROM}'
      LIMIT 1
    )
  ORDER BY timestamp ASC LIMIT 40
`, 'trail');
table('D. Trial-ended email clicker — event trail since 05-28', trail?.results, ['ts', 'event', 'path']);

console.log('\n-- end --');
