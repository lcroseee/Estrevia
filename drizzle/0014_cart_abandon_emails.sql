-- Migration 0014: sent_cart_abandon_emails
--
-- Stores one row per cart-abandon send. No UNIQUE constraint — the 90-day
-- frequency cap is enforced in application code.
-- Applied via `npm run db:migrate` by founder after DRY_RUN smoke test.

CREATE TABLE "sent_cart_abandon_emails" (
  "id"                      SERIAL PRIMARY KEY,
  "lead_id"                 TEXT NOT NULL REFERENCES "email_leads"("id") ON DELETE CASCADE,
  "resend_message_id"       TEXT,
  "posthog_last_paywall_at" TIMESTAMPTZ,
  "checkout_clicks"         INTEGER NOT NULL DEFAULT 0,
  "sent_at"                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "sent_cart_abandon_lead_id_idx"
  ON "sent_cart_abandon_emails" ("lead_id");
