/**
 * Superhuman MCP adapter — fetches emails and maps to RawInteraction[].
 *
 * TODO: Brian wires live MCP `list_email` / `get_email_thread` calls here.
 * The placeholder returns empty arrays. The mapping layer is production-ready.
 */
import type { SuperhumanEmail } from "@shared/types/mcp";
import type { RawInteraction } from "../services/interactionWriter";
import { matchContact } from "../services/contactMatcher";
import { getRelationshipProviderMode } from "../providerMode";
import { storage } from "../../storage";
import { listGmailThreads } from "../../services/gmailClient";
import type { GmailThreadSummary as SuperhumanThreadSummary } from "../../services/gmailClient";
import type { GmailThreadMessage as SuperhumanThreadMessage } from "../../services/gmailClient";
import {
  getSuperhumanCheckpoint,
  saveSuperhumanCheckpoint,
} from "../services/superhumanSyncState";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGES_PER_SYNC = Number.parseInt(
  process.env.SUPERHUMAN_MAX_PAGES_PER_SYNC || "20",
  10,
);
const MAX_THREADS_PER_SYNC = Number.parseInt(
  process.env.SUPERHUMAN_MAX_THREADS_PER_SYNC || "1000",
  10,
);

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
}

function normalizeEmailList(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const email = extractEmailAddress(value);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }
  return normalized;
}

function toTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function pickLatestMessage(thread: SuperhumanThreadSummary): SuperhumanThreadMessage | undefined {
  if (!thread.messages?.length) return undefined;
  return [...thread.messages].sort((a, b) => toTimestamp(b.sent_at) - toTimestamp(a.sent_at))[0];
}

/**
 * fetchEmails — pull emails from Superhuman MCP for a date range.
 * TODO: Replace with real MCP call to `list_email`.
 */
export async function fetchEmails(
  startDate: string,
  endDate: string,
  userEmail: string,
  userId: string,
): Promise<SuperhumanEmail[]> {
  const startedAt = Date.now();
  const providerMode = getRelationshipProviderMode();
  if (providerMode === "live") {
    const checkpointIso = await getSuperhumanCheckpoint(userId);
    const effectiveStartDate =
      checkpointIso && Date.parse(checkpointIso) > Date.parse(startDate)
        ? checkpointIso
        : startDate;

    const threads: SuperhumanThreadSummary[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    let hitPageLimit = false;
    let hitThreadLimit = false;

    while (pageCount < MAX_PAGES_PER_SYNC && threads.length < MAX_THREADS_PER_SYNC) {
      const remaining = MAX_THREADS_PER_SYNC - threads.length;
      const pageLimit = Math.min(DEFAULT_PAGE_LIMIT, remaining);
      if (pageLimit <= 0) break;

      const response = await listGmailThreads(userId, {
        start_date: effectiveStartDate,
        end_date: endDate,
        limit: pageLimit,
        ...(cursor ? { cursor } : {}),
      });

      threads.push(...(response.threads || []));
      pageCount++;
      cursor = response.next_cursor;
      if (!cursor) break;
    }
    hitPageLimit = pageCount >= MAX_PAGES_PER_SYNC && !!cursor;
    hitThreadLimit = threads.length >= MAX_THREADS_PER_SYNC;

    const mapped: SuperhumanEmail[] = [];
    for (const thread of threads) {
      const latestMessage = pickLatestMessage(thread);
      const fromRaw = latestMessage?.from || thread.participants[0] || "";
      const from = extractEmailAddress(fromRaw);

      const toRaw = latestMessage?.to || thread.participants.slice(1);
      const to = normalizeEmailList(toRaw);
      const cc = normalizeEmailList(latestMessage?.cc || []);

      mapped.push({
        messageId: latestMessage?.message_id || `${thread.thread_id}-latest`,
        threadId: thread.thread_id,
        from,
        to,
        cc,
        subject: latestMessage?.subject || thread.subject,
        date: latestMessage?.sent_at || thread.last_message_at,
        snippet: latestMessage?.snippet || thread.snippet,
        hasAttachments: (latestMessage?.attachments?.length || 0) > 0,
      });
    }

    const newestEmailDate = mapped.reduce<string | null>((latest, email) => {
      if (!email.date || Number.isNaN(Date.parse(email.date))) return latest;
      if (!latest) return email.date;
      return Date.parse(email.date) > Date.parse(latest) ? email.date : latest;
    }, null);
    if (newestEmailDate) {
      await saveSuperhumanCheckpoint(userId, newestEmailDate);
    }
    console.info("[Sync][Superhuman] fetchEmails completed", {
      userId,
      providerMode,
      requestedStartDate: startDate,
      effectiveStartDate,
      endDate,
      checkpointIso,
      pagesFetched: pageCount,
      threadsFetched: threads.length,
      emailsMapped: mapped.length,
      hitPageLimit,
      hitThreadLimit,
      elapsedMs: Date.now() - startedAt,
    });

    return mapped;
  }

  const contacts = await storage.getContacts(userId);
  const withEmail = contacts.filter((c) => c.email && c.name);
  if (withEmail.length === 0) return [];

  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Number.isNaN(end) ? Date.now() : end;
  const baseline = Number.isNaN(start) ? now - 7 * 24 * 60 * 60 * 1000 : start;
  const span = Math.max(1, now - baseline);

  return withEmail.slice(0, 3).map((contact, index) => {
    const occurredAt = new Date(baseline + Math.floor(((index + 1) / 4) * span));
    return {
      messageId: `mock-email-message-${userId}-${contact.id}`,
      threadId: `mock-email-thread-${userId}-${contact.id}`,
      from: contact.email!,
      to: [userEmail || "owner@outboundos.local"],
      cc: [],
      subject: `Following up from ${contact.company ?? "our last note"}`,
      date: occurredAt.toISOString(),
      snippet: `Quick follow-up from ${contact.name} about next steps.`,
      hasAttachments: false,
    };
  });
}

/**
 * mapEmailToInteraction — convert a Superhuman email to a RawInteraction.
 *
 * Direction: outbound if `from` matches userEmail (case-insensitive), inbound otherwise.
 * sourceId: thread_id (stable per-conversation identity for idempotent dedupe).
 * summary: subject + snippet truncated to 200 chars.
 */
export function mapEmailToInteraction(
  email: SuperhumanEmail,
  contactId: string,
  userEmail: string,
): RawInteraction {
  const fromNorm = email.from.toLowerCase().trim();
  const userNorm = userEmail.toLowerCase().trim();
  const direction = fromNorm === userNorm ? "outbound" : "inbound";

  const fullSummary = `${email.subject} — ${email.snippet}`;
  const summary = fullSummary.length > 200 ? fullSummary.slice(0, 200) : fullSummary;

  return {
    contactId,
    channel: "email",
    direction,
    occurredAt: new Date(email.date),
    sourceId: email.threadId,
    summary,
    source: "superhuman",
  };
}

/**
 * fetchAndMapEmails — full pipeline: fetch emails, match contacts, map to RawInteraction[].
 * Unmatched participants are skipped.
 */
export async function fetchAndMapEmails(
  startDate: string,
  endDate: string,
  userId: string,
  userEmail: string,
): Promise<{ interactions: RawInteraction[]; errors: string[] }> {
  const errors: string[] = [];
  const result: RawInteraction[] = [];

  try {
    const emails = await fetchEmails(startDate, endDate, userEmail, userId);

    for (const email of emails) {
      // Determine the counterparty email (the non-user participant)
      const fromNorm = email.from.toLowerCase().trim();
      const userNorm = userEmail.toLowerCase().trim();
      const counterpartyEmail =
        fromNorm === userNorm
          ? email.to[0] // outbound: counterparty is the first recipient
          : email.from; // inbound: counterparty is the sender

      if (!counterpartyEmail) continue;

      const contact = await matchContact(counterpartyEmail, userId);
      if (!contact) continue; // skip unmatched participants

      result.push(mapEmailToInteraction(email, contact.id, userEmail));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Superhuman fetch failed: ${msg}`);
  }

  return { interactions: result, errors };
}
