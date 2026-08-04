import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const PH_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = '407908';

async function hogql(q) {
  const r = await fetch(`https://us.posthog.com/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PH_KEY}` },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const j = await r.json();
  if (!r.ok) { console.error('HogQL error:', JSON.stringify(j)); throw new Error('HogQL failed'); }
  return j;
}

// ─── 1. PostHog ES funnel — combine locale=es AND path-contains /es/ for max coverage
console.log('=== POSTHOG: ES funnel last 14d (locale=es OR url contains /es/) ===\n');

const events = ['$pageview','chart_calculated','email_gate_viewed','paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected','user_registered','subscription_started'];

const q = `
SELECT
  event,
  count() AS event_count,
  count(DISTINCT distinct_id) AS unique_users
FROM events
WHERE timestamp > now() - INTERVAL 14 DAY
  AND event IN (${events.map(e => `'${e}'`).join(',')})
  AND (
    properties.locale = 'es'
    OR (properties.$pathname IS NOT NULL AND positionUTF8(properties.$pathname, '/es') > 0)
    OR (properties.$current_url IS NOT NULL AND positionUTF8(properties.$current_url, '/es/') > 0)
  )
GROUP BY event
ORDER BY event_count DESC
`;

const r = await hogql(q);
console.table(r.results.map(row => ({ event: row[0], events: row[1], distinct_users: row[2] })));

// ─── 2. The same for post-fix only (locale tagging reliable) — 48h
console.log('\n=== POSTHOG: ES funnel POST-FIX 48h (locale=es trusted) ===\n');
const q2 = `
SELECT
  event,
  count() AS event_count,
  count(DISTINCT distinct_id) AS unique_users
FROM events
WHERE timestamp > now() - INTERVAL 48 HOUR
  AND event IN (${events.map(e => `'${e}'`).join(',')})
  AND properties.locale = 'es'
GROUP BY event
ORDER BY event_count DESC
`;
const r2 = await hogql(q2);
console.table(r2.results.map(row => ({ event: row[0], events: row[1], distinct_users: row[2] })));

// ─── 3. ES users who hit paywall but NOT stripe (per-user)
console.log('\n=== POSTHOG: ES users who reached paywall but did NOT redirect to Stripe (14d) ===\n');
const q3 = `
SELECT
  distinct_id,
  countIf(event='paywall_cta_viewed') AS paywall_viewed,
  countIf(event='paywall_opened') AS paywall_opened,
  countIf(event='paywall_trial_clicked') AS paywall_clicked,
  countIf(event='checkout_stripe_redirected') AS stripe_redirected,
  countIf(event='subscription_started') AS subscribed,
  min(properties.$current_url) AS first_url
FROM events
WHERE timestamp > now() - INTERVAL 14 DAY
  AND event IN ('paywall_cta_viewed','paywall_opened','paywall_trial_clicked','checkout_stripe_redirected','subscription_started')
  AND (
    properties.locale = 'es'
    OR (properties.$current_url IS NOT NULL AND positionUTF8(properties.$current_url, '/es/') > 0)
    OR (properties.$pathname IS NOT NULL AND positionUTF8(properties.$pathname, '/es') > 0)
  )
GROUP BY distinct_id
HAVING (paywall_viewed > 0 OR paywall_opened > 0 OR paywall_clicked > 0)
ORDER BY paywall_viewed DESC
`;
const r3 = await hogql(q3);
console.log(`Found ${r3.results.length} ES distinct_ids who interacted with paywall in 14d:\n`);
let viewed_no_click = 0, clicked_no_stripe = 0, fully_through = 0;
for (const row of r3.results) {
  const [did, pv, po, pc, sr, sub, url] = row;
  console.log(`  ${did.slice(0,12)} | viewed=${pv} opened=${po} clicked=${pc} → stripe=${sr} sub=${sub}  ${(url||'').slice(0,60)}`);
  if (pc === 0 && pv > 0) viewed_no_click++;
  else if (pc > 0 && sr === 0) clicked_no_stripe++;
  else if (pc > 0 && sr > 0) fully_through++;
}
console.log(`\n  → viewed paywall but never clicked: ${viewed_no_click}`);
console.log(`  → clicked paywall but never reached Stripe: ${clicked_no_stripe}`);
console.log(`  → clicked AND reached Stripe: ${fully_through}`);

// ─── 4. DB: ES leads cohort (14d) — total leads + how many became users + paid
console.log('\n=== DB: ES leads cohort (last 14d) ===\n');
const cohort = await sql`
  SELECT
    COUNT(*) AS total_es_leads,
    COUNT(*) FILTER (WHERE converted_to_user_id IS NOT NULL) AS became_users,
    COUNT(*) FILTER (WHERE email_undeliverable = true) AS undeliverable
  FROM email_leads
  WHERE locale = 'es'
    AND created_at > NOW() - INTERVAL '14 days'
`;
console.table(cohort);

const paid = await sql`
  SELECT
    COUNT(DISTINCT u.id) AS es_users_with_stripe_id,
    COUNT(DISTINCT u.id) FILTER (WHERE u.stripe_customer_id IS NOT NULL) AS es_with_customer
  FROM users u
  WHERE u.id IN (SELECT converted_to_user_id FROM email_leads WHERE locale='es' AND created_at > NOW() - INTERVAL '14 days' AND converted_to_user_id IS NOT NULL)
`;
console.table(paid);

// ─── 5. Stripe: ES-locale sessions complete-vs-expired
console.log('\n=== Stripe-side cross-check (handled in 04-stripe.md earlier): 9 ES sessions in 30d, 0 complete ===');
