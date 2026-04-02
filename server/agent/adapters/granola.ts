/**
 * Granola MCP adapter — fetches meetings and maps to RawInteraction[].
 *
 * TODO: Brian wires live MCP `list_meetings` / `get_meetings` calls here.
 * The placeholder returns empty arrays. The mapping layer is production-ready.
 */
import type { GranolaMeeting } from "@shared/types/mcp";
import type { RawInteraction } from "../services/interactionWriter";
import { matchContact } from "../services/contactMatcher";
import { getRelationshipProviderMode } from "../providerMode";
import { storage } from "../../storage";

type GranolaTimeRange = "this_week" | "last_week" | "last_30_days";

/**
 * Compute the best Granola time_range enum value from a date range.
 * Granola only accepts enum values, not arbitrary dates.
 */
export function computeTimeRange(startDate: Date): GranolaTimeRange {
  const now = new Date();
  const diffMs = now.getTime() - startDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 7) return "this_week";
  if (diffDays <= 14) return "last_week";
  return "last_30_days";
}

/**
 * fetchMeetings — pull meetings from Granola MCP for a time range.
 * TODO: Replace with real MCP call to `list_meetings` + `get_meetings`.
 */
export async function fetchMeetings(
  timeRange: GranolaTimeRange,
  userId: string,
): Promise<GranolaMeeting[]> {
  const providerMode = getRelationshipProviderMode();
  if (providerMode === "live") {
    throw new Error(
      "RELATIONSHIP_PROVIDER_MODE=live but Granola MCP adapter is not wired yet"
    );
  }

  const contacts = await storage.getContacts(userId);
  const withEmail = contacts.filter((c) => c.email && c.name);
  if (withEmail.length === 0) return [];

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const lookbackDays = timeRange === "this_week" ? 5 : timeRange === "last_week" ? 12 : 25;
  const meetingDate = new Date(now - lookbackDays * dayMs).toISOString().slice(0, 10);

  return withEmail.slice(0, 2).map((contact) => ({
    id: `mock-granola-${userId}-${contact.id}`,
    title: `Catch-up with ${contact.name}`,
    date: meetingDate,
    knownParticipants: [contact.email!],
    summary: `Discussed priorities and agreed on a follow-up with ${contact.name}.`,
  }));
}

/**
 * mapMeetingToInteraction — convert a Granola meeting to a RawInteraction.
 *
 * Direction: always "mutual" (per PRD Section 5.2).
 * sourceId: meeting UUID.
 * summary: first 500 chars of AI summary.
 */
export function mapMeetingToInteraction(
  meeting: GranolaMeeting,
  contactId: string,
): RawInteraction {
  const summary = meeting.summary.length > 500
    ? meeting.summary.slice(0, 500)
    : meeting.summary;

  return {
    contactId,
    channel: "meeting",
    direction: "mutual",
    occurredAt: new Date(meeting.date),
    sourceId: meeting.id,
    summary,
    source: "granola",
  };
}

/**
 * fetchAndMapMeetings — full pipeline: fetch meetings, match contacts, map to RawInteraction[].
 * Each meeting may produce multiple RawInteractions (one per matched participant).
 */
export async function fetchAndMapMeetings(
  startDate: Date,
  userId: string,
): Promise<{ interactions: RawInteraction[]; errors: string[] }> {
  const errors: string[] = [];
  const result: RawInteraction[] = [];

  try {
    const timeRange = computeTimeRange(startDate);
    const meetings = await fetchMeetings(timeRange, userId);

    for (const meeting of meetings) {
      for (const participantEmail of meeting.knownParticipants) {
        const contact = await matchContact(participantEmail, userId);
        if (!contact) continue;
        result.push(mapMeetingToInteraction(meeting, contact.id));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Granola fetch failed: ${msg}`);
  }

  return { interactions: result, errors };
}
