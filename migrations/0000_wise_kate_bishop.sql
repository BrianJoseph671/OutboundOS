CREATE TABLE "airtable_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_id" text NOT NULL,
	"table_name" text NOT NULL,
	"personal_access_token" text NOT NULL,
	"field_mapping" text,
	"view_name" text DEFAULT 'Grid view',
	"last_sync_at" timestamp,
	"is_connected" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"role" text,
	"linkedin_url" text,
	"email" text,
	"headline" text,
	"about" text,
	"location" text,
	"experience" text,
	"education" text,
	"skills" text,
	"keywords" text,
	"notes" text,
	"tags" text,
	"research_status" text,
	"research_data" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"outreach_type" text NOT NULL,
	"hypothesis" text,
	"variable_tested" text NOT NULL,
	"variant_a_text" text NOT NULL,
	"variant_b_text" text NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "outreach_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"date_sent" timestamp DEFAULT now() NOT NULL,
	"outreach_type" text NOT NULL,
	"relationship_type" text DEFAULT 'cold',
	"campaign" text,
	"message_variant_label" text,
	"message_body" text NOT NULL,
	"subject" text,
	"experiment_id" varchar,
	"experiment_variant" text,
	"responded" boolean DEFAULT false,
	"positive_response" boolean DEFAULT false,
	"meeting_booked" boolean DEFAULT false,
	"converted" boolean DEFAULT false,
	"notes" text,
	"company_tier" varchar(20),
	"response_date" timestamp,
	"days_to_response" integer,
	"follow_up_sent" boolean DEFAULT false,
	"responded_after_followup" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"default_tone" text DEFAULT 'professional',
	"default_cta_options" text,
	"email_signature" text,
	"email_subject_patterns" text,
	"include_proof_line" boolean DEFAULT true,
	"include_logistics_line" boolean DEFAULT true,
	"connection_request_char_limit" integer DEFAULT 300
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
