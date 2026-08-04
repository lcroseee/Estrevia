// CRO audit 2026-07-10 — landing/gate sector probe (STRICTLY READ-ONLY)
// PostHog HogQL reads + Neon SELECTs. No writes, no captures, no sends.
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');
const sql = neon(process.env.DATABASE_URL);

const WINDOW_START = '2026-05-29';
const WINDOW_END = '2026-07-11'; // exclusive

async function hog(query) {
  const r = await fetch(`${HOST}/api/projects/${PROJECT_ID}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const j = await r.json();
  if (j.error || j.detail) {
    console.log(`  PostHog error: ${j.error?.message || j.detail}`);
    return null;
  }
  return j;
}

const W = `timestamp >= toDateTime('${WINDOW_START} 00:00:00') AND timestamp < toDateTime('${WINDOW_END} 00:00:00')`;

console.log(`=== WINDOW: ${WINDOW_START} .. ${WINDOW_END} (exclusive) ===`);

console.log('\n--- A. Top-of-funnel event volumes (window) ---');
const ev = await hog(`
  SELECT event, COUNT(*)::int AS n, COUNT(DISTINCT person_id)::int AS uniq
  FROM events
  WHERE ${W}
    AND event IN ('landing_view','chart_calculated','email_gate_viewed','email_gate_dismissed','email_lead_submitted','email_lead_resubmitted','paywall_viewed')
  GROUP BY event ORDER BY n DESC
`);
for (const r of ev?.results ?? []) console.log(`  ${String(r[0]).padEnd(28)} n=${String(r[1]).padStart(5)} uniq=${r[2]}`);

console.log('\n--- A2. Same, 30d trailing ---');
const ev30 = await hog(`
  SELECT event, COUNT(*)::int AS n, COUNT(DISTINCT person_id)::int AS uniq
  FROM events
  WHERE timestamp > now() - INTERVAL 30 DAY
    AND event IN ('landing_view','chart_calculated','email_gate_viewed','email_gate_dismissed','email_lead_submitted','email_lead_resubmitted')
  GROUP BY event ORDER BY n DESC
`);
for (const r of ev30?.results ?? []) console.log(`  ${String(r[0]).padEnd(28)} n=${String(r[1]).padStart(5)} uniq=${r[2]}`);

console.log('\n--- B. chart_calculated by source (window) ---');
const src = await hog(`
  SELECT properties.source AS src, COUNT(*)::int AS n, COUNT(DISTINCT person_id)::int AS uniq
  FROM events WHERE ${W} AND event='chart_calculated'
  GROUP BY src ORDER BY n DESC
`);
for (const r of src?.results ?? []) console.log(`  source=${String(r[0]).padEnd(12)} n=${String(r[1]).padStart(5)} uniq=${r[2]}`);

console.log('\n--- C. /chart pageviews carrying dead chartId param (window) ---');
const dead = await hog(`
  SELECT COUNT(*)::int AS pvs, COUNT(DISTINCT person_id)::int AS uniq
  FROM events
  WHERE ${W} AND event='$pageview'
    AND properties.$current_url LIKE '%/chart?chartId=%'
`);
for (const r of dead?.results ?? []) console.log(`  pageviews=${r[0]} uniques=${r[1]}`);

console.log('\n--- C2. of those, how many came from lead-nurture (drip) links ---');
const deadDrip = await hog(`
  SELECT COUNT(*)::int AS pvs, COUNT(DISTINCT person_id)::int AS uniq
  FROM events
  WHERE ${W} AND event='$pageview'
    AND properties.$current_url LIKE '%/chart?chartId=%'
    AND properties.$current_url LIKE '%utm_source=lead-nurture%'
`);
for (const r of deadDrip?.results ?? []) console.log(`  pageviews=${r[0]} uniques=${r[1]}`);

console.log('\n--- D. Hero calculators who had to RE-ENTER on /chart (window) ---');
// persons with chart_calculated source='hero' who later fired chart_calculated with another source
const reentry = await hog(`
  WITH hero AS (
    SELECT person_id, min(timestamp) AS t0 FROM events
    WHERE ${W} AND event='chart_calculated' AND properties.source='hero'
    GROUP BY person_id
  ),
  later AS (
    SELECT DISTINCT e.person_id FROM events e
    INNER JOIN hero h ON e.person_id = h.person_id
    WHERE ${W} AND e.event='chart_calculated'
      AND (properties.source IS NULL OR properties.source != 'hero')
      AND e.timestamp > h.t0
  )
  SELECT (SELECT COUNT(*) FROM hero)::int AS hero_uniq, (SELECT COUNT(*) FROM later)::int AS reentered
`);
for (const r of reentry?.results ?? []) console.log(`  hero_calc_uniques=${r[0]}  re-entered_on_chart_page=${r[1]}`);

console.log('\n--- E. locale super-prop null rate on landing_view (window) ---');
const locNull = await hog(`
  SELECT properties.locale AS loc, COUNT(*)::int AS n FROM events
  WHERE ${W} AND event='landing_view' GROUP BY loc ORDER BY n DESC
`);
for (const r of locNull?.results ?? []) console.log(`  locale=${String(r[0]).padEnd(8)} n=${r[1]}`);

console.log('\n--- F. Gate funnel daily sanity: viewed vs dismissed vs submitted (window) ---');
const daily = await hog(`
  SELECT toDate(timestamp) AS d,
    countIf(event='email_gate_viewed')::int AS viewed,
    countIf(event='email_gate_dismissed')::int AS dismissed,
    countIf(event='email_lead_resubmitted')::int AS resubmitted
  FROM events WHERE ${W} AND event IN ('email_gate_viewed','email_gate_dismissed','email_lead_resubmitted')
  GROUP BY d ORDER BY d
`);
for (const r of daily?.results ?? []) console.log(`  ${r[0]}  viewed=${String(r[1]).padStart(3)} dismissed=${String(r[2]).padStart(3)} resub=${r[3]}`);

console.log('\n--- G. DB: email_leads created in window, by locale ---');
const leads = await sql`
  SELECT locale, COUNT(*)::int AS n
  FROM email_leads
  WHERE created_at >= ${WINDOW_START} AND created_at < ${WINDOW_END}
  GROUP BY locale ORDER BY n DESC`;
console.log(leads);

console.log('\n--- G2. DB: email_leads all-time + last 30d ---');
const leadsTot = await sql`
  SELECT COUNT(*)::int AS all_time,
         COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last_30d
  FROM email_leads`;
console.log(leadsTot);

console.log('\n--- H. landing_view by locale x day (window, first/last 5 days) ---');
const lvDaily = await hog(`
  SELECT toDate(timestamp) AS d, COUNT(*)::int AS n
  FROM events WHERE ${W} AND event='landing_view' GROUP BY d ORDER BY d
`);
for (const r of lvDaily?.results ?? []) console.log(`  ${r[0]}  landing_view=${r[1]}`);
