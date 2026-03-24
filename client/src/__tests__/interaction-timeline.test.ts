/**
 * Tests for the interaction timeline component logic and form validation.
 *
 * These tests run in the node environment using vitest.
 * They verify the logic and data transformations without rendering React components.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { logInteractionSchema } from "../components/interaction-timeline";

// ── logInteractionSchema validation ──────────────────────────────────────────

describe("logInteractionSchema - form validation", () => {
  it("accepts valid form data", () => {
    const result = logInteractionSchema.safeParse({
      channel: "email",
      direction: "outbound",
      occurred_at: "2025-03-20",
      summary: "Had a great call",
      raw_content: "Full transcript...",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe("email");
      expect(result.data.direction).toBe("outbound");
      expect(result.data.occurred_at).toBe("2025-03-20");
    }
  });

  it("rejects missing channel", () => {
    const result = logInteractionSchema.safeParse({
      direction: "inbound",
      occurred_at: "2025-03-20",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const channelError = result.error.issues.find((i) => i.path[0] === "channel");
      expect(channelError).toBeDefined();
    }
  });

  it("rejects missing direction", () => {
    const result = logInteractionSchema.safeParse({
      channel: "call",
      occurred_at: "2025-03-20",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const directionError = result.error.issues.find((i) => i.path[0] === "direction");
      expect(directionError).toBeDefined();
    }
  });

  it("rejects missing occurred_at (empty string)", () => {
    const result = logInteractionSchema.safeParse({
      channel: "meeting",
      direction: "mutual",
      occurred_at: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dateError = result.error.issues.find((i) => i.path[0] === "occurred_at");
      expect(dateError).toBeDefined();
    }
  });

  it("rejects invalid channel value", () => {
    const result = logInteractionSchema.safeParse({
      channel: "telegram",
      direction: "outbound",
      occurred_at: "2025-03-20",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid direction value", () => {
    const result = logInteractionSchema.safeParse({
      channel: "email",
      direction: "unknown",
      occurred_at: "2025-03-20",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid channel values", () => {
    const channels = ["email", "call", "meeting", "linkedin", "text"] as const;
    for (const channel of channels) {
      const result = logInteractionSchema.safeParse({
        channel,
        direction: "outbound",
        occurred_at: "2025-03-20",
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all valid direction values", () => {
    const directions = ["inbound", "outbound", "mutual"] as const;
    for (const direction of directions) {
      const result = logInteractionSchema.safeParse({
        channel: "email",
        direction,
        occurred_at: "2025-03-20",
      });
      expect(result.success).toBe(true);
    }
  });

  it("allows optional summary and raw_content to be omitted", () => {
    const result = logInteractionSchema.safeParse({
      channel: "text",
      direction: "inbound",
      occurred_at: "2025-01-15",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBeUndefined();
      expect(result.data.raw_content).toBeUndefined();
    }
  });

  it("allows optional fields to be empty strings", () => {
    const result = logInteractionSchema.safeParse({
      channel: "linkedin",
      direction: "mutual",
      occurred_at: "2025-06-01",
      summary: "",
      raw_content: "",
    });
    expect(result.success).toBe(true);
  });
});

// ── Tier badge color mapping ──────────────────────────────────────────────────

describe("tier badge color mapping", () => {
  /** Mirrors getTierBadgeClass in contacts.tsx */
  function getTierBadgeClass(tier: string): string {
    switch (tier) {
      case "warm":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0";
      case "cool":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0";
      case "cold":
        return "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300 border-0";
      case "vip":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-0";
      default:
        return "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300 border-0";
    }
  }

  it("warm tier uses amber colors", () => {
    const cls = getTierBadgeClass("warm");
    expect(cls).toContain("amber");
  });

  it("cool tier uses blue colors", () => {
    const cls = getTierBadgeClass("cool");
    expect(cls).toContain("blue");
  });

  it("cold tier uses slate colors", () => {
    const cls = getTierBadgeClass("cold");
    expect(cls).toContain("slate");
  });

  it("vip tier uses purple colors", () => {
    const cls = getTierBadgeClass("vip");
    expect(cls).toContain("purple");
  });

  it("unknown tier falls back to slate colors", () => {
    const cls = getTierBadgeClass("unknown");
    expect(cls).toContain("slate");
  });
});

// ── useInteractions API patterns ──────────────────────────────────────────────

describe("useInteractions - API call patterns", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("constructs correct URL for contactId filter", async () => {
    const mockInteractions = [
      {
        id: "inter-1",
        contactId: "contact-abc",
        userId: "user-1",
        channel: "email",
        direction: "outbound",
        occurredAt: new Date("2025-03-20").toISOString(),
        sourceId: null,
        summary: "Initial outreach",
        rawContent: null,
        openThreads: null,
        ingestedAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockInteractions), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("GET", "/api/interactions?contactId=contact-abc");
    const data = await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/interactions?contactId=contact-abc",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(data).toHaveLength(1);
    expect(data[0].channel).toBe("email");
  });

  it("POST /api/interactions includes required fields", async () => {
    const created = {
      id: "inter-new",
      contactId: "contact-abc",
      userId: "user-1",
      channel: "call",
      direction: "outbound",
      occurredAt: new Date("2025-03-22").toISOString(),
      sourceId: null,
      summary: "Follow-up call",
      rawContent: null,
      openThreads: null,
      ingestedAt: new Date().toISOString(),
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(created), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const payload = {
      contactId: "contact-abc",
      channel: "call",
      direction: "outbound",
      occurredAt: new Date("2025-03-22").toISOString(),
      summary: "Follow-up call",
    };
    const res = await apiRequest("POST", "/api/interactions", payload);
    const data = await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/interactions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    expect(data.id).toBe("inter-new");
  });
});

// ── Interaction sorting (newest-first) ────────────────────────────────────────

describe("interaction sorting - newest first", () => {
  function sortInteractionsNewestFirst(
    interactions: Array<{ id: string; occurredAt: string }>,
  ) {
    return [...interactions].sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }

  it("returns newest interaction first", () => {
    const items = [
      { id: "a", occurredAt: "2025-01-01T00:00:00.000Z" },
      { id: "b", occurredAt: "2025-03-15T00:00:00.000Z" },
      { id: "c", occurredAt: "2024-12-01T00:00:00.000Z" },
    ];
    const sorted = sortInteractionsNewestFirst(items);
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("a");
    expect(sorted[2].id).toBe("c");
  });

  it("handles empty array", () => {
    expect(sortInteractionsNewestFirst([])).toHaveLength(0);
  });

  it("leaves single-item array unchanged", () => {
    const items = [{ id: "only", occurredAt: "2025-03-20T00:00:00.000Z" }];
    const sorted = sortInteractionsNewestFirst(items);
    expect(sorted[0].id).toBe("only");
  });

  it("does not mutate original array", () => {
    const items = [
      { id: "a", occurredAt: "2025-01-01T00:00:00.000Z" },
      { id: "b", occurredAt: "2025-03-15T00:00:00.000Z" },
    ];
    sortInteractionsNewestFirst(items);
    // Original is unchanged
    expect(items[0].id).toBe("a");
    expect(items[1].id).toBe("b");
  });
});

// ── Timeline empty state ──────────────────────────────────────────────────────

describe("timeline empty state detection", () => {
  it("detects empty interactions array", () => {
    const interactions: unknown[] = [];
    expect(interactions.length === 0).toBe(true);
  });

  it("detects non-empty interactions array", () => {
    const interactions = [{ id: "1" }];
    expect(interactions.length === 0).toBe(false);
  });
});
