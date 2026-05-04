/**
 * One-shot: apply drizzle migration 0004 (advertising_recon_state) to prod Neon.
 *
 * Why this script exists: drizzle-kit's migrate command fails silently against
 * this Neon DB because the __drizzle_migrations table is empty (per T1 audit
 * 2026-05-03). The v3a memo claimed 0004 was applied during Track 8 work but
 * Neon's public schema does not contain advertising_recon_state, so the v3a
 * Track 8 reconciler suspend logic 500s when getReconState() runs.
 *
 * Idempotent: uses IF NOT EXISTS + ON CONFLICT DO NOTHING. Safe to re-run.
 *
 * Usage: `npx tsx scripts/advertising/apply-migration-0004.ts`
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FAIL: DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const statements: Array<{ label: string; sql: string }> = [
  {
    label: 'CREATE advertising_recon_state',
    sql: `CREATE TABLE IF NOT EXISTS "advertising_recon_state" (
      "id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
      "suspended" boolean DEFAULT false NOT NULL,
      "suspended_at" timestamp with time zone,
      "suspend_reason" text,
      "auto_resume_at" timestamp with time zone,
      "last_drift_pct" real,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    label: 'INSERT singleton row',
    sql: `INSERT INTO "advertising_recon_state" ("id", "suspended")
          VALUES ('singleton', false)
          ON CONFLICT ("id") DO NOTHING`,
  },
];

async function main() {
  console.log('Applying drizzle migration 0004 (advertising_recon_state) to Neon...\n');

  for (const stmt of statements) {
    console.log(`▶ ${stmt.label}`);
    try {
      await sql.query(stmt.sql);
      console.log('  ✅ OK\n');
    } catch (err) {
      console.error(`  ❌ FAIL: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  console.log('Verifying...');
  const rows = await sql`SELECT id, suspended, suspended_at, suspend_reason, auto_resume_at, last_drift_pct FROM advertising_recon_state`;
  console.log('advertising_recon_state contents:');
  console.table(rows);

  if (rows.length === 0) {
    console.error('FAIL: singleton row missing after INSERT');
    process.exit(1);
  }

  if (rows[0].id !== 'singleton') {
    console.error(`FAIL: expected id='singleton', got id='${rows[0].id}'`);
    process.exit(1);
  }

  console.log('\n✅ Migration 0004 applied successfully.');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
