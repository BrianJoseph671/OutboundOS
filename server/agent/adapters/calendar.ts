/**
 * Google Calendar MCP adapter — fetches events and maps to RawInteraction[].
 *
 * TODO: Brian wires live MCP `gcal_list_events` call here.
 * The placeholder returns empty arrays. The mapping layer is production-ready.
 */
import type { CalendarEvent } from "@shared/types/mcp";
import type { RawInteraction } from "../services/interactionWriter";
import { matchContact } from "../services/contactMatcher";

/**
 * fetchEvents — pull events from Google Calendar MCP for a time window.
 * TODO: Replace with real MCP call to `gcal_list_events`.
 */
export async function fetchEvents(
  _timeMin: string,
  _timeMax: string,
): Promise<CalendarEvent[]> {
  console.warn("[Calendar Adapter] fetchEvents — TODO placeholder, returning empty");
  return [];
}

/**
 * mapEventToInteraction — convert a Calendar event to a RawInteraction.
 *
 * Direction: always "mutual" (per PRD Section 5.2).
 * sourceId: eventId.
 * summary: event title.
 */
export function mapEventToInteraction(
  event: CalendarEvent,
  contactId: string,
): RawInteraction {
  return {
    contactId,
    channel: "meeting",
    direction: "mutual",
    occurredAt: new Date(event.start),
    sourceId: event.eventId,
    summary: event.title,
    source: "calendar",
  };
}

/**
 * fetchAndMapEvents — full pipeline: fetch events, match contacts, map to RawInteraction[].
 * Each event may produce multiple RawInteractions (one per matched external attendee).
 */
export async function fetchAndMapEvents(
  startDate: string,
  endDate: string,
  userId: string,
  userEmail: string,
): Promise<{ interactions: RawInteraction[]; errors: string[] }> {
  const errors: string[] = [];
  const result: RawInteraction[] = [];

  try {
    const events = await fetchEvents(startDate, endDate);

    for (const event of events) {
      // Filter to external attendees only (exclude user's own email)
      const externalAttendees = event.attendees.filter(
        (email) => email.toLowerCase().trim() !== userEmail.toLowerCase().trim(),
      );

      for (const attendeeEmail of externalAttendees) {
        const contact = await matchContact(attendeeEmail, userId);
        if (!contact) continue;
        result.push(mapEventToInteraction(event, contact.id));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Calendar fetch failed: ${msg}`);
  }

  return { interactions: result, errors };
}
