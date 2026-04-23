import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password"),
  email: text("email").unique(),
  googleId: text("google_id").unique(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  googleId: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  company: text("company"),
  role: text("role"),
  linkedinUrl: text("linkedin_url"),
  email: text("email"),
  headline: text("headline"),
  about: text("about"),
  location: text("location"),
  experience: text("experience"),
  education: text("education"),
  skills: text("skills"),
  keywords: text("keywords"),
  notes: text("notes"),
  tags: text("tags"),
  researchStatus: text("research_status"),
  researchData: text("research_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // RelationshipOS columns (Phase 1)
  source: text("source"),
  tier: text("tier").notNull().default("cool"),
  lastInteractionAt: timestamp("last_interaction_at"),
  lastInteractionChannel: text("last_interaction_channel"),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Phase 2 columns
  lastSyncedAt: timestamp("last_synced_at"),
  // Network Indexer columns
  warmthScore: integer("warmth_score").default(0),
  bidirectionalThreads: integer("bidirectional_threads").default(0),
  totalThreads: integer("total_threads").default(0),
  lastInboundAt: timestamp("last_inbound_at"),
  lastOutboundAt: timestamp("last_outbound_at"),
  indexedAt: timestamp("indexed_at"),
}, (table) => [
  index("contacts_user_id_idx").on(table.userId),
]);

// userId is optional in the Zod schema for backward compatibility with code that
// doesn't yet set userId from a session (auth is added in a later feature).
// The NOT NULL constraint is enforced at the database level.
export const insertContactSchema = createInsertSchema(contacts)
  .omit({ id: true })
  .extend({ userId: z.string().optional() });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const outreachAttempts = pgTable("outreach_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull(),
  dateSent: timestamp("date_sent").notNull().defaultNow(),
  outreachType: text("outreach_type").notNull(),
  relationshipType: text("relationship_type").default("cold"),
  campaign: text("campaign"),
  messageVariantLabel: text("message_variant_label"),
  messageBody: text("message_body").notNull(),
  subject: text("subject"),
  experimentId: varchar("experiment_id"),
  experimentVariant: text("experiment_variant"),
  responded: boolean("responded").default(false),
  positiveResponse: boolean("positive_response").default(false),
  meetingBooked: boolean("meeting_booked").default(false),
  converted: boolean("converted").default(false),
  notes: text("notes"),
  companyTier: varchar("company_tier", { length: 20 }),
  responseDate: timestamp("response_date"),
  daysToResponse: integer("days_to_response"),
  followUpSent: boolean("follow_up_sent").default(false),
  respondedAfterFollowup: boolean("responded_after_followup").default(false),
});

export const insertOutreachAttemptSchema = createInsertSchema(outreachAttempts, {
  dateSent: z.coerce.date(),
  responseDate: z.coerce.date().nullable(),
}).omit({ id: true });
export type InsertOutreachAttempt = z.infer<typeof insertOutreachAttemptSchema>;
export type OutreachAttempt = typeof outreachAttempts.$inferSelect;

export const experiments = pgTable("experiments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  outreachType: text("outreach_type").notNull(),
  hypothesis: text("hypothesis"),
  variableTested: text("variable_tested").notNull(),
  variantAText: text("variant_a_text").notNull(),
  variantBText: text("variant_b_text").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  active: boolean("active").default(true),
});

export const insertExperimentSchema = createInsertSchema(experiments).omit({ id: true });
export type InsertExperiment = z.infer<typeof insertExperimentSchema>;
export type Experiment = typeof experiments.$inferSelect;

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  defaultTone: text("default_tone").default("professional"),
  defaultCtaOptions: text("default_cta_options"),
  emailSignature: text("email_signature"),
  emailSubjectPatterns: text("email_subject_patterns"),
  includeProofLine: boolean("include_proof_line").default(true),
  includeLogisticsLine: boolean("include_logistics_line").default(true),
  connectionRequestCharLimit: integer("connection_request_char_limit").default(300),
});

export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export const outreachTypes = ["linkedin_connected", "linkedin_connect_request", "linkedin_inmail", "email", "whatsapp"] as const;
export type OutreachType = typeof outreachTypes[number];

export const outreachGoals = ["intro_chat", "partnership", "recruiting", "advice"] as const;
export type OutreachGoal = typeof outreachGoals[number];

export const toneOptions = ["professional", "friendly", "direct"] as const;
export type ToneOption = typeof toneOptions[number];

export const lengthOptions = ["short", "medium", "long"] as const;
export type LengthOption = typeof lengthOptions[number];

export const variableOptions = ["hook", "cta", "length", "tone"] as const;
export type VariableOption = typeof variableOptions[number];

export const airtableConfig = pgTable("airtable_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  baseId: text("base_id").notNull(),
  tableName: text("table_name").notNull(),
  personalAccessToken: text("personal_access_token").notNull(),
  fieldMapping: text("field_mapping"),
  viewName: text("view_name").default("Grid view"),
  lastSyncAt: timestamp("last_sync_at"),
  isConnected: boolean("is_connected").default(true),
});

export const insertAirtableConfigSchema = createInsertSchema(airtableConfig).omit({ id: true });
export type InsertAirtableConfig = z.infer<typeof insertAirtableConfigSchema>;
export type AirtableConfig = typeof airtableConfig.$inferSelect;

export const integrationProviders = ["google", "granola"] as const;
export type IntegrationProvider = typeof integrationProviders[number];

export const meetingSources = ["google_calendar", "granola"] as const;
export type MeetingSource = typeof meetingSources[number];

export const matchMethods = ["email", "name", "manual"] as const;
export type MatchMethod = typeof matchMethods[number];

export const integrationConnections = pgTable("integration_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  scopes: text("scopes"),
  providerAccountId: text("provider_account_id"),
  isConnected: boolean("is_connected").default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertIntegrationConnectionSchema = createInsertSchema(integrationConnections).omit({ id: true });
export type InsertIntegrationConnection = z.infer<typeof insertIntegrationConnectionSchema>;
export type IntegrationConnection = typeof integrationConnections.$inferSelect;

export const meetings = pgTable("meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  externalId: text("external_id"),
  title: text("title"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  attendees: jsonb("attendees").$type<Array<{ email?: string; name?: string; self?: boolean }>>().default([]),
  notes: text("notes"),
  transcript: text("transcript"),
  summary: text("summary"),
  actionItems: jsonb("action_items").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({ id: true });
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetings.$inferSelect;

export const contactMeetings = pgTable("contact_meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  meetingId: varchar("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  matchedBy: text("matched_by").notNull().default("email"),
});

export const insertContactMeetingSchema = createInsertSchema(contactMeetings).omit({ id: true });
export type InsertContactMeeting = z.infer<typeof insertContactMeetingSchema>;
export type ContactMeeting = typeof contactMeetings.$inferSelect;

export const researchPacketStatuses = ["not_started", "queued", "researching", "complete", "failed"] as const;
export type ResearchPacketStatus = typeof researchPacketStatuses[number];

export const researchPackets = pgTable("research_packets", {
  contactId: varchar("contact_id").primaryKey().references(() => contacts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("not_started"),
  prospectSnapshot: text("prospect_snapshot"),
  companySnapshot: text("company_snapshot"),
  signalsHooks: jsonb("signals_hooks").$type<string[]>().default([]),
  personalizedMessage: text("personalized_message"),
  variants: jsonb("variants").$type<unknown[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertResearchPacketSchema = createInsertSchema(researchPackets);
export type InsertResearchPacket = z.infer<typeof insertResearchPacketSchema>;
export type ResearchPacket = typeof researchPackets.$inferSelect;

// Interactions table (Phase 1 — RelationshipOS)
export const interactions = pgTable("interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  direction: text("direction").notNull(),
  occurredAt: timestamp("occurred_at").notNull(),
  sourceId: text("source_id"),
  summary: text("summary"),
  rawContent: text("raw_content"),
  openThreads: text("open_threads"),
  ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
}, (table) => [
  // Partial unique index: prevent duplicate interactions per (user, channel, source_id)
  uniqueIndex("interactions_user_channel_source_id_unique")
    .on(table.userId, table.channel, table.sourceId)
    .where(sql`${table.sourceId} IS NOT NULL`),
  // Performance index for contact detail lookups
  index("interactions_user_contact_idx").on(table.userId, table.contactId),
  // Performance index for chronological queries
  index("interactions_user_occurred_at_idx").on(table.userId, table.occurredAt),
]);

export const insertInteractionSchema = createInsertSchema(interactions, {
  occurredAt: z.coerce.date(),
}).omit({ id: true, ingestedAt: true });
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;
export type Interaction = typeof interactions.$inferSelect;

// Actions table (Phase 2)
export const actions = pgTable("actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull(),
  triggerInteractionId: varchar("trigger_interaction_id").references(() => interactions.id, { onDelete: "set null" }),
  priority: integer("priority").notNull().default(0),
  status: text("status").notNull().default("pending"),
  snoozedUntil: timestamp("snoozed_until"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("actions_user_id_idx").on(table.userId),
  index("actions_user_id_status_idx").on(table.userId, table.status),
]);

export const insertActionSchema = createInsertSchema(actions).omit({ id: true });
export type InsertAction = z.infer<typeof insertActionSchema>;
export type Action = typeof actions.$inferSelect;

// Drafts log table (Phase 2)
export const draftsLog = pgTable("drafts_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  actionId: varchar("action_id").references(() => actions.id, { onDelete: "set null" }),
  superhumanDraftId: text("superhuman_draft_id"),
  instructions: text("instructions"),
  generatedBody: text("generated_body"),
  finalBody: text("final_body"),
  playType: text("play_type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDraftsLogSchema = createInsertSchema(draftsLog).omit({ id: true });
export type InsertDraftsLog = z.infer<typeof insertDraftsLogSchema>;
export type DraftsLog = typeof draftsLog.$inferSelect;

// Contact briefs table (Phase 3 — Context Engine)
export const contactBriefs = pgTable("contact_briefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  briefData: jsonb("brief_data").$type<Record<string, unknown>>().notNull(),
  modelVersion: text("model_version"),
  generatedAt: timestamp("generated_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contact_briefs_user_contact_unique").on(table.userId, table.contactId),
]);

export const insertContactBriefSchema = createInsertSchema(contactBriefs).omit({ id: true });
export type InsertContactBrief = z.infer<typeof insertContactBriefSchema>;
export type ContactBriefRow = typeof contactBriefs.$inferSelect;

// Network Index Jobs — tracks indexing progress for the UI
export const networkIndexJobs = pgTable("network_index_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  threadsScanned: integer("threads_scanned").default(0),
  contactsFound: integer("contacts_found").default(0),
  contactsUpdated: integer("contacts_updated").default(0),
  errors: jsonb("errors").$type<string[]>().default([]),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNetworkIndexJobSchema = createInsertSchema(networkIndexJobs).omit({ id: true });
export type InsertNetworkIndexJob = z.infer<typeof insertNetworkIndexJobSchema>;
export type NetworkIndexJob = typeof networkIndexJobs.$inferSelect;

export const warmthTiers = ["vip", "warm", "cool", "cold"] as const;
export type WarmthTier = typeof warmthTiers[number];

// ─── Email Sequences ─────────────────────────────────────────────────────────

export const sequenceTemplates = pgTable("sequence_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  steps: jsonb("steps").$type<Array<{ stepNumber: number; delayDays: number; instructions: string }>>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSequenceTemplateSchema = createInsertSchema(sequenceTemplates).omit({ id: true });
export type InsertSequenceTemplate = z.infer<typeof insertSequenceTemplateSchema>;
export type SequenceTemplate = typeof sequenceTemplates.$inferSelect;

export const sequences = pgTable("sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  templateId: varchar("template_id").references(() => sequenceTemplates.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("sequences_user_id_idx").on(table.userId),
  index("sequences_contact_id_idx").on(table.contactId),
]);

export const insertSequenceSchema = createInsertSchema(sequences).omit({ id: true });
export type InsertSequence = z.infer<typeof insertSequenceSchema>;
export type Sequence = typeof sequences.$inferSelect;

export const sequenceSteps = pgTable("sequence_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: varchar("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  delayDays: integer("delay_days").notNull().default(0),
  subject: text("subject"),
  instructions: text("instructions").notNull(),
  status: text("status").notNull().default("pending"),
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  draftId: text("draft_id"),
  threadId: text("thread_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSequenceStepSchema = createInsertSchema(sequenceSteps).omit({ id: true });
export type InsertSequenceStep = z.infer<typeof insertSequenceStepSchema>;
export type SequenceStep = typeof sequenceSteps.$inferSelect;

export const sequenceStatuses = ["active", "completed", "paused", "cancelled"] as const;
export type SequenceStatus = typeof sequenceStatuses[number];

export const stepStatuses = ["pending", "due", "sent", "skipped"] as const;
export type StepStatus = typeof stepStatuses[number];

// ─── Email Type Review Gate ──────────────────────────────────────────────────

export const emailTypeRules = pgTable("email_type_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  signatureHash: text("signature_hash").notNull(),
  label: text("label").notNull(),
  decision: text("decision").notNull(), // accept | reject
  examples: jsonb("examples").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("email_type_rules_user_signature_unique").on(table.userId, table.signatureHash),
  index("email_type_rules_user_decision_idx").on(table.userId, table.decision),
]);

export const insertEmailTypeRuleSchema = createInsertSchema(emailTypeRules).omit({ id: true });
export type InsertEmailTypeRule = z.infer<typeof insertEmailTypeRuleSchema>;
export type EmailTypeRule = typeof emailTypeRules.$inferSelect;

export const indexReviewSessions = pgTable("index_review_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: varchar("job_id").references(() => networkIndexJobs.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending_review"), // pending_review | approved | cancelled
  summary: jsonb("summary").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("index_review_sessions_user_status_idx").on(table.userId, table.status),
]);

export const insertIndexReviewSessionSchema = createInsertSchema(indexReviewSessions).omit({ id: true });
export type InsertIndexReviewSession = z.infer<typeof insertIndexReviewSessionSchema>;
export type IndexReviewSession = typeof indexReviewSessions.$inferSelect;

export const indexReviewItems = pgTable("index_review_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => indexReviewSessions.id, { onDelete: "cascade" }),
  signatureHash: text("signature_hash").notNull(),
  proposedLabel: text("proposed_label").notNull(),
  exampleSubjects: jsonb("example_subjects").$type<string[]>().default([]),
  messageCount: integer("message_count").notNull().default(0),
  decision: text("decision"), // accept | reject | null
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("index_review_items_session_signature_unique").on(table.sessionId, table.signatureHash),
  index("index_review_items_session_decision_idx").on(table.sessionId, table.decision),
]);

export const insertIndexReviewItemSchema = createInsertSchema(indexReviewItems).omit({ id: true });
export type InsertIndexReviewItem = z.infer<typeof insertIndexReviewItemSchema>;
export type IndexReviewItem = typeof indexReviewItems.$inferSelect;
