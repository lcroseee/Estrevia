#!/usr/bin/env node
/**
 * SP-0 remediation: delete chart_readings generated against tropical house
 * cusps. Only readings whose chart HAS houses named an Ascendant, so only
 * those can be wrong — readings for unknown-birth-time charts are correct and
 * are deliberately left alone rather than regenerated at token cost.
 *
 * MUST run AFTER the backfill. Inverting the order regenerates a reading
 * against a chart that has not been corrected yet, reproducing the bug in
 * fresh rows.
 *
 * DRY RUN BY DEFAULT. Pass --apply to delete.
 *
 *   node scripts/invalidate-stale-readings-2026-08-04.mjs
 *   node scripts/invalidate-stale-readings-2026-08-04.mjs --apply
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes('--apply');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  const {
    rows: [counts],
  } = await pool.query(`
    SELECT COUNT(*)::int AS affected,
           COUNT(*) FILTER (WHERE cr.locale = 'en')::int AS en,
           COUNT(*) FILTER (WHERE cr.locale = 'es')::int AS es
      FROM chart_readings cr
      JOIN natal_charts nc ON nc.id = cr.chart_id
     WHERE nc.chart_data->'houses' IS NOT NULL
       AND nc.chart_data->'houses' != 'null'::jsonb
  `);

  const {
    rows: [guard],
  } = await pool.query(`
    SELECT COUNT(*)::int AS unaffected
      FROM chart_readings cr
      JOIN natal_charts nc ON nc.id = cr.chart_id
     WHERE nc.chart_data->'houses' IS NULL
        OR nc.chart_data->'houses' = 'null'::jsonb
  `);

  const {
    rows: [notBackfilled],
  } = await pool.query(`
    SELECT COUNT(*)::int AS pending
      FROM natal_charts nc
     WHERE nc.chart_data->'houses' IS NOT NULL
       AND nc.chart_data->'houses' != 'null'::jsonb
       AND NOT (nc.chart_data->'houses'->0 ? 'siderealDegree')
  `);

  console.log(APPLY ? 'APPLYING' : 'DRY RUN');
  console.log(`  readings to delete : ${counts.affected} (en ${counts.en}, es ${counts.es})`);
  console.log(`  readings preserved : ${guard.unaffected} (charts without houses — already correct)`);
  console.log(`  charts still on the old cusp shape: ${notBackfilled.pending}`);

  if (notBackfilled.pending > 0) {
    console.error(
      '\nREFUSING TO APPLY: run the backfill first.\n' +
        'Deleting readings before the charts are corrected means the next view\n' +
        'regenerates against an uncorrected chart, reproducing the bug in fresh rows.',
    );
    process.exit(1);
  }

  if (APPLY) {
    const res = await pool.query(`
      DELETE FROM chart_readings cr
        USING natal_charts nc
        WHERE nc.id = cr.chart_id
          AND nc.chart_data->'houses' IS NOT NULL
          AND nc.chart_data->'houses' != 'null'::jsonb
    `);
    console.log(`  deleted            : ${res.rowCount}`);
  } else {
    console.log('\nRe-run with --apply to delete. Run the BACKFILL FIRST.');
  }
} finally {
  await pool.end();
}
