-- sent_discount_blast_emails — idempotency + audit log for one-off promo blasts.
--
-- Hand-trimmed from `drizzle-kit generate`: the auto-generated diff re-created
-- sent_cart_abandon/dunning/trial tables because meta snapshots for migrations
-- 0013–0017 were never committed (snapshot history jumps 0012→0018). Those
-- tables already exist in prod (applied via 0015–0017), so this migration adds
-- ONLY the new table. IF NOT EXISTS guards keep it safe to re-run.
CREATE TABLE IF NOT EXISTS "sent_discount_blast_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"lead_id" text,
	"user_id" text,
	"coupon_code" text NOT NULL,
	"resend_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sent_discount_blast_idempotency_idx" ON "sent_discount_blast_emails" USING btree ("recipient","coupon_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sent_discount_blast_sent_at_idx" ON "sent_discount_blast_emails" USING btree ("sent_at");
