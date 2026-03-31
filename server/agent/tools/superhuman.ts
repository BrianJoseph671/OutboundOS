/**
 * Superhuman MCP tool adapters.
 * TODO: These are placeholder implementations — Brian wires live MCP connections separately.
 * Each tool body logs a warning and returns empty/mock data.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { SuperhumanEmail, SuperhumanThread } from "@shared/types/mcp";

/**
 * list_emails — List emails from Superhuman within a date range.
 * Returns an array of SuperhumanEmail objects.
 */
export const listEmailsTool = tool(
  async (_input: { startDate: string; endDate: string; limit?: number; cursor?: string }) => {
    console.warn("[Superhuman MCP] listEmails — MCP adapter not wired — return empty/mock data");
    const result: SuperhumanEmail[] = [];
    return JSON.stringify(result);
  },
  {
    name: "list_emails",
    description:
      "List emails from Superhuman within a date range. Returns recent email threads involving the user.",
    schema: z.object({
      startDate: z
        .string()
        .describe("ISO 8601 date string for the start of the date range (e.g. '2025-01-01')"),
      endDate: z
        .string()
        .describe("ISO 8601 date string for the end of the date range (e.g. '2025-01-31')"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of emails to return (default 50)"),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor for fetching the next page of results"),
    }),
  }
);

/**
 * get_email_thread — Get a full email thread by threadId from Superhuman.
 * Returns a SuperhumanThread with all messages in the thread.
 */
export const getEmailThreadTool = tool(
  async (_input: { threadId: string }) => {
    console.warn("[Superhuman MCP] getEmailThread — MCP adapter not wired — return empty/mock data");
    const result: SuperhumanThread = {
      threadId: _input.threadId,
      messages: [],
    };
    return JSON.stringify(result);
  },
  {
    name: "get_email_thread",
    description:
      "Get a full email thread from Superhuman by thread ID. Returns all messages in the thread.",
    schema: z.object({
      threadId: z
        .string()
        .describe("The unique identifier of the email thread to retrieve"),
    }),
  }
);
