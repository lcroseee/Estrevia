CREATE TABLE "chart_readings" (
	"id" text PRIMARY KEY NOT NULL,
	"chart_id" text NOT NULL,
	"locale" text NOT NULL,
	"body" text NOT NULL,
	"model" text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chart_readings" ADD CONSTRAINT "chart_readings_chart_id_natal_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."natal_charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chart_readings_chart_locale_uniq" ON "chart_readings" USING btree ("chart_id","locale");