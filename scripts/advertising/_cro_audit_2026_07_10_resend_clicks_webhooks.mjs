// CRO audit 2026-07-10 — Resend sector part 4. READ-ONLY.
// A) Click destinations: PostHog pageviews with utm_source=lead-nurture since 05-29
//    (HogQL read query — no capture).
// B) Resend webhook registration + domain status via GET (root cause of the
//    still-broken bounce suppression?).
import { config } from 'dotenv';
config({ path: '.env' });

const PH_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PH_PROJECT = process.env.POSTHOG_PROJECT_ID;

async function hogql(query) {
  const res = await fetch(`https://us.posthog.com/api/projects/${PH_PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PH_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) {
    console.error('PostHog query failed', res.status, (await res.text()).slice(0, 300));
    return null;
  }
  return res.json();
}

// A1. Landing paths of drip clicks
const dest = await hogql(`
  SELECT properties.utm_campaign AS campaign, properties.$pathname AS path, count() AS n,
         count(DISTINCT person_id) AS people
  FROM events
  WHERE event = '$pageview'
    AND properties.utm_source = 'lead-nurture'
    AND timestamp >= toDateTime('2026-05-29 00:00:00')
  GROUP BY campaign, path ORDER BY n DESC LIMIT 40`);
console.log('=== PostHog: drip-attributed pageviews since 05-29 (campaign x path) ===');
if (dest) console.table(dest.results.map((r) => ({ campaign: r[0], path: r[1], views: r[2], people: r[3] })));

// A2. Same for full tracking window for comparison
const destFull = await hogql(`
  SELECT properties.utm_campaign AS campaign, count() AS n, count(DISTINCT person_id) AS people
  FROM events
  WHERE event = '$pageview'
    AND properties.utm_source = 'lead-nurture'
    AND timestamp >= toDateTime('2026-05-21 20:25:00')
  GROUP BY campaign ORDER BY n DESC LIMIT 20`);
console.log('\n=== PostHog: drip pageviews since 05-21 by campaign ===');
if (destFull) console.table(destFull.results.map((r) => ({ campaign: r[0], views: r[1], people: r[2] })));

// A3. utm_content presence on those pageviews
const contentCheck = await hogql(`
  SELECT properties.utm_content AS content, count() AS n
  FROM events
  WHERE event = '$pageview'
    AND properties.utm_source = 'lead-nurture'
    AND timestamp >= toDateTime('2026-05-21 20:25:00')
  GROUP BY content ORDER BY n DESC LIMIT 10`);
console.log('\n=== utm_content values on drip pageviews (expect null) ===');
if (contentCheck) console.table(contentCheck.results.map((r) => ({ utm_content: r[0] ?? '(null)', n: r[1] })));

// A4. What did drip visitors do after landing? key funnel events
const downstream = await hogql(`
  SELECT event, count() AS n, count(DISTINCT person_id) AS people
  FROM events
  WHERE timestamp >= toDateTime('2026-05-29 00:00:00')
    AND person_id IN (
      SELECT DISTINCT person_id FROM events
      WHERE event = '$pageview' AND properties.utm_source = 'lead-nurture'
        AND timestamp >= toDateTime('2026-05-29 00:00:00'))
    AND event IN ('paywall_click', 'checkout_started', 'checkout_completed', 'EMAIL_GATE_VIEWED', 'chart_calculated', 'paywall_viewed')
  GROUP BY event ORDER BY n DESC`);
console.log('\n=== Funnel events by drip-visiting persons since 05-29 ===');
if (downstream) console.table(downstream.results.map((r) => ({ event: r[0], n: r[1], people: r[2] })));

// B. Resend webhooks + domains (GET only)
const rk = process.env.RESEND_API_KEY;
for (const ep of ['webhooks', 'domains']) {
  const res = await fetch(`https://api.resend.com/${ep}`, {
    headers: { Authorization: `Bearer ${rk}` },
  });
  console.log(`\n=== GET /${ep} -> ${res.status} ===`);
  const body = await res.text();
  console.log(body.slice(0, 2000));
}

console.log('\nREAD-ONLY complete.');
