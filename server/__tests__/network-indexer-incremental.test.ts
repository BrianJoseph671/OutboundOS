import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createNetworkIndexJob,
  updateNetworkIndexJob,
  getRejectedEmailTypeSignatures,
  getContactByEmail,
  updateContact,
  createContact,
  getMeetings,
  createAction,
  listGmailThreads,
  getUserLabelMap,
  detectActions,
} = vi.hoisted(() => ({
  createNetworkIndexJob: vi.fn(),
  updateNetworkIndexJob: vi.fn(),
  getRejectedEmailTypeSignatures: vi.fn(),
  getContactByEmail: vi.fn(),
  updateContact: vi.fn(),
  createContact: vi.fn(),
  getMeetings: vi.fn(),
  createAction: vi.fn(),
  listGmailThreads: vi.fn(),
  getUserLabelMap: vi.fn(),
  detectActions: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    createNetworkIndexJob,
    updateNetworkIndexJob,
    getRejectedEmailTypeSignatures,
    getContactByEmail,
    updateContact,
    createContact,
    getMeetings,
    createAction,
  },
}));

vi.mock("../services/gmailClient", () => ({
  listGmailThreads,
  getUserLabelMap,
}));

vi.mock("../agent/services/actionDetector", () => ({
  detectActions,
}));

const { runIncrementalSync } = await import("../services/networkIndexer");

describe("runIncrementalSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNetworkIndexJob.mockResolvedValue({ id: "job-1" });
    updateNetworkIndexJob.mockResolvedValue({ id: "job-1" });
    getRejectedEmailTypeSignatures.mockResolvedValue(new Set());
    getUserLabelMap.mockResolvedValue(new Map());
    getMeetings.mockResolvedValue([]);
    detectActions.mockResolvedValue([]);
    createAction.mockResolvedValue({ id: "action-1" });
  });

  it("does not replace lifetime relationship metrics with the 7-day scan window", async () => {
    const userId = "user-1";
    const userEmail = "owner@example.com";
    const contactEmail = "alice@example.com";
    const previousInbound = new Date("2026-04-01T12:00:00.000Z");
    const previousOutbound = new Date("2026-04-02T12:00:00.000Z");
    const recentOutbound = new Date();
    const recentInbound = new Date(recentOutbound.getTime() + 1000);
    const existingContact = {
      id: "contact-1",
      userId,
      name: "Alice",
      email: contactEmail,
      company: "Acme",
      totalThreads: 50,
      bidirectionalThreads: 12,
      lastInboundAt: previousInbound,
      lastOutboundAt: previousOutbound,
      lastInteractionAt: previousOutbound,
    };

    getContactByEmail.mockResolvedValue(existingContact);
    updateContact.mockResolvedValue({ ...existingContact });
    listGmailThreads
      .mockResolvedValueOnce({
        threads: [
          {
            thread_id: "thread-outbound",
            subject: "Recent follow-up",
            snippet: "Checking in",
            participants: [userEmail, contactEmail],
            labels: [],
            last_message_at: recentOutbound.toISOString(),
            message_count: 1,
            messages: [
              {
                message_id: "message-outbound",
                thread_id: "thread-outbound",
                from: userEmail,
                to: [contactEmail],
                subject: "Recent follow-up",
                snippet: "Checking in",
                sent_at: recentOutbound.toISOString(),
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        threads: [
          {
            thread_id: "thread-inbound",
            subject: "Recent reply",
            snippet: "Sounds good",
            participants: [contactEmail, userEmail],
            labels: [],
            last_message_at: recentInbound.toISOString(),
            message_count: 1,
            messages: [
              {
                message_id: "message-inbound",
                thread_id: "thread-inbound",
                from: contactEmail,
                to: [userEmail],
                subject: "Recent reply",
                snippet: "Sounds good",
                sent_at: recentInbound.toISOString(),
              },
            ],
          },
        ],
      });

    const result = await runIncrementalSync(userId, userEmail);

    expect(result.errors).toEqual([]);
    expect(result.threadsScanned).toBe(2);
    expect(updateContact).toHaveBeenCalledWith(
      "contact-1",
      userId,
      expect.objectContaining({
        totalThreads: 50,
        bidirectionalThreads: 12,
        lastInboundAt: recentInbound,
        lastOutboundAt: recentOutbound,
        lastInteractionAt: recentInbound,
        tier: "vip",
      }),
    );
    expect(createContact).not.toHaveBeenCalled();
  });
});
