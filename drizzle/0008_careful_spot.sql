CREATE TABLE "email_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"chart_id" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"source" text DEFAULT 'hero_calculator' NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"anonymous_id" text,
	"ip_address_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"converted_to_user_id" text,
	"converted_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "email_leads_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "email_leads_created_at_idx" ON "email_leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_leads_converted_to_user_id_idx" ON "email_leads" USING btree ("converted_to_user_id");