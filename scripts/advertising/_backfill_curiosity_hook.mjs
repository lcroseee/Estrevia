/**
 * Backfill curiosity_hook for pre-deploy leads renumbered by migration 0013.
 *
 * Resets target leads to nurture_step=1, nurture_next_at=NOW so cron picks
 * them up. Idempotent (UNIQUE index on sent_lead_emails blocks duplicates).
 *
 * Usage:
 *   node scripts/advertising/_backfill_curiosity_hook.mjs --wave=1 --dry-run
 *   node scripts/advertising/_backfill_curiosity_hook.mjs --wave=1
 *
 * Wave sizes: 1=10 (canary), 2=50, 3=108 (remainder).
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { neon } from '@neondatabase/serverless';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith('--wave=')) return ['wave', Number(a.split('=')[1])];
    if (a === '--dry-run') return ['dry', true];
    return [a.replace(/^--/, ''), true];
  }),
);
const wave = args.wave;
const DRY = !!args.dry;

if (![1, 2, 3].includes(wave)) {
  console.error('Required: --wave=1|2|3');
  process.exit(1);
}
const WAVE_SIZES = { 1: 10, 2: 50, 3: 108 };
const limit = WAVE_SIZES[wave];

const sql = neon(process.env.DATABASE_URL);

const targets = await sql`
  SELECT id, locale, nurture_step, created_at, utm_campaign
  FROM email_leads
  WHERE nurture_step IN (2, 3)
    AND converted_to_user_id IS NULL
    AND unsubscribed_at IS NULL
    AND email_undeliverable = false
    AND NOT EXISTS (
      SELECT 1 FROM sent_lead_emails s
      WHERE s.lead_id = email_leads.id AND s.email_type = 'lead_curiosity_hook'
    )
  ORDER BY created_at DESC
  LIMIT ${limit}
`;

console.log(`Wave ${wave} targets (limit=${limit}, found=${targets.length}):`);
console.table(targets.map((t) => ({
  id: t.id.slice(0, 10),
  locale: t.locale,
  step: t.nurture_step,
  created: t.created_at.toISOString().slice(0, 16),
  utm: t.utm_campaign,
})));

if (DRY) {
  console.log('\n[DRY RUN] No UPDATE executed.');
  process.exit(0);
}

const ids = targets.map((t) => t.id);
const updated = await sql`
  UPDATE email_leads
  SET nurture_step = 1, nurture_next_at = NOW()
  WHERE id = ANY(${ids})
  RETURNING id
`;
console.log(`\n✓ Reset ${updated.length} leads to step=1 (cron picks up next tick).`);
