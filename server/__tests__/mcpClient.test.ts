import { beforeEach, describe, expect, it, vi } from "vitest";

const getValidAccessTokenMock = vi.fn();
let callToolMock = vi.fn();

vi.mock("../services/oauth", () => ({
  getValidAccessToken: getValidAccessTokenMock,
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockTransport {
    constructor(public url: URL) {}
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    async connect() {
      return undefined;
    }
    async close() {
      return undefined;
    }
    async callTool(args: unknown) {
      return callToolMock(args);
    }
  },
}));

describe("mcpClient retry policy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SUPERHUMAN_MCP_MAX_RETRIES = "2";
    process.env.SUPERHUMAN_MCP_RETRY_BASE_MS = "0";
    getValidAccessTokenMock.mockResolvedValue("token-1");
  });

  it("retries transient failure then succeeds", async () => {
    callToolMock = vi.fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ structuredContent: { threads: [], next_cursor: undefined } });

    const { listThreads } = await import("../services/mcpClient");
    const result = await listThreads("user-1", { limit: 10 });

    expect(callToolMock).toHaveBeenCalledTimes(2);
    expect(result.threads).toEqual([]);
  });

  it("stops after retry budget is exhausted", async () => {
    callToolMock = vi.fn()
      .mockRejectedValue(new Error("503 service unavailable"));

    const { listThreads } = await import("../services/mcpClient");

    await expect(listThreads("user-2", { limit: 10 })).rejects.toThrow("503 service unavailable");
    expect(callToolMock).toHaveBeenCalledTimes(2);
  });
});
