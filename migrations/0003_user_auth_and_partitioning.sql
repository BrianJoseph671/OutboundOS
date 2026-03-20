-- Add new columns to users table for auth
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text UNIQUE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" text UNIQUE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "picture" text;
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

-- Create a default seed user for existing data
INSERT INTO "users" ("id", "username", "email", "display_name")
VALUES ('00000000-0000-0000-0000-000000000001', 'seed_user', 'seed@localhost', 'Seed User')
ON CONFLICT ("id") DO NOTHING;

-- Add userId to contacts
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "user_id" varchar;
UPDATE "contacts" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;
ALTER TABLE "contacts" ALTER COLUMN "user_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add userId to outreach_attempts
ALTER TABLE "outreach_attempts" ADD COLUMN IF NOT EXISTS "user_id" varchar;
UPDATE "outreach_attempts" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;
ALTER TABLE "outreach_attempts" ALTER COLUMN "user_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "outreach_attempts" ADD CONSTRAINT "outreach_attempts_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add userId to experiments
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "user_id" varchar;
UPDATE "experiments" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;
ALTER TABLE "experiments" ALTER COLUMN "user_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add userId to settings
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "user_id" varchar;
UPDATE "settings" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;
ALTER TABLE "settings" ALTER COLUMN "user_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add userId to airtable_config
ALTER TABLE "airtable_config" ADD COLUMN IF NOT EXISTS "user_id" varchar;
UPDATE "airtable_config" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;
ALTER TABLE "airtable_config" ALTER COLUMN "user_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "airtable_config" ADD CONSTRAINT "airtable_config_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create integration_connections if not exists (from migration 0002 that may not have run)
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

-- Add userId to integration_connections if it already existed without user_id
ALTER TABLE "integration_connections" ADD COLUMN IF NOT EXISTS "user_id" varchar;
UPDATE "integration_connections" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;
ALTER TABLE "integration_connections" ALTER COLUMN "user_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create meetings if not exists
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

-- Add userId to meetings if it already existed without user_id
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "user_id" varchar;
UPDATE "meetings" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;
ALTER TABLE "meetings" ALTER COLUMN "user_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "meetings" ADD CONSTRAINT "meetings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create contact_meetings if not exists
CREATE TABLE IF NOT EXISTS "contact_meetings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" varchar NOT NULL,
  "meeting_id" varchar NOT NULL,
  "matched_by" text DEFAULT 'email' NOT NULL
);

-- Add FKs for contact_meetings
DO $$ BEGIN
  ALTER TABLE "contact_meetings" ADD CONSTRAINT "contact_meetings_contact_id_contacts_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "contact_meetings" ADD CONSTRAINT "contact_meetings_meeting_id_meetings_id_fk"
    FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add userId to meetings FK if missing
DO $$ BEGIN
  ALTER TABLE "meetings" ADD CONSTRAINT "meetings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add userId to research_packets (nullable, backfill from contacts)
ALTER TABLE "research_packets" ADD COLUMN IF NOT EXISTS "user_id" varchar;
UPDATE "research_packets" rp SET "user_id" = c."user_id" FROM "contacts" c WHERE rp."contact_id" = c."id" AND rp."user_id" IS NULL;
DO $$ BEGIN
  ALTER TABLE "research_packets" ADD CONSTRAINT "research_packets_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
