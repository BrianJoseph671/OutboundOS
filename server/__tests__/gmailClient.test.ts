import { beforeEach, describe, expect, it, vi } from "vitest";

const getValidAccessTokenMock = vi.fn();

vi.mock("../services/oauth", () => ({
  getValidAccessToken: getValidAccessTokenMock,
}));

describe("getGmailThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getValidAccessTokenMock.mockResolvedValue("token-1");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the union of labels from all messages in a thread", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        id: "thread-1",
        snippet: "thread snippet",
        messages: [
          {
            id: "msg-old",
            threadId: "thread-1",
            labelIds: ["Label_receipts"],
            internalDate: "1700000000000",
            payload: {
              headers: [
                { name: "From", value: "me@example.com" },
                { name: "To", value: "vendor@example.com" },
                { name: "Subject", value: "Receipt" },
              ],
            },
          },
          {
            id: "msg-new",
            threadId: "thread-1",
            labelIds: ["SENT"],
            internalDate: "1700000100000",
            payload: {
              headers: [
                { name: "From", value: "vendor@example.com" },
                { name: "To", value: "me@example.com" },
                { name: "Subject", value: "Re: Receipt" },
              ],
            },
          },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { getGmailThread } = await import("../services/gmailClient");
    const thread = await getGmailThread("user-1", "thread-1");

    expect(thread.labels).toEqual(["Label_receipts", "SENT"]);
  });
});
