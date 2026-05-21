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
CREATE UNIQUE INDEX IF NOT EXISTS "email_type_rules_user_signature_unique" ON "email_type_rules" ("user_id", "signature_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_type_rules_user_decision_idx" ON "email_type_rules" ("user_id", "decision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_review_sessions_user_status_idx" ON "index_review_sessions" ("user_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_review_items_session_signature_unique" ON "index_review_items" ("session_id", "signature_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_review_items_session_decision_idx" ON "index_review_items" ("session_id", "decision");
