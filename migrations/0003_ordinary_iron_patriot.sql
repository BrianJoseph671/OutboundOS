-- This migration is idempotent — safe to run on databases that already have
-- migrations 0001 (research_packets) and 0002 (integrations_and_meetings) applied,
-- as well as the manually-applied 0003_user_auth_and_partitioning schema.
-- Uses IF NOT EXISTS and duplicate_object exception handling throughout.

-- Tables from 0001/0002 (IF NOT EXISTS guards for idempotency)
CREATE TABLE IF NOT EXISTS "contact_meetings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"meeting_id" varchar NOT NULL,
	"matched_by" text DEFAULT 'email' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"scopes" text,
	"provider_account_id" text,
	"is_connected" boolean DEFAULT true,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Phase 1: NEW interactions table (RelationshipOS)
CREATE TABLE IF NOT EXISTS "interactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"contact_id" varchar NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"source_id" text,
	"summary" text,
	"raw_content" text,
	"open_threads" text,
	"ingested_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meetings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"title" text,
	"start_time" timestamp,
	"end_time" timestamp,
	"attendees" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"transcript" text,
	"summary" text,
	"action_items" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_packets" (
	"contact_id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"prospect_snapshot" text,
	"company_snapshot" text,
	"signals_hooks" jsonb DEFAULT '[]'::jsonb,
	"personalized_message" text,
	"variants" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Add user_id to tables created by 0001/0002 (which lacked it) — IF NOT EXISTS guard
-- for idempotency when running on DB where 0003_user_auth_and_partitioning already ran.
ALTER TABLE "integration_connections" ADD COLUMN IF NOT EXISTS "user_id" varchar NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "user_id" varchar NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "research_packets" ADD COLUMN IF NOT EXISTS "user_id" varchar NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "airtable_config" ADD COLUMN IF NOT EXISTS "user_id" varchar NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "user_id" varchar NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
-- Phase 1: NEW RelationshipOS columns on contacts
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "tier" text DEFAULT 'cool' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_interaction_at" timestamp;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_interaction_channel" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "user_id" varchar NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "outreach_attempts" ADD COLUMN IF NOT EXISTS "user_id" varchar NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "user_id" varchar NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
-- Phase 1: NEW user identity columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_meetings" ADD CONSTRAINT "contact_meetings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_meetings" ADD CONSTRAINT "contact_meetings_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interactions" ADD CONSTRAINT "interactions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_packets" ADD CONSTRAINT "research_packets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_packets" ADD CONSTRAINT "research_packets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interactions_channel_source_id_unique" ON "interactions" USING btree ("channel","source_id") WHERE "interactions"."source_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_user_contact_idx" ON "interactions" USING btree ("user_id","contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_user_occurred_at_idx" ON "interactions" USING btree ("user_id","occurred_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "airtable_config" ADD CONSTRAINT "airtable_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "experiments" ADD CONSTRAINT "experiments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_user_id_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
