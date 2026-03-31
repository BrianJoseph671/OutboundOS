/**
 * Granola MCP tool adapters.
 * TODO: These are placeholder implementations — Brian wires live MCP connections separately.
 * Each tool body logs a warning and returns empty/mock data.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { GranolaMeeting } from "@shared/types/mcp";

/**
 * list_meetings — List meetings from Granola for a given time range.
 * Returns an array of GranolaMeeting objects.
 */
export const listMeetingsTool = tool(
  async (_input: { timeRange: "this_week" | "last_week" | "last_30_days" }) => {
    console.warn("[Granola MCP] listMeetings — MCP adapter not wired — return empty/mock data");
    const result: GranolaMeeting[] = [];
    return JSON.stringify(result);
  },
  {
    name: "list_meetings",
    description:
      "List meetings from Granola for a given time range. Returns meeting summaries with participant information.",
    schema: z.object({
      timeRange: z
        .enum(["this_week", "last_week", "last_30_days"])
        .describe(
          "The time range to fetch meetings for: 'this_week', 'last_week', or 'last_30_days'"
        ),
    }),
  }
);

/**
 * get_meetings — Get detailed meeting information for a list of meeting IDs from Granola.
 * Returns an array of GranolaMeeting objects with full details.
 */
export const getMeetingsTool = tool(
  async (_input: { meetingIds: string[] }) => {
    console.warn("[Granola MCP] getMeetings — MCP adapter not wired — return empty/mock data");
    const result: GranolaMeeting[] = [];
    return JSON.stringify(result);
  },
  {
    name: "get_meetings",
    description:
      "Get detailed meeting information for a list of meeting IDs from Granola. Returns full summaries and participant details.",
    schema: z.object({
      meetingIds: z
        .array(z.string())
        .describe("Array of Granola meeting UUIDs to retrieve details for"),
    }),
  }
);
