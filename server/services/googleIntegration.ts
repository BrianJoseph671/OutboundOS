import { getValidAccessToken } from "./oauth";
import { storage } from "../storage";
import type { InsertMeeting } from "@shared/schema";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string; displayName?: string; self?: boolean; responseStatus?: string }>;
  description?: string;
  status?: string;
}

interface GoogleCalendarListResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

async function googleFetch(url: string, accessToken: string): Promise<Response> {
  return fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function syncGoogleCalendarEvents(daysBack = 30, daysForward = 7): Promise<{
  synced: number;
  matched: number;
  errors: string[];
}> {
  const accessToken = await getValidAccessToken("google");
  if (!accessToken) {
    throw new Error("Google not connected or token expired");
  }

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - daysBack);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + daysForward);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const errors: string[] = [];
  let synced = 0;
  let matched = 0;
  let pageToken: string | undefined;

  do {
    const url = `${CALENDAR_API}/calendars/primary/events?${params.toString()}${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await googleFetch(url, accessToken);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Calendar API error: ${res.status} ${text}`);
    }

    const data: GoogleCalendarListResponse = await res.json();

    for (const event of data.items) {
      if (!event.id || event.status === "cancelled") continue;

      try {
        const startTime = event.start?.dateTime || event.start?.date;
        const endTime = event.end?.dateTime || event.end?.date;

        const attendees = (event.attendees || []).map((a) => ({
          email: a.email,
          name: a.displayName,
          self: a.self,
        }));

        const meetingData: Partial<InsertMeeting> = {
          title: event.summary || "Untitled Event",
          startTime: startTime ? new Date(startTime) : null,
          endTime: endTime ? new Date(endTime) : null,
          attendees,
        };

        await storage.upsertMeetingByExternalId("google_calendar", event.id, meetingData);
        synced++;

        // Auto-match attendees to contacts by email
        const matchCount = await matchMeetingToContacts(event.id, attendees);
        matched += matchCount;
      } catch (err: any) {
        errors.push(`Event ${event.id}: ${err.message}`);
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return { synced, matched, errors };
}

async function matchMeetingToContacts(
  googleEventId: string,
  attendees: Array<{ email?: string; name?: string; self?: boolean }>
): Promise<number> {
  const meeting = await storage.getMeetingByExternalId("google_calendar", googleEventId);
  if (!meeting) return 0;

  const contacts = await storage.getContacts();
  let matchCount = 0;

  for (const attendee of attendees) {
    if (attendee.self) continue;

    // Match by email
    if (attendee.email) {
      const emailMatch = contacts.find(
        (c) => c.email && c.email.toLowerCase() === attendee.email!.toLowerCase()
      );
      if (emailMatch) {
        await storage.linkContactToMeeting({
          contactId: emailMatch.id,
          meetingId: meeting.id,
          matchedBy: "email",
        });
        matchCount++;
        continue;
      }
    }

    // Match by name
    if (attendee.name) {
      const nameMatch = contacts.find(
        (c) => c.name.toLowerCase() === attendee.name!.toLowerCase()
      );
      if (nameMatch) {
        await storage.linkContactToMeeting({
          contactId: nameMatch.id,
          meetingId: meeting.id,
          matchedBy: "name",
        });
        matchCount++;
      }
    }
  }

  return matchCount;
}

export async function getGoogleUserInfo(): Promise<{ email: string; name?: string } | null> {
  const accessToken = await getValidAccessToken("google");
  if (!accessToken) return null;

  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}
