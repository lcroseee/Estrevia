// Final piece: join user_registered events (no locale) to pre-signup session
// events via person_id. This tells us which locale each signed-up user
// actually came from.
import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const HOST = 'https://us.posthog.com';

async function hogql(q, label) {
  const r = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const d = await r.json();
  if (!r.ok) { console.log(`ERR ${label}:`, JSON.stringify(d).slice(0, 500)); return null; }
  return d;
}

// Approach: for each user_registered event, get its person_id, then look at
// ALL events for that person_id BEFORE the registration to derive locale.
const joined = await hogql(`
  WITH regs AS (
    SELECT
      person_id,
      distinct_id AS reg_did,
      MIN(timestamp) AS reg_t,
      argMin(properties.utm_source, timestamp) AS utm_src,
      argMin(properties.utm_campaign, timestamp) AS utm_camp
    FROM events
    WHERE event = 'user_registered' AND timestamp >= '2026-05-17'
    GROUP BY person_id, distinct_id
  )
  SELECT
    r.reg_did,
    r.reg_t,
    r.utm_src,
    r.utm_camp,
    countIf(e.properties.locale = 'es') AS es_events,
    countIf(e.properties.locale = 'en') AS en_events,
    countIf(e.properties.locale IS NULL) AS unset_events,
    countIf(e.event = 'email_lead_submitted') AS gate_subs,
    countIf(e.event = 'checkout_stripe_redirected') AS stripe,
    argMax(e.properties.$current_url, e.timestamp) AS last_url,
    argMax(e.properties.locale, e.timestamp) AS last_locale
  FROM regs r
  LEFT JOIN events e ON e.person_id = r.person_id AND e.timestamp <= r.reg_t
  GROUP BY r.reg_did, r.reg_t, r.utm_src, r.utm_camp
  ORDER BY r.reg_t DESC
`, 'reg-person-join');

console.log('═══ user_registered enriched via person_id join ═══');
if (joined?.results?.length) {
  for (const [did, t, src, camp, es, en, unset, subs, stripe, url, lloc] of joined.results) {
    const tag = es > en ? '🇪🇸 ES' : (en > es ? '🇺🇸 EN' : '❓ unknown');
    console.log(`\n  ${tag.padEnd(12)} ${did.padEnd(40)} reg_t=${t.slice(0, 19)}`);
    console.log(`    utm: ${src ?? '—'} / ${camp ?? '—'}`);
    console.log(`    pre-signup events: es=${es} en=${en} unset=${unset}`);
    console.log(`    gate_subs=${subs}  stripe_redir=${stripe}`);
    console.log(`    last_url: ${(url ?? '—').slice(0, 80)}`);
    console.log(`    last_locale: ${lloc ?? '—'}`);
  }
} else {
  console.log('  (no data)');
}

// Sanity — DB lead converters mapped to PostHog
console.log('\n═══ Per-source registration counts ═══');
const srcCounts = await hogql(`
  WITH regs AS (
    SELECT person_id
    FROM events
    WHERE event = 'user_registered' AND timestamp >= '2026-05-17'
    GROUP BY person_id
  )
  SELECT
    coalesce(e.properties.locale, '(unset)') AS locale,
    e.properties.utm_source,
    e.properties.utm_campaign,
    uniq(e.person_id) AS registered_users
  FROM events e
  WHERE e.person_id IN (SELECT person_id FROM regs)
    AND e.event IN ('email_lead_submitted', '$pageview')
    AND e.properties.utm_source IS NOT NULL
  GROUP BY locale, e.properties.utm_source, e.properties.utm_campaign
  ORDER BY registered_users DESC
`, 'src-of-converters');
if (srcCounts?.results?.length) {
  console.log(`  ${'locale'.padEnd(8)} │ ${'utm_source'.padEnd(15)} │ ${'utm_campaign'.padEnd(25)} │ users`);
  console.log(`  ${'─'.repeat(8)}─┼─${'─'.repeat(15)}─┼─${'─'.repeat(25)}─┼─${'─'.repeat(5)}`);
  for (const [loc, src, camp, n] of srcCounts.results) {
    console.log(`  ${(loc ?? '—').padEnd(8)} │ ${(src ?? '—').padEnd(15)} │ ${(camp ?? '—').slice(0, 25).padEnd(25)} │ ${n}`);
  }
}

console.log('\n— End join audit —');
