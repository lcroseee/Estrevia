-- T1: Dunning sequence — sent_dunning_emails table.
-- Applied via `psql $DATABASE_URL < drizzle/0014_dunning_emails.sql`
-- or `npm run db:migrate` after founder applies.

CREATE TABLE IF NOT EXISTS "sent_dunning_emails" (
  "id"                   SERIAL PRIMARY KEY,
  "user_id"              TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "subscription_id"      TEXT NOT NULL,
  "stripe_invoice_id"    TEXT NOT NULL,
  "dunning_step"         TEXT NOT NULL,
  "billing_period_start" DATE NOT NULL,
  "is_hard_decline"      BOOLEAN NOT NULL DEFAULT FALSE,
  "resend_message_id"    TEXT,
  "sent_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "error"                TEXT,
  CONSTRAINT "dunning_step_check" CHECK (
    "dunning_step" IN ('d0', 'd3', 'd7', 'd10')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "sent_dunning_emails_idempotency_idx"
  ON "sent_dunning_emails" ("subscription_id", "dunning_step", "billing_period_start");

CREATE INDEX IF NOT EXISTS "sent_dunning_emails_user_idx"
  ON "sent_dunning_emails" ("user_id", "sent_at");
