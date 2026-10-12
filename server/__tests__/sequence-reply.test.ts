import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionMatchesSequence,
  gmailThreadIds,
  isGmailThreadId,
  replyLookupWindow,
  threadHasContactReplyAfter,
} from "../services/sequenceReply";

const { storageMock, listGmailThreads, getGmailThread } = vi.hoisted(() => ({
  storageMock: {
    getSequences: vi.fn(),
    getSequence: vi.fn(),
    getContact: vi.fn(),
    getSequenceSteps: vi.fn(),
    getInteractions: vi.fn(),
    updateSequence: vi.fn(),
    updateSequenceStep: vi.fn(),
    getActions: vi.fn(),
    updateAction: vi.fn(),
  },
  listGmailThreads: vi.fn(),
  getGmailThread: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: storageMock }));
vi.mock("../services/gmailClient", () => ({
  listGmailThreads,
  getGmailThread,
}));

import { checkReplyAndAutoComplete } from "../services/sequenceManager";

const userId = "user-1";
const contactId = "contact-1";
const sequenceId = "seq-1";
const lastSentAt = new Date("2026-10-01T15:00:00.000Z");

function sequence(overrides: Record<string, unknown> = {}) {
  return {
    id: sequenceId,
    userId,
    contactId,
    name: "Networking 3-Touch",
    status: "active",
    templateId: null,
    createdAt: lastSentAt,
    updatedAt: lastSentAt,
    ...overrides,
  };
}

function sentStep(threadId: string | null) {
  return {
    id: "step-1",
    sequenceId,
    stepNumber: 1,
    delayDays: 0,
    subject: null,
    instructions: "Send",
    status: "sent",
    scheduledFor: lastSentAt,
    sentAt: lastSentAt,
    draftId: null,
    threadId,
    createdAt: lastSentAt,
  };
}

function pendingStep() {
  return {
    id: "step-2",
    sequenceId,
    stepNumber: 2,
    delayDays: 3,
    subject: null,
    instructions: "Bump",
    status: "pending",
    scheduledFor: new Date("2026-10-04T15:00:00.000Z"),
    sentAt: null,
    draftId: null,
    threadId: null,
    createdAt: lastSentAt,
  };
}

function replyThread(threadId: string, sentAt = "2026-10-03T12:00:00.000Z") {
  return {
    thread_id: threadId,
    subject: "Re: hello",
    snippet: "Thanks",
    participants: ["Ada <ada@example.com>"],
    labels: [],
    last_message_at: sentAt,
    message_count: 2,
    messages: [
      {
        message_id: "m-out",
        thread_id: threadId,
        from: "Brian <brian@nd.edu>",
        to: ["ada@example.com"],
        subject: "hello",
        snippet: "hello",
        sent_at: lastSentAt.toISOString(),
      },
      {
        message_id: "m-in",
        thread_id: threadId,
        from: "Ada <ada@example.com>",
        to: ["brian@nd.edu"],
        subject: "Re: hello",
        snippet: "Thanks",
        sent_at: sentAt,
      },
    ],
  };
}

describe("sequence reply helpers", () => {
  it("rejects draft fallback thread ids and keeps Gmail hex ids", () => {
    expect(isGmailThreadId("local-thread-1710000000000")).toBe(false);
    expect(isGmailThreadId("thread-1710000000000")).toBe(false);
    expect(isGmailThreadId("18f0a1b2c3d4e5f6")).toBe(true);
    expect(gmailThreadIds(["local-thread-1", "18f0a1b2c3d4e5f6", "18f0a1b2c3d4e5f6"])).toEqual([
      "18f0a1b2c3d4e5f6",
    ]);
  });

  it("searches from the send time through the next UTC day", () => {
    const now = new Date("2026-10-12T13:00:00.000Z");
    const window = replyLookupWindow(lastSentAt, now);
    expect(window.start_date).toBe(lastSentAt.toISOString());
    expect(window.end_date).toBe("2026-10-13T00:00:00.000Z");
  });

  it("matches a later message from the contact and ignores earlier mail", () => {
    const thread = replyThread("18f0a1b2c3d4e5f6");
    expect(threadHasContactReplyAfter(thread, "ada@example.com", lastSentAt)).toBe(true);
    expect(
      threadHasContactReplyAfter(thread, "ada@example.com", new Date("2026-10-04T00:00:00.000Z")),
    ).toBe(false);
    expect(actionMatchesSequence('Step 2 of "Networking 3-Touch" is due', "Networking 3-Touch")).toBe(true);
    expect(actionMatchesSequence('Step 2 of "Networking 3-Touch extra" is due', "Networking 3-Touch")).toBe(false);
  });
});

describe("checkReplyAndAutoComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.getSequences.mockResolvedValue([sequence()]);
    storageMock.getSequence.mockResolvedValue(sequence());
    storageMock.getContact.mockResolvedValue({ id: contactId, email: "ada@example.com" });
    storageMock.updateSequence.mockResolvedValue(sequence({ status: "completed" }));
    storageMock.updateSequenceStep.mockImplementation(async (id: string, data: { status: string }) => ({
      id,
      ...data,
    }));
    storageMock.getActions.mockResolvedValue([
      {
        id: "action-1",
        userId,
        contactId,
        actionType: "sequence_step",
        status: "pending",
        reason: 'Step 2 of "Networking 3-Touch" is due',
      },
      {
        id: "action-other",
        userId,
        contactId,
        actionType: "sequence_step",
        status: "pending",
        reason: 'Step 2 of "Networking 3-Touch extra" is due',
      },
    ]);
    storageMock.updateAction.mockResolvedValue({});
  });

  it("completes a sequence when a stored Gmail thread has a reply from days earlier", async () => {
    storageMock.getSequenceSteps.mockResolvedValue([
      sentStep("18f0a1b2c3d4e5f6"),
      pendingStep(),
    ]);
    getGmailThread.mockResolvedValue(replyThread("18f0a1b2c3d4e5f6"));

    const completed = await checkReplyAndAutoComplete(userId);

    expect(completed).toBe(1);
    expect(getGmailThread).toHaveBeenCalledWith(userId, "18f0a1b2c3d4e5f6");
    expect(listGmailThreads).not.toHaveBeenCalled();
    expect(storageMock.updateSequenceStep).toHaveBeenCalledWith("step-2", { status: "skipped" });
    expect(storageMock.updateSequence).toHaveBeenCalledWith(sequenceId, userId, { status: "completed" });
    expect(storageMock.updateAction).toHaveBeenCalledWith("action-1", userId, { status: "completed" });
    expect(storageMock.updateAction).not.toHaveBeenCalledWith("action-other", userId, { status: "completed" });
  });

  it("does not let a local draft thread id hide a later reply from the contact", async () => {
    storageMock.getSequenceSteps.mockResolvedValue([
      sentStep("local-thread-1710000000000"),
      pendingStep(),
    ]);
    listGmailThreads.mockResolvedValue({
      threads: [replyThread("18aaaaaaaaaaaaaa")],
    });

    const completed = await checkReplyAndAutoComplete(userId);

    expect(completed).toBe(1);
    expect(getGmailThread).not.toHaveBeenCalled();
    expect(listGmailThreads).toHaveBeenCalledWith(userId, {
      ...replyLookupWindow(lastSentAt),
      from: ["ada@example.com"],
      limit: 30,
    });
    expect(storageMock.updateSequence).toHaveBeenCalledWith(sequenceId, userId, { status: "completed" });
  });

  it("leaves the sequence active when the stored thread has no reply after the send", async () => {
    storageMock.getSequenceSteps.mockResolvedValue([sentStep("18f0a1b2c3d4e5f6"), pendingStep()]);
    getGmailThread.mockResolvedValue(replyThread("18f0a1b2c3d4e5f6", lastSentAt.toISOString()));
    storageMock.getInteractions.mockResolvedValue([
      {
        direction: "inbound",
        channel: "email",
        occurredAt: new Date("2026-10-05T00:00:00.000Z"),
      },
    ]);

    const completed = await checkReplyAndAutoComplete(userId);

    expect(completed).toBe(0);
    expect(listGmailThreads).not.toHaveBeenCalled();
    expect(storageMock.getInteractions).not.toHaveBeenCalled();
    expect(storageMock.updateSequence).not.toHaveBeenCalled();
  });

  it("falls back to stored inbound interactions when Gmail thread loads fail", async () => {
    storageMock.getSequenceSteps.mockResolvedValue([sentStep("18f0a1b2c3d4e5f6"), pendingStep()]);
    getGmailThread.mockRejectedValue(new Error("Gmail unavailable"));
    storageMock.getInteractions.mockResolvedValue([
      {
        direction: "inbound",
        channel: "email",
        occurredAt: new Date("2026-10-05T00:00:00.000Z"),
      },
    ]);

    const completed = await checkReplyAndAutoComplete(userId);

    expect(completed).toBe(1);
    expect(storageMock.updateSequence).toHaveBeenCalledWith(sequenceId, userId, { status: "completed" });
  });
});
