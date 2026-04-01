/**
 * Phase 3 — Compose Service.
 * Creates and revises email drafts using Superhuman MCP (TODO placeholder).
 * Enriches instructions with brief context and trigger interaction data.
 * Logs all drafts to the drafts_log table.
 */
import { storage } from "../storage";
import { generateBrief } from "./briefGenerator";
import type { ComposeRequest, ComposeResponse, ReviseRequest, ReviseResponse, PlayType, ContactBrief } from "@shared/types/draft";

export interface ComposeServiceDeps {
  getAction: typeof storage.getAction;
  getInteraction: typeof storage.getInteraction;
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
}

function defaultDeps(): ComposeServiceDeps {
  return {
    getAction: storage.getAction.bind(storage),
    getInteraction: storage.getInteraction.bind(storage),
    createDraftsLog: storage.createDraftsLog.bind(storage),
    generateBrief,
  };
}

const PRESET_ENRICHMENTS: Record<PlayType, string> = {
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

// TODO: Replace with real Superhuman MCP draft_email call when Brian wires auth
function mockSuperhumanDraft(params: {
  to: string;
  subject: string;
  enrichedInstructions: string;
}): ComposeResponse {
  return {
    draftId: `draft-${Date.now()}`,
    draftThreadId: `thread-${Date.now()}`,
    to: params.to,
    subject: params.subject,
    body: `[Draft generated from instructions]\n\n${params.enrichedInstructions.slice(0, 200)}...\n\n(This is a placeholder — Superhuman MCP integration pending.)`,
  };
}

function mockSuperhumanRevise(params: {
  draftId: string;
  draftThreadId: string;
  enrichedInstructions: string;
}): ComposeResponse {
  return {
    draftId: params.draftId,
    draftThreadId: params.draftThreadId,
    to: "",
    subject: "",
    body: `[Revised draft]\n\n${params.enrichedInstructions.slice(0, 200)}...\n\n(This is a placeholder — Superhuman MCP integration pending.)`,
  };
}

export async function createDraft(
  req: ComposeRequest,
  userId: string,
  deps?: ComposeServiceDeps
): Promise<ComposeResponse> {
  const d = deps || defaultDeps();

  // Load brief for context
  const brief = await d.generateBrief(req.contactId, userId);
  const briefContext = briefToContext(brief);

  // Load trigger interaction context if action has one
  let triggerContext: string | null = null;
  const action = await d.getAction(req.actionId, userId);
  if (action?.triggerInteractionId) {
    const interaction = await d.getInteraction(action.triggerInteractionId, userId);
    if (interaction) {
      triggerContext = `${interaction.channel} on ${new Date(interaction.occurredAt).toISOString().slice(0, 10)}: ${interaction.summary || "no summary"}`;
    }
  }

  const enriched = enrichInstructions(req.instructions, briefContext, triggerContext, req.playType);

  let result: ComposeResponse;

  if (d.callSuperhumanDraft) {
    const superhumanResult = await d.callSuperhumanDraft({
      to: req.to || "",
      subject: req.subject || "",
      body: enriched,
      threadId: req.threadId,
    });
    result = {
      draftId: superhumanResult.draftId,
      draftThreadId: superhumanResult.draftThreadId,
      to: req.to || "",
      subject: req.subject || "",
      body: enriched,
    };
  } else {
    result = mockSuperhumanDraft({
      to: req.to || "",
      subject: req.subject || "",
      enrichedInstructions: enriched,
    });
  }

  // Log to drafts_log
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
  deps?: ComposeServiceDeps
): Promise<ReviseResponse> {
  const d = deps || defaultDeps();

  const brief = await d.generateBrief(req.contactId, userId);
  const briefContext = briefToContext(brief);

  const enriched = enrichInstructions(req.instructions, briefContext, null, null);

  let result: ComposeResponse;

  if (d.callSuperhumanRevise) {
    const superhumanResult = await d.callSuperhumanRevise({
      draftId: req.draftId,
      draftThreadId: req.draftThreadId,
      body: enriched,
    });
    result = {
      draftId: superhumanResult.draftId,
      draftThreadId: superhumanResult.draftThreadId,
      to: "",
      subject: "",
      body: enriched,
    };
  } else {
    result = mockSuperhumanRevise({
      draftId: req.draftId,
      draftThreadId: req.draftThreadId,
      enrichedInstructions: enriched,
    });
  }

  // Log revision
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

export { enrichInstructions, briefToContext, PRESET_ENRICHMENTS };
