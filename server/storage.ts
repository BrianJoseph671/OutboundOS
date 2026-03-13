import { 
  contacts, type Contact, type InsertContact,
  outreachAttempts, type OutreachAttempt, type InsertOutreachAttempt,
  experiments, type Experiment, type InsertExperiment,
  settings, type Settings, type InsertSettings,
  airtableConfig, type AirtableConfig, type InsertAirtableConfig,
  researchPackets, type ResearchPacket, type InsertResearchPacket,
  integrationConnections, type IntegrationConnection, type InsertIntegrationConnection,
  meetings, type Meeting, type InsertMeeting,
  contactMeetings, type ContactMeeting, type InsertContactMeeting
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, inArray, and } from "drizzle-orm";

export interface IStorage {
  // Contacts
  getContacts(): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;
  deleteContacts(ids: string[]): Promise<number>;

  // Outreach Attempts
  getOutreachAttempts(): Promise<OutreachAttempt[]>;
  getOutreachAttempt(id: string): Promise<OutreachAttempt | undefined>;
  getOutreachAttemptsByContact(contactId: string): Promise<OutreachAttempt[]>;
  createOutreachAttempt(attempt: InsertOutreachAttempt): Promise<OutreachAttempt>;
  updateOutreachAttempt(id: string, attempt: Partial<InsertOutreachAttempt>): Promise<OutreachAttempt | undefined>;
  deleteOutreachAttempt(id: string): Promise<boolean>;
  deleteOutreachAttempts(ids: string[]): Promise<number>;

  // Experiments
  getExperiments(): Promise<Experiment[]>;
  getExperiment(id: string): Promise<Experiment | undefined>;
  createExperiment(experiment: InsertExperiment): Promise<Experiment>;
  updateExperiment(id: string, experiment: Partial<InsertExperiment>): Promise<Experiment | undefined>;
  deleteExperiment(id: string): Promise<boolean>;

  // Settings
  getSettings(): Promise<Settings | undefined>;
  createSettings(settings: InsertSettings): Promise<Settings>;
  updateSettings(id: string, settings: Partial<InsertSettings>): Promise<Settings | undefined>;

  // Airtable Config
  getAirtableConfig(): Promise<AirtableConfig | undefined>;
  saveAirtableConfig(config: InsertAirtableConfig): Promise<AirtableConfig>;
  updateAirtableConfig(id: string, config: Partial<InsertAirtableConfig>): Promise<AirtableConfig | undefined>;
  deleteAirtableConfig(): Promise<boolean>;

  // Research Packets
  getResearchPacket(contactId: string): Promise<ResearchPacket | undefined>;
  getResearchPacketsByContactIds(contactIds: string[]): Promise<ResearchPacket[]>;
  getAllResearchPackets(): Promise<ResearchPacket[]>;
  upsertResearchPacket(contactId: string, data: Partial<Omit<InsertResearchPacket, "contactId">>): Promise<ResearchPacket>;

  // Integration Connections
  getIntegrationConnection(provider: string): Promise<IntegrationConnection | undefined>;
  getAllIntegrationConnections(): Promise<IntegrationConnection[]>;
  upsertIntegrationConnection(provider: string, data: Partial<Omit<InsertIntegrationConnection, "provider">>): Promise<IntegrationConnection>;
  deleteIntegrationConnection(provider: string): Promise<boolean>;

  // Meetings
  getMeetings(): Promise<Meeting[]>;
  getMeeting(id: string): Promise<Meeting | undefined>;
  getMeetingByExternalId(source: string, externalId: string): Promise<Meeting | undefined>;
  createMeeting(meeting: InsertMeeting): Promise<Meeting>;
  updateMeeting(id: string, meeting: Partial<InsertMeeting>): Promise<Meeting | undefined>;
  upsertMeetingByExternalId(source: string, externalId: string, data: Partial<InsertMeeting>): Promise<Meeting>;

  // Contact-Meeting Links
  getContactMeetings(contactId: string): Promise<(ContactMeeting & { meeting: Meeting })[]>;
  getMeetingContacts(meetingId: string): Promise<ContactMeeting[]>;
  linkContactToMeeting(data: InsertContactMeeting): Promise<ContactMeeting>;
  unlinkContactFromMeeting(contactId: string, meetingId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Contacts
  async getContacts(): Promise<Contact[]> {
    return await db.select().from(contacts).orderBy(contacts.createdAt);
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values(insertContact).returning();
    return contact;
  }

  async updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db.update(contacts).set(contact).where(eq(contacts.id, id)).returning();
    return updated;
  }

  async deleteContact(id: string): Promise<boolean> {
    const [deleted] = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    return !!deleted;
  }

  async deleteContacts(ids: string[]): Promise<number> {
    const results = await Promise.all(
      ids.map(id => db.delete(contacts).where(eq(contacts.id, id)).returning())
    );
    return results.filter(r => r.length > 0).length;
  }

  async upsertContact(contact: Contact): Promise<Contact> {
    const existing = await this.getContact(contact.id);
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
        .where(eq(contacts.id, contact.id))
        .returning();
      return updated!;
    }
    const [created] = await db
      .insert(contacts)
      .values({
        id: contact.id,
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
  async getOutreachAttempts(): Promise<OutreachAttempt[]> {
    return await db.select().from(outreachAttempts).orderBy(desc(outreachAttempts.dateSent));
  }

  async getOutreachAttempt(id: string): Promise<OutreachAttempt | undefined> {
    const [attempt] = await db.select().from(outreachAttempts).where(eq(outreachAttempts.id, id));
    return attempt;
  }

  async getOutreachAttemptsByContact(contactId: string): Promise<OutreachAttempt[]> {
    return await db.select().from(outreachAttempts).where(eq(outreachAttempts.contactId, contactId));
  }

  async createOutreachAttempt(attempt: InsertOutreachAttempt): Promise<OutreachAttempt> {
    const [newAttempt] = await db.insert(outreachAttempts).values(attempt).returning();
    return newAttempt;
  }

  async updateOutreachAttempt(id: string, attempt: Partial<InsertOutreachAttempt>): Promise<OutreachAttempt | undefined> {
    const [updated] = await db.update(outreachAttempts).set(attempt).where(eq(outreachAttempts.id, id)).returning();
    return updated;
  }

  async deleteOutreachAttempt(id: string): Promise<boolean> {
    const [deleted] = await db.delete(outreachAttempts).where(eq(outreachAttempts.id, id)).returning();
    return !!deleted;
  }

  async deleteOutreachAttempts(ids: string[]): Promise<number> {
    const results = await Promise.all(
      ids.map(id => db.delete(outreachAttempts).where(eq(outreachAttempts.id, id)).returning())
    );
    return results.filter(r => r.length > 0).length;
  }

  // Experiments
  async getExperiments(): Promise<Experiment[]> {
    return await db.select().from(experiments).orderBy(desc(experiments.id));
  }

  async getExperiment(id: string): Promise<Experiment | undefined> {
    const [experiment] = await db.select().from(experiments).where(eq(experiments.id, id));
    return experiment;
  }

  async createExperiment(experiment: InsertExperiment): Promise<Experiment> {
    const [newExperiment] = await db.insert(experiments).values(experiment).returning();
    return newExperiment;
  }

  async updateExperiment(id: string, experiment: Partial<InsertExperiment>): Promise<Experiment | undefined> {
    const [updated] = await db.update(experiments).set(experiment).where(eq(experiments.id, id)).returning();
    return updated;
  }

  async deleteExperiment(id: string): Promise<boolean> {
    const [deleted] = await db.delete(experiments).where(eq(experiments.id, id)).returning();
    return !!deleted;
  }

  // Settings
  async getSettings(): Promise<Settings | undefined> {
    const [s] = await db.select().from(settings).limit(1);
    return s;
  }

  async createSettings(insertSettings: InsertSettings): Promise<Settings> {
    const [s] = await db.insert(settings).values(insertSettings).returning();
    return s;
  }

  async updateSettings(id: string, update: Partial<InsertSettings>): Promise<Settings | undefined> {
    const [updated] = await db.update(settings).set(update).where(eq(settings.id, id)).returning();
    return updated;
  }

  // Airtable Config
  async getAirtableConfig(): Promise<AirtableConfig | undefined> {
    const [config] = await db.select().from(airtableConfig).limit(1);
    return config;
  }

  async saveAirtableConfig(config: InsertAirtableConfig): Promise<AirtableConfig> {
    await db.delete(airtableConfig);
    const [saved] = await db.insert(airtableConfig).values(config).returning();
    return saved;
  }

  async updateAirtableConfig(id: string, config: Partial<InsertAirtableConfig>): Promise<AirtableConfig | undefined> {
    const [updated] = await db.update(airtableConfig).set(config).where(eq(airtableConfig.id, id)).returning();
    return updated;
  }

  async deleteAirtableConfig(): Promise<boolean> {
    const result = await db.delete(airtableConfig).returning();
    return result.length > 0;
  }

  // Research Packets
  async getResearchPacket(contactId: string): Promise<ResearchPacket | undefined> {
    const [packet] = await db.select().from(researchPackets).where(eq(researchPackets.contactId, contactId));
    return packet;
  }

  async getResearchPacketsByContactIds(contactIds: string[]): Promise<ResearchPacket[]> {
    if (contactIds.length === 0) return [];
    return await db
      .select()
      .from(researchPackets)
      .where(inArray(researchPackets.contactId, contactIds));
  }

  async getAllResearchPackets(): Promise<ResearchPacket[]> {
    return await db.select().from(researchPackets);
  }

  async upsertResearchPacket(contactId: string, data: Partial<Omit<InsertResearchPacket, "contactId">>): Promise<ResearchPacket> {
    const now = new Date();
    const [packet] = await db
      .insert(researchPackets)
      .values({
        contactId,
        status: data.status ?? "not_started",
        prospectSnapshot: data.prospectSnapshot ?? null,
        companySnapshot: data.companySnapshot ?? null,
        signalsHooks: data.signalsHooks ?? [],
        personalizedMessage: data.personalizedMessage ?? null,
        variants: data.variants ?? [],
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: researchPackets.contactId,
        set: {
          ...(data.status !== undefined && { status: data.status }),
          ...(data.prospectSnapshot !== undefined && { prospectSnapshot: data.prospectSnapshot }),
          ...(data.companySnapshot !== undefined && { companySnapshot: data.companySnapshot }),
          ...(data.signalsHooks !== undefined && { signalsHooks: data.signalsHooks }),
          ...(data.personalizedMessage !== undefined && { personalizedMessage: data.personalizedMessage }),
          ...(data.variants !== undefined && { variants: data.variants }),
          updatedAt: now,
        },
      })
      .returning();
    return packet!;
  }

  // Integration Connections
  async getIntegrationConnection(provider: string): Promise<IntegrationConnection | undefined> {
    const [conn] = await db.select().from(integrationConnections).where(eq(integrationConnections.provider, provider));
    return conn;
  }

  async getAllIntegrationConnections(): Promise<IntegrationConnection[]> {
    return await db.select().from(integrationConnections);
  }

  async upsertIntegrationConnection(provider: string, data: Partial<Omit<InsertIntegrationConnection, "provider">>): Promise<IntegrationConnection> {
    const now = new Date();
    const existing = await this.getIntegrationConnection(provider);
    if (existing) {
      const [updated] = await db
        .update(integrationConnections)
        .set({ ...data, updatedAt: now })
        .where(eq(integrationConnections.provider, provider))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(integrationConnections)
      .values({
        provider,
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

  async deleteIntegrationConnection(provider: string): Promise<boolean> {
    const result = await db.delete(integrationConnections).where(eq(integrationConnections.provider, provider)).returning();
    return result.length > 0;
  }

  // Meetings
  async getMeetings(): Promise<Meeting[]> {
    return await db.select().from(meetings).orderBy(desc(meetings.startTime));
  }

  async getMeeting(id: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));
    return meeting;
  }

  async getMeetingByExternalId(source: string, externalId: string): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings)
      .where(and(eq(meetings.source, source), eq(meetings.externalId, externalId)));
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

  async updateMeeting(id: string, meeting: Partial<InsertMeeting>): Promise<Meeting | undefined> {
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
    const [updated] = await db.update(meetings).set(updatePayload).where(eq(meetings.id, id)).returning();
    return updated;
  }

  async upsertMeetingByExternalId(source: string, externalId: string, data: Partial<InsertMeeting>): Promise<Meeting> {
    const now = new Date();
    const attendeesArr = data.attendees ? [...data.attendees] as Array<{ email?: string; name?: string; self?: boolean }> : [];
    const actionItemsArr = data.actionItems ? [...data.actionItems] as string[] : [];
    const existing = await this.getMeetingByExternalId(source, externalId);
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
        .where(eq(meetings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(meetings)
      .values({
        source,
        externalId,
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
