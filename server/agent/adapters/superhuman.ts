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
import { listThreads } from "../../services/mcpClient";

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
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
  const providerMode = getRelationshipProviderMode();
  if (providerMode === "live") {
    const response = await listThreads(userId, {
      start_date: startDate,
      end_date: endDate,
      limit: 50,
    });

    const mapped: SuperhumanEmail[] = [];
    for (const thread of response.threads) {
      const latestMessage = thread.messages?.[0];
      const fromRaw = latestMessage?.from || thread.participants[0] || "";
      const from = extractEmailAddress(fromRaw);

      const toRaw = latestMessage?.to || thread.participants.slice(1);
      const to = toRaw.map(extractEmailAddress).filter(Boolean);
      const cc = (latestMessage?.cc || []).map(extractEmailAddress).filter(Boolean);

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
 * sourceId: thread_id (per PRD Section 5.2 Interaction Mapping).
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
