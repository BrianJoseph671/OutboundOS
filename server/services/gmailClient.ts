import { getValidAccessToken } from "./oauth";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailThreadMessage {
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

export interface GmailThreadSummary {
  thread_id: string;
  subject: string;
  snippet: string;
  participants: string[];
  labels: string[];
  last_message_at: string;
  message_count: number;
  messages?: GmailThreadMessage[];
}

export interface GmailListThreadsResponse {
  threads: GmailThreadSummary[];
  next_cursor?: string;
  total_estimate?: number;
}

export interface GmailListThreadsFilters {
  limit?: number;
  start_date?: string;
  end_date?: string;
  from?: string[];
  to?: string[];
  cursor?: string;
}

function toDateQuery(dateIso: string): string {
  const d = new Date(dateIso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function buildGmailQuery(filters: GmailListThreadsFilters): string {
  const parts: string[] = [];

  if (filters.start_date) {
    parts.push(`after:${toDateQuery(filters.start_date)}`);
  }
  if (filters.end_date) {
    parts.push(`before:${toDateQuery(filters.end_date)}`);
  }
  if (filters.from && filters.from.length > 0) {
    const fromQuery = filters.from.map((v) => `from:${v}`).join(" OR ");
    parts.push(filters.from.length > 1 ? `(${fromQuery})` : fromQuery);
  }
  if (filters.to && filters.to.length > 0) {
    const toQuery = filters.to.map((v) => `to:${v}`).join(" OR ");
    parts.push(filters.to.length > 1 ? `(${toQuery})` : toQuery);
  }

  return parts.join(" ");
}

function parseAddressList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function getHeader(headers: Array<{ name?: string; value?: string }> | undefined, name: string): string {
  if (!headers) return "";
  const target = name.toLowerCase();
  const match = headers.find((h) => (h.name || "").toLowerCase() === target);
  return match?.value || "";
}

function toIsoDate(message: { internalDate?: string; payload?: { headers?: Array<{ name?: string; value?: string }> } }): string {
  if (message.internalDate) {
    const millis = Number.parseInt(message.internalDate, 10);
    if (!Number.isNaN(millis)) {
      return new Date(millis).toISOString();
    }
  }
  const headerDate = getHeader(message.payload?.headers, "Date");
  const parsed = Date.parse(headerDate);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return new Date(0).toISOString();
}

function collectAttachments(payload: { filename?: string; parts?: Array<any> } | undefined): string[] {
  if (!payload) return [];
  const files: string[] = [];
  if (payload.filename) files.push(payload.filename);
  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      files.push(...collectAttachments(part));
    }
  }
  return files.filter(Boolean);
}

async function gmailFetch<T>(userId: string, url: string, init?: RequestInit): Promise<T> {
  const accessToken = await getValidAccessToken("google", userId);
  if (!accessToken) {
    throw new Error("Google is not connected. Connect it in Settings first.");
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail API request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

export async function getGmailThread(
  userId: string,
  threadId: string,
): Promise<GmailThreadSummary> {
  const url = `${GMAIL_API_BASE}/threads/${encodeURIComponent(threadId)}?format=full`;
  const raw = await gmailFetch<{
    id: string;
    snippet?: string;
    historyId?: string;
    messages?: Array<{
      id: string;
      threadId: string;
      labelIds?: string[];
      snippet?: string;
      internalDate?: string;
      payload?: {
        headers?: Array<{ name?: string; value?: string }>;
        filename?: string;
        parts?: Array<any>;
      };
    }>;
  }>(userId, url);

  const mappedMessages: GmailThreadMessage[] = (raw.messages || []).map((msg) => {
    const from = getHeader(msg.payload?.headers, "From");
    const to = parseAddressList(getHeader(msg.payload?.headers, "To"));
    const cc = parseAddressList(getHeader(msg.payload?.headers, "Cc"));
    const subject = getHeader(msg.payload?.headers, "Subject");
    const sentAt = toIsoDate(msg);
    const attachments = collectAttachments(msg.payload);

    return {
      message_id: msg.id,
      thread_id: msg.threadId,
      from,
      to,
      cc,
      subject,
      snippet: msg.snippet || "",
      sent_at: sentAt,
      labels: msg.labelIds || [],
      attachments,
    };
  });

  mappedMessages.sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  const latest = mappedMessages[mappedMessages.length - 1];
  const participantsSet = new Set<string>();
  for (const msg of mappedMessages) {
    if (msg.from) participantsSet.add(msg.from);
    for (const recipient of msg.to) participantsSet.add(recipient);
    for (const carbonCopy of msg.cc || []) participantsSet.add(carbonCopy);
  }

  return {
    thread_id: raw.id,
    subject: latest?.subject || "",
    snippet: latest?.snippet || raw.snippet || "",
    participants: Array.from(participantsSet),
    labels: latest?.labels || [],
    last_message_at: latest?.sent_at || new Date(0).toISOString(),
    message_count: mappedMessages.length,
    messages: mappedMessages,
  };
}

export async function listGmailThreads(
  userId: string,
  filters: GmailListThreadsFilters,
): Promise<GmailListThreadsResponse> {
  const maxResults = filters.limit || 50;
  const q = buildGmailQuery(filters);
  const query = new URLSearchParams();
  query.set("maxResults", String(maxResults));
  if (q) query.set("q", q);
  if (filters.cursor) query.set("pageToken", filters.cursor);

  const url = `${GMAIL_API_BASE}/threads?${query.toString()}`;
  const listResponse = await gmailFetch<{
    threads?: Array<{ id: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(userId, url);

  const ids = (listResponse.threads || []).map((t) => t.id);
  const threads: GmailThreadSummary[] = [];
  for (const threadId of ids) {
    try {
      const thread = await getGmailThread(userId, threadId);
      threads.push(thread);
    } catch (err) {
      console.warn("[GmailClient] Failed to load thread", { threadId, err });
    }
  }

  return {
    threads,
    next_cursor: listResponse.nextPageToken,
    total_estimate: listResponse.resultSizeEstimate,
  };
}

function toBase64UrlUtf8(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function createGmailDraft(
  userId: string,
  params: { to: string; subject: string; body: string; thread_id?: string },
): Promise<{ draft_id: string; thread_id: string }> {
  const headers = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    params.body,
  ].join("\r\n");

  const raw = toBase64UrlUtf8(headers);

  const requestBody = {
    message: {
      raw,
      ...(params.thread_id ? { threadId: params.thread_id } : {}),
    },
  };

  const url = `${GMAIL_API_BASE}/drafts`;
  const response = await gmailFetch<{
    id: string;
    message?: { threadId?: string };
  }>(userId, url, {
    method: "POST",
    body: JSON.stringify(requestBody),
  });

  return {
    draft_id: response.id,
    thread_id: response.message?.threadId || params.thread_id || "",
  };
}
