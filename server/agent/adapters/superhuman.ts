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
    throw new Error(
      "RELATIONSHIP_PROVIDER_MODE=live but Superhuman MCP adapter is not wired yet"
    );
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
