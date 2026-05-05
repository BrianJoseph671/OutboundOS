import { beforeEach, describe, expect, it, vi } from "vitest";

const listGmailThreadsMock = vi.fn();
const getUserLabelMapMock = vi.fn();
const defaultRejectedSignature = "unused";

vi.mock("../services/gmailClient", () => ({
  listGmailThreads: listGmailThreadsMock,
  getUserLabelMap: getUserLabelMapMock,
}));

const createdContacts: Array<Record<string, any>> = [];
const updatedJobs: Array<Record<string, any>> = [];

vi.mock("../storage", () => ({
  storage: {
    createNetworkIndexJob: vi.fn(async () => ({ id: "job-1" })),
    updateNetworkIndexJob: vi.fn(async (_id: string, _userId: string, data: Record<string, any>) => {
      updatedJobs.push(data);
      return { id: "job-1", ...data };
    }),
    getRejectedEmailTypeSignatures: vi.fn(async () => new Set([defaultRejectedSignature])),
    getMeetings: vi.fn(async () => []),
    getContactByEmail: vi.fn(async () => undefined),
    createContact: vi.fn(async (contact: Record<string, any>) => {
      createdContacts.push(contact);
      return { id: `contact-${createdContacts.length}`, ...contact };
    }),
    updateContact: vi.fn(),
    getInteractions: vi.fn(async () => []),
    createAction: vi.fn(),
  },
}));

vi.mock("../agent/services/actionDetector", () => ({
  detectActions: vi.fn(async () => []),
}));

function signatureFor(subject: string) {
  return subjectSignatureHash(subject).signatureHash;
}

import { subjectSignatureHash } from "../services/emailTypeClassifier";
import { runIncrementalSync } from "../services/networkIndexer";

describe("network indexer rejected email type filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdContacts.length = 0;
    updatedJobs.length = 0;
    getUserLabelMapMock.mockResolvedValue(new Map());
  });

  it("keeps accepted thread contributions for contacts that also appear in rejected email types", async () => {
    const rejected = signatureFor("Newsletter");
    vi.mocked((await import("../storage")).storage.getRejectedEmailTypeSignatures).mockResolvedValue(new Set([rejected]));
    listGmailThreadsMock
      .mockResolvedValueOnce({
        threads: [
          {
            thread_id: "accepted-thread",
            subject: "Intro meeting",
            snippet: "",
            participants: ["Brian <brian@nd.edu>", "Alice <alice@example.com>"],
            labels: [],
            last_message_at: "2026-05-01T11:00:00.000Z",
            message_count: 2,
            messages: [
              {
                message_id: "accepted-1",
                thread_id: "accepted-thread",
                from: "Brian <brian@nd.edu>",
                to: ["Alice <alice@example.com>"],
                subject: "Intro meeting",
                snippet: "",
                sent_at: "2026-05-01T10:00:00.000Z",
              },
              {
                message_id: "accepted-2",
                thread_id: "accepted-thread",
                from: "Alice <alice@example.com>",
                to: ["Brian <brian@nd.edu>"],
                subject: "Re: Intro meeting",
                snippet: "",
                sent_at: "2026-05-01T11:00:00.000Z",
              },
            ],
          },
          {
            thread_id: "rejected-thread",
            subject: "Newsletter",
            snippet: "",
            participants: ["Alice <alice@example.com>", "Brian <brian@nd.edu>"],
            labels: [],
            last_message_at: "2026-05-02T09:00:00.000Z",
            message_count: 1,
            messages: [
              {
                message_id: "rejected-1",
                thread_id: "rejected-thread",
                from: "Alice <alice@example.com>",
                to: ["Brian <brian@nd.edu>"],
                subject: "Newsletter",
                snippet: "",
                sent_at: "2026-05-02T09:00:00.000Z",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({ threads: [] });

    const result = await runIncrementalSync("user-1", "brian@nd.edu");

    expect(result.errors).toEqual([]);
    expect(result.contactsFound).toBe(1);
    expect(createdContacts).toHaveLength(1);
    expect(createdContacts[0]).toMatchObject({
      email: "alice@example.com",
      totalThreads: 1,
      bidirectionalThreads: 1,
      lastInboundAt: new Date("2026-05-01T11:00:00.000Z"),
      lastOutboundAt: new Date("2026-05-01T10:00:00.000Z"),
      lastInteractionAt: new Date("2026-05-01T11:00:00.000Z"),
    });
  });
});
