import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const outreachAttempts = pgTable("outreach_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull(),
  dateSent: timestamp("date_sent").notNull().defaultNow(),
  outreachType: text("outreach_type").notNull(),
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
});

export const insertOutreachAttemptSchema = createInsertSchema(outreachAttempts).omit({ id: true, dateSent: true });
export type InsertOutreachAttempt = z.infer<typeof insertOutreachAttemptSchema>;
export type OutreachAttempt = typeof outreachAttempts.$inferSelect;

export const experiments = pgTable("experiments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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

export const outreachTypes = ["linkedin_connected", "linkedin_connect_request", "linkedin_inmail", "email"] as const;
export type OutreachType = typeof outreachTypes[number];

export const outreachGoals = ["intro_chat", "referral", "partnership", "recruiting", "advice"] as const;
export type OutreachGoal = typeof outreachGoals[number];

export const toneOptions = ["professional", "friendly", "direct"] as const;
export type ToneOption = typeof toneOptions[number];

export const lengthOptions = ["short", "medium", "long"] as const;
export type LengthOption = typeof lengthOptions[number];

export const variableOptions = ["hook", "cta", "length", "tone"] as const;
export type VariableOption = typeof variableOptions[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
