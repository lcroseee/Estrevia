-- Trial expiration email sequence: sent_trial_emails tracking table.
-- Mirrors sent_lead_emails but keyed by Stripe subscription_id + step.
-- UNIQUE INDEX enforces one-shot per (subscription, step) — prevents
-- double-fire on Stripe webhook retries and concurrent cron runs.

CREATE TABLE "sent_trial_emails" (
  "id" serial PRIMARY KEY,
  "subscription_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "step" text NOT NULL,
  "resend_message_id" text,
  "sent_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "sent_trial_emails_unique_idx"
  ON "sent_trial_emails" ("subscription_id", "step");

CREATE INDEX "sent_trial_emails_user_id_idx"
  ON "sent_trial_emails" ("user_id");
