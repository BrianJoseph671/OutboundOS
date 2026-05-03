import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  createNetworkIndexJob: vi.fn(),
  updateNetworkIndexJob: vi.fn(),
  createIndexReviewSession: vi.fn(),
  createIndexReviewItem: vi.fn(),
  getEmailTypeRuleBySignature: vi.fn(),
  upsertEmailTypeRule: vi.fn(),
  getMeetings: vi.fn(),
}));

const gmailMock = vi.hoisted(() => ({
  getUserLabelMap: vi.fn(),
  listGmailThreads: vi.fn(),
}));

const classifierMock = vi.hoisted(() => ({
  classifyEmailTypes: vi.fn(),
  subjectSignatureHash: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: storageMock,
}));

vi.mock("../services/gmailClient", () => ({
  getUserLabelMap: gmailMock.getUserLabelMap,
  listGmailThreads: gmailMock.listGmailThreads,
}));

vi.mock("../services/emailTypeClassifier", () => ({
  classifyEmailTypes: classifierMock.classifyEmailTypes,
  subjectSignatureHash: classifierMock.subjectSignatureHash,
}));

vi.mock("../agent/services/actionDetector", () => ({
  detectActions: vi.fn(),
}));

describe("prepareIndexReviewSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    storageMock.createNetworkIndexJob.mockResolvedValue({ id: "job-1" });
    storageMock.updateNetworkIndexJob.mockResolvedValue({});
    storageMock.createIndexReviewSession.mockResolvedValue({ id: "session-1" });
    storageMock.createIndexReviewItem.mockResolvedValue({});
    storageMock.getEmailTypeRuleBySignature.mockResolvedValue(undefined);
    storageMock.upsertEmailTypeRule.mockResolvedValue({});
    storageMock.getMeetings.mockResolvedValue([]);

    gmailMock.getUserLabelMap.mockResolvedValue(new Map());
    gmailMock.listGmailThreads.mockResolvedValue({
      threads: [
        {
          thread_id: "thread-1",
          subject: "Networking intro",
          snippet: "",
          participants: ["User <user@example.com>", "Contact <contact@example.com>"],
          labels: [],
          last_message_at: "2026-05-01T00:00:00.000Z",
          message_count: 1,
          messages: [
            {
              message_id: "message-1",
              thread_id: "thread-1",
              from: "user@example.com",
              to: ["contact@example.com"],
              subject: "Networking intro",
              snippet: "",
              sent_at: "2026-05-01T00:00:00.000Z",
              labels: [],
            },
          ],
        },
      ],
    });

    classifierMock.subjectSignatureHash.mockImplementation((subject: string) => ({
      signatureHash: `hash:${subject}`,
      signatureKey: subject,
    }));
  });

  it("does not overwrite a previous reject when auto-accepting overflow email types", async () => {
    const rejectedOverflowSignature = "signature-21";
    classifierMock.classifyEmailTypes.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => {
        const n = index + 1;
        return {
          signatureHash: `signature-${n}`,
          proposedLabel: `Type ${n}`,
          messageCount: 100 - index,
          exampleSubjects: [`Subject ${n}`],
          meetingLinkedContactCount: 0,
          hasAnyMeetingLinkedContacts: false,
          source: "subject",
        };
      }),
    );
    storageMock.getEmailTypeRuleBySignature.mockResolvedValue({
      signatureHash: rejectedOverflowSignature,
      decision: "reject",
    });

    const { prepareIndexReviewSession } = await import("../services/networkIndexer");
    await prepareIndexReviewSession("user-1", "user@example.com");

    expect(storageMock.createIndexReviewItem).toHaveBeenCalledTimes(20);
    expect(storageMock.getEmailTypeRuleBySignature).toHaveBeenCalledWith(
      "user-1",
      rejectedOverflowSignature,
    );
    expect(storageMock.upsertEmailTypeRule).not.toHaveBeenCalledWith(
      "user-1",
      rejectedOverflowSignature,
      expect.objectContaining({ decision: "accept" }),
    );
  });
});
