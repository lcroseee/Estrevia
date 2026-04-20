CREATE TABLE "cosmic_passports" (
	"id" text PRIMARY KEY NOT NULL,
	"chart_id" text NOT NULL,
	"sun_sign" text NOT NULL,
	"moon_sign" text NOT NULL,
	"ascendant_sign" text,
	"element" text NOT NULL,
	"ruling_planet" text NOT NULL,
	"rarity_percent" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"card_id" text NOT NULL,
	"reversed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_cards_user_date_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "natal_charts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text,
	"status" text DEFAULT 'temp' NOT NULL,
	"encrypted_birth_data" text NOT NULL,
	"house_system" text DEFAULT 'Placidus' NOT NULL,
	"ayanamsa" text DEFAULT 'lahiri' NOT NULL,
	"chart_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"daily_moon_phase" boolean DEFAULT false NOT NULL,
	"full_new_moon" boolean DEFAULT false NOT NULL,
	"planetary_hour_change" boolean DEFAULT false NOT NULL,
	"weekly_digest" boolean DEFAULT false NOT NULL,
	"preferred_time" text DEFAULT '08:00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synastry_results" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"chart1_id" text NOT NULL,
	"chart2_id" text NOT NULL,
	"overall_score" real NOT NULL,
	"category_scores" jsonb NOT NULL,
	"aspects" jsonb NOT NULL,
	"ai_analysis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tarot_readings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"spread_type" text NOT NULL,
	"cards" jsonb NOT NULL,
	"ai_interpretation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"period_key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_user_feature_period_unique" UNIQUE("user_id","feature","period_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"consent_at" timestamp with time zone,
	"stripe_customer_id" text,
	"subscription_tier" text DEFAULT 'free' NOT NULL,
	"subscription_expires_at" timestamp with time zone,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"subscription_status" text DEFAULT 'active' NOT NULL,
	"trial_end" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'organic' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "cosmic_passports" ADD CONSTRAINT "cosmic_passports_chart_id_natal_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."natal_charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_cards" ADD CONSTRAINT "daily_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "natal_charts" ADD CONSTRAINT "natal_charts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synastry_results" ADD CONSTRAINT "synastry_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synastry_results" ADD CONSTRAINT "synastry_results_chart1_id_natal_charts_id_fk" FOREIGN KEY ("chart1_id") REFERENCES "public"."natal_charts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synastry_results" ADD CONSTRAINT "synastry_results_chart2_id_natal_charts_id_fk" FOREIGN KEY ("chart2_id") REFERENCES "public"."natal_charts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarot_readings" ADD CONSTRAINT "tarot_readings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;