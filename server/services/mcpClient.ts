import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getValidAccessToken } from "./oauth";

type JsonRecord = Record<string, unknown>;
const MAX_MCP_RETRIES = Number.parseInt(process.env.SUPERHUMAN_MCP_MAX_RETRIES || "3", 10);
const RETRY_BASE_DELAY_MS = Number.parseInt(process.env.SUPERHUMAN_MCP_RETRY_BASE_MS || "250", 10);

export interface SuperhumanThreadMessage {
  message_id: string;
  thread_id: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  sent_at: string;
  labels?: string[];
  cc?: string[];
  attachments?: string[];
}

export interface SuperhumanThreadSummary {
  thread_id: string;
  subject: string;
  snippet: string;
  participants: string[];
  labels: string[];
  last_message_at: string;
  message_count: number;
  messages?: SuperhumanThreadMessage[];
}

export interface SuperhumanListThreadsResponse {
  threads: SuperhumanThreadSummary[];
  next_cursor?: string;
  total_estimate?: number;
}

export interface SuperhumanGetThreadResponse {
  thread_id: string;
  messages: SuperhumanThreadMessage[];
}

export interface ListThreadsFilters {
  limit?: number;
  start_date?: string;
  end_date?: string;
  from?: string[];
  to?: string[];
  is_unread?: boolean;
  labels?: string[];
  subject_contains?: string;
  body_contains?: string;
  cursor?: string;
}

export class SuperhumanAuthProvider {
  async getAccessToken(userId: string): Promise<string> {
    const token = await getValidAccessToken("superhuman", userId);
    if (!token) {
      throw new Error("Superhuman is not connected. Connect it in Settings first.");
    }
    return token;
  }
}

type CachedClient = {
  token: string;
  client: Client;
  transport: StreamableHTTPClientTransport;
};

const clientCache = new Map<string, CachedClient>();
const authProvider = new SuperhumanAuthProvider();

function getSuperhumanMcpUrl(): string {
  return process.env.SUPERHUMAN_MCP_URL || "https://mcp.mail.superhuman.com/mcp";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRetryableSuperhumanError(err: unknown): boolean {
  const message = getErrorMessage(err).toLowerCase();
  if (
    message.includes("not connected")
    || message.includes("unauthorized")
    || message.includes("forbidden")
    || message.includes("invalid token")
    || message.includes("auth")
  ) {
    return false;
  }
  return (
    message.includes("timeout")
    || message.includes("timed out")
    || message.includes("network")
    || message.includes("econnreset")
    || message.includes("socket hang up")
    || message.includes("429")
    || message.includes("5xx")
    || message.includes("502")
    || message.includes("503")
    || message.includes("504")
  );
}

function backoffDelayMs(attempt: number): number {
  const exp = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * RETRY_BASE_DELAY_MS);
  return exp + jitter;
}

async function getClientForUser(userId: string): Promise<Client> {
  const token = await authProvider.getAccessToken(userId);
  const existing = clientCache.get(userId);
  if (existing && existing.token === token) {
    return existing.client;
  }

  if (existing) {
    await existing.client.close().catch(() => undefined);
    clientCache.delete(userId);
  }

  const transport = new StreamableHTTPClientTransport(
    new URL(getSuperhumanMcpUrl()),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );

  const client = new Client({
    name: "outboundos-server",
    version: "1.0.0",
  });

  await client.connect(transport);
  clientCache.set(userId, { token, client, transport });
  return client;
}

function parseToolJson<T>(result: unknown): T {
  if (
    result &&
    typeof result === "object" &&
    "structuredContent" in result &&
    (result as { structuredContent?: unknown }).structuredContent &&
    typeof (result as { structuredContent?: unknown }).structuredContent === "object"
  ) {
    return (result as { structuredContent: T }).structuredContent;
  }

  if (
    result &&
    typeof result === "object" &&
    "toolResult" in result &&
    (result as { toolResult?: unknown }).toolResult !== undefined
  ) {
    return (result as { toolResult: T }).toolResult;
  }

  if (result && typeof result === "object" && "content" in result) {
    const content = (result as { content?: Array<{ type?: string; text?: string }> }).content || [];
    for (const block of content) {
      if (block?.type !== "text" || !block.text) continue;
      try {
        return JSON.parse(block.text) as T;
      } catch {
        // Continue until we find a JSON-parsable text block.
      }
    }
  }

  throw new Error("Unable to parse JSON payload from Superhuman MCP tool response");
}

async function callSuperhumanTool<T>(
  userId: string,
  toolName: string,
  args: JsonRecord,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_MCP_RETRIES; attempt++) {
    try {
      const client = await getClientForUser(userId);
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });
      return parseToolJson<T>(result);
    } catch (err) {
      lastError = err;
      const existing = clientCache.get(userId);
      if (existing) {
        await existing.client.close().catch(() => undefined);
        clientCache.delete(userId);
      }
      const retryable = isRetryableSuperhumanError(err);
      const shouldRetry = retryable && attempt < MAX_MCP_RETRIES;
      if (!shouldRetry) break;
      await sleep(backoffDelayMs(attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
}

export async function listThreads(
  userId: string,
  filters: ListThreadsFilters,
): Promise<SuperhumanListThreadsResponse> {
  const payload = await callSuperhumanTool<SuperhumanListThreadsResponse>(
    userId,
    "list_threads",
    filters as JsonRecord,
  );
  return {
    threads: payload.threads || [],
    next_cursor: payload.next_cursor,
    total_estimate: payload.total_estimate,
  };
}

export async function getThread(
  userId: string,
  threadId: string,
): Promise<SuperhumanGetThreadResponse> {
  return callSuperhumanTool<SuperhumanGetThreadResponse>(userId, "get_thread", {
    thread_id: threadId,
  });
}

export interface SuperhumanDraftResponse {
  draft_id: string;
  thread_id: string;
}

export async function createSuperhumanDraft(
  userId: string,
  params: { to: string; subject: string; body: string; thread_id?: string },
): Promise<SuperhumanDraftResponse> {
  return callSuperhumanTool<SuperhumanDraftResponse>(userId, "draft_email", {
    to: params.to,
    subject: params.subject,
    body: params.body,
    ...(params.thread_id ? { thread_id: params.thread_id } : {}),
  });
}

export async function sendSuperhumanDraft(
  userId: string,
  params: { draft_id: string; thread_id: string },
): Promise<{ success: boolean }> {
  return callSuperhumanTool<{ success: boolean }>(userId, "send_draft", {
    draft_id: params.draft_id,
    thread_id: params.thread_id,
  });
}

export async function clearSuperhumanClient(userId: string): Promise<void> {
  const existing = clientCache.get(userId);
  if (!existing) return;
  await existing.client.close().catch(() => undefined);
  clientCache.delete(userId);
}
