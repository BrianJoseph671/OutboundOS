/**
 * Phase 3 — Brief Generator Service.
 * Generates a 5-section ContactBrief from a contact's interaction history.
 * Uses Claude API when ANTHROPIC_API_KEY is set; otherwise returns a
 * deterministic fallback brief built from raw interaction data.
 */
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "../storage";
import type { ContactBrief, BriefSections, BriefSource } from "@shared/types/draft";

const MODEL_VERSION = "claude-sonnet-4-20250514";
const BRIEF_CACHE_HOURS = 24;

function getClaudeClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function callClaudeReal(prompt: string): Promise<string> {
  const client = getClaudeClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY not set");

  const response = await client.messages.create({
    model: MODEL_VERSION,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text || "";
}

export interface BriefGeneratorDeps {
  getInteractions: typeof storage.getInteractions;
  getContact: typeof storage.getContact;
  getContactBrief: typeof storage.getContactBrief;
  upsertContactBrief: typeof storage.upsertContactBrief;
  callClaude?: (prompt: string) => Promise<string>;
}

function defaultDeps(): BriefGeneratorDeps {
  return {
    getInteractions: storage.getInteractions.bind(storage),
    getContact: storage.getContact.bind(storage),
    getContactBrief: storage.getContactBrief.bind(storage),
    upsertContactBrief: storage.upsertContactBrief.bind(storage),
  };
}

function buildSourcesFromInteractions(
  interactions: Array<{ channel: string; summary: string | null; occurredAt: Date; sourceId: string | null }>
): BriefSource[] {
  return interactions.slice(0, 5).map((i) => ({
    type: i.channel === "email" ? "email" as const : i.channel === "meeting" ? "meeting" as const : "calendar" as const,
    summary: i.summary || "No summary available",
    date: i.occurredAt.toISOString(),
    sourceId: i.sourceId,
  }));
}

function buildFallbackBrief(
  contactId: string,
  contactName: string,
  interactions: Array<{ channel: string; summary: string | null; occurredAt: Date; sourceId: string | null; direction: string; openThreads: string | null }>
): ContactBrief {
  const recentFive = interactions.slice(0, 5);

  const interactionSummaries = recentFive
    .map((i) => `${i.occurredAt.toISOString().slice(0, 10)} — ${i.channel} (${i.direction}): ${i.summary || "no summary"}`)
    .join("\n");

  const openThreadsList = recentFive
    .filter((i) => i.openThreads)
    .map((i) => i.openThreads)
    .join("; ");

  const channelCounts: Record<string, number> = {};
  for (const i of interactions) {
    channelCounts[i.channel] = (channelCounts[i.channel] || 0) + 1;
  }
  const channelBreakdown = Object.entries(channelCounts)
    .map(([ch, count]) => `${ch}: ${count}`)
    .join(", ");

  const sections: BriefSections = {
    relationshipSummary: `Contact: ${contactName}. ${interactions.length} total interactions across channels (${channelBreakdown}).`,
    recentInteractions: interactionSummaries || "No recent interactions found.",
    openThreads: openThreadsList || "No open threads detected.",
    relationshipHealth: interactions.length >= 3
      ? `Active — ${interactions.length} interactions recorded. Last interaction: ${recentFive[0]?.occurredAt.toISOString().slice(0, 10) || "unknown"}.`
      : `Low activity — only ${interactions.length} interaction(s) recorded.`,
    suggestedApproach: "Review the recent interactions and draft a follow-up based on any open threads or pending items.",
  };

  return {
    contactId,
    sections,
    sources: buildSourcesFromInteractions(interactions),
    generatedAt: new Date().toISOString(),
    modelVersion: "fallback",
  };
}

function buildClaudePrompt(
  contactName: string,
  interactions: Array<{ channel: string; summary: string | null; occurredAt: Date; direction: string; openThreads: string | null }>
): string {
  const interactionBlock = interactions.slice(0, 20).map((i) =>
    `[${i.occurredAt.toISOString().slice(0, 10)}] ${i.channel} (${i.direction}): ${i.summary || "no summary"}${i.openThreads ? ` | Open threads: ${i.openThreads}` : ""}`
  ).join("\n");

  return `You are a relationship intelligence assistant. Given the interaction history below for ${contactName}, generate a JSON object with exactly these 5 keys:

- "relationshipSummary": A 2-3 sentence summary of how the user knows this person and the nature of the relationship.
- "recentInteractions": A bullet-point summary of the 3-5 most recent interactions with dates.
- "openThreads": Any unresolved conversations, pending requests, or items that need follow-up.
- "relationshipHealth": An assessment of relationship strength, engagement frequency, and any risks.
- "suggestedApproach": A recommended next action or conversation angle for the user's outreach.

Interaction history:
${interactionBlock}

Respond ONLY with a valid JSON object. No markdown fences, no explanation.`;
}

function parseClaudeResponse(raw: string): BriefSections | null {
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (
      parsed.relationshipSummary &&
      parsed.recentInteractions &&
      parsed.openThreads &&
      parsed.relationshipHealth &&
      parsed.suggestedApproach
    ) {
      return parsed as BriefSections;
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateBrief(
  contactId: string,
  userId: string,
  options?: { force?: boolean; deps?: BriefGeneratorDeps }
): Promise<ContactBrief> {
  const deps = options?.deps || defaultDeps();
  const force = options?.force ?? false;

  // Check cache unless force regeneration
  if (!force) {
    const cached = await deps.getContactBrief(contactId, userId);
    if (cached) {
      const age = Date.now() - new Date(cached.generatedAt).getTime();
      if (age < BRIEF_CACHE_HOURS * 60 * 60 * 1000) {
        return cached.briefData as unknown as ContactBrief;
      }
    }
  }

  const contact = await deps.getContact(contactId, userId);
  if (!contact) {
    throw new Error(`Contact ${contactId} not found`);
  }

  const interactions = await deps.getInteractions(userId, contactId);
  const sorted = [...interactions].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  let brief: ContactBrief;

  // Try Claude API if available
  if (deps.callClaude) {
    try {
      const prompt = buildClaudePrompt(contact.name, sorted);
      const raw = await deps.callClaude(prompt);
      const sections = parseClaudeResponse(raw);
      if (sections) {
        brief = {
          contactId,
          sections,
          sources: buildSourcesFromInteractions(sorted),
          generatedAt: new Date().toISOString(),
          modelVersion: MODEL_VERSION,
        };
      } else {
        brief = buildFallbackBrief(contactId, contact.name, sorted);
      }
    } catch {
      brief = buildFallbackBrief(contactId, contact.name, sorted);
    }
  } else if (process.env.ANTHROPIC_API_KEY) {
    try {
      const prompt = buildClaudePrompt(contact.name, sorted);
      const raw = await callClaudeReal(prompt);
      const sections = parseClaudeResponse(raw);
      if (sections) {
        brief = {
          contactId,
          sections,
          sources: buildSourcesFromInteractions(sorted),
          generatedAt: new Date().toISOString(),
          modelVersion: MODEL_VERSION,
        };
      } else {
        brief = buildFallbackBrief(contactId, contact.name, sorted);
      }
    } catch {
      brief = buildFallbackBrief(contactId, contact.name, sorted);
    }
  } else {
    brief = buildFallbackBrief(contactId, contact.name, sorted);
  }

  // Cache the brief
  await deps.upsertContactBrief(contactId, userId, {
    briefData: brief as unknown as Record<string, unknown>,
    modelVersion: brief.modelVersion,
    generatedAt: new Date(brief.generatedAt),
  });

  return brief;
}

export { buildFallbackBrief, buildClaudePrompt, parseClaudeResponse, BRIEF_CACHE_HOURS };
