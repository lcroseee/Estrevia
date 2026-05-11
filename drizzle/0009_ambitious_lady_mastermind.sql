CREATE TABLE "advertising_brand_voice_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"depth" real NOT NULL,
	"scientific" real NOT NULL,
	"respectful" real NOT NULL,
	"no_manipulation" boolean NOT NULL,
	"overall" real NOT NULL,
	"needs_review" boolean NOT NULL,
	"reviewed_by_claude_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "abv_run_id_idx" ON "advertising_brand_voice_scores" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "abv_reviewed_at_idx" ON "advertising_brand_voice_scores" USING btree ("reviewed_by_claude_at");