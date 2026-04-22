import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

/**
 * Applies the 0001_cascade_synastry_fks migration idempotently.
 *
 * Drops and re-creates the FKs `synastry_results.chart1_id` and
 * `synastry_results.chart2_id` with ON DELETE CASCADE. Safe to re-run.
 *
 * Usage: `npx tsx scripts/apply-synastry-cascade-migration.ts`
 */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Make sure .env contains it.');
  process.exit(1);
}

const sql = neon(url);

async function main() {
  console.log('[migrate] Connecting to', url!.replace(/:[^:@/]+@/, ':***@'));

  console.log('[migrate] Dropping old FK synastry_results_chart1_id_natal_charts_id_fk (if any)...');
  await sql`
    ALTER TABLE "synastry_results"
    DROP CONSTRAINT IF EXISTS "synastry_results_chart1_id_natal_charts_id_fk"
  `;

  console.log('[migrate] Adding FK chart1_id with ON DELETE CASCADE...');
  await sql`
    ALTER TABLE "synastry_results"
    ADD CONSTRAINT "synastry_results_chart1_id_natal_charts_id_fk"
    FOREIGN KEY ("chart1_id") REFERENCES "public"."natal_charts"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
  `;

  console.log('[migrate] Dropping old FK synastry_results_chart2_id_natal_charts_id_fk (if any)...');
  await sql`
    ALTER TABLE "synastry_results"
    DROP CONSTRAINT IF EXISTS "synastry_results_chart2_id_natal_charts_id_fk"
  `;

  console.log('[migrate] Adding FK chart2_id with ON DELETE CASCADE...');
  await sql`
    ALTER TABLE "synastry_results"
    ADD CONSTRAINT "synastry_results_chart2_id_natal_charts_id_fk"
    FOREIGN KEY ("chart2_id") REFERENCES "public"."natal_charts"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
  `;

  console.log('[migrate] Done. Synastry FKs now cascade on natal_charts deletion.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] FAILED:', err);
    process.exit(1);
  });
