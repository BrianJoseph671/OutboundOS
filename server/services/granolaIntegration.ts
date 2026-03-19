import { getValidAccessToken } from "./oauth";
import { storage } from "../storage";
import type { InsertMeeting } from "@shared/schema";

const GRANOLA_MCP_URL = "https://mcp.granola.ai/mcp";

interface GranolaMeeting {
  id: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  attendees?: Array<{ email?: string; name?: string }>;
  notes?: string;
  transcript?: string;
  summary?: string;
  actionItems?: string[];
}

interface McpToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/**
 * Granola uses Google OAuth for authentication — we pass the user's Google
 * access token directly to Granola's MCP endpoint.
 */
async function getGranolaToken(): Promise<string> {
  const token = await getValidAccessToken("google");
  if (!token) {
    throw new Error("Google not connected. Connect your Google account first to enable Granola sync.");
  }
  return token;
}

async function mcpCall(
  method: string,
  params: Record<string, unknown>,
  accessToken: string
): Promise<any> {
  const body = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  };

  const res = await fetch(GRANOLA_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Granola MCP error ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`MCP error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result;
}

async function listGranolaTools(accessToken: string): Promise<any[]> {
  const result = await mcpCall("tools/list", {}, accessToken);
  return result?.tools || [];
}

async function callGranolaTool(
  toolName: string,
  args: Record<string, unknown>,
  accessToken: string
): Promise<McpToolCallResult> {
  return await mcpCall("tools/call", { name: toolName, arguments: args }, accessToken);
}

function extractTextFromMcpResult(result: McpToolCallResult): string {
  if (!result?.content) return "";
  return result.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");
}

export async function syncGranolaMeetings(daysBack = 30): Promise<{
  synced: number;
  matched: number;
  errors: string[];
}> {
  const accessToken = await getGranolaToken();
  const errors: string[] = [];
  let synced = 0;
  let matched = 0;

  try {
    const tools = await listGranolaTools(accessToken);
    const toolNames = tools.map((t: any) => t.name);

    const listToolName = toolNames.find(
      (n: string) => n.includes("list_meetings") || n.includes("get_meetings") || n.includes("meetings")
    ) || "list_meetings";

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    const listResult = await callGranolaTool(
      listToolName,
      { since: sinceDate.toISOString(), limit: 100 },
      accessToken
    );

    const rawText = extractTextFromMcpResult(listResult);
    let meetingsList: GranolaMeeting[] = [];

    try {
      meetingsList = JSON.parse(rawText);
    } catch {
      console.log("[Granola] Non-JSON response from list_meetings, attempting text parse");
      meetingsList = [];
    }

    if (!Array.isArray(meetingsList)) {
      meetingsList = [meetingsList];
    }

    for (const gMeeting of meetingsList) {
      if (!gMeeting.id) continue;

      try {
        let notes = gMeeting.notes || "";
        let transcript = gMeeting.transcript || "";
        let summary = gMeeting.summary || "";
        let actionItems = gMeeting.actionItems || [];

        const detailToolName = toolNames.find(
          (n: string) => n.includes("get_meeting") || n.includes("meeting_details")
        );

        if (detailToolName) {
          try {
            const detailResult = await callGranolaTool(
              detailToolName,
              { meeting_id: gMeeting.id },
              accessToken
            );
            const detailText = extractTextFromMcpResult(detailResult);
            try {
              const detail = JSON.parse(detailText);
              notes = detail.notes || notes;
              transcript = detail.transcript || transcript;
              summary = detail.summary || summary;
              actionItems = detail.actionItems || actionItems;
            } catch {
              notes = notes || detailText;
            }
          } catch (detailErr: any) {
            errors.push(`Detail fetch for ${gMeeting.id}: ${detailErr.message}`);
          }
        }

        const attendees = (gMeeting.attendees || []).map((a) => ({
          email: a.email,
          name: a.name,
        }));

        const meetingData: Partial<InsertMeeting> = {
          title: gMeeting.title || "Granola Meeting",
          startTime: gMeeting.startTime ? new Date(gMeeting.startTime) : null,
          endTime: gMeeting.endTime ? new Date(gMeeting.endTime) : null,
          attendees,
          notes,
          transcript,
          summary,
          actionItems,
        };

        await storage.upsertMeetingByExternalId("granola", gMeeting.id, meetingData);
        synced++;

        const matchCount = await matchGranolaMeetingToContacts(gMeeting.id, attendees);
        matched += matchCount;
      } catch (err: any) {
        errors.push(`Meeting ${gMeeting.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`MCP call failed: ${err.message}`);
  }

  return { synced, matched, errors };
}

async function matchGranolaMeetingToContacts(
  externalId: string,
  attendees: Array<{ email?: string; name?: string }>
): Promise<number> {
  const meeting = await storage.getMeetingByExternalId("granola", externalId);
  if (!meeting) return 0;

  const contacts = await storage.getContacts();
  let matchCount = 0;

  for (const attendee of attendees) {
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

export async function mergeGranolaWithCalendar(): Promise<number> {
  const allMeetings = await storage.getMeetings();
  const calendarMeetings = allMeetings.filter((m) => m.source === "google_calendar");
  const granolaMeetings = allMeetings.filter((m) => m.source === "granola");

  let merged = 0;

  for (const gm of granolaMeetings) {
    if (!gm.startTime) continue;

    const gmStart = new Date(gm.startTime).getTime();
    const match = calendarMeetings.find((cm) => {
      if (!cm.startTime) return false;
      const cmStart = new Date(cm.startTime).getTime();
      const timeDiff = Math.abs(gmStart - cmStart);
      if (timeDiff > 5 * 60 * 1000) return false;
      if (gm.title && cm.title) {
        return gm.title.toLowerCase().includes(cm.title.toLowerCase()) ||
          cm.title.toLowerCase().includes(gm.title.toLowerCase());
      }
      return timeDiff < 60 * 1000;
    });

    if (match) {
      await storage.updateMeeting(match.id, {
        notes: gm.notes || match.notes,
        transcript: gm.transcript || match.transcript,
        summary: gm.summary || match.summary,
        actionItems: (gm.actionItems && (gm.actionItems as string[]).length > 0)
          ? gm.actionItems
          : match.actionItems,
      });

      const granolaLinks = await storage.getMeetingContacts(gm.id);
      for (const link of granolaLinks) {
        await storage.linkContactToMeeting({
          contactId: link.contactId,
          meetingId: match.id,
          matchedBy: link.matchedBy,
        });
      }

      merged++;
    }
  }

  return merged;
}
