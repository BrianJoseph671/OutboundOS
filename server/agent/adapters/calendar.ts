/**
 * Google Calendar MCP adapter — fetches events and maps to RawInteraction[].
 *
 * TODO: Brian wires live MCP `gcal_list_events` call here.
 * The placeholder returns empty arrays. The mapping layer is production-ready.
 */
import type { CalendarEvent } from "@shared/types/mcp";
import type { RawInteraction } from "../services/interactionWriter";
import { matchContact } from "../services/contactMatcher";
import { getRelationshipProviderMode } from "../providerMode";
import { syncGoogleCalendarEvents } from "../../services/googleIntegration";
import { storage } from "../../storage";

/**
 * fetchEvents — pull events from Google Calendar MCP for a time window.
 * TODO: Replace with real MCP call to `gcal_list_events`.
 */
function meetingRowsToCalendarEvents(
  rows: Awaited<ReturnType<typeof storage.getMeetings>>,
): CalendarEvent[] {
  return rows
    .filter((m) => m.source === "google_calendar")
    .map((m) => ({
      eventId: m.externalId || m.id,
      title: m.title || "Calendar event",
      start: (m.startTime || m.createdAt).toISOString(),
      end: (m.endTime || m.startTime || m.createdAt).toISOString(),
      attendees: (m.attendees || [])
        .map((a) => a.email)
        .filter((e): e is string => Boolean(e)),
      description: m.notes || m.summary || null,
    }));
}

export async function fetchEvents(
  timeMin: string,
  timeMax: string,
  userEmail: string,
  userId: string,
): Promise<CalendarEvent[]> {
  const providerMode = getRelationshipProviderMode();
  if (providerMode === "live") {
    try {
      const start = new Date(timeMin);
      const end = new Date(timeMax);
      const daysBack = Math.max(
        1,
        Math.ceil((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000)),
      );
      const daysForward = Math.max(
        0,
        Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
      );
      await syncGoogleCalendarEvents(userId, daysBack, daysForward);
    } catch (err) {
      console.warn("[Calendar] Live sync failed, using cached events:", err);
    }
    const rows = await storage.getMeetings(userId);
    const mapped = meetingRowsToCalendarEvents(rows);
    if (mapped.length > 0) return mapped;
  }

  const contacts = await storage.getContacts(userId);
  const withEmail = contacts.filter((c) => c.email && c.name);
  if (withEmail.length === 0) return [];

  const start = new Date(timeMin).getTime();
  const end = new Date(timeMax).getTime();
  const now = Number.isNaN(end) ? Date.now() : end;
  const baseline = Number.isNaN(start) ? now - 7 * 24 * 60 * 60 * 1000 : start;
  const slot = baseline + Math.floor((now - baseline) * 0.75);
  const eventStart = new Date(slot);
  const eventEnd = new Date(slot + 30 * 60 * 1000);

  return withEmail.slice(0, 1).map((contact) => ({
    eventId: `mock-calendar-${userId}-${contact.id}`,
    title: `Coffee chat with ${contact.name}`,
    start: eventStart.toISOString(),
    end: eventEnd.toISOString(),
    attendees: [userEmail || "owner@kin.local", contact.email!],
    description: `Reconnect touchpoint with ${contact.name}.`,
  }));
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
    const events = await fetchEvents(startDate, endDate, userEmail, userId);

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
