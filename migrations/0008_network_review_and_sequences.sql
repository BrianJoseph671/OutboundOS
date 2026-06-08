ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "warmth_score" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "bidirectional_threads" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "total_threads" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_inbound_at" timestamp;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_outbound_at" timestamp;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "indexed_at" timestamp;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "network_index_jobs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'pending' NOT NULL,
  "threads_scanned" integer DEFAULT 0,
  "contacts_found" integer DEFAULT 0,
  "contacts_updated" integer DEFAULT 0,
  "errors" jsonb DEFAULT '[]'::jsonb,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sequence_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "steps" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sequences" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contact_id" varchar NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "template_id" varchar REFERENCES "sequence_templates"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sequence_steps" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence_id" varchar NOT NULL REFERENCES "sequences"("id") ON DELETE CASCADE,
  "step_number" integer NOT NULL,
  "delay_days" integer DEFAULT 0 NOT NULL,
  "subject" text,
  "instructions" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "scheduled_for" timestamp,
  "sent_at" timestamp,
  "draft_id" text,
  "thread_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "email_type_rules" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "signature_hash" text NOT NULL,
  "label" text NOT NULL,
  "decision" text NOT NULL,
  "examples" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "index_review_sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "job_id" varchar REFERENCES "network_index_jobs"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'pending_review' NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "index_review_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" varchar NOT NULL REFERENCES "index_review_sessions"("id") ON DELETE CASCADE,
  "signature_hash" text NOT NULL,
  "proposed_label" text NOT NULL,
  "example_subjects" jsonb DEFAULT '[]'::jsonb,
  "message_count" integer DEFAULT 0 NOT NULL,
  "decision" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "network_index_jobs_user_id_idx" ON "network_index_jobs" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequences_user_id_idx" ON "sequences" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequences_contact_id_idx" ON "sequences" ("contact_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_type_rules_user_signature_unique" ON "email_type_rules" ("user_id", "signature_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_type_rules_user_decision_idx" ON "email_type_rules" ("user_id", "decision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_review_sessions_user_status_idx" ON "index_review_sessions" ("user_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_review_items_session_signature_unique" ON "index_review_items" ("session_id", "signature_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_review_items_session_decision_idx" ON "index_review_items" ("session_id", "decision");
