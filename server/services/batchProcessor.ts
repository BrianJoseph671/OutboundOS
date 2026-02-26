import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { n8nClient, type ResearchResponse } from "./n8nClient";
import { storage } from "../storage";
import { appendResearchedTag } from "../utils/contactTags";

export type JobStatus = "pending" | "processing" | "completed" | "failed";
export type ContactStatus = "pending" | "processing" | "completed" | "failed";

export interface ContactResult {
  contactId: string;
  contactName: string;
  status: ContactStatus;
  research?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface BatchJob {
  jobId: string;
  status: JobStatus;
  totalContacts: number;
  processedContacts: number;
  successCount: number;
  failureCount: number;
  contacts: Map<string, ContactResult>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface ContactInput {
  id: string;
  name: string;
  company: string;
  linkedinUrl?: string;
}

interface AirtableConfig {
  baseId: string;
  tableName: string;
  personalAccessToken: string;
}

const CONCURRENCY_LIMIT = 2;
const BATCH_DELAY_MS = 2000;

class BatchProcessor extends EventEmitter {
  private jobs: Map<string, BatchJob> = new Map();
  private airtableConfig: AirtableConfig | null = null;

  setAirtableConfig(config: AirtableConfig | null): void {
    this.airtableConfig = config;
  }

  async startResearchBatch(contacts: ContactInput[]): Promise<string> {
    const jobId = randomUUID();

    const contactResults = new Map<string, ContactResult>();
    contacts.forEach((contact) => {
      contactResults.set(contact.id, {
        contactId: contact.id,
        contactName: contact.name,
        status: "pending",
      });
    });

    const job: BatchJob = {
      jobId,
      status: "pending",
      totalContacts: contacts.length,
      processedContacts: 0,
      successCount: 0,
      failureCount: 0,
      contacts: contactResults,
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);

    this.processJob(jobId, contacts).catch((error) => {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = "failed";
        job.error = error.message;
        job.completedAt = new Date();
      }
    });

    return jobId;
  }

  getJobStatus(jobId: string): BatchJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    return {
      ...job,
      contacts: new Map(job.contacts),
    };
  }

  getJobStatusJSON(jobId: string): object | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    return {
      ...job,
      contacts: Array.from(job.contacts.values()),
    };
  }

  private async processJob(jobId: string, contacts: ContactInput[]): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = "processing";
    job.startedAt = new Date();

    for (let i = 0; i < contacts.length; i += CONCURRENCY_LIMIT) {
      const batch = contacts.slice(i, i + CONCURRENCY_LIMIT);
      console.log(`[BatchProcessor] Processing batch ${i / CONCURRENCY_LIMIT + 1}, contacts: ${batch.map(c => c.name).join(", ")}`);

      await Promise.all(
        batch.map((contact) => this.processContact(jobId, contact))
      );

      if (i + CONCURRENCY_LIMIT < contacts.length) {
        await this.delay(BATCH_DELAY_MS);
      }
    }

    job.status = job.failureCount === job.totalContacts ? "failed" : "completed";
    job.completedAt = new Date();

    this.emit("job:complete", {
      jobId,
      status: job.status,
      successCount: job.successCount,
      failureCount: job.failureCount,
      totalContacts: job.totalContacts,
    });
  }

  private async processContact(jobId: string, contact: ContactInput): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const contactResult = job.contacts.get(contact.id);
    if (!contactResult) return;

    contactResult.status = "processing";
    contactResult.startedAt = new Date();

    console.log(`[BatchProcessor] Starting research for ${contact.name} (job: ${jobId})`);

    this.emit("contact:start", {
      jobId,
      contactId: contact.id,
      contactName: contact.name,
    });

    // Emit immediate progress update when starting a contact
    this.emitProgress(jobId);

    try {
      const researchResult: ResearchResponse = await n8nClient.research({
        personName: contact.name,
        company: contact.company,
        linkedinUrl: contact.linkedinUrl,
      });

      const research = researchResult.research || researchResult.profileInsight || "";

      const existing = await storage.getContact(contact.id);
      const newTags = existing ? appendResearchedTag(existing.tags) : "researched";
      await storage.updateContact(contact.id, {
        notes: research ? `[AI Research]\n${research}` : undefined,
        tags: newTags,
      });

      if (this.airtableConfig && research) {
        await this.updateAirtable(contact, research);
      }

      contactResult.status = "completed";
      contactResult.research = research;
      contactResult.completedAt = new Date();
      job.successCount++;
      job.processedContacts++;

      console.log(`[BatchProcessor] Completed research for ${contact.name} (success)`);

      this.emit("contact:complete", {
        jobId,
        contactId: contact.id,
        contactName: contact.name,
        research,
      });

      // Emit progress after each contact completes
      this.emitProgress(jobId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      contactResult.status = "failed";
      contactResult.error = errorMessage;
      contactResult.completedAt = new Date();
      job.failureCount++;
      job.processedContacts++;

      console.log(`[BatchProcessor] Failed research for ${contact.name}: ${errorMessage}`);

      this.emit("contact:failed", {
        jobId,
        contactId: contact.id,
        contactName: contact.name,
        error: errorMessage,
      });

      // Emit progress after each contact fails
      this.emitProgress(jobId);
    }
  }

  private async updateAirtable(contact: ContactInput, research: string): Promise<void> {
    if (!this.airtableConfig) return;

    try {
      const { baseId, tableName, personalAccessToken } = this.airtableConfig;

      const searchResponse = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?filterByFormula={Name}="${encodeURIComponent(contact.name)}"&maxRecords=1`,
        {
          headers: {
            Authorization: `Bearer ${personalAccessToken}`,
          },
        }
      );

      if (!searchResponse.ok) {
        console.error("[BatchProcessor] Airtable search failed:", await searchResponse.text());
        return;
      }

      const searchData = await searchResponse.json();
      const existingRecord = searchData.records?.[0];

      if (existingRecord) {
        await fetch(
          `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${existingRecord.id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${personalAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fields: {
                Research: research,
              },
            }),
          }
        );
      }
    } catch (error) {
      console.error("[BatchProcessor] Airtable update error:", error);
    }
  }

  private emitProgress(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const progressData = {
      jobId,
      processedContacts: job.processedContacts,
      totalContacts: job.totalContacts,
      successCount: job.successCount,
      failureCount: job.failureCount,
      percentComplete: Math.round((job.processedContacts / job.totalContacts) * 100),
    };

    console.log(`[BatchProcessor] Emitting progress:`, JSON.stringify(progressData));

    this.emit("progress", progressData);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const batchProcessor = new BatchProcessor();
export default batchProcessor;
