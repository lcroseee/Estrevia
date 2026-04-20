import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Make sure .env contains it.');
  process.exit(1);
}

const sql = neon(url);

async function main() {
  console.log('[migrate] Connecting to', url.replace(/:[^:@/]+@/, ':***@'));

  const exists = await sql`
    SELECT to_regclass('public.usage_counters') AS oid
  `;
  if (exists[0]?.oid) {
    console.log('[migrate] usage_counters already exists — nothing to do.');
    return;
  }

  console.log('[migrate] Creating usage_counters...');
  await sql`
    CREATE TABLE "usage_counters" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "feature" text NOT NULL,
      "period_key" text NOT NULL,
      "count" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "usage_counters_user_feature_period_unique" UNIQUE("user_id","feature","period_key")
    )
  `;

  console.log('[migrate] Adding FK to users...');
  await sql`
    ALTER TABLE "usage_counters"
    ADD CONSTRAINT "usage_counters_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
  `;

  const verify = await sql`
    SELECT
      column_name,
      data_type,
      is_nullable
    FROM information_schema.columns
    WHERE table_name = 'usage_counters'
    ORDER BY ordinal_position
  `;
  console.log('[migrate] Done. Columns:');
  console.table(verify);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] FAILED:', err);
    process.exit(1);
  });
