/**
 * Superhuman MCP adapter — fetches emails and maps to RawInteraction[].
 *
 * TODO: Brian wires live MCP `list_email` / `get_email_thread` calls here.
 * The placeholder returns empty arrays. The mapping layer is production-ready.
 */
import type { SuperhumanEmail } from "@shared/types/mcp";
import type { RawInteraction } from "../services/interactionWriter";
import { matchContact } from "../services/contactMatcher";

/**
 * fetchEmails — pull emails from Superhuman MCP for a date range.
 * TODO: Replace with real MCP call to `list_email`.
 */
export async function fetchEmails(
  _startDate: string,
  _endDate: string,
  _userEmail: string,
): Promise<SuperhumanEmail[]> {
  console.warn("[Superhuman Adapter] fetchEmails — TODO placeholder, returning empty");
  return [];
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
    const emails = await fetchEmails(startDate, endDate, userEmail);

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
