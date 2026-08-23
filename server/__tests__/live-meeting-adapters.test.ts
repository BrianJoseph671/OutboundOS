import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getContactsMock,
  getMeetingsMock,
  syncCalendarMock,
  syncGranolaMock,
} = vi.hoisted(() => ({
  getContactsMock: vi.fn(),
  getMeetingsMock: vi.fn(),
  syncCalendarMock: vi.fn(),
  syncGranolaMock: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getContacts: getContactsMock,
    getMeetings: getMeetingsMock,
  },
}));

vi.mock("../services/googleIntegration", () => ({
  syncGoogleCalendarEvents: syncCalendarMock,
}));

vi.mock("../services/granolaIntegration", () => ({
  syncGranolaMeetings: syncGranolaMock,
}));

import { fetchEvents } from "../agent/adapters/calendar";
import { fetchMeetings } from "../agent/adapters/granola";

describe("live meeting adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RELATIONSHIP_PROVIDER_MODE = "live";
    getMeetingsMock.mockResolvedValue([]);
    getContactsMock.mockResolvedValue([
      { id: "contact-1", name: "Alice", email: "alice@example.com" },
    ]);
  });

  it("does not fabricate calendar events when live sync fails without a cache", async () => {
    syncCalendarMock.mockRejectedValue(new Error("Google token expired"));

    const events = await fetchEvents(
      "2026-07-01T00:00:00.000Z",
      "2026-07-20T00:00:00.000Z",
      "owner@example.com",
      "user-1",
    );

    expect(events).toEqual([]);
    expect(getContactsMock).not.toHaveBeenCalled();
  });

  it("does not fabricate Granola meetings when live sync fails without a cache", async () => {
    syncGranolaMock.mockRejectedValue(new Error("Granola unavailable"));

    const meetings = await fetchMeetings("last_30_days", "user-1");

    expect(meetings).toEqual([]);
    expect(getContactsMock).not.toHaveBeenCalled();
  });
});
