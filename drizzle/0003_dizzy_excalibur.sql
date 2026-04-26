CREATE TABLE "advertising_audiences" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"meta_audience_id" text,
	"size" integer DEFAULT 0 NOT NULL,
	"last_refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_query" text NOT NULL,
	"active_in_campaigns" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertising_creatives" (
	"id" text PRIMARY KEY NOT NULL,
	"hook_template_id" text NOT NULL,
	"asset_url" text NOT NULL,
	"asset_kind" text NOT NULL,
	"generator" text NOT NULL,
	"cost_usd" real NOT NULL,
	"copy" text NOT NULL,
	"cta" text NOT NULL,
	"locale" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"safety_checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta_ad_id" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertising_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"ad_id" text NOT NULL,
	"action" text NOT NULL,
	"delta_budget_usd" real,
	"reason" text NOT NULL,
	"reasoning_tier" text NOT NULL,
	"confidence" real NOT NULL,
	"metrics_snapshot" jsonb NOT NULL,
	"applied" boolean DEFAULT false NOT NULL,
	"applied_at" timestamp with time zone,
	"apply_error" text,
	"meta_response" jsonb
);
--> statement-breakpoint
CREATE TABLE "advertising_feature_gates" (
	"feature_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"activation_criteria" jsonb NOT NULL,
	"current_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertising_shadow_comparisons" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"ad_id" text NOT NULL,
	"active_decision" text NOT NULL,
	"shadow_decision" text NOT NULL,
	"agreement" boolean NOT NULL,
	"outcome_better" text,
	"shadow_component" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertising_spend_daily" (
	"date" text PRIMARY KEY NOT NULL,
	"spent_usd" real DEFAULT 0 NOT NULL,
	"cap_usd" real NOT NULL,
	"triggered_halt" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "adv_creatives_status_idx" ON "advertising_creatives" USING btree ("status");--> statement-breakpoint
CREATE INDEX "adv_creatives_meta_ad_id_idx" ON "advertising_creatives" USING btree ("meta_ad_id");--> statement-breakpoint
CREATE INDEX "adv_decisions_timestamp_idx" ON "advertising_decisions" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "adv_decisions_ad_id_idx" ON "advertising_decisions" USING btree ("ad_id");