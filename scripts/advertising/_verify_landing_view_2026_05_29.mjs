// READ-ONLY verification probe — P1-1 landing_view undercount (2026-05-29)
// Independently re-derive: landing_view event count vs landing $pageview count (14d).
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const API_HOST = 'https://us.posthog.com';

if (!KEY || !PROJECT) { console.error('missing posthog env'); process.exit(1); }

async function hog(q, label) {
  const r = await fetch(`${API_HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const d = await r.json();
  if (!r.ok || d.error || d.detail) { console.error(`ERR ${label}: ${r.status} ${JSON.stringify(d).slice(0,300)}`); return null; }
  return d.results;
}

console.log(`Run at: ${new Date().toISOString()}  project=${PROJECT}\n`);

// 1. landing_view event count (14d) — total + by locale
const lv = await hog(`
  SELECT coalesce(properties.locale,'(unset)') AS locale, COUNT()::int AS n, uniq(distinct_id)::int AS users
  FROM events WHERE event='landing_view' AND timestamp > now() - INTERVAL 14 DAY
  GROUP BY locale ORDER BY n DESC
`, 'landing_view-14d');
console.log('1. landing_view events (14d):', JSON.stringify(lv));

// 1b. landing_view total
const lvTot = await hog(`SELECT COUNT()::int FROM events WHERE event='landing_view' AND timestamp > now() - INTERVAL 14 DAY`, 'lv-total');
console.log('1b. landing_view TOTAL (14d):', JSON.stringify(lvTot));

// 2. $pageview on marketing landing pages: / and /es exactly (14d)
const lp = await hog(`
  SELECT properties.$pathname AS path, COUNT()::int AS pvs, uniq(distinct_id)::int AS users
  FROM events WHERE event='$pageview' AND timestamp > now() - INTERVAL 14 DAY
    AND properties.$pathname IN ('/', '/es', '/es/')
  GROUP BY path ORDER BY pvs DESC
`, 'landing-pageviews');
console.log('\n2. $pageview on landing paths (/ , /es) (14d):', JSON.stringify(lp));

// 2b. total landing pageviews
const lpTot = await hog(`
  SELECT COUNT()::int FROM events WHERE event='$pageview' AND timestamp > now() - INTERVAL 14 DAY
    AND properties.$pathname IN ('/', '/es', '/es/')
`, 'lp-total');
console.log('2b. landing $pageview TOTAL (14d):', JSON.stringify(lpTot));

// 3. ALL $pageview (14d) for context
const pvAll = await hog(`SELECT COUNT()::int FROM events WHERE event='$pageview' AND timestamp > now() - INTERVAL 14 DAY`, 'pv-all');
console.log('3. ALL $pageview (14d):', JSON.stringify(pvAll));

// 4. landing_view by day (14d) — to see if it ever fires at all recently
const lvDay = await hog(`
  SELECT toString(toStartOfDay(timestamp)) AS day, COUNT()::int AS n
  FROM events WHERE event='landing_view' AND timestamp > now() - INTERVAL 14 DAY
  GROUP BY day ORDER BY day DESC
`, 'lv-by-day');
console.log('\n4. landing_view by day (14d):', JSON.stringify(lvDay));

// 5. consent events for context (does landing pageview happen but consent declined?)
const consent = await hog(`
  SELECT event, COUNT()::int AS n FROM events
  WHERE event IN ('cookie_consent_accepted','cookie_consent_declined','$opt_in')
    AND timestamp > now() - INTERVAL 14 DAY
  GROUP BY event ORDER BY n DESC
`, 'consent');
console.log('\n5. consent events (14d):', JSON.stringify(consent));

console.log('\n— end probe —');
