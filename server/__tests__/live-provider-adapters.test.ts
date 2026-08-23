import { beforeEach, describe, expect, it, vi } from "vitest";

const getMeetingsMock = vi.fn();
const getContactsMock = vi.fn();
const syncGoogleCalendarEventsMock = vi.fn();
const syncGranolaMeetingsMock = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getMeetings: getMeetingsMock,
    getContacts: getContactsMock,
  },
}));

vi.mock("../services/googleIntegration", () => ({
  syncGoogleCalendarEvents: syncGoogleCalendarEventsMock,
}));

vi.mock("../services/granolaIntegration", () => ({
  syncGranolaMeetings: syncGranolaMeetingsMock,
}));

describe("live provider adapters", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.RELATIONSHIP_PROVIDER_MODE = "live";
    getMeetingsMock.mockResolvedValue([]);
    getContactsMock.mockResolvedValue([
      { id: "contact-1", name: "Alice", email: "alice@example.com" },
    ]);
    syncGoogleCalendarEventsMock.mockResolvedValue({ synced: 0 });
    syncGranolaMeetingsMock.mockResolvedValue({ synced: 0 });
  });

  it("does not synthesize mock calendar events when live sync has no cached meetings", async () => {
    const { fetchEvents } = await import("../agent/adapters/calendar");

    const events = await fetchEvents(
      "2026-07-01T00:00:00.000Z",
      "2026-07-02T00:00:00.000Z",
      "owner@example.com",
      "user-1",
    );

    expect(syncGoogleCalendarEventsMock).toHaveBeenCalledWith("user-1", expect.any(Number), expect.any(Number));
    expect(events).toEqual([]);
    expect(getContactsMock).not.toHaveBeenCalled();
  });

  it("does not synthesize mock granola meetings when live sync has no cached meetings", async () => {
    const { fetchMeetings } = await import("../agent/adapters/granola");

    const meetings = await fetchMeetings("this_week", "user-1");

    expect(syncGranolaMeetingsMock).toHaveBeenCalledWith("user-1", 7);
    expect(meetings).toEqual([]);
    expect(getContactsMock).not.toHaveBeenCalled();
  });
});
