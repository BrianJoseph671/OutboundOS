CREATE TABLE IF NOT EXISTS "contact_briefs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contact_id" varchar NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "brief_data" jsonb NOT NULL,
  "model_version" text,
  "generated_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "contact_briefs_user_contact_unique" ON "contact_briefs" ("user_id", "contact_id");
