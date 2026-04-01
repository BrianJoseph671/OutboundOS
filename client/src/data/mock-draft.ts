/**
 * Phase 3 — Mock data for the Draft Workspace.
 * Drives UI development before backend wiring.
 */

import type {
  ContactBrief,
  ComposeResponse,
  ChatMessage,
} from "@shared/types/draft";

export const mockBrief: ContactBrief = {
  contactId: "contact-vince",
  sections: {
    relationshipSummary:
      "You met Vince Signori at a SaaStr Annual networking event in Sep 2025. He's VP of Sales at Acme Corp. You've exchanged 12 emails and had 3 meetings over the past 6 months. He expressed interest in your outbound automation platform during your last call.",
    recentInteractions:
      "Mar 25 — 30-min Zoom call about Q2 pipeline strategy. Mar 18 — Email thread re: intro to their CRO. Mar 10 — Granola meeting notes from coffee chat at WeWork.",
    openThreads:
      "CRO intro request (Mar 18 email) — Vince said he'd check internally but hasn't followed up. Q2 pilot discussion — he asked for pricing details you haven't sent yet.",
    relationshipHealth:
      "Strong — 3 touchpoints in March alone. Engagement is high with quick email response times (avg 4 hours). Risk: the open CRO intro could stall if not nudged this week.",
    suggestedApproach:
      "Follow up on the CRO intro request with a soft nudge. Reference the Q2 pipeline conversation to keep momentum. Attach the pricing one-pager he asked about.",
  },
  sources: [
    {
      type: "meeting",
      summary: "30-min Zoom — Q2 pipeline strategy",
      date: "2026-03-25T14:00:00.000Z",
      sourceId: "granola-meeting-001",
    },
    {
      type: "email",
      summary: "Re: Intro to Acme CRO",
      date: "2026-03-18T09:30:00.000Z",
      sourceId: "sh-msg-042",
    },
    {
      type: "meeting",
      summary: "Coffee chat at WeWork",
      date: "2026-03-10T10:00:00.000Z",
      sourceId: "granola-meeting-002",
    },
  ],
  generatedAt: new Date().toISOString(),
  modelVersion: "claude-sonnet-4-20250514",
};

export const mockComposeResponse: ComposeResponse = {
  draftId: "draft-001",
  draftThreadId: "thread-001",
  to: "vince@acmecorp.com",
  subject: "Re: Intro to Acme CRO",
  body: `Hey Vince,

Great catching up on the Q2 pipeline call last week — excited about the direction you're taking.

Quick follow-up on two things:

1. **CRO intro** — any update on whether that intro to Sarah makes sense? Happy to send a short blurb you can forward if that helps.

2. **Pricing** — attached the one-pager we discussed. Let me know if you have questions or want to walk through it on a quick call.

Looking forward to keeping the momentum going.

Best,
Brian`,
};

export const mockReviseResponse: ComposeResponse = {
  draftId: "draft-001",
  draftThreadId: "thread-001",
  to: "vince@acmecorp.com",
  subject: "Re: Intro to Acme CRO",
  body: `Hey Vince,

Loved our Q2 pipeline chat — your team's growth trajectory is impressive.

Two quick items:

1. **CRO intro** — would it help if I drafted a short blurb you could forward to Sarah? Want to make this easy for you.

2. **Pricing details** — one-pager attached. Happy to do a 15-min walkthrough whenever works.

Cheers,
Brian`,
};

export const mockChatHistory: ChatMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    content:
      "I've loaded Vince's brief. He has 2 open threads — the CRO intro and Q2 pricing. What kind of message would you like to draft?",
    timestamp: new Date().toISOString(),
  },
];

export const PRESET_INSTRUCTIONS: Record<string, string> = {
  warm: "Draft a warm follow-up that references our recent conversations and open threads. Keep it personal and direct.",
  cold: "Draft a professional outreach as if this is our first real business interaction. Focus on value proposition.",
  intro: "Draft a message requesting an introduction through this contact. Be concise and make the ask clear.",
};
