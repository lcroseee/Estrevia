// CRO audit 2026-07-10 — PAYWALL sector, corrected locale split (pathname '/es/%' not '/es%')
// READ-ONLY HogQL.
import { config } from 'dotenv';
config({ path: '.env' });
const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const API = 'https://us.posthog.com';

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

const LOC = `multiIf(startsWith(toString(properties.$pathname), '/es/') OR toString(properties.$pathname) = '/es', 'es', toString(properties.locale) = 'es', 'es', 'en')`;

for (const [name, FROM] of [['since 05-13 (paywall ship)', '2026-05-13T00:00:00'], ['window 05-29→now', '2026-05-29T00:00:00']]) {
  const l = await hog(`
    SELECT ${LOC} AS loc,
      coalesce(toString(properties.trigger), '(none)') AS trg,
      uniqIf(distinct_id, event='paywall_cta_viewed')::int AS cta_u,
      uniqIf(distinct_id, event='paywall_opened')::int AS opened_u,
      uniqIf(distinct_id, event='paywall_trial_clicked')::int AS clicked_u,
      uniqIf(distinct_id, event='checkout_stripe_redirected')::int AS stripe_u,
      countIf(event='paywall_opened')::int AS opened_n,
      countIf(event='paywall_trial_clicked')::int AS clicked_n
    FROM events
    WHERE timestamp >= '${FROM}'
      AND event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected')
    GROUP BY loc, trg ORDER BY loc, cta_u DESC
  `, `locale-fix ${name}`);
  table(`Corrected locale × trigger (uniques) — ${name}`, l?.results,
    ['loc','trigger','cta_u','opened_u','clicked_u','stripe_u','opened_n','clicked_n']);
}

// Essay-modal deep dive: per-user opens then click?
const essay = await hog(`
  SELECT ${LOC} AS loc,
    uniqIf(distinct_id, event='paywall_opened' AND toString(properties.trigger)='essay')::int AS essay_open_u,
    countIf(event='paywall_opened' AND toString(properties.trigger)='essay')::int AS essay_open_n,
    uniqIf(distinct_id, event='paywall_trial_clicked' AND toString(properties.trigger)='essay')::int AS essay_click_u
  FROM events WHERE timestamp >= '2026-05-13T00:00:00'
  GROUP BY loc
`, 'essay');
table('Essay modal, corrected locale (since 05-13)', essay?.results, ['loc','open_u','open_n','click_u']);

// paywall_opened→trial_clicked same-session gap distribution (how fast do people click or bail)
const gap = await hog(`
  SELECT coalesce(toString(properties.trigger),'(none)') AS trg,
    COUNT()::int AS opens_with_no_click_same_user_24h
  FROM events e
  WHERE e.event='paywall_opened' AND e.timestamp >= '2026-05-13T00:00:00'
    AND NOT EXISTS (
      SELECT 1 FROM events c
      WHERE c.event='paywall_trial_clicked' AND c.distinct_id = e.distinct_id
        AND c.timestamp BETWEEN e.timestamp AND e.timestamp + INTERVAL 24 HOUR
    )
  GROUP BY trg ORDER BY opens_with_no_click_same_user_24h DESC
`, 'gap');
table('Opens with NO trial click within 24h by same user (since 05-13)', gap?.results, ['trigger','opens_no_click']);
console.log('\n-- end --');
