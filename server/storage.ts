import { 
  contacts, type Contact, type InsertContact,
  outreachAttempts, type OutreachAttempt, type InsertOutreachAttempt,
  experiments, type Experiment, type InsertExperiment,
  settings, type Settings, type InsertSettings,
  airtableConfig, type AirtableConfig, type InsertAirtableConfig,
  researchPackets, type ResearchPacket, type InsertResearchPacket
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, inArray } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
