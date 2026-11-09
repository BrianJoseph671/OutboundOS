/**
 * Sync must honor snoozed actions.
 *
 * detectActions runs on every Sync Recent. It used to treat only status=pending
 * as "already open", so a snoozed reconnect was recreated immediately and a
 * snoozed follow-up survived an outbound reply.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Interaction } from "@shared/schema";

const { getActionsMock, getContactsMock, getContactMock, getInteractionsMock, updateActionMock } =
  vi.hoisted(() => ({
    getActionsMock: vi.fn(),
    getContactsMock: vi.fn(),
    getContactMock: vi.fn(),
    getInteractionsMock: vi.fn(),
    updateActionMock: vi.fn(),
  }));

vi.mock("../storage", () => ({
  storage: {
    getActions: getActionsMock,
    getContacts: getContactsMock,
    getContact: getContactMock,
    getInteractions: getInteractionsMock,
    updateAction: updateActionMock,
  },
}));

type StoredAction = {
  id: string;
  userId: string;
  contactId: string;
  actionType: string;
  status: string;
  snoozedUntil: Date | null;
};

let storedActions: StoredAction[];

function action(partial: Partial<StoredAction> & Pick<StoredAction, "id" | "actionType" | "status">): StoredAction {
  return {
    userId: "user-1",
    contactId: "contact-1",
    snoozedUntil: null,
    ...partial,
  };
}

function outbound(contactId = "contact-1"): Interaction {
  return {
    id: "interaction-1",
    userId: "user-1",
    contactId,
    channel: "email",
    direction: "outbound",
    occurredAt: new Date(),
    sourceId: "src-1",
    summary: null,
    rawContent: null,
    openThreads: null,
    ingestedAt: new Date(),
  };
}

describe("detectActions snooze dedup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedActions = [];
    getActionsMock.mockImplementation(async (_userId: string, filters?: { status?: string }) => {
      return storedActions.filter((row) => !filters?.status || row.status === filters.status);
    });
    getContactsMock.mockResolvedValue([
      {
        id: "contact-1",
        tier: "warm",
        name: "Ada",
        lastInteractionAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      },
    ]);
    getContactMock.mockResolvedValue({ id: "contact-1", tier: "warm" });
    getInteractionsMock.mockResolvedValue([]);
    updateActionMock.mockResolvedValue(undefined);
  });

  it("does not recreate a reconnect that is still snoozed", async () => {
    storedActions = [
      action({
        id: "snoozed-reconnect",
        actionType: "reconnect",
        status: "snoozed",
        snoozedUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      }),
    ];

    const { detectActions } = await import("../agent/services/actionDetector");
    const created = await detectActions("user-1", []);

    expect(created.filter((row) => row.actionType === "reconnect")).toEqual([]);
    expect(getActionsMock).toHaveBeenCalledWith("user-1", { status: "snoozed" });
  });

  it("creates a reconnect when the previous one was dismissed", async () => {
    storedActions = [
      action({
        id: "dismissed-reconnect",
        actionType: "reconnect",
        status: "dismissed",
      }),
    ];

    const { detectActions } = await import("../agent/services/actionDetector");
    const created = await detectActions("user-1", []);

    expect(created.filter((row) => row.actionType === "reconnect")).toHaveLength(1);
  });

  it("completes a snoozed follow-up when an outbound reply is synced", async () => {
    storedActions = [
      action({
        id: "snoozed-follow-up",
        actionType: "follow_up",
        status: "snoozed",
        snoozedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    ];
    getContactsMock.mockResolvedValue([]);

    const { detectActions } = await import("../agent/services/actionDetector");
    await detectActions("user-1", [outbound()]);

    expect(updateActionMock).toHaveBeenCalledWith("snoozed-follow-up", "user-1", {
      status: "completed",
    });
  });
});
