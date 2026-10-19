import { beforeEach, describe, expect, it, vi } from "vitest";

const { listGmailThreadsMock, getUserLabelMapMock } = vi.hoisted(() => ({
  listGmailThreadsMock: vi.fn(),
  getUserLabelMapMock: vi.fn(),
}));

vi.mock("../services/gmailClient", () => ({
  listGmailThreads: listGmailThreadsMock,
  getUserLabelMap: getUserLabelMapMock,
}));

const createdContacts: Array<Record<string, unknown>> = [];
const updatedContacts: Array<Record<string, unknown>> = [];

vi.mock("../storage", () => ({
  storage: {
    createNetworkIndexJob: vi.fn(async () => ({ id: "job-1" })),
    updateNetworkIndexJob: vi.fn(async () => ({ id: "job-1" })),
    getRejectedEmailTypeSignatures: vi.fn(async () => new Set<string>()),
    getMeetings: vi.fn(async () => []),
    getContactByEmail: vi.fn(async () => undefined),
    createContact: vi.fn(async (contact: Record<string, unknown>) => {
      createdContacts.push(contact);
      return { id: `contact-${createdContacts.length}`, ...contact };
    }),
    updateContact: vi.fn(async (_id: string, _userId: string, data: Record<string, unknown>) => {
      updatedContacts.push(data);
      return data;
    }),
    createAction: vi.fn(),
    createIndexReviewSession: vi.fn(async () => ({ id: "session-1" })),
    createIndexReviewItem: vi.fn(async () => ({ id: "item-1" })),
    upsertEmailTypeRule: vi.fn(async () => ({ id: "rule-1" })),
    getIndexReviewSession: vi.fn(),
    getIndexReviewItems: vi.fn(async () => []),
    updateIndexReviewSession: vi.fn(async () => ({ id: "session-1" })),
  },
}));

vi.mock("../agent/services/actionDetector", () => ({
  detectActions: vi.fn(async () => []),
}));

vi.mock("../services/emailTypeClassifier", async () => {
  const actual = await vi.importActual<typeof import("../services/emailTypeClassifier")>(
    "../services/emailTypeClassifier",
  );
  return {
    ...actual,
    classifyEmailTypes: async (candidates: Array<import("../services/emailTypeClassifier").EmailTypeCandidate>) =>
      candidates.map((candidate) => ({
        signatureHash: candidate.signatureHash,
        proposedLabel: candidate.labelName || candidate.exampleSubjects[0] || "General",
        messageCount: candidate.messageCount,
        exampleSubjects: candidate.exampleSubjects,
        meetingLinkedContactCount: candidate.meetingLinkedContactCount || 0,
        hasAnyMeetingLinkedContacts: Boolean(candidate.hasAnyMeetingLinkedContacts),
        source: candidate.source === "label" ? "label" as const : "subject" as const,
        labelName: candidate.labelName,
      })),
  };
});

import { subjectSignatureHash } from "../services/emailTypeClassifier";
import { storage } from "../storage";
import {
  completeIndexReviewSession,
  prepareIndexReviewSession,
  runIncrementalSync,
} from "../services/networkIndexer";

function signatureFor(subject: string): string {
  return subjectSignatureHash(subject).signatureHash;
}

function message(params: {
  id: string;
  from: string;
  to: string[];
  subject: string;
  sentAt: string;
}) {
  return {
    message_id: params.id,
    thread_id: params.id,
    from: params.from,
    to: params.to,
    subject: params.subject,
    snippet: "",
    sent_at: params.sentAt,
  };
}

function thread(params: {
  id: string;
  subject: string;
  participants: string[];
  messages: ReturnType<typeof message>[];
  lastMessageAt: string;
}) {
  return {
    thread_id: params.id,
    subject: params.subject,
    snippet: "",
    participants: params.participants,
    labels: [],
    last_message_at: params.lastMessageAt,
    message_count: params.messages.length,
    messages: params.messages,
  };
}

const introThread = thread({
  id: "intro-thread",
  subject: "Intro meeting",
  participants: ["Brian <brian@nd.edu>", "Alice <alice@example.com>"],
  lastMessageAt: "2026-05-01T11:00:00.000Z",
  messages: [
    message({
      id: "intro-1",
      from: "Brian <brian@nd.edu>",
      to: ["Alice <alice@example.com>"],
      subject: "Intro meeting",
      sentAt: "2026-05-01T10:00:00.000Z",
    }),
    message({
      id: "intro-2",
      from: "Alice <alice@example.com>",
      to: ["Brian <brian@nd.edu>"],
      subject: "Re: Intro meeting",
      sentAt: "2026-05-01T11:00:00.000Z",
    }),
  ],
});

const newsletterThread = thread({
  id: "newsletter-thread",
  subject: "Newsletter",
  participants: ["Alice <alice@example.com>", "Brian <brian@nd.edu>"],
  lastMessageAt: "2026-05-02T09:00:00.000Z",
  messages: [
    message({
      id: "newsletter-1",
      from: "Alice <alice@example.com>",
      to: ["Brian <brian@nd.edu>"],
      subject: "Newsletter",
      sentAt: "2026-05-02T09:00:00.000Z",
    }),
  ],
});

describe("index review contact filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdContacts.length = 0;
    updatedContacts.length = 0;
    listGmailThreadsMock.mockReset();
    getUserLabelMapMock.mockResolvedValue(new Map());
    vi.mocked(storage.getMeetings).mockResolvedValue([]);
    vi.mocked(storage.getContactByEmail).mockResolvedValue(undefined);
    vi.mocked(storage.getRejectedEmailTypeSignatures).mockResolvedValue(new Set());
  });

  it("keeps a new contact's accepted threads when another thread type was rejected", async () => {
    vi.mocked(storage.getRejectedEmailTypeSignatures).mockResolvedValue(new Set([signatureFor("Newsletter")]));
    listGmailThreadsMock
      .mockResolvedValueOnce({ threads: [introThread] })
      .mockResolvedValueOnce({ threads: [newsletterThread] });

    const result = await runIncrementalSync("user-1", "brian@nd.edu");

    expect(result.errors).toEqual([]);
    expect(createdContacts).toHaveLength(1);
    expect(createdContacts[0]).toMatchObject({
      email: "alice@example.com",
      totalThreads: 1,
      bidirectionalThreads: 1,
      lastInboundAt: new Date("2026-05-01T11:00:00.000Z"),
      lastOutboundAt: new Date("2026-05-01T10:00:00.000Z"),
      lastInteractionAt: new Date("2026-05-01T11:00:00.000Z"),
    });
    expect(updatedContacts).toHaveLength(0);
  });

  it("does not replace an existing contact with the partial recent window", async () => {
    vi.mocked(storage.getRejectedEmailTypeSignatures).mockResolvedValue(new Set([signatureFor("Newsletter")]));
    vi.mocked(storage.getContactByEmail).mockResolvedValue({
      id: "alice-id",
      email: "alice@example.com",
      company: "Example",
      totalThreads: 40,
    } as Awaited<ReturnType<typeof storage.getContactByEmail>>);
    listGmailThreadsMock
      .mockResolvedValueOnce({ threads: [introThread] })
      .mockResolvedValueOnce({ threads: [newsletterThread] });

    await runIncrementalSync("user-1", "brian@nd.edu");

    expect(createdContacts).toHaveLength(0);
    expect(updatedContacts).toHaveLength(0);
  });

  it("does not create a contact whose only recent threads are rejected types", async () => {
    vi.mocked(storage.getRejectedEmailTypeSignatures).mockResolvedValue(new Set([signatureFor("Newsletter")]));
    listGmailThreadsMock
      .mockResolvedValueOnce({ threads: [] })
      .mockResolvedValueOnce({ threads: [newsletterThread] });

    const result = await runIncrementalSync("user-1", "brian@nd.edu");

    expect(result.errors).toEqual([]);
    expect(result.contactsFound).toBe(0);
    expect(createdContacts).toHaveLength(0);
  });

  it("does not auto-accept a type the user already rejected when it falls outside the review list", async () => {
    const subjects = [
      "alpha brief", "bravo brief", "cedar brief", "delta brief", "ember brief",
      "flint brief", "grove brief", "harbor brief", "ivory brief", "juniper brief",
      "kelp brief", "linen brief", "maple brief", "north brief", "opal brief",
      "pearl brief", "quartz brief", "river brief", "spruce brief", "timber brief",
      "umber brief",
    ];
    const rejectedSubject = subjects[subjects.length - 1];
    const threads = subjects.map((subject, index) => {
      return thread({
        id: `type-${index}`,
        subject,
        participants: ["Brian <brian@nd.edu>", "Pat <pat@example.com>"],
        lastMessageAt: "2026-05-01T10:00:00.000Z",
        messages: [
          message({
            id: `type-${index}`,
            from: "Brian <brian@nd.edu>",
            to: ["Pat <pat@example.com>"],
            subject,
            sentAt: "2026-05-01T10:00:00.000Z",
          }),
        ],
      });
    });
    vi.mocked(storage.getRejectedEmailTypeSignatures).mockResolvedValue(new Set([signatureFor(rejectedSubject)]));
    listGmailThreadsMock.mockResolvedValue({ threads });

    await prepareIndexReviewSession("user-1", "brian@nd.edu");

    const upsertedHashes = vi.mocked(storage.upsertEmailTypeRule).mock.calls.map((call) => call[1]);
    expect(upsertedHashes).not.toContain(signatureFor(rejectedSubject));
    const reviewedHashes = vi.mocked(storage.createIndexReviewItem).mock.calls.map(
      (call) => (call[0] as { signatureHash: string }).signatureHash,
    );
    expect(reviewedHashes).toHaveLength(20);
    expect(reviewedHashes).not.toContain(signatureFor(rejectedSubject));
  });

  it("persists accepted threads when completing a review that rejected another type for the same contact", async () => {
    const introHash = signatureFor("Intro meeting");
    const newsletterHash = signatureFor("Newsletter");
    vi.mocked(storage.getIndexReviewSession).mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      jobId: "job-1",
      status: "pending_review",
      summary: {
        threadsScanned: 2,
        contacts: [
          {
            email: "alice@example.com",
            name: "Alice",
            threadCount: 2,
            bidirectionalThreads: 1,
            lastInbound: "2026-05-02T09:00:00.000Z",
            lastOutbound: "2026-05-01T10:00:00.000Z",
            lastInteraction: "2026-05-02T09:00:00.000Z",
            company: "Example",
          },
        ],
        signaturesByEmail: {
          "alice@example.com": [introHash, newsletterHash],
        },
        contactContributions: [
          {
            email: "alice@example.com",
            name: "Alice",
            threadCount: 1,
            bidirectionalThreads: 1,
            lastInbound: "2026-05-01T11:00:00.000Z",
            lastOutbound: "2026-05-01T10:00:00.000Z",
            lastInteraction: "2026-05-01T11:00:00.000Z",
            company: "Example",
            signatures: [introHash],
          },
          {
            email: "alice@example.com",
            name: "Alice",
            threadCount: 1,
            bidirectionalThreads: 0,
            lastInbound: "2026-05-02T09:00:00.000Z",
            lastOutbound: null,
            lastInteraction: "2026-05-02T09:00:00.000Z",
            company: "Example",
            signatures: [newsletterHash],
          },
        ],
      },
    } as Awaited<ReturnType<typeof storage.getIndexReviewSession>>);
    vi.mocked(storage.getIndexReviewItems).mockResolvedValue([
      {
        id: "item-newsletter",
        sessionId: "session-1",
        signatureHash: newsletterHash,
        proposedLabel: "Newsletter",
        exampleSubjects: ["Newsletter"],
        messageCount: 1,
        decision: "reject",
      },
      {
        id: "item-intro",
        sessionId: "session-1",
        signatureHash: introHash,
        proposedLabel: "Intro",
        exampleSubjects: ["Intro meeting"],
        messageCount: 1,
        decision: "accept",
      },
    ] as Awaited<ReturnType<typeof storage.getIndexReviewItems>>);
    vi.mocked(storage.getRejectedEmailTypeSignatures).mockResolvedValue(new Set([newsletterHash]));

    await completeIndexReviewSession("user-1", "session-1");

    expect(createdContacts).toHaveLength(1);
    expect(createdContacts[0]).toMatchObject({
      email: "alice@example.com",
      totalThreads: 1,
      bidirectionalThreads: 1,
      lastInteractionAt: new Date("2026-05-01T11:00:00.000Z"),
    });
  });

  it("keeps a contact from an older review session when only one of their types was rejected", async () => {
    const introHash = signatureFor("Intro meeting");
    const newsletterHash = signatureFor("Newsletter");
    vi.mocked(storage.getIndexReviewSession).mockResolvedValue({
      id: "session-old",
      userId: "user-1",
      jobId: "job-1",
      status: "pending_review",
      summary: {
        threadsScanned: 2,
        contacts: [
          {
            email: "alice@example.com",
            name: "Alice",
            threadCount: 2,
            bidirectionalThreads: 1,
            lastInbound: "2026-05-01T11:00:00.000Z",
            lastOutbound: "2026-05-01T10:00:00.000Z",
            lastInteraction: "2026-05-01T11:00:00.000Z",
            company: "Example",
          },
        ],
        signaturesByEmail: {
          "alice@example.com": [introHash, newsletterHash],
        },
      },
    } as Awaited<ReturnType<typeof storage.getIndexReviewSession>>);
    vi.mocked(storage.getIndexReviewItems).mockResolvedValue([
      {
        id: "item-newsletter",
        sessionId: "session-old",
        signatureHash: newsletterHash,
        proposedLabel: "Newsletter",
        exampleSubjects: ["Newsletter"],
        messageCount: 1,
        decision: "reject",
      },
    ] as Awaited<ReturnType<typeof storage.getIndexReviewItems>>);
    vi.mocked(storage.getRejectedEmailTypeSignatures).mockResolvedValue(new Set([newsletterHash]));

    await completeIndexReviewSession("user-1", "session-old");

    expect(createdContacts).toHaveLength(1);
    expect(createdContacts[0]).toMatchObject({
      email: "alice@example.com",
      totalThreads: 2,
    });
  });
});
