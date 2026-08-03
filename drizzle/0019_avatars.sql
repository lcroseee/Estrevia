CREATE TABLE IF NOT EXISTS "avatars" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mode" text NOT NULL,
	"style" text NOT NULL,
	"presentation" text,
	"scale" text,
	"blob_pathname" text NOT NULL,
	"palette" jsonb NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_users_id_fk"
   FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "avatars_user_created_idx" ON "avatars" ("user_id","created_at");
