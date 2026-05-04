CREATE TABLE "advertising_ad_set_metric_history" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_set_id" text NOT NULL,
	"date" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"spend_usd" real NOT NULL,
	"ctr" real NOT NULL,
	"cpc" real NOT NULL,
	"cpm" real NOT NULL,
	"frequency" real NOT NULL,
	"conversions_meta" integer NOT NULL,
	"conversions_posthog" integer NOT NULL,
	"revenue_usd" real DEFAULT 0 NOT NULL,
	"roas" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertising_ad_set_phase_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"ad_set_id" text NOT NULL,
	"transition_kind" text NOT NULL,
	"from_value" text NOT NULL,
	"to_value" text NOT NULL,
	"reason" text NOT NULL,
	"metric_snapshot" jsonb NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertising_ad_set_state" (
	"ad_set_id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"locale" text NOT NULL,
	"current_phase" text DEFAULT 'A' NOT NULL,
	"phase_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_maturity_mode" text DEFAULT 'COLD_START' NOT NULL,
	"maturity_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"optimization_event" text DEFAULT 'landing_page_view' NOT NULL,
	"conversions_7d_meta" integer DEFAULT 0 NOT NULL,
	"conversions_14d_meta" integer DEFAULT 0 NOT NULL,
	"conversions_total_meta" integer DEFAULT 0 NOT NULL,
	"days_with_pixel_data" integer DEFAULT 0 NOT NULL,
	"conversions_7d_posthog" integer DEFAULT 0 NOT NULL,
	"roas_7d" real,
	"cpa_7d" real,
	"frequency_current" real,
	"parent_ad_set_id" text,
	"duplicates_count" integer DEFAULT 0 NOT NULL,
	"last_action_taken_at" timestamp with time zone,
	"flagged_for_review" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertising_thresholds" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text,
	"metric_name" text NOT NULL,
	"value" real NOT NULL,
	"source" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"baseline_metric_snapshot" jsonb,
	"changed_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_metric_history_adset_date" ON "advertising_ad_set_metric_history" USING btree ("ad_set_id","date");--> statement-breakpoint
CREATE INDEX "idx_metric_history_adset_dow" ON "advertising_ad_set_metric_history" USING btree ("ad_set_id","day_of_week");--> statement-breakpoint
CREATE INDEX "idx_phase_transitions_adset" ON "advertising_ad_set_phase_transitions" USING btree ("ad_set_id","triggered_at");--> statement-breakpoint
CREATE INDEX "idx_ad_set_state_current_phase" ON "advertising_ad_set_state" USING btree ("current_phase");--> statement-breakpoint
CREATE INDEX "idx_ad_set_state_data_maturity" ON "advertising_ad_set_state" USING btree ("data_maturity_mode");--> statement-breakpoint
CREATE INDEX "idx_ad_set_state_parent" ON "advertising_ad_set_state" USING btree ("parent_ad_set_id");--> statement-breakpoint
CREATE INDEX "idx_ad_set_state_flagged" ON "advertising_ad_set_state" USING btree ("flagged_for_review") WHERE "advertising_ad_set_state"."flagged_for_review" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_thresholds_scope_metric_eff" ON "advertising_thresholds" USING btree ("scope","scope_id","metric_name","effective_from");--> statement-breakpoint
CREATE INDEX "idx_thresholds_lookup" ON "advertising_thresholds" USING btree ("scope","scope_id","metric_name","effective_from");