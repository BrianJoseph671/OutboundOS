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
    console.log(`[n8nClient] Sending request to ${endpoint}:`, JSON.stringify(data));
    const response = await client.post<T>(endpoint, data);
    console.log(`[n8nClient] Response from ${endpoint}:`, JSON.stringify(response.data));
    return response.data;
  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      const message = err.response?.data?.error || err.message || "Request failed";
      console.error(`[n8nClient] ${endpoint} error:`, message);
      console.error(`[n8nClient] Full error response:`, JSON.stringify(err.response?.data));
      throw new Error(message);
    }
    throw err;
  }
}

export const n8nClient = {
  research: async (data: ResearchRequest): Promise<ResearchResponse> => {
    const rawResponse = await handleRequest<Record<string, unknown>, ResearchRequest>(
      "https://n8n.srv1096794.hstgr.cloud/webhook/028dc28a-4779-4a35-80cf-87dfbde544f8",
      data
    );
    
    // Normalize the response - n8n might return data in various formats
    // Handle both direct response and nested response formats
    const normalizedResponse: ResearchResponse = {
      success: true,
      research: undefined,
      profileInsight: undefined,
    };
    
    // Try to extract research from various possible response structures
    if (typeof rawResponse === "object" && rawResponse !== null) {
      // Direct fields
      if (typeof rawResponse.research === "string") {
        normalizedResponse.research = rawResponse.research;
      }
      if (typeof rawResponse.profileInsight === "string") {
        normalizedResponse.profileInsight = rawResponse.profileInsight;
      }
      if (typeof rawResponse.profile_insight === "string") {
        normalizedResponse.profileInsight = rawResponse.profile_insight;
      }
      // Check for nested output field (common n8n pattern)
      if (typeof rawResponse.output === "string") {
        normalizedResponse.research = rawResponse.output;
      }
      // Check for nested data field
      if (typeof rawResponse.data === "object" && rawResponse.data !== null) {
        const dataObj = rawResponse.data as Record<string, unknown>;
        if (typeof dataObj.research === "string") {
          normalizedResponse.research = dataObj.research;
        }
        if (typeof dataObj.profileInsight === "string") {
          normalizedResponse.profileInsight = dataObj.profileInsight;
        }
      }
      // Check for message or text field
      if (typeof rawResponse.message === "string" && !normalizedResponse.research) {
        normalizedResponse.research = rawResponse.message;
      }
      if (typeof rawResponse.text === "string" && !normalizedResponse.research) {
        normalizedResponse.research = rawResponse.text;
      }
      // Check for result field
      if (typeof rawResponse.result === "string" && !normalizedResponse.research) {
        normalizedResponse.research = rawResponse.result;
      }
      // Check if success is explicitly false
      if (rawResponse.success === false) {
        normalizedResponse.success = false;
        normalizedResponse.error = typeof rawResponse.error === "string" ? rawResponse.error : "Research failed";
      }
    }
    
    // If we still don't have research, try to stringify any meaningful data
    if (!normalizedResponse.research && !normalizedResponse.profileInsight) {
      const keys = Object.keys(rawResponse).filter(k => !["success", "error"].includes(k));
      if (keys.length > 0) {
        // Try to find any string value that looks like research
        for (const key of keys) {
          const value = rawResponse[key];
          if (typeof value === "string" && value.length > 50) {
            normalizedResponse.research = value;
            console.log(`[n8nClient] Extracted research from field "${key}"`);
            break;
          }
        }
      }
    }
    
    console.log(`[n8nClient] Normalized research response:`, JSON.stringify(normalizedResponse));
    return normalizedResponse;
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
