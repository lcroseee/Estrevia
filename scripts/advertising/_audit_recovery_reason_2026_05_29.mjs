// Read-only: extract the `reason` property from checkout_recovery_failed events (14d).
import { config } from 'dotenv';
config({ path: '.env' });
const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const API_HOST = 'https://us.posthog.com';
async function hog(q) {
  const r = await fetch(`${API_HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: q } }),
  });
  const d = await r.json();
  if (!r.ok || d.error) { console.error('ERR', r.status, JSON.stringify(d).slice(0, 300)); return null; }
  return d;
}
const q = `
SELECT timestamp,
       properties.reason AS reason,
       properties.session_id AS session_id
FROM events
WHERE timestamp >= now() - INTERVAL 14 DAY
  AND event = 'checkout_recovery_failed'
ORDER BY timestamp DESC`;
const d = await hog(q);
console.log('=== checkout_recovery_failed reasons (14d) ===');
if (!d?.results?.length) { console.log('(none)'); }
else { console.log('cols:', d.columns?.join(' | ')); for (const r of d.results) console.log(r.map((v) => String(v ?? '')).join('  |  ')); }
