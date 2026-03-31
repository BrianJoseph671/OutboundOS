/**
 * Google Calendar MCP tool adapters.
 * TODO: These are placeholder implementations — Brian wires live MCP connections separately.
 * Each tool body logs a warning and returns empty/mock data.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { CalendarEvent } from "@shared/types/mcp";

/**
 * list_events — List calendar events from Google Calendar within a time window.
 * Returns an array of CalendarEvent objects.
 */
export const listEventsTool = tool(
  async (_input: {
    calendarId: string;
    timeMin: string;
    timeMax: string;
    timeZone?: string;
    maxResults?: number;
  }) => {
    console.warn("[Calendar MCP] listEvents — MCP adapter not wired — return empty/mock data");
    const result: CalendarEvent[] = [];
    return JSON.stringify(result);
  },
  {
    name: "list_events",
    description:
      "List calendar events from Google Calendar within a specified time window. Returns event details including attendees.",
    schema: z.object({
      calendarId: z
        .string()
        .describe(
          "The calendar ID to fetch events from (e.g. 'primary' for the user's primary calendar)"
        ),
      timeMin: z
        .string()
        .describe(
          "ISO 8601 datetime string for the start of the time window (e.g. '2025-01-01T00:00:00Z')"
        ),
      timeMax: z
        .string()
        .describe(
          "ISO 8601 datetime string for the end of the time window (e.g. '2025-01-31T23:59:59Z')"
        ),
      timeZone: z
        .string()
        .optional()
        .describe("IANA timezone name (e.g. 'America/New_York'). Defaults to UTC if not provided."),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of events to return (default 100)"),
    }),
  }
);
