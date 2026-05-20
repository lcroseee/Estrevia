/**
 * One-off: unstick 23 leads sitting on nurture_step=1 with a 24h delay
 * (their nurture_next_at was set by the pre-fix waitUntil code using
 * the old 24h delta instead of the new 1h delta).
 *
 * Only safe to run after #3-B root cause is fixed and confirmed —
 * otherwise these leads will go into the same broken curiosity_hook
 * flow and stay broken longer.
 *
 * Usage:
 *   node scripts/advertising/_unstick_step1_leads.mjs --dry-run    # SELECT only
 *   node scripts/advertising/_unstick_step1_leads.mjs              # UPDATE
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const DRY = process.argv.includes('--dry-run');
const sql = neon(process.env.DATABASE_URL);

const targets = await sql`
  SELECT id, locale, nurture_step, nurture_next_at,
         EXTRACT(EPOCH FROM (NOW() - created_at))/3600 AS age_hours
  FROM email_leads
  WHERE nurture_step = 1
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
  ORDER BY created_at ASC
`;

console.log(`Found ${targets.length} stuck step=1 leads:`);
console.table(targets);

if (DRY) {
  console.log('\n[DRY RUN] No UPDATE executed. Remove --dry-run to apply.');
  process.exit(0);
}

const updated = await sql`
  UPDATE email_leads
  SET nurture_next_at = NOW()
  WHERE nurture_step = 1
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
  RETURNING id
`;

console.log(`\nUpdated ${updated.length} leads — next cron tick will pick them up for curiosity_hook send.`);
