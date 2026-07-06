import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunSyncDeps } from "../agent/index";

const getUserMock = vi.fn();
const getContactsMock = vi.fn();
const getInteractionsMock = vi.fn();
const writeInteractionsMock = vi.fn();
const detectActionsMock = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getUser: getUserMock,
    getContacts: getContactsMock,
    getInteractions: getInteractionsMock,
  },
}));

vi.mock("../agent/services/interactionWriter", () => ({
  writeInteractions: writeInteractionsMock,
}));

vi.mock("../agent/services/actionDetector", () => ({
  detectActions: detectActionsMock,
}));

describe("runSyncWithDeps user email resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.BRIAN_EMAIL = "owner@example.com";
    getUserMock.mockResolvedValue({ id: "user-1", email: "actual-user@example.com" });
    getContactsMock.mockResolvedValue([]);
    getInteractionsMock.mockResolvedValue([]);
    writeInteractionsMock.mockResolvedValue({
      written: 0,
      writtenContactIds: [],
      writtenInteractionIds: [],
    });
    detectActionsMock.mockResolvedValue([]);
  });

  it("passes the authenticated user's email to adapters instead of BRIAN_EMAIL", async () => {
    const { runSyncWithDeps } = await import("../agent/index");
    const deps: RunSyncDeps = {
      fetchAndMapEmails: vi.fn().mockResolvedValue({ interactions: [], errors: [] }),
      fetchAndMapMeetings: vi.fn().mockResolvedValue({ interactions: [], errors: [] }),
      fetchAndMapEvents: vi.fn().mockResolvedValue({ interactions: [], errors: [] }),
    };

    await runSyncWithDeps("user-1", deps);

    expect(deps.fetchAndMapEmails).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "user-1",
      "actual-user@example.com",
    );
    expect(deps.fetchAndMapEvents).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "user-1",
      "actual-user@example.com",
    );
  });
});
