import { 
  contacts, type Contact, type InsertContact,
  outreachAttempts, type OutreachAttempt, type InsertOutreachAttempt,
  experiments, type Experiment, type InsertExperiment,
  settings, type Settings, type InsertSettings 
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  // Contacts
  async getContacts(): Promise<Contact[]> {
    return await db.select().from(contacts).orderBy(desc(contacts.id));
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
}

export const storage = new DatabaseStorage();
