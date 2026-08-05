#!/usr/bin/env node
/**
 * Snapshot natal_charts.chart_data before the SP-0 backfill rewrites it.
 *
 * The backup lives INSIDE the database rather than in a dumped file: chart_data
 * describes a person's sky at birth, so exporting it to disk would move
 * customer data outside its trust boundary for no benefit. A table copy is
 * instant, keeps the data where it already is, and makes rollback one UPDATE.
 *
 * DRY RUN BY DEFAULT. Pass --apply to create the table.
 * Pass --rollback to restore chart_data from the snapshot.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');
const TABLE = 'natal_charts_chart_data_bak_20260804';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  const { rows: [exists] } = await pool.query(
    `SELECT to_regclass($1) IS NOT NULL AS present`,
    [TABLE],
  );

  if (ROLLBACK) {
    if (!exists.present) {
      console.error(`No snapshot table ${TABLE} — nothing to roll back to.`);
      process.exit(1);
    }
    const res = await pool.query(`
      UPDATE natal_charts nc
         SET chart_data = b.chart_data
        FROM ${TABLE} b
       WHERE b.id = nc.id
    `);
    console.log(`ROLLED BACK ${res.rowCount} rows from ${TABLE}`);
    process.exit(0);
  }

  const { rows: [src] } = await pool.query(`
    SELECT COUNT(*)::int AS n FROM natal_charts
     WHERE chart_data->'houses' IS NOT NULL
       AND chart_data->'houses' != 'null'::jsonb
  `);

  console.log(APPLY ? 'APPLYING' : 'DRY RUN');
  console.log(`  snapshot table     : ${TABLE} (${exists.present ? 'ALREADY EXISTS' : 'to create'})`);
  console.log(`  rows to snapshot   : ${src.n}`);

  if (exists.present) {
    const { rows: [bak] } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${TABLE}`);
    console.log(`  rows already held  : ${bak.n}`);
    console.log('\nSnapshot already exists — refusing to overwrite it.');
    console.log('That snapshot is the only rollback path; replacing it after a');
    console.log('partial backfill would capture the corrupted state as "original".');
    process.exit(0);
  }

  if (APPLY) {
    await pool.query(`
      CREATE TABLE ${TABLE} AS
      SELECT id, chart_data
        FROM natal_charts
       WHERE chart_data->'houses' IS NOT NULL
         AND chart_data->'houses' != 'null'::jsonb
    `);
    const { rows: [bak] } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${TABLE}`);
    console.log(`  snapshotted        : ${bak.n}`);
    if (bak.n !== src.n) {
      console.error('\nCOUNT MISMATCH — do not proceed with the backfill.');
      process.exit(1);
    }
    console.log('\nSnapshot verified. Safe to run the backfill.');
  } else {
    console.log('\nRe-run with --apply to create the snapshot.');
  }
} finally {
  await pool.end();
}
