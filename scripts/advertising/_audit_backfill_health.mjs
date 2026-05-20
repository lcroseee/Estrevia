/**
 * Run after each backfill wave: measures whether the wave's leads got
 * their curiosity_hook delivered + tracks abort criteria (silent fail,
 * unsubscribes, bounces, complaints).
 *
 * Usage:
 *   node scripts/advertising/_audit_backfill_health.mjs
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

console.log('═════ curiosity_hook sends in last 25h ═════');
const sends = await sql`
  SELECT
    COUNT(*)::int AS sent_total,
    COUNT(*) FILTER (WHERE resend_message_id IS NOT NULL)::int AS confirmed_sent,
    COUNT(*) FILTER (WHERE resend_message_id IS NULL)::int AS silent_fail
  FROM sent_lead_emails
  WHERE email_type = 'lead_curiosity_hook'
    AND sent_at >= NOW() - INTERVAL '25 hours'
`;
console.table(sends);

if (sends[0].silent_fail > 0) {
  console.error('🚨 SILENT FAIL DETECTED — #3-B regression. ABORT next wave.');
}

console.log('\n═════ Unsubscribes among recent curiosity_hook recipients ═════');
const unsubs = await sql`
  WITH recipients AS (
    SELECT lead_id FROM sent_lead_emails
    WHERE email_type = 'lead_curiosity_hook'
      AND sent_at >= NOW() - INTERVAL '25 hours'
  )
  SELECT
    COUNT(*)::int AS recipients_total,
    COUNT(*) FILTER (WHERE l.unsubscribed_at >= NOW() - INTERVAL '25 hours')::int AS unsubs_24h,
    COUNT(*) FILTER (WHERE l.email_undeliverable = true)::int AS bounces_total,
    ROUND(100.0 * COUNT(*) FILTER (WHERE l.unsubscribed_at >= NOW() - INTERVAL '25 hours') / NULLIF(COUNT(*), 0), 2) AS unsub_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE l.email_undeliverable = true) / NULLIF(COUNT(*), 0), 2) AS bounce_pct
  FROM email_leads l
  WHERE l.id IN (SELECT lead_id FROM recipients)
`;
console.table(unsubs);

const u = unsubs[0];
const flags = [];
if (u.unsub_pct > 5) flags.push(`unsub_pct ${u.unsub_pct}% > 5% threshold`);
if (u.bounce_pct > 5) flags.push(`bounce_pct ${u.bounce_pct}% > 5% threshold`);

if (flags.length > 0) {
  console.error('\n🚨 ABORT CRITERIA HIT — DO NOT run next wave:');
  for (const f of flags) console.error(`  - ${f}`);
} else {
  console.log('\n✓ All abort criteria clean. Next wave safe to proceed (after 24h observation).');
}
console.log('\nNOTE: Resend complaint/spam rate not visible from DB — check Resend dashboard manually.');
