import { config } from 'dotenv';
config({ path: '.env' });
const KEY = process.env.POSTHOG_PERSONAL_API_KEY, PROJECT = process.env.POSTHOG_PROJECT_ID, API='https://us.posthog.com';
async function hog(q,l){const r=await fetch(`${API}/api/projects/${PROJECT}/query/`,{method:'POST',headers:{Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({query:{kind:'HogQLQuery',query:q}})});const d=await r.json();if(!r.ok||d.error){console.error(`ERR ${l}`,r.status,JSON.stringify(d).slice(0,200));return null;}return d.results;}

// Does landing_view appear on OTHER pathnames? (maybe marketing landing renders elsewhere)
const byPath = await hog(`SELECT properties.$pathname AS p, COUNT()::int n FROM events WHERE event='landing_view' AND timestamp>now()-INTERVAL 14 DAY GROUP BY p ORDER BY n DESC`,'lv-by-path');
console.log('landing_view by pathname:', JSON.stringify(byPath));

// pageviews on / and /es by day to compare scale to landing_view by day
const pvDay = await hog(`SELECT toString(toStartOfDay(timestamp)) d, COUNT()::int n FROM events WHERE event='$pageview' AND properties.$pathname IN ('/','/es','/es/') AND timestamp>now()-INTERVAL 14 DAY GROUP BY d ORDER BY d DESC`,'pv-day');
console.log('\nlanding $pageview by day:', JSON.stringify(pvDay));

// Among distinct_ids that fired landing $pageview, how many also fired cookie_consent_accepted, and landing_view?
const cohort = await hog(`
  SELECT
    countDistinctIf(distinct_id, event='$pageview' AND properties.$pathname IN ('/','/es','/es/')) AS landed,
    countDistinctIf(distinct_id, event='cookie_consent_accepted') AS consented,
    countDistinctIf(distinct_id, event='landing_view') AS lv
  FROM events WHERE timestamp>now()-INTERVAL 14 DAY
`,'cohort');
console.log('\ndistinct users 14d — landed / consented / landing_view:', JSON.stringify(cohort));
