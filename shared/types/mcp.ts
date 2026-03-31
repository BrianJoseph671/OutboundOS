/**
 * Phase 2 — MCP (Model Context Protocol) tool interfaces.
 * These types define the data shapes returned by Superhuman, Granola, and Google Calendar MCP adapters.
 * Used by the LangGraph agent in server/agent/ (added in phase2-agent-skeleton).
 * All tool adapter bodies are TODO placeholders until Brian wires live MCP connections.
 */

// ---------------------------------------------------------------------------
// Superhuman
// ---------------------------------------------------------------------------

/** A single email message as returned by Superhuman MCP. */
export interface SuperhumanEmail {
  messageId: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: string; // ISO 8601
  snippet: string;
  hasAttachments: boolean;
}

/**
 * SuperhumanMessage is equivalent to SuperhumanEmail.
 * Used within SuperhumanThread.messages to represent individual messages in a thread.
 */
export interface SuperhumanMessage {
  messageId: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: string; // ISO 8601
  snippet: string;
  hasAttachments: boolean;
}

/** An email thread as returned by Superhuman MCP. */
export interface SuperhumanThread {
  threadId: string;
  messages: SuperhumanMessage[];
}

/** Response from draft_email Superhuman MCP tool. */
export interface SuperhumanDraftResponse {
  draftId: string;
  draftThreadId: string;
  composedEmail: string;
}

// ---------------------------------------------------------------------------
// Granola
// ---------------------------------------------------------------------------

/** A meeting as returned by Granola MCP. */
export interface GranolaMeeting {
  id: string;
  title: string;
  date: string; // ISO 8601 date (YYYY-MM-DD)
  knownParticipants: string[]; // email addresses of identified participants
  summary: string;
}

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

/** A calendar event as returned by Google Calendar MCP. */
export interface CalendarEvent {
  eventId: string;
  title: string;
  start: string; // ISO 8601 datetime
  end: string; // ISO 8601 datetime
  attendees: string[]; // email addresses
  description: string | null;
}
