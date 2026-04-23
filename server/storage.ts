import { 
  contacts, type Contact, type InsertContact,
  outreachAttempts, type OutreachAttempt, type InsertOutreachAttempt,
  experiments, type Experiment, type InsertExperiment,
  settings, type Settings, type InsertSettings,
  airtableConfig, type AirtableConfig, type InsertAirtableConfig,
  researchPackets, type ResearchPacket, type InsertResearchPacket,
  integrationConnections, type IntegrationConnection, type InsertIntegrationConnection,
  meetings, type Meeting, type InsertMeeting,
  contactMeetings, type ContactMeeting, type InsertContactMeeting,
  interactions, type Interaction, type InsertInteraction,
  actions, type Action, type InsertAction,
  draftsLog, type DraftsLog, type InsertDraftsLog,
  contactBriefs, type ContactBriefRow, type InsertContactBrief,
  networkIndexJobs, type NetworkIndexJob, type InsertNetworkIndexJob,
  sequences, type Sequence, type InsertSequence,
  sequenceSteps, type SequenceStep, type InsertSequenceStep,
  sequenceTemplates, type SequenceTemplate, type InsertSequenceTemplate,
  emailTypeRules, type EmailTypeRule, type InsertEmailTypeRule,
  indexReviewSessions, type IndexReviewSession, type InsertIndexReviewSession,
  indexReviewItems, type IndexReviewItem, type InsertIndexReviewItem,
  users, type User, type InsertUser
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, inArray, and, or, lte, gt, isNull, sql as drizzleSql, getTableColumns } from "drizzle-orm";

/**
 * ActionWithContact — an Action row with joined contact fields
 * (name, company, email) from the contacts table.
 * Returned by getActions() so the UI can render contact info without
 * a separate API call.
 */
export type ActionWithContact = Action & {
  contactName: string | null;
  contactCompany: string | null;
  contactEmail: string | null;
};

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Contacts
  getContacts(userId: string, options?: { sort?: string; order?: string }): Promise<Contact[]>;
  getContact(id: string, userId: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, userId: string, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  upsertContact(contact: Contact, userId: string): Promise<Contact>;
  deleteContact(id: string, userId: string): Promise<boolean>;
  deleteContacts(ids: string[], userId: string): Promise<number>;

  // Outreach Attempts
  getOutreachAttempts(userId: string): Promise<OutreachAttempt[]>;
  getOutreachAttempt(id: string, userId: string): Promise<OutreachAttempt | undefined>;
  getOutreachAttemptsByContact(contactId: string, userId: string): Promise<OutreachAttempt[]>;
  createOutreachAttempt(attempt: InsertOutreachAttempt): Promise<OutreachAttempt>;
  updateOutreachAttempt(id: string, userId: string, attempt: Partial<InsertOutreachAttempt>): Promise<OutreachAttempt | undefined>;
  deleteOutreachAttempt(id: string, userId: string): Promise<boolean>;
  deleteOutreachAttempts(ids: string[], userId: string): Promise<number>;

  // Experiments
  getExperiments(userId: string): Promise<Experiment[]>;
  getExperiment(id: string, userId: string): Promise<Experiment | undefined>;
  createExperiment(experiment: InsertExperiment): Promise<Experiment>;
  updateExperiment(id: string, userId: string, experiment: Partial<InsertExperiment>): Promise<Experiment | undefined>;
  deleteExperiment(id: string, userId: string): Promise<boolean>;

  // Settings
  getSettings(userId: string): Promise<Settings | undefined>;
  createSettings(settings: InsertSettings): Promise<Settings>;
  updateSettings(id: string, userId: string, settings: Partial<InsertSettings>): Promise<Settings | undefined>;

  // Airtable Config
  getAirtableConfig(userId: string): Promise<AirtableConfig | undefined>;
  saveAirtableConfig(config: InsertAirtableConfig): Promise<AirtableConfig>;
  updateAirtableConfig(id: string, userId: string, config: Partial<InsertAirtableConfig>): Promise<AirtableConfig | undefined>;
  deleteAirtableConfig(userId: string): Promise<boolean>;

  // Research Packets
  getResearchPacket(contactId: string, userId: string): Promise<ResearchPacket | undefined>;
  getResearchPacketsByContactIds(contactIds: string[], userId: string): Promise<ResearchPacket[]>;
  getAllResearchPackets(userId: string): Promise<ResearchPacket[]>;
  upsertResearchPacket(contactId: string, data: Partial<Omit<InsertResearchPacket, "contactId">>, userId: string): Promise<ResearchPacket>;

  // Integration Connections
  getIntegrationConnection(provider: string, userId: string): Promise<IntegrationConnection | undefined>;
  getAllIntegrationConnections(userId: string): Promise<IntegrationConnection[]>;
  upsertIntegrationConnection(provider: string, userId: string, data: Partial<Omit<InsertIntegrationConnection, "provider" | "userId">>): Promise<IntegrationConnection>;
  deleteIntegrationConnection(provider: string, userId: string): Promise<boolean>;

  // Meetings
  getMeetings(userId: string): Promise<Meeting[]>;
  getMeeting(id: string, userId: string): Promise<Meeting | undefined>;
  getMeetingByExternalId(source: string, externalId: string, userId: string): Promise<Meeting | undefined>;
  createMeeting(meeting: InsertMeeting): Promise<Meeting>;
  updateMeeting(id: string, userId: string, meeting: Partial<InsertMeeting>): Promise<Meeting | undefined>;
  upsertMeetingByExternalId(source: string, externalId: string, userId: string, data: Partial<InsertMeeting>): Promise<Meeting>;

  // Contact-Meeting Links
  getContactMeetings(contactId: string): Promise<(ContactMeeting & { meeting: Meeting })[]>;
  getMeetingContacts(meetingId: string): Promise<ContactMeeting[]>;
  linkContactToMeeting(data: InsertContactMeeting): Promise<ContactMeeting>;
  unlinkContactFromMeeting(contactId: string, meetingId: string): Promise<boolean>;

  // Interactions
  getInteractions(userId: string, contactId?: string): Promise<Interaction[]>;
  getInteraction(id: string, userId: string): Promise<Interaction | undefined>;
  createInteraction(interaction: InsertInteraction): Promise<Interaction>;
  updateInteraction(id: string, userId: string, data: Partial<InsertInteraction>): Promise<Interaction | undefined>;
  deleteInteraction(id: string, userId: string): Promise<boolean>;
  getInteractionBySourceId(channel: string, sourceId: string, userId: string): Promise<Interaction | undefined>;

  // Actions (Phase 2)
  getActions(userId: string, filters?: { status?: string; type?: string; limit?: number; offset?: number }): Promise<ActionWithContact[]>;
  getAction(id: string, userId: string): Promise<Action | undefined>;
  getActionWithContact(id: string, userId: string): Promise<ActionWithContact | undefined>;
  createAction(action: InsertAction): Promise<Action>;
  updateAction(id: string, userId: string, data: Partial<InsertAction>): Promise<Action | undefined>;
  deleteAction(id: string, userId: string): Promise<boolean>;

  // DraftsLog (Phase 2)
  getDraftsLogs(userId: string, contactId?: string): Promise<DraftsLog[]>;
  getDraftsLog(id: string, userId: string): Promise<DraftsLog | undefined>;
  createDraftsLog(draft: InsertDraftsLog): Promise<DraftsLog>;
  updateDraftsLog(id: string, userId: string, data: Partial<InsertDraftsLog>): Promise<DraftsLog | undefined>;

  // Contact Briefs (Phase 3)
  getContactBrief(contactId: string, userId: string): Promise<ContactBriefRow | undefined>;
  upsertContactBrief(contactId: string, userId: string, data: { briefData: Record<string, unknown>; modelVersion: string | null; generatedAt: Date }): Promise<ContactBriefRow>;

  // Network Index Jobs
  createNetworkIndexJob(job: InsertNetworkIndexJob): Promise<NetworkIndexJob>;
  getNetworkIndexJob(id: string, userId: string): Promise<NetworkIndexJob | undefined>;
  getLatestNetworkIndexJob(userId: string): Promise<NetworkIndexJob | undefined>;
  updateNetworkIndexJob(id: string, userId: string, data: Partial<InsertNetworkIndexJob>): Promise<NetworkIndexJob | undefined>;

  // Contacts — email lookup
  getContactByEmail(email: string, userId: string): Promise<Contact | undefined>;

  // Sequences
  getSequences(userId: string, filters?: { status?: string; contactId?: string }): Promise<Sequence[]>;
  getSequence(id: string, userId: string): Promise<Sequence | undefined>;
  createSequence(seq: InsertSequence): Promise<Sequence>;
  updateSequence(id: string, userId: string, data: Partial<InsertSequence>): Promise<Sequence | undefined>;

  // Sequence Steps
  getSequenceSteps(sequenceId: string): Promise<SequenceStep[]>;
  getSequenceStep(id: string): Promise<SequenceStep | undefined>;
  createSequenceStep(step: InsertSequenceStep): Promise<SequenceStep>;
  updateSequenceStep(id: string, data: Partial<InsertSequenceStep>): Promise<SequenceStep | undefined>;
  getDueSequenceSteps(userId: string): Promise<(SequenceStep & { sequenceName: string; contactId: string })[]>;

  // Sequence Templates
  getSequenceTemplates(userId: string): Promise<SequenceTemplate[]>;
  getSequenceTemplate(id: string, userId: string): Promise<SequenceTemplate | undefined>;
  createSequenceTemplate(template: InsertSequenceTemplate): Promise<SequenceTemplate>;
  updateSequenceTemplate(id: string, userId: string, data: Partial<InsertSequenceTemplate>): Promise<SequenceTemplate | undefined>;
  deleteSequenceTemplate(id: string, userId: string): Promise<boolean>;

  // Email Type Rules
  getEmailTypeRules(userId: string): Promise<EmailTypeRule[]>;
  getEmailTypeRuleBySignature(userId: string, signatureHash: string): Promise<EmailTypeRule | undefined>;
  upsertEmailTypeRule(userId: string, signatureHash: string, data: Omit<InsertEmailTypeRule, "userId" | "signatureHash">): Promise<EmailTypeRule>;
  getRejectedEmailTypeSignatures(userId: string): Promise<Set<string>>;

  // Index Review Sessions
  createIndexReviewSession(session: InsertIndexReviewSession): Promise<IndexReviewSession>;
  getIndexReviewSession(id: string, userId: string): Promise<IndexReviewSession | undefined>;
  getLatestPendingIndexReviewSession(userId: string): Promise<IndexReviewSession | undefined>;
  updateIndexReviewSession(id: string, userId: string, data: Partial<InsertIndexReviewSession>): Promise<IndexReviewSession | undefined>;
  createIndexReviewItem(item: InsertIndexReviewItem): Promise<IndexReviewItem>;
  getIndexReviewItems(sessionId: string): Promise<IndexReviewItem[]>;
  updateIndexReviewItemDecision(sessionId: string, signatureHash: string, decision: "accept" | "reject"): Promise<IndexReviewItem | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  // Contacts
  async getContacts(userId: string, options?: { sort?: string; order?: string }): Promise<Contact[]> {
    if (options?.sort === "last_interaction_at") {
      // Sort by lastInteractionAt with NULLS LAST
      if (options.order === "asc") {
        return await db.select().from(contacts)
          .where(eq(contacts.userId, userId))
          .orderBy(drizzleSql`${contacts.lastInteractionAt} ASC NULLS LAST`);
      } else {
        return await db.select().from(contacts)
          .where(eq(contacts.userId, userId))
          .orderBy(drizzleSql`${contacts.lastInteractionAt} DESC NULLS LAST`);
      }
    }
    return await db.select().from(contacts)
      .where(eq(contacts.userId, userId))
      .orderBy(contacts.createdAt);
  }

  async getContact(id: string, userId: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
    return contact;
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    // userId is optional in InsertContact (Zod schema) for backward compat, but
    // required at the DB level. Callers must always supply userId (from req.user.id
    // or the seed user fallback) before calling createContact.
    const userId = insertContact.userId;
    if (!userId) {
      throw new Error("userId is required for createContact — set req.user.id or seed user id before calling");
    }
    const [contact] = await db.insert(contacts).values({
      ...insertContact,
      userId,
    }).returning();
    return contact;
  }

  async updateContact(id: string, userId: string, contact: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db.update(contacts)
      .set({ ...contact, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
      .returning();
    return updated;
  }

  async deleteContact(id: string, userId: string): Promise<boolean> {
    const [deleted] = await db.delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
      .returning();
    return !!deleted;
  }

  async deleteContacts(ids: string[], userId: string): Promise<number> {
    const results = await Promise.all(
      ids.map(id => db.delete(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
        .returning())
    );
    return results.filter(r => r.length > 0).length;
  }

  async upsertContact(contact: Contact, userId: string): Promise<Contact> {
    const existing = await this.getContact(contact.id, userId);
    if (existing) {
      const [updated] = await db
        .update(contacts)
        .set({
          name: contact.name,
          company: contact.company,
          role: contact.role,
          linkedinUrl: contact.linkedinUrl,
          email: contact.email,
          headline: contact.headline,
          about: contact.about,
          location: contact.location,
          experience: contact.experience,
          education: contact.education,
          skills: contact.skills,
          keywords: contact.keywords,
          notes: contact.notes,
          tags: contact.tags,
          researchStatus: contact.researchStatus,
          researchData: contact.researchData,
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.id, contact.id), eq(contacts.userId, userId)))
        .returning();
      return updated!;
    }
    const [created] = await db
      .insert(contacts)
      .values({
        id: contact.id,
        userId,
        name: contact.name,
        company: contact.company,
        role: contact.role,
        linkedinUrl: contact.linkedinUrl,
        email: contact.email,
        headline: contact.headline,
        about: contact.about,
        location: contact.location,
        experience: contact.experience,
        education: contact.education,
        skills: contact.skills,
        keywords: contact.keywords,
        notes: contact.notes,
        tags: contact.tags,
        researchStatus: contact.researchStatus,
        researchData: contact.researchData,
      })
      .returning();
    return created!;
  }

  // Outreach Attempts
  async getOutreachAttempts(userId: string): Promise<OutreachAttempt[]> {
    return await db.select().from(outreachAttempts)
      .where(eq(outreachAttempts.userId, userId))
      .orderBy(desc(outreachAttempts.dateSent));
  }

  async getOutreachAttempt(id: string, userId: string): Promise<OutreachAttempt | undefined> {
    const [attempt] = await db.select().from(outreachAttempts)
      .where(and(eq(outreachAttempts.id, id), eq(outreachAttempts.userId, userId)));
    return attempt;
  }

  async getOutreachAttemptsByContact(contactId: string, userId: string): Promise<OutreachAttempt[]> {
    return await db.select().from(outreachAttempts)
      .where(and(eq(outreachAttempts.contactId, contactId), eq(outreachAttempts.userId, userId)));
  }

  async createOutreachAttempt(attempt: InsertOutreachAttempt): Promise<OutreachAttempt> {
    const [newAttempt] = await db.insert(outreachAttempts).values(attempt).returning();
    return newAttempt;
  }

  async updateOutreachAttempt(id: string, userId: string, attempt: Partial<InsertOutreachAttempt>): Promise<OutreachAttempt | undefined> {
    const [updated] = await db.update(outreachAttempts).set(attempt)
      .where(and(eq(outreachAttempts.id, id), eq(outreachAttempts.userId, userId)))
      .returning();
    return updated;
  }

  async deleteOutreachAttempt(id: string, userId: string): Promise<boolean> {
    const [deleted] = await db.delete(outreachAttempts)
      .where(and(eq(outreachAttempts.id, id), eq(outreachAttempts.userId, userId)))
      .returning();
    return !!deleted;
  }

  async deleteOutreachAttempts(ids: string[], userId: string): Promise<number> {
    const results = await Promise.all(
      ids.map(id => db.delete(outreachAttempts)
        .where(and(eq(outreachAttempts.id, id), eq(outreachAttempts.userId, userId)))
        .returning())
    );
    return results.filter(r => r.length > 0).length;
  }

  // Experiments
  async getExperiments(userId: string): Promise<Experiment[]> {
    return await db.select().from(experiments)
      .where(eq(experiments.userId, userId))
      .orderBy(desc(experiments.id));
  }

  async getExperiment(id: string, userId: string): Promise<Experiment | undefined> {
    const [experiment] = await db.select().from(experiments)
      .where(and(eq(experiments.id, id), eq(experiments.userId, userId)));
    return experiment;
  }

  async createExperiment(experiment: InsertExperiment): Promise<Experiment> {
    const [newExperiment] = await db.insert(experiments).values(experiment).returning();
    return newExperiment;
  }

  async updateExperiment(id: string, userId: string, experiment: Partial<InsertExperiment>): Promise<Experiment | undefined> {
    const [updated] = await db.update(experiments).set(experiment)
      .where(and(eq(experiments.id, id), eq(experiments.userId, userId)))
      .returning();
    return updated;
  }

  async deleteExperiment(id: string, userId: string): Promise<boolean> {
    const [deleted] = await db.delete(experiments)
      .where(and(eq(experiments.id, id), eq(experiments.userId, userId)))
      .returning();
    return !!deleted;
  }

  // Settings
  async getSettings(userId: string): Promise<Settings | undefined> {
    const [s] = await db.select().from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);
    return s;
  }

  async createSettings(insertSettings: InsertSettings): Promise<Settings> {
    const [s] = await db.insert(settings).values(insertSettings).returning();
    return s;
  }

  async updateSettings(id: string, userId: string, update: Partial<InsertSettings>): Promise<Settings | undefined> {
    const [updated] = await db.update(settings).set(update)
      .where(and(eq(settings.id, id), eq(settings.userId, userId)))
      .returning();
    return updated;
  }

  // Airtable Config
  async getAirtableConfig(userId: string): Promise<AirtableConfig | undefined> {
    const [config] = await db.select().from(airtableConfig)
      .where(eq(airtableConfig.userId, userId))
      .limit(1);
    return config;
  }

  async saveAirtableConfig(config: InsertAirtableConfig): Promise<AirtableConfig> {
    await db.delete(airtableConfig).where(eq(airtableConfig.userId, config.userId));
    const [saved] = await db.insert(airtableConfig).values(config).returning();
    return saved;
  }

  async updateAirtableConfig(id: string, userId: string, config: Partial<InsertAirtableConfig>): Promise<AirtableConfig | undefined> {
    const [updated] = await db.update(airtableConfig).set(config)
      .where(and(eq(airtableConfig.id, id), eq(airtableConfig.userId, userId)))
      .returning();
    return updated;
  }

  async deleteAirtableConfig(userId: string): Promise<boolean> {
    const result = await db.delete(airtableConfig)
      .where(eq(airtableConfig.userId, userId))
      .returning();
    return result.length > 0;
  }

  // Research Packets
  async getResearchPacket(contactId: string, userId: string): Promise<ResearchPacket | undefined> {
    const [packet] = await db.select().from(researchPackets)
      .where(and(eq(researchPackets.contactId, contactId), eq(researchPackets.userId, userId)));
    return packet;
  }

  async getResearchPacketsByContactIds(contactIds: string[], userId: string): Promise<ResearchPacket[]> {
    if (contactIds.length === 0) return [];
    return await db
      .select()
      .from(researchPackets)
      .where(and(inArray(researchPackets.contactId, contactIds), eq(researchPackets.userId, userId)));
  }

  async getAllResearchPackets(userId: string): Promise<ResearchPacket[]> {
    const userContacts = await this.getContacts(userId);
    const contactIds = userContacts.map(c => c.id);
    if (contactIds.length === 0) return [];
    return await db.select().from(researchPackets)
      .where(inArray(researchPackets.contactId, contactIds));
  }

  async upsertResearchPacket(contactId: string, data: Partial<Omit<InsertResearchPacket, "contactId">>, userId: string): Promise<ResearchPacket> {
    const now = new Date();
    const [packet] = await db
      .insert(researchPackets)
      .values({
        contactId,
        userId: userId,
        status: data.status ?? "not_started",
        prospectSnapshot: data.prospectSnapshot ?? null,
        companySnapshot: data.companySnapshot ?? null,
        signalsHooks: (data.signalsHooks as string[] | null | undefined) ?? [],
        personalizedMessage: data.personalizedMessage ?? null,
        variants: (data.variants as unknown[] | null | undefined) ?? [],
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: researchPackets.contactId,
        set: {
          ...(data.status !== undefined && { status: data.status }),
          ...(data.prospectSnapshot !== undefined && { prospectSnapshot: data.prospectSnapshot }),
          ...(data.companySnapshot !== undefined && { companySnapshot: data.companySnapshot }),
          ...(data.signalsHooks !== undefined && { signalsHooks: data.signalsHooks as string[] }),
          ...(data.personalizedMessage !== undefined && { personalizedMessage: data.personalizedMessage }),
          ...(data.variants !== undefined && { variants: data.variants as unknown[] }),
          updatedAt: now,
        },
      })
      .returning();
    return packet!;
  }

  // Integration Connections
  async getIntegrationConnection(provider: string, userId: string): Promise<IntegrationConnection | undefined> {
    const [conn] = await db.select().from(integrationConnections)
      .where(and(eq(integrationConnections.provider, provider), eq(integrationConnections.userId, userId)));
    return conn;
  }

  async getAllIntegrationConnections(userId: string): Promise<IntegrationConnection[]> {
    return await db.select().from(integrationConnections)
      .where(eq(integrationConnections.userId, userId));
  }

  async upsertIntegrationConnection(provider: string, userId: string, data: Partial<Omit<InsertIntegrationConnection, "provider" | "userId">>): Promise<IntegrationConnection> {
    const now = new Date();
    const existing = await this.getIntegrationConnection(provider, userId);
    if (existing) {
      const [updated] = await db
        .update(integrationConnections)
        .set({ ...data, updatedAt: now })
        .where(and(eq(integrationConnections.provider, provider), eq(integrationConnections.userId, userId)))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(integrationConnections)
      .values({
        provider,
        userId,
        accessToken: data.accessToken ?? "",
        refreshToken: data.refreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
        scopes: data.scopes,
        providerAccountId: data.providerAccountId,
        isConnected: data.isConnected ?? true,
        metadata: data.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created;
  }

  async deleteIntegrationConnection(provider: string, userId: string): Promise<boolean> {
    const result = await db.delete(integrationConnections)
      .where(and(eq(integrationConnections.provider, provider), eq(integrationConnections.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // Meetings
  async getMeetings(userId: string): Promise<Meeting[]> {
    return await db.select().from(meetings)
      .where(eq(meetings.userId, userId))
      .orderBy(desc(meetings.startTime));
  }

  async getMeeting(id: string, userId: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings)
      .where(and(eq(meetings.id, id), eq(meetings.userId, userId)));
    return meeting;
  }

  async getMeetingByExternalId(source: string, externalId: string, userId: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings)
      .where(and(eq(meetings.source, source), eq(meetings.externalId, externalId), eq(meetings.userId, userId)));
    return meeting;
  }

  async createMeeting(meeting: InsertMeeting): Promise<Meeting> {
    const values = {
      ...meeting,
      attendees: meeting.attendees ? [...meeting.attendees] as Array<{ email?: string; name?: string; self?: boolean }> : [],
      actionItems: meeting.actionItems ? [...meeting.actionItems] as string[] : [],
    };
    const [created] = await db.insert(meetings).values(values).returning();
    return created;
  }

  async updateMeeting(id: string, userId: string, meeting: Partial<InsertMeeting>): Promise<Meeting | undefined> {
    const now = new Date();
    const updatePayload: Record<string, unknown> = { updatedAt: now };
    if (meeting.title !== undefined) updatePayload.title = meeting.title;
    if (meeting.startTime !== undefined) updatePayload.startTime = meeting.startTime;
    if (meeting.endTime !== undefined) updatePayload.endTime = meeting.endTime;
    if (meeting.notes !== undefined) updatePayload.notes = meeting.notes;
    if (meeting.transcript !== undefined) updatePayload.transcript = meeting.transcript;
    if (meeting.summary !== undefined) updatePayload.summary = meeting.summary;
    if (meeting.attendees !== undefined) updatePayload.attendees = meeting.attendees ? Array.from(meeting.attendees) as Array<{ email?: string; name?: string; self?: boolean }> : [];
    if (meeting.actionItems !== undefined) updatePayload.actionItems = meeting.actionItems ? Array.from(meeting.actionItems) as string[] : [];
    const [updated] = await db.update(meetings).set(updatePayload)
      .where(and(eq(meetings.id, id), eq(meetings.userId, userId)))
      .returning();
    return updated;
  }

  async upsertMeetingByExternalId(source: string, externalId: string, userId: string, data: Partial<InsertMeeting>): Promise<Meeting> {
    const now = new Date();
    const attendeesArr = data.attendees ? [...data.attendees] as Array<{ email?: string; name?: string; self?: boolean }> : [];
    const actionItemsArr = data.actionItems ? [...data.actionItems] as string[] : [];
    const existing = await this.getMeetingByExternalId(source, externalId, userId);
    if (existing) {
      const updatePayload: Record<string, unknown> = { updatedAt: now };
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.startTime !== undefined) updatePayload.startTime = data.startTime;
      if (data.endTime !== undefined) updatePayload.endTime = data.endTime;
      if (data.attendees !== undefined) updatePayload.attendees = attendeesArr;
      if (data.notes !== undefined) updatePayload.notes = data.notes;
      if (data.transcript !== undefined) updatePayload.transcript = data.transcript;
      if (data.summary !== undefined) updatePayload.summary = data.summary;
      if (data.actionItems !== undefined) updatePayload.actionItems = actionItemsArr;
      const [updated] = await db
        .update(meetings)
        .set(updatePayload)
        .where(and(eq(meetings.id, existing.id), eq(meetings.userId, userId)))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(meetings)
      .values({
        source,
        externalId,
        userId,
        title: data.title ?? null,
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        attendees: attendeesArr,
        notes: data.notes ?? null,
        transcript: data.transcript ?? null,
        summary: data.summary ?? null,
        actionItems: actionItemsArr,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created;
  }

  // Contact-Meeting Links
  async getContactMeetings(contactId: string): Promise<(ContactMeeting & { meeting: Meeting })[]> {
    const links = await db.select().from(contactMeetings).where(eq(contactMeetings.contactId, contactId));
    if (links.length === 0) return [];
    const meetingIds = links.map(l => l.meetingId);
    const meetingRows = await db.select().from(meetings).where(inArray(meetings.id, meetingIds));
    const meetingMap = new Map(meetingRows.map(m => [m.id, m]));
    return links
      .filter(l => meetingMap.has(l.meetingId))
      .map(l => ({ ...l, meeting: meetingMap.get(l.meetingId)! }));
  }

  async getMeetingContacts(meetingId: string): Promise<ContactMeeting[]> {
    return await db.select().from(contactMeetings).where(eq(contactMeetings.meetingId, meetingId));
  }

  async linkContactToMeeting(data: InsertContactMeeting): Promise<ContactMeeting> {
    const existing = await db.select().from(contactMeetings)
      .where(and(eq(contactMeetings.contactId, data.contactId), eq(contactMeetings.meetingId, data.meetingId)));
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(contactMeetings).values(data).returning();
    return created;
  }

  async unlinkContactFromMeeting(contactId: string, meetingId: string): Promise<boolean> {
    const result = await db.delete(contactMeetings)
      .where(and(eq(contactMeetings.contactId, contactId), eq(contactMeetings.meetingId, meetingId)))
      .returning();
    return result.length > 0;
  }

  // Interactions
  async getInteractions(userId: string, contactId?: string): Promise<Interaction[]> {
    if (contactId !== undefined) {
      return await db
        .select()
        .from(interactions)
        .where(and(eq(interactions.userId, userId), eq(interactions.contactId, contactId)))
        .orderBy(desc(interactions.occurredAt));
    }
    return await db
      .select()
      .from(interactions)
      .where(eq(interactions.userId, userId))
      .orderBy(desc(interactions.occurredAt));
  }

  async getInteraction(id: string, userId: string): Promise<Interaction | undefined> {
    const [interaction] = await db
      .select()
      .from(interactions)
      .where(and(eq(interactions.id, id), eq(interactions.userId, userId)));
    return interaction;
  }

  async createInteraction(interaction: InsertInteraction): Promise<Interaction> {
    // Truncate raw_content to 10,000 characters if needed
    const rawContent =
      interaction.rawContent != null && interaction.rawContent.length > 10000
        ? interaction.rawContent.slice(0, 10000)
        : interaction.rawContent;

    const [created] = await db
      .insert(interactions)
      .values({ ...interaction, rawContent })
      .returning();

    // Update parent contact's last_interaction_at and last_interaction_channel
    // only if the new interaction's occurred_at is newer than the current value
    const contact = await this.getContact(created.contactId, created.userId);
    if (contact) {
      const currentLastAt = contact.lastInteractionAt;
      if (
        currentLastAt === null ||
        currentLastAt === undefined ||
        created.occurredAt.getTime() > currentLastAt.getTime()
      ) {
        await db
          .update(contacts)
          .set({
            lastInteractionAt: created.occurredAt,
            lastInteractionChannel: created.channel,
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, created.contactId));
      }
    }

    return created;
  }

  async updateInteraction(id: string, userId: string, data: Partial<InsertInteraction>): Promise<Interaction | undefined> {
    const [updated] = await db
      .update(interactions)
      .set(data)
      .where(and(eq(interactions.id, id), eq(interactions.userId, userId)))
      .returning();
    return updated;
  }

  async deleteInteraction(id: string, userId: string): Promise<boolean> {
    const [deleted] = await db
      .delete(interactions)
      .where(and(eq(interactions.id, id), eq(interactions.userId, userId)))
      .returning();
    return !!deleted;
  }

  async getInteractionBySourceId(channel: string, sourceId: string, userId: string): Promise<Interaction | undefined> {
    const [interaction] = await db
      .select()
      .from(interactions)
      .where(and(eq(interactions.channel, channel), eq(interactions.sourceId, sourceId), eq(interactions.userId, userId)));
    return interaction;
  }

  // ─── Actions (Phase 2) ─────────────────────────────────────────────────────

  async getActions(
    userId: string,
    filters?: { status?: string; type?: string; limit?: number; offset?: number }
  ): Promise<ActionWithContact[]> {
    const now = new Date();
    const conditions: ReturnType<typeof eq>[] = [eq(actions.userId, userId)];

    if (filters?.type) {
      conditions.push(eq(actions.actionType, filters.type));
    }

    if (filters?.status === "pending") {
      // pending: include status='pending' AND (snoozed actions where snoozed_until <= now)
      // Exclude future-snoozed (status='snoozed' AND snoozed_until > now)
      const statusCondition = or(
        and(eq(actions.status, "pending")),
        and(eq(actions.status, "snoozed"), lte(actions.snoozedUntil, now))
      );
      conditions.push(statusCondition!);
    } else if (filters?.status) {
      conditions.push(eq(actions.status, filters.status));
    }

    // Join contacts table to include contactName, contactCompany, contactEmail
    let query = db
      .select({
        ...getTableColumns(actions),
        contactName: contacts.name,
        contactCompany: contacts.company,
        contactEmail: contacts.email,
      })
      .from(actions)
      .leftJoin(contacts, eq(actions.contactId, contacts.id))
      .where(and(...conditions))
      .orderBy(desc(actions.priority), desc(actions.createdAt));

    if (filters?.limit !== undefined) {
      query = query.limit(filters.limit) as typeof query;
    }
    if (filters?.offset !== undefined) {
      query = query.offset(filters.offset) as typeof query;
    }

    return await query;
  }

  async getAction(id: string, userId: string): Promise<Action | undefined> {
    const [action] = await db
      .select()
      .from(actions)
      .where(and(eq(actions.id, id), eq(actions.userId, userId)));
    return action;
  }

  async getActionWithContact(id: string, userId: string): Promise<ActionWithContact | undefined> {
    const [result] = await db
      .select({
        ...getTableColumns(actions),
        contactName: contacts.name,
        contactCompany: contacts.company,
        contactEmail: contacts.email,
      })
      .from(actions)
      .leftJoin(contacts, eq(actions.contactId, contacts.id))
      .where(and(eq(actions.id, id), eq(actions.userId, userId)));
    return result;
  }

  async createAction(action: InsertAction): Promise<Action> {
    const [created] = await db.insert(actions).values(action).returning();
    return created;
  }

  async updateAction(
    id: string,
    userId: string,
    data: Partial<InsertAction>
  ): Promise<Action | undefined> {
    const updateData: Partial<InsertAction> & { completedAt?: Date | null; snoozedUntil?: Date | null } = { ...data };

    // Auto-set completedAt when transitioning to completed or dismissed
    if (data.status === "completed" || data.status === "dismissed") {
      updateData.completedAt = new Date();
    }

    // Clear snoozedUntil when transitioning away from snoozed to another status
    // (but not when explicitly setting snoozedUntil in the same update)
    if (data.status && data.status !== "snoozed" && !("snoozedUntil" in data)) {
      // Check if the action was snoozed before
      const existing = await this.getAction(id, userId);
      if (existing?.status === "snoozed") {
        updateData.snoozedUntil = null;
      }
    }

    const [updated] = await db
      .update(actions)
      .set(updateData)
      .where(and(eq(actions.id, id), eq(actions.userId, userId)))
      .returning();
    return updated;
  }

  async deleteAction(id: string, userId: string): Promise<boolean> {
    const [deleted] = await db
      .delete(actions)
      .where(and(eq(actions.id, id), eq(actions.userId, userId)))
      .returning();
    return !!deleted;
  }

  // ─── DraftsLog (Phase 2) ──────────────────────────────────────────────────

  async getDraftsLogs(userId: string, contactId?: string): Promise<DraftsLog[]> {
    if (contactId !== undefined) {
      return await db
        .select()
        .from(draftsLog)
        .where(and(eq(draftsLog.userId, userId), eq(draftsLog.contactId, contactId)))
        .orderBy(desc(draftsLog.createdAt));
    }
    return await db
      .select()
      .from(draftsLog)
      .where(eq(draftsLog.userId, userId))
      .orderBy(desc(draftsLog.createdAt));
  }

  async getDraftsLog(id: string, userId: string): Promise<DraftsLog | undefined> {
    const [draft] = await db
      .select()
      .from(draftsLog)
      .where(and(eq(draftsLog.id, id), eq(draftsLog.userId, userId)));
    return draft;
  }

  async createDraftsLog(draft: InsertDraftsLog): Promise<DraftsLog> {
    const [created] = await db.insert(draftsLog).values(draft).returning();
    return created;
  }

  async updateDraftsLog(
    id: string,
    userId: string,
    data: Partial<InsertDraftsLog>
  ): Promise<DraftsLog | undefined> {
    const [updated] = await db
      .update(draftsLog)
      .set(data)
      .where(and(eq(draftsLog.id, id), eq(draftsLog.userId, userId)))
      .returning();
    return updated;
  }

  // ─── Contact Briefs (Phase 3) ─────────────────────────────────────────────

  async getContactBrief(contactId: string, userId: string): Promise<ContactBriefRow | undefined> {
    const [brief] = await db
      .select()
      .from(contactBriefs)
      .where(and(eq(contactBriefs.contactId, contactId), eq(contactBriefs.userId, userId)));
    return brief;
  }

  async upsertContactBrief(
    contactId: string,
    userId: string,
    data: { briefData: Record<string, unknown>; modelVersion: string | null; generatedAt: Date }
  ): Promise<ContactBriefRow> {
    const [result] = await db
      .insert(contactBriefs)
      .values({
        userId,
        contactId,
        briefData: data.briefData,
        modelVersion: data.modelVersion,
        generatedAt: data.generatedAt,
      })
      .onConflictDoUpdate({
        target: [contactBriefs.userId, contactBriefs.contactId],
        set: {
          briefData: data.briefData,
          modelVersion: data.modelVersion,
          generatedAt: data.generatedAt,
        },
      })
      .returning();
    return result;
  }

  // ─── Network Index Jobs ──────────────────────────────────────────────────

  async createNetworkIndexJob(job: InsertNetworkIndexJob): Promise<NetworkIndexJob> {
    const [created] = await db.insert(networkIndexJobs).values(job as any).returning();
    return created;
  }

  async getNetworkIndexJob(id: string, userId: string): Promise<NetworkIndexJob | undefined> {
    const [job] = await db.select().from(networkIndexJobs)
      .where(and(eq(networkIndexJobs.id, id), eq(networkIndexJobs.userId, userId)));
    return job;
  }

  async getLatestNetworkIndexJob(userId: string): Promise<NetworkIndexJob | undefined> {
    const [job] = await db.select().from(networkIndexJobs)
      .where(eq(networkIndexJobs.userId, userId))
      .orderBy(desc(networkIndexJobs.createdAt))
      .limit(1);
    return job;
  }

  async updateNetworkIndexJob(id: string, userId: string, data: Partial<InsertNetworkIndexJob>): Promise<NetworkIndexJob | undefined> {
    const [updated] = await db.update(networkIndexJobs)
      .set(data as any)
      .where(and(eq(networkIndexJobs.id, id), eq(networkIndexJobs.userId, userId)))
      .returning();
    return updated;
  }

  // ─── Contacts — email lookup ─────────────────────────────────────────────

  async getContactByEmail(email: string, userId: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts)
      .where(and(
        eq(contacts.userId, userId),
        drizzleSql`LOWER(${contacts.email}) = LOWER(${email})`
      ));
    return contact;
  }

  // ─── Sequences ───────────────────────────────────────────────────────────

  async getSequences(userId: string, filters?: { status?: string; contactId?: string }): Promise<Sequence[]> {
    const conditions = [eq(sequences.userId, userId)];
    if (filters?.status) conditions.push(eq(sequences.status, filters.status));
    if (filters?.contactId) conditions.push(eq(sequences.contactId, filters.contactId));
    return db.select().from(sequences).where(and(...conditions)).orderBy(desc(sequences.createdAt));
  }

  async getSequence(id: string, userId: string): Promise<Sequence | undefined> {
    const [seq] = await db.select().from(sequences)
      .where(and(eq(sequences.id, id), eq(sequences.userId, userId)));
    return seq;
  }

  async createSequence(seq: InsertSequence): Promise<Sequence> {
    const [created] = await db.insert(sequences).values(seq as any).returning();
    return created;
  }

  async updateSequence(id: string, userId: string, data: Partial<InsertSequence>): Promise<Sequence | undefined> {
    const [updated] = await db.update(sequences)
      .set({ ...data as any, updatedAt: new Date() })
      .where(and(eq(sequences.id, id), eq(sequences.userId, userId)))
      .returning();
    return updated;
  }

  // ─── Sequence Steps ──────────────────────────────────────────────────────

  async getSequenceSteps(sequenceId: string): Promise<SequenceStep[]> {
    return db.select().from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(asc(sequenceSteps.stepNumber));
  }

  async getSequenceStep(id: string): Promise<SequenceStep | undefined> {
    const [step] = await db.select().from(sequenceSteps).where(eq(sequenceSteps.id, id));
    return step;
  }

  async createSequenceStep(step: InsertSequenceStep): Promise<SequenceStep> {
    const [created] = await db.insert(sequenceSteps).values(step as any).returning();
    return created;
  }

  async updateSequenceStep(id: string, data: Partial<InsertSequenceStep>): Promise<SequenceStep | undefined> {
    const [updated] = await db.update(sequenceSteps).set(data as any).where(eq(sequenceSteps.id, id)).returning();
    return updated;
  }

  async getDueSequenceSteps(userId: string): Promise<(SequenceStep & { sequenceName: string; contactId: string })[]> {
    const now = new Date();
    const results = await db
      .select({
        ...getTableColumns(sequenceSteps),
        sequenceName: sequences.name,
        contactId: sequences.contactId,
      })
      .from(sequenceSteps)
      .innerJoin(sequences, eq(sequenceSteps.sequenceId, sequences.id))
      .where(and(
        eq(sequences.userId, userId),
        eq(sequences.status, "active"),
        eq(sequenceSteps.status, "pending"),
        lte(sequenceSteps.scheduledFor, now),
      ))
      .orderBy(asc(sequenceSteps.scheduledFor));
    return results;
  }

  // ─── Sequence Templates ──────────────────────────────────────────────────

  async getSequenceTemplates(userId: string): Promise<SequenceTemplate[]> {
    return db.select().from(sequenceTemplates)
      .where(eq(sequenceTemplates.userId, userId))
      .orderBy(desc(sequenceTemplates.createdAt));
  }

  async getSequenceTemplate(id: string, userId: string): Promise<SequenceTemplate | undefined> {
    const [t] = await db.select().from(sequenceTemplates)
      .where(and(eq(sequenceTemplates.id, id), eq(sequenceTemplates.userId, userId)));
    return t;
  }

  async createSequenceTemplate(template: InsertSequenceTemplate): Promise<SequenceTemplate> {
    const [created] = await db.insert(sequenceTemplates).values(template as any).returning();
    return created;
  }

  async updateSequenceTemplate(id: string, userId: string, data: Partial<InsertSequenceTemplate>): Promise<SequenceTemplate | undefined> {
    const [updated] = await db.update(sequenceTemplates).set(data as any)
      .where(and(eq(sequenceTemplates.id, id), eq(sequenceTemplates.userId, userId)))
      .returning();
    return updated;
  }

  async deleteSequenceTemplate(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(sequenceTemplates)
      .where(and(eq(sequenceTemplates.id, id), eq(sequenceTemplates.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // ─── Email Type Rules ─────────────────────────────────────────────────────

  async getEmailTypeRules(userId: string): Promise<EmailTypeRule[]> {
    return db.select().from(emailTypeRules)
      .where(eq(emailTypeRules.userId, userId))
      .orderBy(desc(emailTypeRules.updatedAt));
  }

  async getEmailTypeRuleBySignature(userId: string, signatureHash: string): Promise<EmailTypeRule | undefined> {
    const [row] = await db.select().from(emailTypeRules)
      .where(and(eq(emailTypeRules.userId, userId), eq(emailTypeRules.signatureHash, signatureHash)));
    return row;
  }

  async upsertEmailTypeRule(
    userId: string,
    signatureHash: string,
    data: Omit<InsertEmailTypeRule, "userId" | "signatureHash">,
  ): Promise<EmailTypeRule> {
    const [row] = await db.insert(emailTypeRules)
      .values({
        userId,
        signatureHash,
        label: data.label,
        decision: data.decision,
        examples: data.examples || [],
        updatedAt: new Date(),
      } as any)
      .onConflictDoUpdate({
        target: [emailTypeRules.userId, emailTypeRules.signatureHash],
        set: {
          label: data.label,
          decision: data.decision,
          examples: data.examples || [],
          updatedAt: new Date(),
        } as any,
      })
      .returning();
    return row;
  }

  async getRejectedEmailTypeSignatures(userId: string): Promise<Set<string>> {
    const rows = await db.select({
      signatureHash: emailTypeRules.signatureHash,
    }).from(emailTypeRules)
      .where(and(eq(emailTypeRules.userId, userId), eq(emailTypeRules.decision, "reject")));
    return new Set(rows.map((r) => r.signatureHash));
  }

  // ─── Index Review Sessions ────────────────────────────────────────────────

  async createIndexReviewSession(session: InsertIndexReviewSession): Promise<IndexReviewSession> {
    const [created] = await db.insert(indexReviewSessions).values(session as any).returning();
    return created;
  }

  async getIndexReviewSession(id: string, userId: string): Promise<IndexReviewSession | undefined> {
    const [row] = await db.select().from(indexReviewSessions)
      .where(and(eq(indexReviewSessions.id, id), eq(indexReviewSessions.userId, userId)));
    return row;
  }

  async getLatestPendingIndexReviewSession(userId: string): Promise<IndexReviewSession | undefined> {
    const [row] = await db.select().from(indexReviewSessions)
      .where(and(eq(indexReviewSessions.userId, userId), eq(indexReviewSessions.status, "pending_review")))
      .orderBy(desc(indexReviewSessions.createdAt))
      .limit(1);
    return row;
  }

  async updateIndexReviewSession(
    id: string,
    userId: string,
    data: Partial<InsertIndexReviewSession>,
  ): Promise<IndexReviewSession | undefined> {
    const [row] = await db.update(indexReviewSessions)
      .set(data as any)
      .where(and(eq(indexReviewSessions.id, id), eq(indexReviewSessions.userId, userId)))
      .returning();
    return row;
  }

  async createIndexReviewItem(item: InsertIndexReviewItem): Promise<IndexReviewItem> {
    const [created] = await db.insert(indexReviewItems).values(item as any).returning();
    return created;
  }

  async getIndexReviewItems(sessionId: string): Promise<IndexReviewItem[]> {
    return db.select().from(indexReviewItems)
      .where(eq(indexReviewItems.sessionId, sessionId))
      .orderBy(desc(indexReviewItems.messageCount), asc(indexReviewItems.proposedLabel));
  }

  async updateIndexReviewItemDecision(
    sessionId: string,
    signatureHash: string,
    decision: "accept" | "reject",
  ): Promise<IndexReviewItem | undefined> {
    const [row] = await db.update(indexReviewItems)
      .set({ decision })
      .where(and(
        eq(indexReviewItems.sessionId, sessionId),
        eq(indexReviewItems.signatureHash, signatureHash),
      ))
      .returning();
    return row;
  }
}

export const storage = new DatabaseStorage();
