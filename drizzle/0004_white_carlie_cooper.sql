CREATE TABLE "advertising_recon_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspend_reason" text,
	"auto_resume_at" timestamp with time zone,
	"last_drift_pct" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "advertising_recon_state" ("id", "suspended") VALUES ('singleton', false)
ON CONFLICT ("id") DO NOTHING;
