import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockClassifyEmailTypes,
  mockDetectActions,
  mockGetUserLabelMap,
  mockListGmailThreads,
  mockStorage,
} = vi.hoisted(() => ({
  mockClassifyEmailTypes: vi.fn(),
  mockDetectActions: vi.fn(),
  mockGetUserLabelMap: vi.fn(),
  mockListGmailThreads: vi.fn(),
  mockStorage: {
    createNetworkIndexJob: vi.fn(),
    updateNetworkIndexJob: vi.fn(),
    getMeetings: vi.fn(),
    createIndexReviewSession: vi.fn(),
    createIndexReviewItem: vi.fn(),
    getEmailTypeRuleBySignature: vi.fn(),
    upsertEmailTypeRule: vi.fn(),
    getIndexReviewSession: vi.fn(),
    getIndexReviewItems: vi.fn(),
    getRejectedEmailTypeSignatures: vi.fn(),
    getContactByEmail: vi.fn(),
    createContact: vi.fn(),
    updateContact: vi.fn(),
    getInteractions: vi.fn(),
    createAction: vi.fn(),
    updateIndexReviewSession: vi.fn(),
  },
}));

vi.mock("../storage", () => ({
  storage: mockStorage,
}));

vi.mock("../services/gmailClient", () => ({
  getUserLabelMap: mockGetUserLabelMap,
  listGmailThreads: mockListGmailThreads,
}));

vi.mock("../services/emailTypeClassifier", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/emailTypeClassifier")>();
  return {
    ...actual,
    classifyEmailTypes: mockClassifyEmailTypes,
  };
});

vi.mock("../agent/services/actionDetector", () => ({
  detectActions: mockDetectActions,
}));

const { completeIndexReviewSession, prepareIndexReviewSession } = await import("../services/networkIndexer");
const { subjectSignatureHash } = await import("../services/emailTypeClassifier");

function makeThread(subject: string, index: number) {
  const contactEmail = `contact-${index}@example.com`;
  return {
    thread_id: `thread-${index}`,
    subject,
    snippet: "",
    participants: [`User <user@example.com>`, `Contact ${index} <${contactEmail}>`],
    labels: [],
    last_message_at: "2026-05-16T10:00:00.000Z",
    message_count: 1,
    messages: [
      {
        message_id: `message-${index}`,
        thread_id: `thread-${index}`,
        from: "User <user@example.com>",
        to: [contactEmail],
        subject,
        snippet: "",
        sent_at: "2026-05-16T10:00:00.000Z",
      },
    ],
  };
}

describe("network index review rule preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectActions.mockResolvedValue([]);
  });

  it("does not auto-accept a type that the user previously rejected", async () => {
    const rejectedSubject = "Type 20";
    const rejectedSignature = subjectSignatureHash(rejectedSubject).signatureHash;
    const threads = Array.from({ length: 21 }, (_value, index) => makeThread(`Type ${index}`, index));

    mockStorage.createNetworkIndexJob.mockResolvedValue({ id: "job-1" });
    mockStorage.updateNetworkIndexJob.mockResolvedValue({});
    mockStorage.getMeetings.mockResolvedValue([]);
    mockStorage.createIndexReviewSession.mockResolvedValue({ id: "session-1", jobId: "job-1" });
    mockStorage.createIndexReviewItem.mockResolvedValue({});
    mockStorage.getEmailTypeRuleBySignature.mockImplementation(async (_userId: string, signatureHash: string) =>
      signatureHash === rejectedSignature ? { decision: "reject" } : undefined,
    );
    mockStorage.upsertEmailTypeRule.mockResolvedValue({});
    mockGetUserLabelMap.mockResolvedValue(new Map());
    mockListGmailThreads.mockResolvedValue({ threads });
    mockClassifyEmailTypes.mockImplementation(async (candidates) =>
      candidates.map((candidate: any) => ({
        ...candidate,
        proposedLabel: candidate.signatureKey,
        messageCount: candidate.signatureHash === rejectedSignature ? 0 : 10,
      })),
    );

    const result = await prepareIndexReviewSession("user-1", "user@example.com");

    expect(result.autoAcceptedCount).toBe(1);
    expect(mockStorage.getEmailTypeRuleBySignature).toHaveBeenCalledWith("user-1", rejectedSignature);
    expect(mockStorage.upsertEmailTypeRule).not.toHaveBeenCalled();
  });

  it("does not complete review sessions while any item is undecided", async () => {
    mockStorage.getIndexReviewSession.mockResolvedValue({
      id: "session-1",
      jobId: "job-1",
      status: "pending_review",
      summary: {},
    });
    mockStorage.getIndexReviewItems.mockResolvedValue([
      {
        signatureHash: "sig-1",
        proposedLabel: "Investor intros",
        exampleSubjects: ["Intro"],
        decision: null,
      },
    ]);

    await expect(completeIndexReviewSession("user-1", "session-1")).rejects.toThrow(
      "All review items must be decided before completion",
    );
    expect(mockStorage.upsertEmailTypeRule).not.toHaveBeenCalled();
  });
});
