// READ-ONLY CRO audit probe — pricing/checkout sector — 2026-07-10
// Neon SELECT-only: trial emails, discount blast table existence, leads, recovery markers.
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

console.log('=== sent_trial_emails by step (all time) ===');
try {
  const rows = await sql`
    SELECT step, count(*)::int AS n,
           min(sent_at) AS first, max(sent_at) AS last,
           count(*) FILTER (WHERE resend_message_id IS NOT NULL)::int AS delivered
    FROM sent_trial_emails GROUP BY step ORDER BY step`;
  console.log(JSON.stringify(rows, null, 1));
} catch (e) { console.log('ERR', e.message); }

console.log('\n=== sent_trial_emails since 2026-05-29 detail ===');
try {
  const rows = await sql`
    SELECT step, subscription_id, sent_at, resend_message_id IS NOT NULL AS has_msg_id
    FROM sent_trial_emails WHERE sent_at >= '2026-05-29' ORDER BY sent_at`;
  console.log(JSON.stringify(rows, null, 1));
} catch (e) { console.log('ERR', e.message); }

console.log('\n=== sent_discount_blast_emails (migration 0018 applied?) ===');
try {
  const rows = await sql`SELECT count(*)::int AS n FROM sent_discount_blast_emails`;
  console.log('table EXISTS, rows:', JSON.stringify(rows));
} catch (e) { console.log('table check:', e.message); }

console.log('\n=== drizzle migrations applied (last 6) ===');
try {
  const rows = await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 6`;
  console.log(JSON.stringify(rows.map(r => ({ id: r.id, at: r.created_at })), null, 1));
} catch (e) { console.log('ERR', e.message); }

console.log('\n=== email_leads: total + window ===');
const leads = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE created_at >= '2026-05-29')::int AS since_0529,
         count(*) FILTER (WHERE converted_to_user_id IS NOT NULL)::int AS converted,
         count(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsub,
         count(*) FILTER (WHERE locale = 'es')::int AS es
  FROM email_leads`;
console.log(JSON.stringify(leads, null, 1));

console.log('\n=== processed_stripe_events: recovery markers + recent events ===');
try {
  const rows = await sql`
    SELECT event_type, count(*)::int AS n, max(processed_at) AS last
    FROM processed_stripe_events
    WHERE processed_at >= '2026-05-29'
    GROUP BY event_type ORDER BY n DESC LIMIT 20`;
  console.log(JSON.stringify(rows, null, 1));
  const rec = await sql`SELECT count(*)::int AS n FROM processed_stripe_events WHERE event_id LIKE 'recovery:%'`;
  console.log('recovery: markers (all time):', JSON.stringify(rec));
} catch (e) { console.log('ERR', e.message); }

console.log('\n=== users with placeholder email (orphan anon payers — repaired?) ===');
const orphans = await sql`
  SELECT count(*)::int AS n FROM users WHERE email LIKE 'stripe-pending-%@placeholder.invalid'`;
console.log(JSON.stringify(orphans));

console.log('\n=== users: subscription states now ===');
const ustates = await sql`
  SELECT subscription_status, count(*)::int AS n FROM users GROUP BY subscription_status ORDER BY n DESC`;
console.log(JSON.stringify(ustates, null, 1));
