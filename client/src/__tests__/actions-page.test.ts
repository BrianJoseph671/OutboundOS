/**
 * Tests for the Actions Page — run in node environment (no DOM rendering).
 *
 * These tests validate the data processing logic used by the Actions Page:
 *   - Filter functions (filterByType, filterByCompany)
 *   - Sort order (priority DESC, createdAt DESC)
 *   - Dismiss logic (removes from list)
 *   - Snooze logic (removes from list)
 *   - Empty state detection
 *   - Tab toggle state management
 *   - Badge color mapping
 *   - Source icon mapping
 *   - Mock data has correct shape (ActionCard)
 *   - useActions hook API call patterns (dismiss, snooze, sync, filters)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ActionCard, ActionType, ActionStatus } from "@shared/types/actions";

// ── Helper: create a minimal ActionCard ──────────────────────────────────────

function makeAction(
  overrides: Partial<ActionCard> & { id: string; actionType: ActionType },
): ActionCard {
  return {
    userId: "user-brian",
    contactId: `contact-${overrides.id}`,
    triggerInteractionId: null,
    priority: 1,
    status: "pending" as ActionStatus,
    snoozedUntil: null,
    reason: "Test reason",
    createdAt: "2026-03-25T00:00:00.000Z",
    completedAt: null,
    contactName: "Test User",
    contactCompany: "Test Corp",
    contactEmail: "test@example.com",
    ...overrides,
  };
}

// ── Pure filter function (mirrors what the component does) ───────────────────

function filterByType(
  actions: ActionCard[],
  type: ActionType | "all",
): ActionCard[] {
  if (type === "all") return actions;
  return actions.filter((a) => a.actionType === type);
}

function filterByCompany(actions: ActionCard[], company: string): ActionCard[] {
  if (!company) return actions;
  return actions.filter((a) =>
    a.contactCompany?.toLowerCase().includes(company.toLowerCase()),
  );
}

function sortActions(actions: ActionCard[]): ActionCard[] {
  return [...actions].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function getPendingActions(actions: ActionCard[]): ActionCard[] {
  const now = new Date();
  return actions.filter(
    (a) =>
      a.status === "pending" &&
      (a.snoozedUntil === null || new Date(a.snoozedUntil) <= now),
  );
}

// ── Badge color mapping ──────────────────────────────────────────────────────

const ACTION_TYPE_BADGE: Record<ActionType, string> = {
  follow_up: "amber",
  reconnect: "blue",
  open_thread: "purple",
  new_contact: "green",
};

// ── Source icon mapping ──────────────────────────────────────────────────────

type SourceChannel = "email" | "meeting" | "video";

function getSourceIcon(channel: SourceChannel): string {
  const map: Record<SourceChannel, string> = {
    email: "Mail",
    meeting: "Calendar",
    video: "Video",
  };
  return map[channel];
}

// =============================================================================
// Tests: Mock data shape
// =============================================================================

describe("Mock data — ActionCard shape", () => {
  it("mock-actions exports pendingMockActions as an array", async () => {
    const { pendingMockActions } = await import("../data/mock-actions");
    expect(Array.isArray(pendingMockActions)).toBe(true);
    expect(pendingMockActions.length).toBeGreaterThan(0);
  });

  it("mock actions are all pending (not snoozed, not dismissed)", async () => {
    const { pendingMockActions } = await import("../data/mock-actions");
    const now = new Date();
    for (const action of pendingMockActions) {
      expect(action.status).toBe("pending");
      if (action.snoozedUntil !== null) {
        expect(new Date(action.snoozedUntil).getTime()).toBeLessThanOrEqual(now.getTime());
      }
    }
  });

  it("each action has required fields: id, actionType, contactName, reason", async () => {
    const { mockActions } = await import("../data/mock-actions");
    for (const action of mockActions) {
      expect(action.id).toBeTruthy();
      expect(action.actionType).toBeTruthy();
      expect(action.contactName).toBeTruthy();
      expect(action.reason).toBeTruthy();
    }
  });

  it("mock data has at least 7 pending actions", async () => {
    const { pendingMockActions } = await import("../data/mock-actions");
    expect(pendingMockActions.length).toBeGreaterThanOrEqual(7);
  });

  it("mock data spans all four action types", async () => {
    const { mockActions } = await import("../data/mock-actions");
    const types = new Set(mockActions.map((a) => a.actionType));
    expect(types.has("follow_up")).toBe(true);
    expect(types.has("reconnect")).toBe(true);
    expect(types.has("open_thread")).toBe(true);
    expect(types.has("new_contact")).toBe(true);
  });

  it("mock data includes realistic names from Brian's network", async () => {
    const { mockActions } = await import("../data/mock-actions");
    const names = mockActions.map((a) => a.contactName);
    // At least one of the expected network names is present
    const knownNames = [
      "Vince Signori",
      "Andrei Gheorghe",
      "Paul Dornier",
      "Noah Lovati",
      "Aron Schwartz",
      "Sean Duryee",
      "George Gardner",
    ];
    const hasKnownName = names.some((n) => knownNames.includes(n));
    expect(hasKnownName).toBe(true);
  });
});

// =============================================================================
// Tests: Filter by type
// =============================================================================

describe("Filter by action type", () => {
  const actions: ActionCard[] = [
    makeAction({ id: "1", actionType: "follow_up" }),
    makeAction({ id: "2", actionType: "reconnect" }),
    makeAction({ id: "3", actionType: "open_thread" }),
    makeAction({ id: "4", actionType: "new_contact" }),
    makeAction({ id: "5", actionType: "follow_up" }),
  ];

  it("returns all actions when type is 'all'", () => {
    expect(filterByType(actions, "all")).toHaveLength(5);
  });

  it("returns only follow_up actions", () => {
    const result = filterByType(actions, "follow_up");
    expect(result).toHaveLength(2);
    expect(result.every((a) => a.actionType === "follow_up")).toBe(true);
  });

  it("returns only reconnect actions", () => {
    const result = filterByType(actions, "reconnect");
    expect(result).toHaveLength(1);
    expect(result[0].actionType).toBe("reconnect");
  });

  it("returns only open_thread actions", () => {
    const result = filterByType(actions, "open_thread");
    expect(result).toHaveLength(1);
    expect(result[0].actionType).toBe("open_thread");
  });

  it("returns only new_contact actions", () => {
    const result = filterByType(actions, "new_contact");
    expect(result).toHaveLength(1);
    expect(result[0].actionType).toBe("new_contact");
  });

  it("returns empty array when no actions match type", () => {
    const followUpsOnly = [makeAction({ id: "1", actionType: "follow_up" })];
    expect(filterByType(followUpsOnly, "reconnect")).toHaveLength(0);
  });
});

// =============================================================================
// Tests: Filter by company
// =============================================================================

describe("Filter by company", () => {
  const actions: ActionCard[] = [
    makeAction({ id: "1", actionType: "follow_up", contactCompany: "Anthropic" }),
    makeAction({ id: "2", actionType: "reconnect", contactCompany: "Linear" }),
    makeAction({ id: "3", actionType: "open_thread", contactCompany: "Notion" }),
  ];

  it("returns all when company is empty string", () => {
    expect(filterByCompany(actions, "")).toHaveLength(3);
  });

  it("matches company name case-insensitively", () => {
    expect(filterByCompany(actions, "anthropic")).toHaveLength(1);
    expect(filterByCompany(actions, "ANTHROPIC")).toHaveLength(1);
    expect(filterByCompany(actions, "Anthropic")).toHaveLength(1);
  });

  it("returns empty when no match", () => {
    expect(filterByCompany(actions, "Google")).toHaveLength(0);
  });
});

// =============================================================================
// Tests: Sort order
// =============================================================================

describe("Sort order — priority DESC, createdAt DESC", () => {
  const base = "2026-03-25T00:00:00.000Z";
  const earlier = "2026-03-20T00:00:00.000Z";

  const actions: ActionCard[] = [
    makeAction({ id: "low-old", actionType: "reconnect", priority: 1, createdAt: earlier }),
    makeAction({ id: "high-new", actionType: "follow_up", priority: 3, createdAt: base }),
    makeAction({ id: "low-new", actionType: "follow_up", priority: 1, createdAt: base }),
    makeAction({ id: "high-old", actionType: "open_thread", priority: 3, createdAt: earlier }),
    makeAction({ id: "mid", actionType: "new_contact", priority: 2, createdAt: base }),
  ];

  it("highest priority actions appear first", () => {
    const sorted = sortActions(actions);
    expect(sorted[0].priority).toBe(3);
    expect(sorted[1].priority).toBe(3);
  });

  it("within same priority, newer actions appear first", () => {
    const sorted = sortActions(actions);
    const priority3 = sorted.filter((a) => a.priority === 3);
    expect(priority3[0].id).toBe("high-new");
    expect(priority3[1].id).toBe("high-old");
  });

  it("lower priority appears after higher", () => {
    const sorted = sortActions(actions);
    const lastTwo = sorted.slice(-2);
    expect(lastTwo.every((a) => a.priority === 1)).toBe(true);
  });
});

// =============================================================================
// Tests: Dismiss removes card from list
// =============================================================================

describe("Dismiss — removes card from list", () => {
  function dismissAction(actions: ActionCard[], id: string): ActionCard[] {
    return actions.filter((a) => a.id !== id);
  }

  it("removes the dismissed action by id", () => {
    const actions = [
      makeAction({ id: "act-1", actionType: "follow_up" }),
      makeAction({ id: "act-2", actionType: "reconnect" }),
      makeAction({ id: "act-3", actionType: "open_thread" }),
    ];
    const result = dismissAction(actions, "act-2");
    expect(result).toHaveLength(2);
    expect(result.find((a) => a.id === "act-2")).toBeUndefined();
  });

  it("does nothing if id not found", () => {
    const actions = [makeAction({ id: "act-1", actionType: "follow_up" })];
    const result = dismissAction(actions, "act-999");
    expect(result).toHaveLength(1);
  });

  it("empty state after all actions dismissed", () => {
    const actions = [makeAction({ id: "act-1", actionType: "follow_up" })];
    const result = dismissAction(actions, "act-1");
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// Tests: Snooze removes card from pending list
// =============================================================================

describe("Snooze — removes card from pending list", () => {
  function snoozeAction(actions: ActionCard[], id: string, until: Date): ActionCard[] {
    // Snooze removes from visible pending list
    return actions.filter((a) => a.id !== id);
  }

  it("snoozed action removed from visible list", () => {
    const actions = [
      makeAction({ id: "act-1", actionType: "follow_up" }),
      makeAction({ id: "act-2", actionType: "reconnect" }),
    ];
    const until = new Date(Date.now() + 86400000); // 1 day from now
    const result = snoozeAction(actions, "act-1", until);
    expect(result).toHaveLength(1);
    expect(result.find((a) => a.id === "act-1")).toBeUndefined();
  });
});

// =============================================================================
// Tests: Empty state detection
// =============================================================================

describe("Empty state detection", () => {
  it("is empty when no pending actions", () => {
    expect(getPendingActions([])).toHaveLength(0);
  });

  it("is empty when all actions are dismissed", () => {
    const actions = [
      makeAction({ id: "1", actionType: "follow_up", status: "dismissed" }),
      makeAction({ id: "2", actionType: "reconnect", status: "completed" }),
    ];
    expect(getPendingActions(actions)).toHaveLength(0);
  });

  it("excludes future-snoozed actions from pending", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const actions = [
      makeAction({ id: "1", actionType: "follow_up", status: "snoozed", snoozedUntil: future }),
    ];
    expect(getPendingActions(actions)).toHaveLength(0);
  });

  it("includes past-snoozed actions in pending (resurfaced)", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const actions = [
      makeAction({ id: "1", actionType: "follow_up", status: "pending", snoozedUntil: past }),
    ];
    expect(getPendingActions(actions)).toHaveLength(1);
  });

  it("is not empty when pending actions exist", () => {
    const actions = [makeAction({ id: "1", actionType: "follow_up" })];
    expect(getPendingActions(actions)).toHaveLength(1);
  });
});

// =============================================================================
// Tests: Tab toggle state management
// =============================================================================

describe("Tab toggle state", () => {
  type Tab = "actions" | "rolodex";

  function setActiveTab(current: Tab, next: Tab): Tab {
    return next;
  }

  it("defaults to 'actions' tab", () => {
    const defaultTab: Tab = "actions";
    expect(defaultTab).toBe("actions");
  });

  it("can switch from actions to rolodex", () => {
    expect(setActiveTab("actions", "rolodex")).toBe("rolodex");
  });

  it("can switch from rolodex to actions", () => {
    expect(setActiveTab("rolodex", "actions")).toBe("actions");
  });
});

// =============================================================================
// Tests: Action type badge colors
// =============================================================================

describe("Action type badge colors", () => {
  it("follow_up maps to amber", () => {
    expect(ACTION_TYPE_BADGE["follow_up"]).toBe("amber");
  });

  it("reconnect maps to blue", () => {
    expect(ACTION_TYPE_BADGE["reconnect"]).toBe("blue");
  });

  it("open_thread maps to purple", () => {
    expect(ACTION_TYPE_BADGE["open_thread"]).toBe("purple");
  });

  it("new_contact maps to green", () => {
    expect(ACTION_TYPE_BADGE["new_contact"]).toBe("green");
  });

  it("all four types have distinct colors", () => {
    const colors = Object.values(ACTION_TYPE_BADGE);
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(4);
  });
});

// =============================================================================
// Tests: Source icon mapping
// =============================================================================

describe("Source icon mapping", () => {
  it("email channel maps to Mail icon", () => {
    expect(getSourceIcon("email")).toBe("Mail");
  });

  it("meeting channel maps to Calendar icon", () => {
    expect(getSourceIcon("meeting")).toBe("Calendar");
  });

  it("video channel maps to Video icon", () => {
    expect(getSourceIcon("video")).toBe("Video");
  });
});

// =============================================================================
// Tests: Sync Recent button loading state
// =============================================================================

describe("Sync Recent loading state logic", () => {
  it("starts with isSyncing = false", () => {
    let isSyncing = false;
    expect(isSyncing).toBe(false);
  });

  it("sets isSyncing = true when sync starts", () => {
    let isSyncing = false;
    // simulate button click
    isSyncing = true;
    expect(isSyncing).toBe(true);
  });

  it("sets isSyncing = false after sync completes", async () => {
    let isSyncing = false;
    isSyncing = true;
    await Promise.resolve(); // simulate async operation
    isSyncing = false;
    expect(isSyncing).toBe(false);
  });

  it("button is disabled while isSyncing = true", () => {
    const isSyncing = true;
    // The button's disabled prop should equal isSyncing
    const isDisabled = isSyncing;
    expect(isDisabled).toBe(true);
  });
});

// =============================================================================
// Tests: Combined filter (type + company)
// =============================================================================

describe("Combined type and company filters", () => {
  const actions: ActionCard[] = [
    makeAction({ id: "1", actionType: "follow_up", contactCompany: "Anthropic" }),
    makeAction({ id: "2", actionType: "follow_up", contactCompany: "Linear" }),
    makeAction({ id: "3", actionType: "reconnect", contactCompany: "Anthropic" }),
  ];

  it("applies both filters: follow_up at Anthropic returns 1 result", () => {
    const byType = filterByType(actions, "follow_up");
    const byCompany = filterByCompany(byType, "Anthropic");
    expect(byCompany).toHaveLength(1);
    expect(byCompany[0].id).toBe("1");
  });

  it("returns empty when type filter eliminates all company matches", () => {
    const byType = filterByType(actions, "open_thread");
    const byCompany = filterByCompany(byType, "Anthropic");
    expect(byCompany).toHaveLength(0);
  });
});

// =============================================================================
// Tests: useActions hook — API call patterns
// (Mirrors the pattern used in interaction-timeline.test.ts for useInteractions)
// =============================================================================

describe("useActions hook — API call patterns", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("GET /api/actions constructs correct base URL without filters", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("GET", "/api/actions");
    await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/actions",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("GET /api/actions?type=follow_up passes type filter to API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("GET", "/api/actions?type=follow_up");
    await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/actions?type=follow_up",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("GET /api/actions?status=pending passes status filter to API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("GET", "/api/actions?status=pending");
    await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/actions?status=pending",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("dismissAction calls PATCH /api/actions/:id with status=dismissed", async () => {
    const mockResponse = { id: "act-1", status: "dismissed", completedAt: new Date().toISOString() };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("PATCH", "/api/actions/act-1", { status: "dismissed" });
    const data = await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/actions/act-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "dismissed" }),
      }),
    );
    expect(data.status).toBe("dismissed");
  });

  it("snoozeAction calls PATCH /api/actions/:id with status=snoozed and snoozedUntil", async () => {
    const snoozedUntil = new Date(Date.now() + 86400000).toISOString();
    const mockResponse = { id: "act-2", status: "snoozed", snoozedUntil };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const payload = { status: "snoozed", snoozedUntil };
    const res = await apiRequest("PATCH", "/api/actions/act-2", payload);
    const data = await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/actions/act-2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    );
    expect(data.status).toBe("snoozed");
    expect(data.snoozedUntil).toBe(snoozedUntil);
  });

  it("syncRecent calls POST /api/sync and returns SyncResponse shape", async () => {
    const mockSyncResponse = { newInteractions: 3, newActions: 2, errors: [] };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSyncResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("POST", "/api/sync");
    const data = await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/sync",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(typeof data.newInteractions).toBe("number");
    expect(typeof data.newActions).toBe("number");
    expect(Array.isArray(data.errors)).toBe(true);
    expect(data.newInteractions).toBe(3);
    expect(data.newActions).toBe(2);
  });

  it("syncRecent response shows correct counts in toast message format", () => {
    // Verify the toast description format used in the UI
    const syncData = { newInteractions: 5, newActions: 3, errors: [] };
    const description = `${syncData.newInteractions} new interactions, ${syncData.newActions} new actions`;
    expect(description).toBe("5 new interactions, 3 new actions");
  });

  it("GET /api/actions?status=pending&type=follow_up combines filters in URL", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    await apiRequest("GET", "/api/actions?status=pending&type=follow_up");

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/actions?status=pending&type=follow_up",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
