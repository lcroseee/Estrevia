-- SP-C: a second reading section per (chart, locale) collides with the old
-- two-column unique key, so the variant has to join it.
--
-- HAND-WRITTEN DELTA. `npm run db:generate` diffs against a stale 0012
-- snapshot and re-emits whole tables; do not replace this with generator
-- output. See feedback_drizzle_snapshot_stale.

ALTER TABLE "chart_readings"
  ADD COLUMN IF NOT EXISTS "variant" text NOT NULL DEFAULT 'natal';

-- Existing rows are natal readings and are covered by the column default,
-- so no backfill is required.

DROP INDEX IF EXISTS "chart_readings_chart_locale_uniq";

CREATE UNIQUE INDEX IF NOT EXISTS "chart_readings_chart_locale_variant_uniq"
  ON "chart_readings" ("chart_id", "locale", "variant");

-- Carried over from the Sonnet 4 retirement (commit 1b69fbf): the application
-- always supplies `model` explicitly, but the column default still named the
-- retired model, which would mislabel any hand-written insert.
ALTER TABLE "chart_readings"
  ALTER COLUMN "model" SET DEFAULT 'claude-sonnet-5';
