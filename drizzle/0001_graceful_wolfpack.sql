CREATE TABLE "processed_stripe_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "subscription_status" SET DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "subscription_status" DROP NOT NULL;