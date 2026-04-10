import { beforeEach, describe, expect, it, vi } from "vitest";

const listThreadsMock = vi.fn();
const getCheckpointMock = vi.fn();
const saveCheckpointMock = vi.fn();

vi.mock("../services/mcpClient", () => ({
  listThreads: listThreadsMock,
}));

vi.mock("../agent/services/superhumanSyncState", () => ({
  getSuperhumanCheckpoint: getCheckpointMock,
  saveSuperhumanCheckpoint: saveCheckpointMock,
}));

describe("superhuman adapter live mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RELATIONSHIP_PROVIDER_MODE = "live";
    getCheckpointMock.mockResolvedValue(null);
  });

  it("fetchEmails paginates through next_cursor and maps all pages", async () => {
    listThreadsMock
      .mockResolvedValueOnce({
        threads: [{
          thread_id: "thread-1",
          subject: "S1",
          snippet: "S1",
          participants: ["alice@example.com", "brian@nd.edu"],
          labels: [],
          last_message_at: "2026-04-01T10:00:00Z",
          message_count: 1,
          messages: [{
            message_id: "m-1",
            thread_id: "thread-1",
            from: "alice@example.com",
            to: ["brian@nd.edu"],
            subject: "S1",
            snippet: "S1",
            sent_at: "2026-04-01T10:00:00Z",
          }],
        }],
        next_cursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        threads: [{
          thread_id: "thread-2",
          subject: "S2",
          snippet: "S2",
          participants: ["charlie@example.com", "brian@nd.edu"],
          labels: [],
          last_message_at: "2026-04-01T11:00:00Z",
          message_count: 1,
          messages: [{
            message_id: "m-2",
            thread_id: "thread-2",
            from: "charlie@example.com",
            to: ["brian@nd.edu"],
            subject: "S2",
            snippet: "S2",
            sent_at: "2026-04-01T11:00:00Z",
          }],
        }],
      });

    const { fetchEmails } = await import("../agent/adapters/superhuman");
    const emails = await fetchEmails(
      "2026-04-01T00:00:00.000Z",
      "2026-04-02T00:00:00.000Z",
      "brian@nd.edu",
      "u-1",
    );

    expect(listThreadsMock).toHaveBeenCalledTimes(2);
    expect(emails).toHaveLength(2);
    expect(emails.map((e: { threadId: string }) => e.threadId)).toEqual(["thread-1", "thread-2"]);
  });

  it("fetchEmails prefers checkpoint when newer than sync window start", async () => {
    getCheckpointMock.mockResolvedValue("2026-04-10T00:00:00.000Z");
    listThreadsMock.mockResolvedValue({
      threads: [],
    });

    const { fetchEmails } = await import("../agent/adapters/superhuman");
    await fetchEmails(
      "2026-04-01T00:00:00.000Z",
      "2026-04-12T00:00:00.000Z",
      "brian@nd.edu",
      "u-2",
    );

    const firstCallArgs = listThreadsMock.mock.calls[0][1];
    expect(firstCallArgs.start_date).toBe("2026-04-10T00:00:00.000Z");
  });

  it("fetchEmails picks newest message by sent_at deterministically", async () => {
    listThreadsMock.mockResolvedValue({
      threads: [{
        thread_id: "thread-3",
        subject: "Fallback Subject",
        snippet: "Fallback Snippet",
        participants: ["Alice <alice@example.com>", "Brian <brian@nd.edu>"],
        labels: [],
        last_message_at: "2026-04-01T11:00:00Z",
        message_count: 2,
        messages: [
          {
            message_id: "old-msg",
            thread_id: "thread-3",
            from: "Alice <alice@example.com>",
            to: ["brian@nd.edu"],
            subject: "Older",
            snippet: "Older snippet",
            sent_at: "2026-04-01T09:00:00Z",
          },
          {
            message_id: "new-msg",
            thread_id: "thread-3",
            from: "Alice <alice@example.com>",
            to: ["brian@nd.edu"],
            subject: "Newer",
            snippet: "Newer snippet",
            sent_at: "2026-04-01T12:00:00Z",
          },
        ],
      }],
    });

    const { fetchEmails } = await import("../agent/adapters/superhuman");
    const emails = await fetchEmails(
      "2026-04-01T00:00:00.000Z",
      "2026-04-02T00:00:00.000Z",
      "brian@nd.edu",
      "u-3",
    );

    expect(emails).toHaveLength(1);
    expect(emails[0].messageId).toBe("new-msg");
    expect(emails[0].subject).toBe("Newer");
    expect(saveCheckpointMock).toHaveBeenCalledWith("u-3", "2026-04-01T12:00:00Z");
  });
});
