/**
 * Compose Service — email draft generation and revision.
 * Uses Claude API for intelligent draft writing and Superhuman MCP for
 * creating email drafts. Falls back to deterministic output when
 * API keys / MCP connections are unavailable.
 */
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "../storage";
import { generateBrief } from "./briefGenerator";
import { createSuperhumanDraft, type SuperhumanDraftResponse } from "./mcpClient";
import type {
  ComposeRequest,
  ComposeResponse,
  ReviseRequest,
  ReviseResponse,
  PlayType,
  ContactBrief,
} from "@shared/types/draft";

export interface ComposeServiceDeps {
  getAction: typeof storage.getAction;
  getInteraction: typeof storage.getInteraction;
  getContact: typeof storage.getContact;
  getInteractions: typeof storage.getInteractions;
  createDraftsLog: typeof storage.createDraftsLog;
  generateBrief: typeof generateBrief;
  callSuperhumanDraft?: (params: {
    to: string;
    subject: string;
    body: string;
    threadId?: string;
  }) => Promise<{ draftId: string; draftThreadId: string }>;
  callSuperhumanRevise?: (params: {
    draftId: string;
    draftThreadId: string;
    body: string;
  }) => Promise<{ draftId: string; draftThreadId: string }>;
  callClaude?: (system: string, userMsg: string) => Promise<string>;
}

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function getClaudeClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function callClaudeDefault(system: string, userMsg: string): Promise<string> {
  const client = getClaudeClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY not set");

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text || "";
}

function defaultDeps(): ComposeServiceDeps {
  return {
    getAction: storage.getAction.bind(storage),
    getInteraction: storage.getInteraction.bind(storage),
    getContact: storage.getContact.bind(storage),
    getInteractions: storage.getInteractions.bind(storage),
    createDraftsLog: storage.createDraftsLog.bind(storage),
    generateBrief,
    callClaude: process.env.ANTHROPIC_API_KEY ? callClaudeDefault : undefined,
  };
}

export const PRESET_ENRICHMENTS: Record<PlayType, string> = {
  warm: "This is a warm follow-up. Reference shared history, recent conversations, and any open threads. Keep the tone personal and direct.",
  cold: "This is a cold/professional outreach. Focus on value proposition and clear next steps. Don't assume familiarity beyond what's in the brief.",
  intro: "This is a request for introduction. Be concise, make the ask crystal clear, and explain why the intro makes sense for both parties.",
};

function enrichInstructions(
  instructions: string,
  briefContext: string,
  triggerContext: string | null,
  playType: PlayType | null | undefined
): string {
  const parts: string[] = [];

  if (playType && PRESET_ENRICHMENTS[playType]) {
    parts.push(PRESET_ENRICHMENTS[playType]);
  }

  parts.push(`User instructions: ${instructions}`);

  if (triggerContext) {
    parts.push(`Trigger interaction context: ${triggerContext}`);
  }

  parts.push(`Relationship brief:\n${briefContext}`);

  return parts.join("\n\n");
}

function briefToContext(brief: ContactBrief): string {
  const s = brief.sections;
  return [
    `relationshipSummary: ${s.relationshipSummary}`,
    `recentInteractions: ${s.recentInteractions}`,
    `openThreads: ${s.openThreads}`,
    `relationshipHealth: ${s.relationshipHealth}`,
    `suggestedApproach: ${s.suggestedApproach}`,
  ].join("\n");
}

async function buildMeetingContext(
  userId: string,
  contactId: string,
  deps: ComposeServiceDeps,
): Promise<string | null> {
  const interactions = await deps.getInteractions(userId, contactId);
  const meetings = interactions.filter((i) => i.channel === "meeting" || i.channel === "calendar");
  if (meetings.length === 0) return null;

  const sorted = [...meetings].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  return sorted
    .slice(0, 5)
    .map(
      (m) =>
        `[${new Date(m.occurredAt).toISOString().slice(0, 10)}] ${m.channel}: ${m.summary || "No summary"}`,
    )
    .join("\n");
}

const COMPOSE_SYSTEM = `You are a professional email composer for a relationship-management tool called Outbound OS.
Write a complete email draft ready to send. Output ONLY the email body (no subject line, no greeting header like "Subject:", no markdown fences).
Use the relationship brief, meeting context, and user instructions to write a concise, personal, and effective email.
Match the tone to the play type. Keep it under 150 words unless the user explicitly asks for more.`;

const REVISE_SYSTEM = `You are a professional email editor for Outbound OS.
The user will provide their current draft and revision instructions.
Output ONLY the revised email body. No subject lines, no markdown fences, no explanations.`;

function fallbackDraft(params: {
  to: string;
  subject: string;
  enrichedInstructions: string;
}): ComposeResponse {
  return {
    draftId: `draft-${Date.now()}`,
    draftThreadId: `thread-${Date.now()}`,
    to: params.to,
    subject: params.subject,
    body: `[Draft generated from instructions]\n\n${params.enrichedInstructions.slice(0, 300)}...\n\n(Claude API key not configured — set ANTHROPIC_API_KEY for AI-generated drafts.)`,
  };
}

function fallbackRevise(params: {
  draftId: string;
  draftThreadId: string;
  enrichedInstructions: string;
}): ComposeResponse {
  return {
    draftId: params.draftId,
    draftThreadId: params.draftThreadId,
    to: "",
    subject: "",
    body: `[Revised draft]\n\n${params.enrichedInstructions.slice(0, 300)}...\n\n(Claude API key not configured — set ANTHROPIC_API_KEY for AI-generated drafts.)`,
  };
}

export async function createDraft(
  req: ComposeRequest,
  userId: string,
  deps?: ComposeServiceDeps,
): Promise<ComposeResponse> {
  const d = deps || defaultDeps();

  const brief = await d.generateBrief(req.contactId, userId);
  const briefContext = briefToContext(brief);

  let triggerContext: string | null = null;
  const action = await d.getAction(req.actionId, userId);
  if (action?.triggerInteractionId) {
    const interaction = await d.getInteraction(action.triggerInteractionId, userId);
    if (interaction) {
      triggerContext = `${interaction.channel} on ${new Date(interaction.occurredAt).toISOString().slice(0, 10)}: ${interaction.summary || "no summary"}`;
    }
  }

  const meetingContext = await buildMeetingContext(userId, req.contactId, d);
  const enriched = enrichInstructions(req.instructions, briefContext, triggerContext, req.playType);

  let body: string;

  if (d.callClaude) {
    try {
      const userMsg = [
        enriched,
        meetingContext ? `\nRecent meetings/calendar events:\n${meetingContext}` : "",
        req.to ? `\nRecipient: ${req.to}` : "",
        req.subject ? `\nSubject: ${req.subject}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      body = await d.callClaude(COMPOSE_SYSTEM, userMsg);
    } catch (err) {
      console.warn("[ComposeService] Claude API call failed, using fallback:", err);
      const result = fallbackDraft({ to: req.to || "", subject: req.subject || "", enrichedInstructions: enriched });
      await d.createDraftsLog({
        userId,
        contactId: req.contactId,
        actionId: req.actionId,
        superhumanDraftId: result.draftId,
        instructions: req.instructions,
        generatedBody: result.body,
        playType: req.playType || null,
      });
      return result;
    }
  } else {
    const result = fallbackDraft({ to: req.to || "", subject: req.subject || "", enrichedInstructions: enriched });
    await d.createDraftsLog({
      userId,
      contactId: req.contactId,
      actionId: req.actionId,
      superhumanDraftId: result.draftId,
      instructions: req.instructions,
      generatedBody: result.body,
      playType: req.playType || null,
    });
    return result;
  }

  // Try to create a Superhuman draft via MCP
  let draftId: string;
  let draftThreadId: string;

  if (d.callSuperhumanDraft) {
    try {
      const shResult = await d.callSuperhumanDraft({
        to: req.to || "",
        subject: req.subject || "",
        body,
        threadId: req.threadId,
      });
      draftId = shResult.draftId;
      draftThreadId = shResult.draftThreadId;
    } catch (err) {
      console.warn("[ComposeService] Superhuman draft creation failed, using local ID:", err);
      draftId = `local-draft-${Date.now()}`;
      draftThreadId = `local-thread-${Date.now()}`;
    }
  } else {
    // Try live Superhuman MCP
    try {
      const shResult = await createSuperhumanDraft(userId, {
        to: req.to || "",
        subject: req.subject || "",
        body,
        thread_id: req.threadId,
      });
      draftId = shResult.draft_id;
      draftThreadId = shResult.thread_id;
    } catch (err) {
      console.warn("[ComposeService] Superhuman MCP draft failed, using local ID:", err);
      draftId = `local-draft-${Date.now()}`;
      draftThreadId = `local-thread-${Date.now()}`;
    }
  }

  const result: ComposeResponse = {
    draftId,
    draftThreadId,
    to: req.to || "",
    subject: req.subject || "",
    body,
  };

  await d.createDraftsLog({
    userId,
    contactId: req.contactId,
    actionId: req.actionId,
    superhumanDraftId: result.draftId,
    instructions: req.instructions,
    generatedBody: result.body,
    playType: req.playType || null,
  });

  return result;
}

export async function reviseDraft(
  req: ReviseRequest,
  userId: string,
  deps?: ComposeServiceDeps,
): Promise<ReviseResponse> {
  const d = deps || defaultDeps();

  const brief = await d.generateBrief(req.contactId, userId);
  const briefContext = briefToContext(brief);
  const enriched = enrichInstructions(req.instructions, briefContext, null, null);

  let body: string;

  if (d.callClaude) {
    try {
      const userMsg = [
        `Current draft:\n${req.currentBody || "(no current body)"}`,
        `\nRevision instructions:\n${enriched}`,
      ].join("\n");
      body = await d.callClaude(REVISE_SYSTEM, userMsg);
    } catch (err) {
      console.warn("[ComposeService] Claude revise failed, using fallback:", err);
      const result = fallbackRevise({
        draftId: req.draftId,
        draftThreadId: req.draftThreadId,
        enrichedInstructions: enriched,
      });
      await d.createDraftsLog({
        userId,
        contactId: req.contactId,
        actionId: req.actionId,
        superhumanDraftId: result.draftId,
        instructions: req.instructions,
        generatedBody: result.body,
        playType: null,
      });
      return result;
    }
  } else {
    const result = fallbackRevise({
      draftId: req.draftId,
      draftThreadId: req.draftThreadId,
      enrichedInstructions: enriched,
    });
    await d.createDraftsLog({
      userId,
      contactId: req.contactId,
      actionId: req.actionId,
      superhumanDraftId: result.draftId,
      instructions: req.instructions,
      generatedBody: result.body,
      playType: null,
    });
    return result;
  }

  // Update the Superhuman draft via MCP if possible
  if (d.callSuperhumanRevise) {
    try {
      await d.callSuperhumanRevise({
        draftId: req.draftId,
        draftThreadId: req.draftThreadId,
        body,
      });
    } catch {
      // Non-critical — draft body is still updated locally
    }
  }

  const result: ComposeResponse = {
    draftId: req.draftId,
    draftThreadId: req.draftThreadId,
    to: "",
    subject: "",
    body,
  };

  await d.createDraftsLog({
    userId,
    contactId: req.contactId,
    actionId: req.actionId,
    superhumanDraftId: result.draftId,
    instructions: req.instructions,
    generatedBody: result.body,
    playType: null,
  });

  return result;
}

export { enrichInstructions, briefToContext };
