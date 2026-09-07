import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserMock,
  getContactsMock,
  getInteractionsMock,
  updateContactMock,
  writeInteractionsMock,
  detectActionsMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getContactsMock: vi.fn(),
  getInteractionsMock: vi.fn(),
  updateContactMock: vi.fn(),
  writeInteractionsMock: vi.fn(),
  detectActionsMock: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getUser: getUserMock,
    getContacts: getContactsMock,
    getInteractions: getInteractionsMock,
    updateContact: updateContactMock,
  },
}));

vi.mock("../agent/services/interactionWriter", () => ({
  writeInteractions: writeInteractionsMock,
}));

vi.mock("../agent/services/actionDetector", () => ({
  detectActions: detectActionsMock,
}));

import { runSyncWithDeps } from "../agent/index";

describe("runSync user email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BRIAN_EMAIL;
    getContactsMock.mockResolvedValue([]);
    getInteractionsMock.mockResolvedValue([]);
    writeInteractionsMock.mockResolvedValue({
      written: 0,
      writtenContactIds: [],
      writtenInteractionIds: [],
    });
    detectActionsMock.mockResolvedValue([]);
  });

  it("prefers the signed-in account email over BRIAN_EMAIL for adapter matching", async () => {
    getUserMock.mockResolvedValue({ id: "user-1", email: "owner@example.com" });
    process.env.BRIAN_EMAIL = "fallback@example.com";

    const fetchAndMapEmails = vi.fn().mockResolvedValue({ interactions: [], errors: [] });
    const fetchAndMapMeetings = vi.fn().mockResolvedValue({ interactions: [], errors: [] });
    const fetchAndMapEvents = vi.fn().mockResolvedValue({ interactions: [], errors: [] });

    await runSyncWithDeps("user-1", {
      fetchAndMapEmails,
      fetchAndMapMeetings,
      fetchAndMapEvents,
    });

    expect(fetchAndMapEmails).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "user-1",
      "owner@example.com",
    );
    expect(fetchAndMapEvents).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "user-1",
      "owner@example.com",
    );
  });
});
