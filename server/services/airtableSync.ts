import axios, { AxiosInstance } from "axios";

interface AirtableRecord {
  id?: string;
  fields: Record<string, unknown>;
}

interface AirtableResponse {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

interface AirtableListResponse {
  records: AirtableResponse[];
  offset?: string;
}

interface ResearchResult {
  summary?: string;
  signals?: Array<{
    type: string;
    description: string;
    safeToReference?: boolean;
  }>;
  companyInfo?: string;
  talkingPoints?: string[];
}

interface MessageDraft {
  type: "linkedin" | "email";
  subject?: string;
  body: string;
  qaStatus?: "pending" | "approved" | "rejected";
  qaFeedback?: string;
}

class AirtableSyncService {
  private client: AxiosInstance;
  private baseId: string;

  constructor() {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;

    if (!apiKey || !baseId) {
      console.warn("[AirtableSync] Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
    }

    this.baseId = baseId || "";
    this.client = axios.create({
      baseURL: `https://api.airtable.com/v0/${this.baseId}`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  private isConfigured(): boolean {
    return !!(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID);
  }

  async syncPerson(
    contact: {
      id: string;
      name: string;
      company?: string | null;
      role?: string | null;
      email?: string | null;
      linkedinUrl?: string | null;
    },
    researchResult?: ResearchResult
  ): Promise<string | null> {
    if (!this.isConfigured()) {
      console.log("[AirtableSync] Skipping sync - not configured");
      return null;
    }

    try {
      const existingRecord = await this.findPersonByContactId(contact.id);

      const fields: Record<string, unknown> = {
        "Contact ID": contact.id,
        "Name": contact.name,
        "Company": contact.company || "",
        "Title": contact.role || "",
        "Email": contact.email || "",
        "LinkedIn URL": contact.linkedinUrl || "",
        "Status": researchResult ? "Researched" : "Imported",
      };

      if (researchResult) {
        fields["Research Brief"] = researchResult.summary || "";
        fields["Company Info"] = researchResult.companyInfo || "";
        fields["Talking Points"] = researchResult.talkingPoints?.join("\n") || "";
      }

      let recordId: string;

      if (existingRecord) {
        const response = await this.client.patch<AirtableResponse>(
          `/People/${existingRecord.id}`,
          { fields }
        );
        recordId = response.data.id;
        console.log(`[AirtableSync] Updated person ${contact.name} (${recordId})`);
      } else {
        const response = await this.client.post<AirtableResponse>("/People", {
          fields,
        });
        recordId = response.data.id;
        console.log(`[AirtableSync] Created person ${contact.name} (${recordId})`);
      }

      return recordId;
    } catch (error) {
      console.error("[AirtableSync] Failed to sync person:", error);
      return null;
    }
  }

  async createSignals(
    personRecordId: string,
    signals: Array<{
      type: string;
      description: string;
      safeToReference?: boolean;
    }>
  ): Promise<string[]> {
    if (!this.isConfigured()) {
      console.log("[AirtableSync] Skipping signal creation - not configured");
      return [];
    }

    const createdIds: string[] = [];

    try {
      const records = signals.map((signal) => ({
        fields: {
          "Person": [personRecordId],
          "Signal Type": signal.type,
          "Description": signal.description,
          "Safe to Reference": signal.safeToReference ?? true,
        },
      }));

      const batchSize = 10;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const response = await this.client.post<{ records: AirtableResponse[] }>(
          "/Signals",
          { records: batch }
        );
        createdIds.push(...response.data.records.map((r) => r.id));
      }

      console.log(`[AirtableSync] Created ${createdIds.length} signals for person ${personRecordId}`);
      return createdIds;
    } catch (error) {
      console.error("[AirtableSync] Failed to create signals:", error);
      return createdIds;
    }
  }

  async syncMessages(
    personRecordId: string,
    messages: MessageDraft[]
  ): Promise<string[]> {
    if (!this.isConfigured()) {
      console.log("[AirtableSync] Skipping message sync - not configured");
      return [];
    }

    const createdIds: string[] = [];

    try {
      const records = messages.map((message) => ({
        fields: {
          "Person": [personRecordId],
          "Message Type": message.type,
          "Subject": message.subject || "",
          "Body": message.body,
          "QA Status": message.qaStatus || "pending",
          "QA Feedback": message.qaFeedback || "",
        },
      }));

      const batchSize = 10;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const response = await this.client.post<{ records: AirtableResponse[] }>(
          "/Messages",
          { records: batch }
        );
        createdIds.push(...response.data.records.map((r) => r.id));
      }

      console.log(`[AirtableSync] Created ${createdIds.length} messages for person ${personRecordId}`);
      return createdIds;
    } catch (error) {
      console.error("[AirtableSync] Failed to sync messages:", error);
      return createdIds;
    }
  }

  async updateTouchStatus(
    touchId: string,
    status: "pending" | "sent" | "responded" | "converted"
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      console.log("[AirtableSync] Skipping touch update - not configured");
      return false;
    }

    try {
      await this.client.patch(`/Touches/${touchId}`, {
        fields: {
          "Status": status,
          "Updated At": new Date().toISOString(),
        },
      });

      console.log(`[AirtableSync] Updated touch ${touchId} status to ${status}`);
      return true;
    } catch (error) {
      console.error("[AirtableSync] Failed to update touch status:", error);
      return false;
    }
  }

  private async findPersonByContactId(contactId: string): Promise<AirtableResponse | null> {
    try {
      const response = await this.client.get<AirtableListResponse>("/People", {
        params: {
          filterByFormula: `{Contact ID} = "${contactId}"`,
          maxRecords: 1,
        },
      });

      return response.data.records[0] || null;
    } catch (error) {
      console.error("[AirtableSync] Failed to find person:", error);
      return null;
    }
  }

  async getPersonByRecordId(recordId: string): Promise<AirtableResponse | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await this.client.get<AirtableResponse>(`/People/${recordId}`);
      return response.data;
    } catch (error) {
      console.error("[AirtableSync] Failed to get person:", error);
      return null;
    }
  }

  async listPeople(options?: { status?: string; limit?: number }): Promise<AirtableResponse[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const params: Record<string, unknown> = {
        maxRecords: options?.limit || 100,
      };

      if (options?.status) {
        params.filterByFormula = `{Status} = "${options.status}"`;
      }

      const response = await this.client.get<AirtableListResponse>("/People", { params });
      return response.data.records;
    } catch (error) {
      console.error("[AirtableSync] Failed to list people:", error);
      return [];
    }
  }
}

export const airtableSync = new AirtableSyncService();
export default airtableSync;
