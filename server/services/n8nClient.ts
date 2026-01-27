import axios, { AxiosError, type AxiosInstance } from "axios";

const N8N_BASE_URL = process.env.N8N_WEBHOOK_URL || "https://n8n.srv1096794.hstgr.cloud";

const client: AxiosInstance = axios.create({
  baseURL: N8N_BASE_URL,
  timeout: 60000,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface ResearchRequest {
  personName: string;
  company: string;
  linkedinUrl?: string;
}

export interface ResearchResponse {
  success: boolean;
  research?: string;
  profileInsight?: string;
  error?: string;
  fallback?: boolean;
}

export interface DraftRequest {
  contactId: string;
  contactName: string;
  company: string;
  research?: string;
  channel: "linkedin" | "email";
  tone?: string;
  goal?: string;
}

export interface DraftResponse {
  success: boolean;
  draft?: string;
  subject?: string;
  error?: string;
}

export interface QARequest {
  draft: string;
  channel: "linkedin" | "email";
  contactName: string;
  company: string;
}

export interface QAResponse {
  success: boolean;
  feedback?: string;
  score?: number;
  suggestions?: string[];
  error?: string;
}

export interface SequenceRequest {
  contactId: string;
  contactName: string;
  company: string;
  channel: "linkedin" | "email";
  numberOfMessages: number;
  goal?: string;
}

export interface SequenceResponse {
  success: boolean;
  messages?: Array<{
    order: number;
    subject?: string;
    body: string;
    waitDays: number;
  }>;
  error?: string;
}

async function handleRequest<T, D extends object>(
  endpoint: string,
  data: D
): Promise<T> {
  try {
    const response = await client.post<T>(endpoint, data);
    return response.data;
  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      const message = err.response?.data?.error || err.message || "Request failed";
      console.error(`[n8nClient] ${endpoint} error:`, message);
      throw new Error(message);
    }
    throw err;
  }
}

export const n8nClient = {
  research: async (data: ResearchRequest): Promise<ResearchResponse> => {
    return handleRequest<ResearchResponse, ResearchRequest>(
      "/webhook/028dc28a-4779-4a35-80cf-87dfbde544f8",
      data
    );
  },

  draft: async (data: DraftRequest): Promise<DraftResponse> => {
    return handleRequest<DraftResponse, DraftRequest>(
      "/webhook/drafting-agent",
      data
    );
  },

  qa: async (data: QARequest): Promise<QAResponse> => {
    return handleRequest<QAResponse, QARequest>(
      "/webhook/qa-agent",
      data
    );
  },

  sequence: async (data: SequenceRequest): Promise<SequenceResponse> => {
    return handleRequest<SequenceResponse, SequenceRequest>(
      "/webhook/sequencing-agent",
      data
    );
  },
};

export default n8nClient;
