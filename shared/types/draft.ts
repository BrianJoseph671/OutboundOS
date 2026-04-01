/**
 * Phase 3 — Draft Workspace types for Context Engine + Compose.
 * Used by both client and server layers.
 */

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------

export interface BriefSections {
  relationshipSummary: string;
  recentInteractions: string;
  openThreads: string;
  relationshipHealth: string;
  suggestedApproach: string;
}

export interface BriefSource {
  type: "email" | "meeting" | "calendar";
  summary: string;
  date: string;
  sourceId: string | null;
}

export interface ContactBrief {
  contactId: string;
  sections: BriefSections;
  sources: BriefSource[];
  generatedAt: string;
  modelVersion: string;
}

// ---------------------------------------------------------------------------
// Compose / Revise
// ---------------------------------------------------------------------------

export type PlayType = "warm" | "cold" | "intro";

export interface ComposeRequest {
  actionId: string;
  contactId: string;
  instructions: string;
  playType?: PlayType | null;
  to?: string;
  subject?: string;
  threadId?: string;
}

export interface ComposeResponse {
  draftId: string;
  draftThreadId: string;
  to: string;
  subject: string;
  body: string;
}

export interface ReviseRequest {
  draftId: string;
  draftThreadId: string;
  instructions: string;
  actionId: string;
  contactId: string;
}

export type ReviseResponse = ComposeResponse;

// ---------------------------------------------------------------------------
// AI Chat (left panel)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}
