-- Migration 0002 — CASCADE on synastry_results chart FKs
--
-- Fixes P0 from audit 03-pii-db.md: GDPR account deletion (`DELETE /api/v1/user/account`)
-- fails at runtime for any user who has computed a synastry, because
-- `synastry_results.chart1_id` and `synastry_results.chart2_id` were created with
-- ON DELETE NO ACTION, violating Article 17 right-to-erasure at runtime.
--
-- This migration drops and re-creates both FKs with ON DELETE CASCADE.
-- No data is modified; only the constraint definition changes.
--
-- Idempotent: uses IF EXISTS on the drops.

ALTER TABLE "synastry_results"
  DROP CONSTRAINT IF EXISTS "synastry_results_chart1_id_natal_charts_id_fk";
--> statement-breakpoint
ALTER TABLE "synastry_results"
  ADD CONSTRAINT "synastry_results_chart1_id_natal_charts_id_fk"
  FOREIGN KEY ("chart1_id") REFERENCES "public"."natal_charts"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "synastry_results"
  DROP CONSTRAINT IF EXISTS "synastry_results_chart2_id_natal_charts_id_fk";
--> statement-breakpoint
ALTER TABLE "synastry_results"
  ADD CONSTRAINT "synastry_results_chart2_id_natal_charts_id_fk"
  FOREIGN KEY ("chart2_id") REFERENCES "public"."natal_charts"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
