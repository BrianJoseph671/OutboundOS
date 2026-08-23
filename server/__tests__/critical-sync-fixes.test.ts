import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storage: {
    getMeetings: vi.fn(),
    getContacts: vi.fn(),
    getUser: vi.fn(),
    getInteractions: vi.fn(),
    getSequences: vi.fn(),
    getContact: vi.fn(),
    getSequenceSteps: vi.fn(),
    updateSequenceStep: vi.fn(),
    updateSequence: vi.fn(),
    createInteraction: vi.fn(),
    getInteractionBySourceId: vi.fn(),
    createAction: vi.fn(),
    updateContact: vi.fn(),
    getActions: vi.fn(),
  },
  syncGranolaMeetings: vi.fn(),
  syncGoogleCalendarEvents: vi.fn(),
  listGmailThreads: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: mocks.storage,
}));

vi.mock("../services/granolaIntegration", () => ({
  syncGranolaMeetings: mocks.syncGranolaMeetings,
}));

vi.mock("../services/googleIntegration", () => ({
  syncGoogleCalendarEvents: mocks.syncGoogleCalendarEvents,
}));

vi.mock("../services/gmailClient", () => ({
  listGmailThreads: mocks.listGmailThreads,
}));

describe("critical sync bug fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RELATIONSHIP_PROVIDER_MODE = "mock";
    mocks.storage.getContacts.mockResolvedValue([]);
    mocks.storage.getMeetings.mockResolvedValue([]);
    mocks.storage.getUser.mockResolvedValue({ id: "u-1", email: "owner@example.com" });
    mocks.storage.getInteractions.mockResolvedValue([]);
    mocks.storage.getActions.mockResolvedValue([]);
  });

  it("does not generate mock Granola meetings when live sync/cache is empty", async () => {
    process.env.RELATIONSHIP_PROVIDER_MODE = "live";
    mocks.syncGranolaMeetings.mockResolvedValue({ synced: 0, matched: 0, errors: [] });
    mocks.storage.getContacts.mockResolvedValue([
      { id: "c-1", name: "Alice", email: "alice@example.com" },
    ]);

    const { fetchMeetings } = await import("../agent/adapters/granola");
    const meetings = await fetchMeetings("this_week", "u-1");

    expect(meetings).toEqual([]);
    expect(mocks.storage.getContacts).not.toHaveBeenCalled();
  });

  it("does not generate mock Calendar events when live sync/cache is empty", async () => {
    process.env.RELATIONSHIP_PROVIDER_MODE = "live";
    mocks.syncGoogleCalendarEvents.mockResolvedValue({ synced: 0, errors: [] });
    mocks.storage.getContacts.mockResolvedValue([
      { id: "c-1", name: "Alice", email: "alice@example.com" },
    ]);

    const { fetchEvents } = await import("../agent/adapters/calendar");
    const events = await fetchEvents(
      "2026-06-01T00:00:00.000Z",
      "2026-06-02T00:00:00.000Z",
      "owner@example.com",
      "u-1",
    );

    expect(events).toEqual([]);
    expect(mocks.storage.getContacts).not.toHaveBeenCalled();
  });

  it("uses contact-specific meeting source IDs so group attendees are not deduped together", async () => {
    const { mapMeetingToInteraction } = await import("../agent/adapters/granola");
    const meeting = {
      id: "meeting-1",
      title: "Group sync",
      date: "2026-06-01",
      knownParticipants: ["a@example.com", "b@example.com"],
      summary: "Discussed launch",
    };

    expect(mapMeetingToInteraction(meeting, "contact-a").sourceId).toBe("meeting-1:contact-a");
    expect(mapMeetingToInteraction(meeting, "contact-b").sourceId).toBe("meeting-1:contact-b");
  });

  it("uses contact-specific calendar source IDs so group attendees are not deduped together", async () => {
    const { mapEventToInteraction } = await import("../agent/adapters/calendar");
    const event = {
      eventId: "event-1",
      title: "Group sync",
      start: "2026-06-01T10:00:00.000Z",
      end: "2026-06-01T10:30:00.000Z",
      attendees: ["owner@example.com", "a@example.com", "b@example.com"],
      description: null,
    };

    expect(mapEventToInteraction(event, "contact-a").sourceId).toBe("event-1:contact-a");
    expect(mapEventToInteraction(event, "contact-b").sourceId).toBe("event-1:contact-b");
  });

  it("passes the authenticated user's email through runSyncWithDeps", async () => {
    const deps = {
      fetchAndMapEmails: vi.fn().mockResolvedValue({ interactions: [], errors: [] }),
      fetchAndMapMeetings: vi.fn().mockResolvedValue({ interactions: [], errors: [] }),
      fetchAndMapEvents: vi.fn().mockResolvedValue({ interactions: [], errors: [] }),
    };

    const { runSyncWithDeps } = await import("../agent/index");
    await runSyncWithDeps("u-1", deps, "authed@example.com");

    expect(deps.fetchAndMapEmails).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "u-1",
      "authed@example.com",
    );
    expect(deps.fetchAndMapEvents).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "u-1",
      "authed@example.com",
    );
  });
});

describe("sequence reply detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storage.getSequences.mockResolvedValue([
      { id: "seq-1", contactId: "contact-1", status: "active", name: "Sequence" },
    ]);
    mocks.storage.getContact.mockResolvedValue({ id: "contact-1", email: "reply@example.com" });
    mocks.storage.getSequenceSteps.mockResolvedValue([
      {
        id: "step-1",
        sequenceId: "seq-1",
        status: "sent",
        sentAt: new Date("2026-06-18T10:00:00.000Z"),
        threadId: "thread-1",
      },
    ]);
    mocks.storage.updateSequenceStep.mockResolvedValue(undefined);
    mocks.storage.updateSequence.mockResolvedValue(undefined);
  });

  it("uses stored inbound interactions when Gmail returns no recent reply", async () => {
    mocks.listGmailThreads.mockResolvedValue({ threads: [] });
    mocks.storage.getInteractions.mockResolvedValue([
      {
        id: "interaction-1",
        contactId: "contact-1",
        channel: "email",
        direction: "inbound",
        occurredAt: new Date("2026-06-19T10:00:00.000Z"),
        sourceId: "thread-1",
      },
    ]);

    const { checkReplyAndAutoComplete } = await import("../services/sequenceManager");
    const completed = await checkReplyAndAutoComplete("u-1");

    expect(completed).toBe(1);
    expect(mocks.listGmailThreads).toHaveBeenCalledWith(
      "u-1",
      expect.objectContaining({
        start_date: "2026-06-18T10:00:00.000Z",
        from: ["reply@example.com"],
      }),
    );
    expect(mocks.storage.updateSequence).toHaveBeenCalledWith(
      "seq-1",
      "u-1",
      { status: "completed" },
    );
  });

  it("does not auto-complete from an unrelated stored thread when sequence thread IDs exist", async () => {
    mocks.listGmailThreads.mockResolvedValue({ threads: [] });
    mocks.storage.getInteractions.mockResolvedValue([
      {
        id: "interaction-1",
        contactId: "contact-1",
        channel: "email",
        direction: "inbound",
        occurredAt: new Date("2026-06-19T10:00:00.000Z"),
        sourceId: "unrelated-thread",
      },
    ]);

    const { checkReplyAndAutoComplete } = await import("../services/sequenceManager");
    const completed = await checkReplyAndAutoComplete("u-1");

    expect(completed).toBe(0);
    expect(mocks.storage.updateSequence).not.toHaveBeenCalled();
  });
});
