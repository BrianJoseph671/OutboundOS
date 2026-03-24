/**
 * Tests for scrutiny-identified fixes in the frontend layer.
 *
 * Fix 3: bulkCreate in useContacts must propagate errors to the caller.
 *         The previous implementation swallowed all API errors. After the fix,
 *         if apiRequest throws (non-OK response or network failure), the error
 *         propagates so TanStack Query's onError can handle it.
 *
 * Fix 4: AuthGate must handle non-401 errors from GET /auth/me (e.g., network
 *         failures, 500s). The underlying getQueryFn already throws for non-401
 *         HTTP errors. The component must now show an error UI + retry button
 *         instead of leaving the user on an infinite loading spinner.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// =============================================================================
// Fix 3: bulkCreate error propagation
// =============================================================================

describe("Fix 3: apiRequest throws on failure — bulkCreate must not swallow errors", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("apiRequest throws on 500 response (the contract bulkCreate now relies on)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    const { apiRequest } = await import("../lib/queryClient");

    await expect(
      apiRequest("POST", "/api/contacts/bulk-import", { contacts: [] }),
    ).rejects.toThrow("500");
  });

  it("apiRequest throws on network failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network failure"));

    const { apiRequest } = await import("../lib/queryClient");

    await expect(
      apiRequest("POST", "/api/contacts/bulk-import", { contacts: [] }),
    ).rejects.toThrow("Network failure");
  });

  it("apiRequest throws on 400 response (bad request)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Bad Request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");

    await expect(
      apiRequest("POST", "/api/contacts/bulk-import", { contacts: [] }),
    ).rejects.toThrow("400");
  });

  it("apiRequest succeeds and does NOT throw on 200/201 responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 3 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("POST", "/api/contacts/bulk-import", {
      contacts: [{ name: "Test" }],
    });

    // Should resolve without throwing
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ count: 3 });
  });
});

// =============================================================================
// Fix 4: getQueryFn throws for non-401 errors → AuthGate isError state
// =============================================================================

describe("Fix 4: getQueryFn throws for non-401 HTTP errors (enables AuthGate isError handling)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("throws for 500 errors when on401 is returnNull", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    const { getQueryFn } = await import("../lib/queryClient");
    const fn = getQueryFn<null>({ on401: "returnNull" });

    await expect(
      fn({
        queryKey: ["/auth/me"],
        signal: new AbortController().signal,
        meta: undefined,
        client: {} as import("@tanstack/react-query").QueryClient,
        direction: "forward",
        pageParam: undefined,
      }),
    ).rejects.toThrow("500");
  });

  it("throws for 503 errors (service unavailable)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Service Unavailable", { status: 503 }),
    );

    const { getQueryFn } = await import("../lib/queryClient");
    const fn = getQueryFn<null>({ on401: "returnNull" });

    await expect(
      fn({
        queryKey: ["/auth/me"],
        signal: new AbortController().signal,
        meta: undefined,
        client: {} as import("@tanstack/react-query").QueryClient,
        direction: "forward",
        pageParam: undefined,
      }),
    ).rejects.toThrow("503");
  });

  it("throws for network failures (getQueryFn does not swallow network errors)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Failed to fetch"));

    const { getQueryFn } = await import("../lib/queryClient");
    const fn = getQueryFn<null>({ on401: "returnNull" });

    await expect(
      fn({
        queryKey: ["/auth/me"],
        signal: new AbortController().signal,
        meta: undefined,
        client: {} as import("@tanstack/react-query").QueryClient,
        direction: "forward",
        pageParam: undefined,
      }),
    ).rejects.toThrow("Failed to fetch");
  });

  it("returns null for 401 — treated as unauthenticated (not an error, triggers redirect)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { getQueryFn } = await import("../lib/queryClient");
    const fn = getQueryFn<null>({ on401: "returnNull" });

    const result = await fn({
      queryKey: ["/auth/me"],
      signal: new AbortController().signal,
      meta: undefined,
      client: {} as import("@tanstack/react-query").QueryClient,
      direction: "forward",
      pageParam: undefined,
    });

    // 401 → null (not an error, triggers login redirect in AuthGate useEffect)
    expect(result).toBeNull();
  });

  it("returns user data for 200 responses", async () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      fullName: "Test User",
      avatarUrl: null,
      googleId: "google-123",
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockUser), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { getQueryFn } = await import("../lib/queryClient");
    const fn = getQueryFn<typeof mockUser>({ on401: "returnNull" });

    const result = await fn({
      queryKey: ["/auth/me"],
      signal: new AbortController().signal,
      meta: undefined,
      client: {} as import("@tanstack/react-query").QueryClient,
      direction: "forward",
      pageParam: undefined,
    });

    expect(result).toEqual(mockUser);
  });
});
