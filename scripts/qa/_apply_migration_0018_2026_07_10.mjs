#!/usr/bin/env node
/**
 * Apply drizzle migration 0018 (sent_discount_blast_emails) to prod Neon.
 *
 * Why not `npm run db:migrate`: __drizzle_migrations is empty and the journal
 * has drift (idx 13 missing; 0013-0017 snapshots never committed) — bare
 * migrate would try to re-run history. 0018's SQL is IF NOT EXISTS-idempotent.
 * Why Pool+ws: Neon HTTP driver silently fails DDL — an earlier attempt via
 * `@neondatabase/serverless` HTTP `sql.unsafe()` reported success but did not
 * commit the writes (docs/runbooks/2026-05-24-discount-launch-executed.md:18).
 * Switching to `Pool` + `ws` (websocket) is the workaround that actually
 * commits DDL.
 *
 * Safety: DRY RUN BY DEFAULT. This only prints the statements it would run
 * and exits 0 — it never opens a DB connection unless --apply is passed.
 * Pass --apply to actually execute the statements against DATABASE_URL.
 *
 * Usage:
 *   node scripts/qa/_apply_migration_0018_2026_07_10.mjs           # dry run (default, no DB connection)
 *   node scripts/qa/_apply_migration_0018_2026_07_10.mjs --apply   # apply for real against DATABASE_URL
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { readFileSync } from 'node:fs';

const IS_APPLY = process.argv.includes('--apply');

const sqlText = readFileSync('drizzle/0018_discount_blast_emails.sql', 'utf8');
const statements = sqlText
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(
  IS_APPLY
    ? '=== APPLY MODE — will execute against DATABASE_URL ==='
    : '=== DRY RUN (default, no DB connection) — pass --apply to execute ===',
);
console.log(`${statements.length} statement(s) parsed from drizzle/0018_discount_blast_emails.sql\n`);

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

// Import Pool/ws lazily and only in --apply mode: dry-run mode should not
// require a live websocket constructor or database credentials to work.
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
    `SELECT to_regclass('public.sent_discount_blast_emails') AS table_exists,
            (SELECT count(*) FROM pg_indexes WHERE tablename = 'sent_discount_blast_emails') AS index_count`,
  );
  console.log('verify:', check.rows[0]);
  if (!check.rows[0].table_exists) {
    console.error('VERIFICATION FAILED — table missing after apply');
    process.exit(1);
  }
  console.log('done.');
} finally {
  await pool.end();
}
