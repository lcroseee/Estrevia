import { config } from 'dotenv';
config({ path: '.env' });

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const HOST = 'https://us.posthog.com';

async function query(hogql) {
  const r = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
  });
  const d = await r.json();
  if (!r.ok) { console.log('ERR:', JSON.stringify(d).slice(0, 200)); return null; }
  return d;
}

console.log('═════ Project info ═════');
const proj = await fetch(`${HOST}/api/projects/${PROJECT}/`, {
  headers: { Authorization: `Bearer ${KEY}` },
}).then(r => r.json());
console.log(`  name: ${proj.name}`);
console.log(`  created: ${proj.created_at}`);
console.log(`  ingested_event: ${proj.ingested_event}`);
console.log(`  test_account_filters_default_checked: ${proj.test_account_filters_default_checked}`);

console.log('\n═════ Last 24h: all events ═════');
const d24 = await query(`
  SELECT event, COUNT() AS n
  FROM events
  WHERE timestamp >= now() - INTERVAL 24 HOUR
  GROUP BY event
  ORDER BY n DESC
  LIMIT 30
`);
if (d24?.results?.length) {
  for (const [ev, n] of d24.results) console.log(`  ${String(n).padStart(6)}  ${ev}`);
} else console.log('  (zero events in last 24h)');

console.log('\n═════ Last 7d funnel events ═════');
const fEv = await query(`
  SELECT event, COUNT() AS n, MIN(timestamp) AS first, MAX(timestamp) AS last
  FROM events
  WHERE timestamp >= now() - INTERVAL 7 DAY
    AND event IN ('email_lead_submitted', 'email_gate_dismissed', 'paywall_opened', 'paywall_trial_clicked', 'checkout_auto_started', 'checkout_stripe_redirected', 'checkout_error', 'subscription_started', '$pageview', 'Lead', 'Subscribe')
  GROUP BY event
  ORDER BY n DESC
`);
if (fEv?.results?.length) {
  for (const [ev, n, first, last] of fEv.results) {
    console.log(`  ${String(n).padStart(6)}  ${ev.padEnd(32)} first=${first?.slice(0,16)} last=${last?.slice(0,16)}`);
  }
} else console.log('  (no funnel events in 7d)');

console.log('\n═════ Last lead event in detail ═════');
const recent = await query(`
  SELECT timestamp, event, properties.utm_source, properties.utm_campaign, properties.\$current_url
  FROM events
  WHERE event = 'email_lead_submitted'
  ORDER BY timestamp DESC
  LIMIT 5
`);
if (recent?.results?.length) {
  for (const row of recent.results) console.log(`  ${row[0]?.slice(0, 19)}  utm=${row[2]||'-'}/${row[3]||'-'}  ${row[4]||''}`);
} else console.log('  (no email_lead_submitted events ever)');

console.log('\n═════ Ingest sanity: last event of ANY kind ═════');
const last = await query(`SELECT timestamp, event, distinct_id FROM events ORDER BY timestamp DESC LIMIT 5`);
if (last?.results?.length) {
  for (const row of last.results) console.log(`  ${row[0]?.slice(0, 19)}  ${String(row[1]).padEnd(25)} distinct=${(row[2]||'').slice(0, 28)}`);
}
