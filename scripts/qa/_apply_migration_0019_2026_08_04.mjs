#!/usr/bin/env node
/**
 * Apply drizzle migration 0019 (avatars) to prod Neon.
 *
 * Why not `npm run db:migrate`: __drizzle_migrations is empty and the journal
 * has drift (0013-0017 snapshots were never committed) — bare migrate would
 * try to re-run history. 0019's SQL is idempotent: CREATE TABLE IF NOT EXISTS,
 * a DO block that swallows duplicate_object on the FK, and
 * CREATE INDEX IF NOT EXISTS.
 * Why Pool+ws: the Neon HTTP driver silently fails DDL — it reports success
 * without committing (see the 0018 script's header and
 * docs/runbooks/2026-05-24-discount-launch-executed.md:18). Pool + ws
 * (websocket) is the workaround that actually commits DDL.
 *
 * Safety: DRY RUN BY DEFAULT. It prints the statements it would run and exits
 * 0 — no DB connection is opened unless --apply is passed.
 *
 * Usage:
 *   node scripts/qa/_apply_migration_0019_2026_08_04.mjs           # dry run
 *   node scripts/qa/_apply_migration_0019_2026_08_04.mjs --apply   # execute against DATABASE_URL
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { readFileSync } from 'node:fs';

const IS_APPLY = process.argv.includes('--apply');
const MIGRATION = 'drizzle/0019_avatars.sql';

const sqlText = readFileSync(MIGRATION, 'utf8');
const statements = sqlText
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(
  IS_APPLY
    ? '=== APPLY MODE — will execute against DATABASE_URL ==='
    : '=== DRY RUN (default, no DB connection) — pass --apply to execute ===',
);
console.log(`${statements.length} statement(s) parsed from ${MIGRATION}\n`);

for (const st of statements) {
  console.log(`${IS_APPLY ? 'applying' : 'would apply'}: ${st.replace(/\s+/g, ' ').slice(0, 90)}…`);
}

if (!IS_APPLY) {
  console.log('\nDry run complete — no statements executed, no DB connection opened.');
  console.log('Re-run with --apply to write to the DB.');
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error('\nDATABASE_URL missing — abort');
  process.exit(1);
}

// Imported lazily and only in --apply mode so a dry run needs neither a
// websocket constructor nor database credentials.
const { Pool, neonConfig } = await import('@neondatabase/serverless');
const ws = (await import('ws')).default;
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  console.log('');
  for (const st of statements) {
    await pool.query(st);
  }

  const check = await pool.query(
    `SELECT to_regclass('public.avatars')                                        AS table_exists,
            (SELECT count(*) FROM pg_indexes
              WHERE tablename = 'avatars')                                       AS index_count,
            (SELECT count(*) FROM information_schema.table_constraints
              WHERE table_name = 'avatars' AND constraint_type = 'FOREIGN KEY')  AS fk_count,
            (SELECT count(*) FROM information_schema.columns
              WHERE table_name = 'avatars')                                      AS column_count`,
  );
  console.log('verify:', check.rows[0]);

  const row = check.rows[0];
  if (!row.table_exists) {
    console.error('VERIFICATION FAILED — avatars table missing after apply');
    process.exit(1);
  }
  if (Number(row.fk_count) < 1) {
    console.error('VERIFICATION FAILED — user_id foreign key missing');
    process.exit(1);
  }
  if (Number(row.column_count) !== 10) {
    console.error(`VERIFICATION FAILED — expected 10 columns, found ${row.column_count}`);
    process.exit(1);
  }

  // The feature's core privacy guarantee: no face-derived column may exist.
  const faceCols = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'avatars'
        AND column_name ~* '(trait|selfie|face|hair|skin|photo)'`,
  );
  if (faceCols.rows.length > 0) {
    console.error('VERIFICATION FAILED — face-derived column(s) present:', faceCols.rows);
    process.exit(1);
  }

  console.log('done.');
} finally {
  await pool.end();
}
