import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEvents } from "../agent/adapters/calendar";
import { fetchMeetings } from "../agent/adapters/granola";
import { runSyncWithDeps, type RunSyncDeps } from "../agent/index";

const mocks = vi.hoisted(() => ({
  syncGoogleCalendarEvents: vi.fn(),
  syncGranolaMeetings: vi.fn(),
  storage: {
    getUser: vi.fn(),
    getContacts: vi.fn(),
    getMeetings: vi.fn(),
    getInteractions: vi.fn(),
    getInteractionBySourceId: vi.fn(),
    createInteraction: vi.fn(),
    createAction: vi.fn(),
    updateContact: vi.fn(),
    getContact: vi.fn(),
  },
}));

vi.mock("../storage", () => ({
  storage: mocks.storage,
}));

vi.mock("../services/googleIntegration", () => ({
  syncGoogleCalendarEvents: mocks.syncGoogleCalendarEvents,
}));

vi.mock("../services/granolaIntegration", () => ({
  syncGranolaMeetings: mocks.syncGranolaMeetings,
}));

describe("live sync regressions", () => {
  const originalProviderMode = process.env.RELATIONSHIP_PROVIDER_MODE;
  const originalBrianEmail = process.env.BRIAN_EMAIL;

  beforeEach(() => {
    process.env.RELATIONSHIP_PROVIDER_MODE = "live";
    process.env.BRIAN_EMAIL = "wrong-env-user@example.com";

    mocks.syncGoogleCalendarEvents.mockReset();
    mocks.syncGranolaMeetings.mockReset();
    for (const mockFn of Object.values(mocks.storage)) {
      mockFn.mockReset();
    }

    mocks.storage.getContacts.mockResolvedValue([
      { id: "contact-1", name: "Alice", email: "alice@example.com" },
    ]);
    mocks.storage.getMeetings.mockResolvedValue([]);
    mocks.storage.getInteractions.mockResolvedValue([]);
    mocks.storage.getUser.mockResolvedValue({
      id: "user-1",
      email: "real-user@example.com",
    });
  });

  afterEach(() => {
    if (originalProviderMode === undefined) {
      delete process.env.RELATIONSHIP_PROVIDER_MODE;
    } else {
      process.env.RELATIONSHIP_PROVIDER_MODE = originalProviderMode;
    }

    if (originalBrianEmail === undefined) {
      delete process.env.BRIAN_EMAIL;
    } else {
      process.env.BRIAN_EMAIL = originalBrianEmail;
    }
  });

  it("does not synthesize calendar mock events in live mode when cached events are empty", async () => {
    mocks.syncGoogleCalendarEvents.mockRejectedValue(new Error("calendar unavailable"));

    const events = await fetchEvents(
      "2026-04-01T00:00:00.000Z",
      "2026-04-02T00:00:00.000Z",
      "real-user@example.com",
      "user-1",
    );

    expect(events).toEqual([]);
    expect(mocks.storage.getContacts).not.toHaveBeenCalled();
  });

  it("does not synthesize Granola mock meetings in live mode when cached meetings are empty", async () => {
    mocks.syncGranolaMeetings.mockRejectedValue(new Error("granola unavailable"));

    const meetings = await fetchMeetings("last_30_days", "user-1");

    expect(meetings).toEqual([]);
    expect(mocks.storage.getContacts).not.toHaveBeenCalled();
  });

  it("passes the authenticated user's email to email and calendar adapters", async () => {
    mocks.storage.getContacts.mockResolvedValue([]);

    const deps: RunSyncDeps = {
      fetchAndMapEmails: vi.fn(async () => ({ interactions: [], errors: [] })),
      fetchAndMapMeetings: vi.fn(async () => ({ interactions: [], errors: [] })),
      fetchAndMapEvents: vi.fn(async () => ({ interactions: [], errors: [] })),
    };

    const result = await runSyncWithDeps("user-1", deps);

    expect(result.errors).toEqual([]);
    expect(deps.fetchAndMapEmails).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "user-1",
      "real-user@example.com",
    );
    expect(deps.fetchAndMapEvents).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "user-1",
      "real-user@example.com",
    );
  });
});
