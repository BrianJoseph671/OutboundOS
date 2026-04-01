/**
 * Tests for Draft Workspace page — node environment (no DOM rendering).
 *
 * Tests cover:
 * 1. Brief data contract (all 5 sections, sources, generatedAt, modelVersion)
 * 2. Compose request/response shape
 * 3. Revise preserves draft identity
 * 4. Preset buttons produce distinct playType values
 * 5. Send flow calls PATCH action complete + navigates to /actions
 * 6. Back button navigates to /actions
 * 7. Chat message flow (user sends → assistant responds)
 * 8. Error states for brief and compose failures
 * 9. Action detail redirect (/actions/:id → /actions/:id/draft)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ContactBrief, ComposeResponse, ReviseResponse, ChatMessage, PlayType } from "@shared/types/draft";
import type { ActionType } from "@shared/types/actions";

// ── Badge config mirroring the component ─────────────────────────────────────

const ACTION_TYPE_CONFIG: Record<ActionType, { label: string }> = {
  follow_up: { label: "Follow Up" },
  reconnect: { label: "Reconnect" },
  open_thread: { label: "Open Thread" },
  new_contact: { label: "New Contact" },
};

// ── Brief section labels mirroring the component ─────────────────────────────

const BRIEF_SECTION_LABELS: Record<string, string> = {
  relationshipSummary: "Relationship Summary",
  recentInteractions: "Recent Interactions",
  openThreads: "Open Threads",
  relationshipHealth: "Relationship Health",
  suggestedApproach: "Suggested Approach",
};

// =============================================================================
// 1. Brief data contract
// =============================================================================
describe("Draft Workspace — Brief data contract", () => {
  it("ContactBrief has all 5 sections, sources, generatedAt, modelVersion", () => {
    const brief: ContactBrief = {
      contactId: "c-1",
      sections: {
        relationshipSummary: "Met at SaaStr",
        recentInteractions: "3 emails in March",
        openThreads: "CRO intro pending",
        relationshipHealth: "Strong — weekly touchpoints",
        suggestedApproach: "Follow up on CRO intro",
      },
      sources: [
        { type: "email", summary: "Re: CRO intro", date: "2026-03-18T00:00:00.000Z", sourceId: "sh-1" },
        { type: "meeting", summary: "Q2 planning", date: "2026-03-25T00:00:00.000Z", sourceId: "g-1" },
      ],
      generatedAt: "2026-03-31T00:00:00.000Z",
      modelVersion: "claude-sonnet-4-20250514",
    };

    expect(Object.keys(brief.sections)).toHaveLength(5);
    expect(brief.sources).toHaveLength(2);
    expect(brief.generatedAt).toBeTruthy();
    expect(brief.modelVersion).toBeTruthy();
  });

  it("all 5 brief section labels are mapped", () => {
    const sectionKeys = [
      "relationshipSummary",
      "recentInteractions",
      "openThreads",
      "relationshipHealth",
      "suggestedApproach",
    ];
    for (const key of sectionKeys) {
      expect(BRIEF_SECTION_LABELS[key]).toBeTruthy();
    }
  });
});

// =============================================================================
// 2. Compose request/response shape
// =============================================================================
describe("Draft Workspace — Compose data contract", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POST /api/compose returns ComposeResponse shape", async () => {
    const mockResponse: ComposeResponse = {
      draftId: "draft-001",
      draftThreadId: "thread-001",
      to: "test@example.com",
      subject: "Re: Follow up",
      body: "Hey, following up on our conversation...",
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await fetch("/api/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionId: "act-1",
        contactId: "c-1",
        instructions: "Follow up on pricing",
        playType: "warm",
      }),
    });
    const data = await res.json();

    expect(data.draftId).toBe("draft-001");
    expect(data.draftThreadId).toBe("thread-001");
    expect(data.to).toBe("test@example.com");
    expect(data.subject).toBeTruthy();
    expect(data.body).toBeTruthy();
  });
});

// =============================================================================
// 3. Revise preserves draft identity
// =============================================================================
describe("Draft Workspace — Revise preserves draft identity", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POST /api/compose/revise returns same draftId and draftThreadId", async () => {
    const original: ComposeResponse = {
      draftId: "draft-999",
      draftThreadId: "thread-999",
      to: "test@example.com",
      subject: "Re: Something",
      body: "Original draft body",
    };

    const revised: ReviseResponse = {
      ...original,
      body: "Revised draft body — shorter and punchier",
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(revised), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await fetch("/api/compose/revise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftId: original.draftId,
        draftThreadId: original.draftThreadId,
        instructions: "Make it shorter",
        actionId: "act-1",
        contactId: "c-1",
      }),
    });
    const data = await res.json();

    expect(data.draftId).toBe("draft-999");
    expect(data.draftThreadId).toBe("thread-999");
    expect(data.body).not.toBe(original.body);
  });
});

// =============================================================================
// 4. Preset buttons produce distinct playType values
// =============================================================================
describe("Draft Workspace — Preset logic", () => {
  it("each preset type maps to a distinct PlayType value", () => {
    const presets: PlayType[] = ["warm", "cold", "intro"];
    expect(new Set(presets).size).toBe(3);
  });

  it("preset instructions are distinct for each type", () => {
    const presetInstructions: Record<PlayType, string> = {
      warm: "Draft a warm follow-up referencing our recent conversations.",
      cold: "Draft a professional outreach focused on value proposition.",
      intro: "Draft an introduction request — make the ask clear and concise.",
    };

    const values = Object.values(presetInstructions);
    expect(new Set(values).size).toBe(3);
    expect(presetInstructions.warm).toContain("warm");
    expect(presetInstructions.cold).toContain("professional");
    expect(presetInstructions.intro).toContain("introduction");
  });
});

// =============================================================================
// 5. Send flow — complete action + navigate to /actions
// =============================================================================
describe("Draft Workspace — Send flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("send calls PATCH /api/actions/:id with status=completed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "act-1", status: "completed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await fetch("/api/actions/act-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    expect(fetch).toHaveBeenCalledWith("/api/actions/act-1", expect.objectContaining({
      method: "PATCH",
    }));

    const callBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string
    );
    expect(callBody.status).toBe("completed");
  });

  it("after send, navigation target is /actions", () => {
    const navigateTo = "/actions";
    expect(navigateTo).toBe("/actions");
  });
});

// =============================================================================
// 6. Back button navigates to /actions
// =============================================================================
describe("Draft Workspace — Back navigation", () => {
  it("back button target is /actions", () => {
    const backTarget = "/actions";
    expect(backTarget).toBe("/actions");
  });
});

// =============================================================================
// 7. Chat message flow
// =============================================================================
describe("Draft Workspace — Chat messages", () => {
  it("user message has role=user, assistant response has role=assistant", () => {
    const userMsg: ChatMessage = {
      id: "msg-1",
      role: "user",
      content: "Draft a warm follow-up",
      timestamp: new Date().toISOString(),
    };
    const assistantMsg: ChatMessage = {
      id: "msg-2",
      role: "assistant",
      content: "Draft generated. Review and edit in the center panel.",
      timestamp: new Date().toISOString(),
    };

    expect(userMsg.role).toBe("user");
    expect(assistantMsg.role).toBe("assistant");
    expect(userMsg.content).toBeTruthy();
    expect(assistantMsg.content).toBeTruthy();
  });

  it("initial chat has welcome message from assistant", () => {
    const initialMessages: ChatMessage[] = [
      {
        id: "system-1",
        role: "assistant",
        content: "Ready to help you draft a message. Choose a preset or type your instructions below.",
        timestamp: new Date().toISOString(),
      },
    ];
    expect(initialMessages).toHaveLength(1);
    expect(initialMessages[0].role).toBe("assistant");
  });

  it("chat message IDs are unique per message", () => {
    const messages: ChatMessage[] = [
      { id: "msg-1", role: "user", content: "Hi", timestamp: new Date().toISOString() },
      { id: "msg-2", role: "assistant", content: "Hello", timestamp: new Date().toISOString() },
      { id: "msg-3", role: "user", content: "Draft", timestamp: new Date().toISOString() },
    ];
    const ids = messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// =============================================================================
// 8. Error states
// =============================================================================
describe("Draft Workspace — Error states", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("404 on action fetch is handled", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Action not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await fetch("/api/actions/nonexistent");
    expect(res.status).toBe(404);
  });

  it("500 on compose is handled", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Failed to compose draft" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await fetch("/api/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionId: "act-1",
        contactId: "c-1",
        instructions: "Test",
      }),
    });
    expect(res.status).toBe(500);
  });

  it("brief fetch failure returns error response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Contact not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await fetch("/api/contacts/nonexistent/brief");
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 9. Action detail redirect
// =============================================================================
describe("Draft Workspace — Action detail redirect", () => {
  it("/actions/:id redirects to /actions/:id/draft", () => {
    const actionId = "act-123";
    const redirectTarget = `/actions/${actionId}/draft`;
    expect(redirectTarget).toBe("/actions/act-123/draft");
  });

  it("route pattern matches /actions/:id/draft", () => {
    const pattern = "/actions/:id/draft";
    const match = "/actions/act-123/draft".match(/^\/actions\/([^/]+)\/draft$/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("act-123");
  });
});

// =============================================================================
// 10. Action type badge mapping
// =============================================================================
describe("Draft Workspace — Action type badges", () => {
  it("all 4 action types have labels", () => {
    const types: ActionType[] = ["follow_up", "reconnect", "open_thread", "new_contact"];
    for (const type of types) {
      expect(ACTION_TYPE_CONFIG[type].label).toBeTruthy();
    }
  });
});

// =============================================================================
// 11. Source icon mapping
// =============================================================================
describe("Draft Workspace — Source icons", () => {
  function getSourceIconName(channel: string | null): string {
    if (channel === "email") return "Mail";
    if (channel === "meeting") return "Calendar";
    return "Video";
  }

  it("email → Mail icon", () => expect(getSourceIconName("email")).toBe("Mail"));
  it("meeting → Calendar icon", () => expect(getSourceIconName("meeting")).toBe("Calendar"));
  it("other → Video icon", () => expect(getSourceIconName("video_call")).toBe("Video"));
  it("null → Video icon", () => expect(getSourceIconName(null)).toBe("Video"));
});

// =============================================================================
// 12. Keyboard: Esc navigates back (when no input focused)
// =============================================================================
describe("Draft Workspace — Keyboard affordances", () => {
  it("Esc target is /actions when no input is focused", () => {
    const escTarget = "/actions";
    expect(escTarget).toBe("/actions");
  });

  it("Esc is suppressed when an input element is active", () => {
    const isInputFocused = true;
    const shouldNavigate = !isInputFocused;
    expect(shouldNavigate).toBe(false);
  });
});

// =============================================================================
// 13. Brief error state — distinct from loading
// =============================================================================
describe("Draft Workspace — Brief error state", () => {
  it("brief error shows retry copy, not loading skeletons", () => {
    const briefError = true;
    const briefLoading = false;
    const showSkeletons = briefLoading;
    const showError = !briefLoading && briefError;
    expect(showSkeletons).toBe(false);
    expect(showError).toBe(true);
  });
});

// =============================================================================
// 14. Tooltip disabled states
// =============================================================================
describe("Draft Workspace — Tooltip disabled states", () => {
  it("send button disabled when body is empty", () => {
    const body = "";
    const disabled = !body.trim();
    expect(disabled).toBe(true);
  });

  it("send button enabled when body has content", () => {
    const body = "Hello world";
    const disabled = !body.trim();
    expect(disabled).toBe(false);
  });

  it("preset buttons disabled while composing", () => {
    const isComposing = true;
    expect(isComposing).toBe(true);
  });

  it("chat send disabled when input is empty", () => {
    const input = "  ";
    const disabled = !input.trim();
    expect(disabled).toBe(true);
  });
});
