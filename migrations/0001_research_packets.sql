CREATE TABLE IF NOT EXISTS "research_packets" (
	"contact_id" varchar PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"prospect_snapshot" text,
	"company_snapshot" text,
	"signals_hooks" jsonb DEFAULT '[]',
	"personalized_message" text,
	"variants" jsonb DEFAULT '[]',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_packets" ADD CONSTRAINT "research_packets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Migrate existing research_data from contacts into research_packets
INSERT INTO "research_packets" ("contact_id", "status", "prospect_snapshot", "company_snapshot", "signals_hooks", "personalized_message", "variants", "created_at", "updated_at")
SELECT 
  c.id,
  'complete',
  (c.research_data::json->>'prospectSnapshot'),
  (c.research_data::json->>'companySnapshot'),
  COALESCE((c.research_data::json->'signalsHooks')::jsonb, '[]'::jsonb),
  (c.research_data::json->>'messageDraft'),
  '[]'::jsonb,
  c.created_at,
  NOW()
FROM "contacts" c
WHERE c.research_status = 'completed' AND c.research_data IS NOT NULL
ON CONFLICT ("contact_id") DO NOTHING;
