CREATE TABLE "sent_lead_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"email_type" text NOT NULL,
	"resend_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_leads" ADD COLUMN "nurture_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_leads" ADD COLUMN "nurture_next_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_leads" ADD COLUMN "email_undeliverable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sent_lead_emails" ADD CONSTRAINT "sent_lead_emails_lead_id_email_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."email_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sent_lead_emails_oneshot_idx" ON "sent_lead_emails" USING btree ("lead_id","email_type");--> statement-breakpoint
CREATE INDEX "sent_lead_emails_lead_id_idx" ON "sent_lead_emails" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "email_leads_nurture_due_idx" ON "email_leads" USING btree ("nurture_next_at") WHERE nurture_step < 3 AND converted_to_user_id IS NULL AND unsubscribed_at IS NULL AND email_undeliverable = false;