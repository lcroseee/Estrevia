// Sensitivity check: distinct_id vs person_id dedup — explains exact digits in 07/09 reports.
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const API_HOST = 'https://us.posthog.com';

async function hog(q, label) {
  const r = await fetch(`${API_HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const d = await r.json();
  if (!r.ok || d.error || d.detail) { console.error(`ERR ${label}: ${JSON.stringify(d).slice(0, 400)}`); return null; }
  return d.results;
}
function table(label, rows, cols) {
  console.log(`\n═══ ${label} ═══`);
  if (!rows?.length) { console.log('  (no data)'); return; }
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i] ?? '').length)));
  console.log('  ' + cols.map((c, i) => c.padEnd(w[i])).join(' │ '));
  for (const r of rows) console.log('  ' + r.map((v, i) => String(v ?? '').padEnd(w[i])).join(' │ '));
}

const WIN = `timestamp >= toDateTime('2026-05-13 00:00:00') AND timestamp < toDateTime('2026-07-11 00:00:00')`;
const LOC = `multiIf(startsWith(toString(properties.$pathname), '/es/') OR toString(properties.$pathname) = '/es', 'es', 'en')`;

// A: 07 replication with distinct_id, natal-chart, pathname locale, window
const a = await hog(`
  SELECT ${LOC} AS loc,
    count(DISTINCT if(event='paywall_cta_viewed' AND toString(properties.trigger)='natal-chart', distinct_id, NULL)) AS cta,
    count(DISTINCT if(event='paywall_opened' AND toString(properties.trigger)='natal-chart', distinct_id, NULL)) AS opened,
    count(DISTINCT if(event='paywall_trial_clicked' AND toString(properties.trigger)='natal-chart', distinct_id, NULL)) AS clicked,
    count(DISTINCT if(event='checkout_stripe_redirected' AND toString(properties.trigger)='natal-chart', distinct_id, NULL)) AS redir
  FROM events
  WHERE event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected') AND ${WIN}
  GROUP BY loc ORDER BY loc
`, 'A');
table('A: 07-method, DISTINCT_ID, natal-chart only (07 said en 75/22/17/15, es 68/25/15/13)', a,
  ['loc', 'cta', 'opened', 'clicked', 'redir']);

// B: 09 replication with distinct_id, all-time, locale-prop buckets
const b = await hog(`
  SELECT
    multiIf(toString(properties.locale)='en','en (prop)', toString(properties.locale)='es','es (prop)',
      (toString(properties.locale) IS NULL OR toString(properties.locale)='')
        AND (startsWith(toString(properties.$pathname),'/es/') OR toString(properties.$pathname)='/es'),'es-path','en-path') AS bucket,
    count(DISTINCT if(event='paywall_cta_viewed', distinct_id, NULL)) AS cta,
    count(DISTINCT if(event='paywall_opened', distinct_id, NULL)) AS opened,
    count(DISTINCT if(event='paywall_trial_clicked', distinct_id, NULL)) AS clicked,
    count(DISTINCT if(event='checkout_stripe_redirected', distinct_id, NULL)) AS redir
  FROM events
  WHERE event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected')
  GROUP BY bucket ORDER BY bucket
`, 'B');
table('B: 09-method, DISTINCT_ID, all-time, locale-prop (09 said en 49/18/18/16; es 22/17/10/9; es-path 50/18/7/6)', b,
  ['bucket', 'cta', 'opened', 'clicked', 'redir']);

// C: canonical Q1 with distinct_id (sensitivity of my own canonical numbers)
const c = await hog(`
  SELECT ${LOC} AS loc,
    count(DISTINCT if(event='paywall_cta_viewed', distinct_id, NULL)) AS cta,
    count(DISTINCT if(event='paywall_opened', distinct_id, NULL)) AS opened,
    count(DISTINCT if(event='paywall_trial_clicked'
      AND (toString(properties.source) IS NULL OR toString(properties.source)!='pricing'), distinct_id, NULL)) AS clicked_modal,
    count(DISTINCT if(event='checkout_stripe_redirected'
      AND toString(properties.trigger) IS NOT NULL, distinct_id, NULL)) AS redir_modal
  FROM events
  WHERE event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected') AND ${WIN}
  GROUP BY loc ORDER BY loc
`, 'C');
table('C: canonical (pathname loc, modal-origin, window) with DISTINCT_ID', c,
  ['loc', 'cta', 'opened', 'clicked_modal', 'redir_modal']);
console.log('\ndone');
