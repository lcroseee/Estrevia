#!/usr/bin/env node
/**
 * Apply drizzle/0020_reading_variant.sql.
 *
 * Follows the repo's existing one-shot pattern (see the 0019 apply script):
 * `npm run db:migrate` is not used here because the journal snapshots 0013-0017
 * are stale and the generator would try to reconcile them.
 *
 * DRY RUN BY DEFAULT. Pass --apply to execute.
 *
 * Idempotent: every statement carries IF EXISTS / IF NOT EXISTS, so a second
 * run is a no-op rather than an error.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { readFileSync } from 'node:fs';

neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes('--apply');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const SQL = readFileSync('drizzle/0020_reading_variant.sql', 'utf8');

// Strip comment lines before splitting: a leading `--` would otherwise make a
// whole statement look like a comment and be skipped in silence.
const statements = SQL.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  const state = async () => {
    const cols = (
      await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'chart_readings'`,
      )
    ).rows.map((r) => r.column_name);
    const idx = (
      await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'chart_readings'`)
    ).rows.map((r) => r.indexname);
    const rows = (await pool.query('SELECT COUNT(*)::int n FROM chart_readings')).rows[0].n;
    return { hasVariant: cols.includes('variant'), idx, rows };
  };

  const before = await state();
  console.log(APPLY ? 'APPLYING' : 'DRY RUN');
  console.log(`  statements     : ${statements.length}`);
  console.log(`  rows           : ${before.rows}`);
  console.log(`  variant column : ${before.hasVariant ? 'already present' : 'to add'}`);
  console.log(`  indexes        : ${before.idx.join(', ')}`);

  if (!APPLY) {
    console.log('\nRe-run with --apply to execute.');
  } else {
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    const after = await state();
    console.log('\nAFTER:');
    console.log(`  rows           : ${after.rows} (was ${before.rows})`);
    console.log(`  variant column : ${after.hasVariant ? 'present' : 'MISSING'}`);
    console.log(`  indexes        : ${after.idx.join(', ')}`);

    const ok =
      after.hasVariant &&
      after.rows === before.rows &&
      after.idx.includes('chart_readings_chart_locale_variant_uniq') &&
      !after.idx.includes('chart_readings_chart_locale_uniq');
    console.log(ok ? '\nOK — 0020 applied and verified.' : '\nVERIFICATION FAILED — inspect above.');
    if (!ok) process.exit(1);
  }
} finally {
  await pool.end();
}
