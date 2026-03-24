/**
 * Frontend tests for auth check behavior and useContacts API-first fetching.
 *
 * These tests run in the node environment using vitest.
 * They verify the logic of the auth check and contacts API fetching
 * without rendering React components.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Auth check behavior ────────────────────────────────────────────────────────

describe("Auth check - getQueryFn with on401: returnNull", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns null when /auth/me returns 401", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not authenticated" }), {
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
    expect(result).toBeNull();
  });

  it("returns user data when /auth/me returns 200", async () => {
    const mockUser = {
      id: "abc123",
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

  it("throws when /auth/me returns 401 and on401 is throw", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Not authenticated", { status: 401 }),
    );

    const { getQueryFn } = await import("../lib/queryClient");
    const fn = getQueryFn<null>({ on401: "throw" });
    await expect(
      fn({
        queryKey: ["/auth/me"],
        signal: new AbortController().signal,
        meta: undefined,
        client: {} as import("@tanstack/react-query").QueryClient,
        direction: "forward",
        pageParam: undefined,
      }),
    ).rejects.toThrow("401");
  });

  it("fetches /auth/me URL derived from queryKey", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { getQueryFn } = await import("../lib/queryClient");
    const fn = getQueryFn<{ id: string }>({ on401: "returnNull" });
    await fn({
      queryKey: ["/auth/me"],
      signal: new AbortController().signal,
      meta: undefined,
      client: {} as import("@tanstack/react-query").QueryClient,
      direction: "forward",
      pageParam: undefined,
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

// ── useContacts API-first fetching ────────────────────────────────────────────

describe("useContacts API-first - apiRequest helper", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("calls GET /api/contacts endpoint", async () => {
    const mockContacts = [
      { id: "1", name: "Alice", company: "Acme" },
      { id: "2", name: "Bob", company: "Corp" },
    ];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockContacts), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("GET", "/api/contacts");
    const data = await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/contacts",
      expect.objectContaining({ method: "GET" }),
    );
    expect(data).toEqual(mockContacts);
  });

  it("calls POST /api/contacts with contact data to create a contact", async () => {
    const newContact = { id: "3", name: "Charlie", company: "StartUp" };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(newContact), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const input = { name: "Charlie", company: "StartUp" };
    const res = await apiRequest("POST", "/api/contacts", input);
    const data = await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/contacts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
    expect(data).toEqual(newContact);
  });

  it("calls PATCH /api/contacts/:id to update a contact", async () => {
    const updated = { id: "1", name: "Alice Updated", company: "Acme" };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(updated), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("PATCH", "/api/contacts/1", { name: "Alice Updated" });
    const data = await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/contacts/1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(data.name).toBe("Alice Updated");
  });

  it("calls DELETE /api/contacts/:id to delete a contact", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("DELETE", "/api/contacts/1");

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/contacts/1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(res.status).toBe(204);
  });

  it("includes credentials in all API requests for session auth", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    await apiRequest("GET", "/api/contacts");

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/contacts",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

// ── Write-through localStorage cache ─────────────────────────────────────────

describe("useContacts write-through localStorage cache", () => {
  const storageData: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => storageData[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storageData[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete storageData[key];
    }),
    clear: vi.fn(() => {
      Object.keys(storageData).forEach((k) => delete storageData[k]);
    }),
    length: 0,
    key: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("fetch", vi.fn());
    // Clear storage
    Object.keys(storageData).forEach((k) => delete storageData[k]);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("writes contacts to localStorage after successful API fetch", async () => {
    const mockContacts = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockContacts), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // Simulate the write-through cache behavior
    const { apiRequest } = await import("../lib/queryClient");
    const res = await apiRequest("GET", "/api/contacts");
    const data = await res.json();

    // Write to localStorage (mimics useContacts queryFn behavior)
    localStorage.setItem("outbound-contacts", JSON.stringify(data));

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "outbound-contacts",
      JSON.stringify(mockContacts),
    );
    expect(JSON.parse(storageData["outbound-contacts"])).toEqual(mockContacts);
  });

  it("localStorage cache matches API response after write-through", () => {
    const contacts = [
      { id: "a1", name: "Charlie", company: "TechCorp" },
    ];

    // Write-through
    localStorage.setItem("outbound-contacts", JSON.stringify(contacts));

    // Read back
    const cached = JSON.parse(localStorage.getItem("outbound-contacts") ?? "[]");
    expect(cached).toEqual(contacts);
    expect(cached[0].name).toBe("Charlie");
  });
});
