/**
 * Agent entry point — LangGraph ReAct agent for RelationshipOS sync.
 *
 * Architecture:
 * - Uses createReactAgent from @langchain/langgraph/prebuilt
 * - ChatAnthropic model: claude-sonnet-4-20250514
 * - Tools: Superhuman, Granola, Calendar MCP adapters (TODO placeholders)
 * - LangSmith tracing: automatic via env vars (LANGCHAIN_TRACING_V2, LANGCHAIN_API_KEY, LANGCHAIN_PROJECT)
 *
 * runSync(userId) orchestrates:
 *   1. Agent invokes MCP tools to pull recent interactions (TODO: returns empty)
 *   2. interactionWriter deduplicates and writes to DB
 *   3. actionDetector creates pending actions
 *   4. Returns SyncResponse with counts
 */
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import type { SyncResponse } from "@shared/types/actions";
import { listEmailsTool, getEmailThreadTool } from "./tools/superhuman";
import { listMeetingsTool, getMeetingsTool } from "./tools/granola";
import { listEventsTool } from "./tools/calendar";
import { writeInteractions, type RawInteraction } from "./services/interactionWriter";
import { detectActions } from "./services/actionDetector";
import { storage } from "../storage";

// ── Model ─────────────────────────────────────────────────────────────────────

const model = new ChatAnthropic({
  model: "claude-sonnet-4-20250514",
  temperature: 0.3,
  maxTokens: 4096,
  // ANTHROPIC_API_KEY read from env automatically
});

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a relationship management assistant for RelationshipOS.

Your job is to pull recent interactions from the user's communication sources and prepare them for ingestion:

1. Use list_emails to fetch recent emails from Superhuman (last 30 days)
2. Use list_meetings to fetch recent meetings from Granola (last_30_days)
3. Use list_events to fetch recent calendar events from Google Calendar
4. For each email thread of interest, use get_email_thread to get full details
5. For interesting meeting IDs, use get_meetings to get full details

Focus on interactions that involve known contacts. Return a summary of what you found.

Note: MCP adapters are currently TODO placeholders that return empty data. This is expected behavior during development.`;

// ── Agent ─────────────────────────────────────────────────────────────────────

const agent = createReactAgent({
  llm: model,
  tools: [listEmailsTool, getEmailThreadTool, listMeetingsTool, getMeetingsTool, listEventsTool],
  prompt: SYSTEM_PROMPT,
});

// ── runSync ───────────────────────────────────────────────────────────────────

/**
 * runSync — Orchestrate a full sync for a user.
 *
 * Flow:
 * 1. Invoke the ReAct agent to pull MCP data (TODO adapters return empty)
 * 2. Process agent output into RawInteraction[] (currently empty — adapters are TODO)
 * 3. Write interactions via interactionWriter (with dedup)
 * 4. Detect new actions via actionDetector
 * 5. Persist new actions to storage
 * 6. Return SyncResponse with counts
 *
 * Errors are caught per-step and surfaced in the errors array (partial failure support).
 */
export async function runSync(userId: string): Promise<SyncResponse> {
  const errors: string[] = [];
  let newInteractions = 0;
  let newActions = 0;

  // ── Step 1: Invoke agent to pull MCP data ─────────────────────────────────
  let rawInteractions: RawInteraction[] = [];

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      // Skip agent invocation if no API key — return early with empty result
      console.warn("[Agent] ANTHROPIC_API_KEY not set — skipping agent invocation");
    } else {
      await agent.invoke({
        messages: [
          {
            role: "user",
            content: `Please pull recent interactions for user ${userId}. Use all available MCP tools to gather emails, meetings, and calendar events from the last 30 days.`,
          },
        ],
      });
      // TODO: Parse agent output into RawInteraction[] once MCP adapters are wired
      // For now, agent returns empty data via TODO adapters
      rawInteractions = [];
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Agent] Error during agent invocation:", msg);
    errors.push(`Agent invocation failed: ${msg}`);
    // Continue with empty interactions (partial failure support)
  }

  // ── Step 2: Write interactions with dedup ────────────────────────────────
  try {
    const writeResult = await writeInteractions(userId, rawInteractions);
    newInteractions = writeResult.written;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Agent] Error writing interactions:", msg);
    errors.push(`Interaction write failed: ${msg}`);
  }

  // ── Step 3: Detect and create actions ────────────────────────────────────
  try {
    // Fetch the newly written interactions to pass to action detector
    // Since our TODO adapters return empty, this will be an empty array
    // but the actionDetector will still scan contacts for reconnect actions
    const recentInteractions = await storage.getInteractions(userId);
    // Only pass interactions written in this sync (those with ingestedAt close to now)
    const syncStart = new Date(Date.now() - 5 * 60 * 1000); // 5-minute window
    const newlySyncedInteractions = recentInteractions.filter(
      (i) => i.ingestedAt >= syncStart
    );

    const actionsToCreate = await detectActions(userId, newlySyncedInteractions);
    for (const action of actionsToCreate) {
      try {
        await storage.createAction(action);
        newActions++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Agent] Error creating action:", msg);
        errors.push(`Action creation failed: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Agent] Error in action detection:", msg);
    errors.push(`Action detection failed: ${msg}`);
  }

  return { newInteractions, newActions, errors };
}
