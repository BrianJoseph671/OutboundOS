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
  users, type User, type InsertUser
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, inArray, and } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Contacts
  getContacts(userId: string): Promise<Contact[]>;
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
  async getContacts(userId: string): Promise<Contact[]> {
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
    const [contact] = await db.insert(contacts).values(insertContact).returning();
    return contact;
  }

  async updateContact(id: string, userId: string, contact: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db.update(contacts).set(contact)
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
        signalsHooks: (data.signalsHooks ?? []) as string[],
        personalizedMessage: data.personalizedMessage ?? null,
        variants: (data.variants ?? []) as unknown[],
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
}

export const storage = new DatabaseStorage();
