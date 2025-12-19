import {
  type Contact, type InsertContact,
  type OutreachAttempt, type InsertOutreachAttempt,
  type Experiment, type InsertExperiment,
  type Settings, type InsertSettings,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Contacts
  getContacts(): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;

  // Outreach Attempts
  getOutreachAttempts(): Promise<OutreachAttempt[]>;
  getOutreachAttempt(id: string): Promise<OutreachAttempt | undefined>;
  getOutreachAttemptsByContact(contactId: string): Promise<OutreachAttempt[]>;
  createOutreachAttempt(attempt: InsertOutreachAttempt): Promise<OutreachAttempt>;
  updateOutreachAttempt(id: string, attempt: Partial<InsertOutreachAttempt>): Promise<OutreachAttempt | undefined>;
  deleteOutreachAttempt(id: string): Promise<boolean>;

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

export class MemStorage implements IStorage {
  private contacts: Map<string, Contact>;
  private outreachAttempts: Map<string, OutreachAttempt>;
  private experiments: Map<string, Experiment>;
  private settings: Settings | undefined;

  constructor() {
    this.contacts = new Map();
    this.outreachAttempts = new Map();
    this.experiments = new Map();
    this.settings = undefined;
    
    this.seedData();
  }

  private seedData() {
    const contact1: Contact = {
      id: randomUUID(),
      name: "Sarah Chen",
      company: "TechCorp Inc",
      role: "VP of Engineering",
      linkedinUrl: "https://linkedin.com/in/sarahchen",
      email: "sarah.chen@techcorp.com",
      headline: "Building high-performance engineering teams | Ex-Google, Ex-Meta",
      about: "Passionate about scaling engineering organizations and building inclusive cultures. 15+ years in tech leadership.",
      location: "San Francisco, CA",
      experience: "VP Engineering at TechCorp (2021-present)\nEngineering Director at Meta (2017-2021)\nSenior Engineer at Google (2012-2017)",
      education: "MS Computer Science, Stanford University\nBS Computer Science, MIT",
      skills: "Leadership, Team Building, System Design, Python, Go, Distributed Systems",
      keywords: "engineering, leadership, scaling",
      notes: "Met at TechConnect conference. Interested in discussing engineering culture.",
      tags: "Enterprise, Decision Maker, West Coast",
    };

    const contact2: Contact = {
      id: randomUUID(),
      name: "Marcus Johnson",
      company: "StartupXYZ",
      role: "Founder & CEO",
      linkedinUrl: "https://linkedin.com/in/marcusjohnson",
      email: "marcus@startupxyz.com",
      headline: "Serial Entrepreneur | 2x Founder | Building the future of work",
      about: "Started my first company at 22. Now on my third venture, focused on transforming how teams collaborate.",
      location: "Austin, TX",
      experience: "Founder & CEO at StartupXYZ (2022-present)\nCo-founder at WorkFlow (acquired 2021)\nProduct Manager at Salesforce (2015-2019)",
      education: "MBA, Wharton\nBA Economics, Yale University",
      skills: "Entrepreneurship, Product Strategy, Fundraising, Sales, Marketing",
      keywords: "startup, founder, saas",
      notes: "Series A stage, looking to scale sales team.",
      tags: "Startup, Founder, Series A",
    };

    const contact3: Contact = {
      id: randomUUID(),
      name: "Emily Rodriguez",
      company: "GlobalFinance",
      role: "Head of Partnerships",
      linkedinUrl: "https://linkedin.com/in/emilyrodriguez",
      email: "emily.rodriguez@globalfinance.com",
      headline: "Strategic Partnerships | Fintech | Building bridges between finance and technology",
      about: "10+ years experience in financial services. Passionate about fintech innovation and strategic partnerships.",
      location: "New York, NY",
      experience: "Head of Partnerships at GlobalFinance (2020-present)\nPartnership Manager at PayPal (2016-2020)\nBusiness Development at Goldman Sachs (2013-2016)",
      education: "MBA, Columbia Business School\nBS Finance, NYU Stern",
      skills: "Partnership Development, Negotiations, Financial Analysis, Strategy",
      keywords: "fintech, partnerships, finance",
      notes: "Interested in technology partnerships for digital transformation.",
      tags: "Enterprise, Fintech, East Coast",
    };

    this.contacts.set(contact1.id, contact1);
    this.contacts.set(contact2.id, contact2);
    this.contacts.set(contact3.id, contact3);

    const experiment1: Experiment = {
      id: randomUUID(),
      name: "Direct vs Friendly Hook",
      outreachType: "linkedin_connected",
      hypothesis: "A more direct hook will perform better with senior executives",
      variableTested: "hook",
      variantAText: "I noticed your recent post about scaling engineering teams and wanted to connect.",
      variantBText: "Hey! Love what you're building at TechCorp. Your take on engineering culture is spot on!",
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: null,
      active: true,
    };

    const experiment2: Experiment = {
      id: randomUUID(),
      name: "Short vs Long CTA",
      outreachType: "email",
      hypothesis: "Shorter CTAs will have higher response rates",
      variableTested: "cta",
      variantAText: "15 min call?",
      variantBText: "Would you be open to a brief 15-minute call this week to discuss how we might collaborate?",
      startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      endDate: null,
      active: true,
    };

    this.experiments.set(experiment1.id, experiment1);
    this.experiments.set(experiment2.id, experiment2);

    const attempt1: OutreachAttempt = {
      id: randomUUID(),
      contactId: contact1.id,
      dateSent: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      outreachType: "linkedin_connected",
      campaign: "Q4 Enterprise",
      messageVariantLabel: "A",
      messageBody: "Hi Sarah,\n\nI noticed your recent post about scaling engineering teams and wanted to connect.\n\nI've been researching best practices for engineering leadership and think we could have an interesting conversation.\n\nWould you be open to a 15 min chat this week?",
      subject: null,
      experimentId: experiment1.id,
      experimentVariant: "A",
      responded: true,
      positiveResponse: true,
      meetingBooked: true,
      converted: false,
      notes: "Very responsive, scheduled call for next Tuesday",
    };

    const attempt2: OutreachAttempt = {
      id: randomUUID(),
      contactId: contact2.id,
      dateSent: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      outreachType: "email",
      campaign: "Startup Founders",
      messageVariantLabel: "B",
      messageBody: "Hi Marcus,\n\nCongrats on the Series A! Your approach to remote collaboration is really interesting.\n\nI've helped several startups scale their sales processes and think there might be some synergies.\n\nWould you be open to a brief 15-minute call this week to discuss how we might collaborate?\n\nBest,\nYour Name",
      subject: "Quick question about StartupXYZ",
      experimentId: experiment2.id,
      experimentVariant: "B",
      responded: true,
      positiveResponse: false,
      meetingBooked: false,
      converted: false,
      notes: "Replied saying timing isn't right, follow up in Q2",
    };

    const attempt3: OutreachAttempt = {
      id: randomUUID(),
      contactId: contact3.id,
      dateSent: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      outreachType: "linkedin_connect_request",
      campaign: "Q4 Enterprise",
      messageVariantLabel: "A",
      messageBody: "Hi Emily, I noticed your work on fintech partnerships at GlobalFinance. I'd love to connect and share insights on technology partnerships in the finance space.",
      subject: null,
      experimentId: null,
      experimentVariant: null,
      responded: false,
      positiveResponse: false,
      meetingBooked: false,
      converted: false,
      notes: null,
    };

    this.outreachAttempts.set(attempt1.id, attempt1);
    this.outreachAttempts.set(attempt2.id, attempt2);
    this.outreachAttempts.set(attempt3.id, attempt3);

    this.settings = {
      id: randomUUID(),
      defaultTone: "professional",
      defaultCtaOptions: "15 min chat\nQuick question\nReferral request\nIntro to your network",
      emailSignature: "Best regards,\nYour Name\nNetworking Professional",
      emailSubjectPatterns: "Quick question about {company}\n{name} x networking\nThoughts on {role} trends",
      includeProofLine: true,
      includeLogisticsLine: true,
      connectionRequestCharLimit: 300,
    };
  }

  // Contacts
  async getContacts(): Promise<Contact[]> {
    return Array.from(this.contacts.values());
  }

  async getContact(id: string): Promise<Contact | undefined> {
    return this.contacts.get(id);
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const id = randomUUID();
    const newContact: Contact = { ...contact, id };
    this.contacts.set(id, newContact);
    return newContact;
  }

  async updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact | undefined> {
    const existing = this.contacts.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...contact };
    this.contacts.set(id, updated);
    return updated;
  }

  async deleteContact(id: string): Promise<boolean> {
    return this.contacts.delete(id);
  }

  // Outreach Attempts
  async getOutreachAttempts(): Promise<OutreachAttempt[]> {
    return Array.from(this.outreachAttempts.values());
  }

  async getOutreachAttempt(id: string): Promise<OutreachAttempt | undefined> {
    return this.outreachAttempts.get(id);
  }

  async getOutreachAttemptsByContact(contactId: string): Promise<OutreachAttempt[]> {
    return Array.from(this.outreachAttempts.values()).filter(
      (a) => a.contactId === contactId
    );
  }

  async createOutreachAttempt(attempt: InsertOutreachAttempt): Promise<OutreachAttempt> {
    const id = randomUUID();
    const newAttempt: OutreachAttempt = { ...attempt, id };
    this.outreachAttempts.set(id, newAttempt);
    return newAttempt;
  }

  async updateOutreachAttempt(
    id: string,
    attempt: Partial<InsertOutreachAttempt>
  ): Promise<OutreachAttempt | undefined> {
    const existing = this.outreachAttempts.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...attempt };
    this.outreachAttempts.set(id, updated);
    return updated;
  }

  async deleteOutreachAttempt(id: string): Promise<boolean> {
    return this.outreachAttempts.delete(id);
  }

  // Experiments
  async getExperiments(): Promise<Experiment[]> {
    return Array.from(this.experiments.values());
  }

  async getExperiment(id: string): Promise<Experiment | undefined> {
    return this.experiments.get(id);
  }

  async createExperiment(experiment: InsertExperiment): Promise<Experiment> {
    const id = randomUUID();
    const newExperiment: Experiment = { ...experiment, id };
    this.experiments.set(id, newExperiment);
    return newExperiment;
  }

  async updateExperiment(
    id: string,
    experiment: Partial<InsertExperiment>
  ): Promise<Experiment | undefined> {
    const existing = this.experiments.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...experiment };
    this.experiments.set(id, updated);
    return updated;
  }

  async deleteExperiment(id: string): Promise<boolean> {
    return this.experiments.delete(id);
  }

  // Settings
  async getSettings(): Promise<Settings | undefined> {
    return this.settings;
  }

  async createSettings(settings: InsertSettings): Promise<Settings> {
    const id = randomUUID();
    this.settings = { ...settings, id };
    return this.settings;
  }

  async updateSettings(
    id: string,
    settings: Partial<InsertSettings>
  ): Promise<Settings | undefined> {
    if (!this.settings || this.settings.id !== id) return undefined;
    this.settings = { ...this.settings, ...settings };
    return this.settings;
  }
}

export const storage = new MemStorage();
