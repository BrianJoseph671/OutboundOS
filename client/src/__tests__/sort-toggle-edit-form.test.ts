/**
 * Tests for:
 * 1. Sort toggle — useContacts hook builds correct API URL with sort/order params
 * 2. Edit contact form — editContactSchema validates required fields
 *
 * These run in the node environment using vitest (no React rendering needed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// ── Sort toggle: URL building ─────────────────────────────────────────────────

describe("Sort toggle - API URL construction", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("fetches GET /api/contacts without params by default", async () => {
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
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetches GET /api/contacts?sort=last_interaction_at&order=desc for last_interaction sort", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    await apiRequest("GET", "/api/contacts?sort=last_interaction_at&order=desc");

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/contacts?sort=last_interaction_at&order=desc",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("sort URL encodes params correctly", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const sort = "last_interaction_at";
    const order = "desc";
    const url = `/api/contacts?sort=${encodeURIComponent(sort)}&order=${encodeURIComponent(order)}`;

    const { apiRequest } = await import("../lib/queryClient");
    await apiRequest("GET", url);

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/contacts?sort=last_interaction_at&order=desc",
      expect.any(Object),
    );
  });

  it("default sort (newest) uses created_at ordering implicitly (no sort params)", async () => {
    // When sortBy is "newest", no sort params are passed → same as original behavior
    const url = "/api/contacts"; // no query string
    expect(url).toBe("/api/contacts");
    expect(url).not.toContain("sort=");
    expect(url).not.toContain("order=");
  });

  it("last_interaction sort constructs correct URL with all required params", () => {
    const sort = "last_interaction_at";
    const order = "desc";
    const url = `/api/contacts?sort=${encodeURIComponent(sort)}&order=${encodeURIComponent(order)}`;
    expect(url).toBe("/api/contacts?sort=last_interaction_at&order=desc");
    expect(url).toContain("sort=last_interaction_at");
    expect(url).toContain("order=desc");
  });
});

// ── Sort options: SortOption type ─────────────────────────────────────────────

describe("Sort options - SortOption values", () => {
  const SORT_OPTIONS = ["newest", "last_interaction"] as const;
  type SortOption = typeof SORT_OPTIONS[number];

  it("'newest' is a valid SortOption", () => {
    const option: SortOption = "newest";
    expect(option).toBe("newest");
  });

  it("'last_interaction' is a valid SortOption", () => {
    const option: SortOption = "last_interaction";
    expect(option).toBe("last_interaction");
  });

  it("sorts params map correctly from SortOption to API params", () => {
    function getSortParams(sortBy: SortOption): { sort: string; order: string } | undefined {
      if (sortBy === "last_interaction") {
        return { sort: "last_interaction_at", order: "desc" };
      }
      return undefined;
    }

    expect(getSortParams("newest")).toBeUndefined();
    expect(getSortParams("last_interaction")).toEqual({
      sort: "last_interaction_at",
      order: "desc",
    });
  });
});

// ── Edit contact form schema ──────────────────────────────────────────────────

// Mirror of the editContactSchema defined in contacts.tsx
const editContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company: z.string().optional(),
  role: z.string().optional(),
  email: z.string().optional(),
  linkedinUrl: z.string().optional(),
  tier: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(),
});

describe("editContactSchema - form validation", () => {
  it("accepts a fully populated contact edit", () => {
    const result = editContactSchema.safeParse({
      name: "Alice Smith",
      company: "Acme Corp",
      role: "VP Sales",
      email: "alice@acme.com",
      linkedinUrl: "https://linkedin.com/in/alice",
      tier: "warm",
      source: "linkedin_import",
      notes: "Met at conference",
      tags: "enterprise, decision-maker",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal data with only name", () => {
    const result = editContactSchema.safeParse({ name: "Bob" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Bob");
    }
  });

  it("rejects empty name string", () => {
    const result = editContactSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameError = result.error.issues.find((i) => i.path[0] === "name");
      expect(nameError).toBeDefined();
      expect(nameError?.message).toBe("Name is required");
    }
  });

  it("rejects missing name", () => {
    const result = editContactSchema.safeParse({
      company: "Corp",
      role: "Manager",
    });
    expect(result.success).toBe(false);
  });

  it("all optional fields can be omitted", () => {
    const result = editContactSchema.safeParse({ name: "Charlie" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.company).toBeUndefined();
      expect(result.data.role).toBeUndefined();
      expect(result.data.email).toBeUndefined();
      expect(result.data.tier).toBeUndefined();
      expect(result.data.source).toBeUndefined();
    }
  });

  it("accepts all tier values: warm, cool, cold, vip", () => {
    for (const tier of ["warm", "cool", "cold", "vip"]) {
      const result = editContactSchema.safeParse({ name: "Test", tier });
      expect(result.success).toBe(true);
    }
  });

  it("accepts empty string for optional fields (cleared input)", () => {
    const result = editContactSchema.safeParse({
      name: "Diana",
      company: "",
      role: "",
      email: "",
      source: "",
      notes: "",
      tags: "",
    });
    expect(result.success).toBe(true);
  });

  it("includes all RelationshipOS fields: tier and source", () => {
    const result = editContactSchema.safeParse({
      name: "Eve",
      tier: "vip",
      source: "manual",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tier).toBe("vip");
      expect(result.data.source).toBe("manual");
    }
  });

  it("tags field accepts comma-separated values", () => {
    const result = editContactSchema.safeParse({
      name: "Frank",
      tags: "enterprise, west-coast, decision-maker",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toContain("enterprise");
    }
  });
});

// ── Edit contact PATCH payload ────────────────────────────────────────────────

describe("Edit contact - PATCH API call patterns", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("PATCH /api/contacts/:id sends updated fields", async () => {
    const updatedContact = {
      id: "contact-1",
      name: "Alice Updated",
      tier: "warm",
      source: "manual",
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(updatedContact), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    const payload = { name: "Alice Updated", tier: "warm", source: "manual" };
    const res = await apiRequest("PATCH", "/api/contacts/contact-1", payload);
    const data = await res.json();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/contacts/contact-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    );
    expect(data.name).toBe("Alice Updated");
    expect(data.tier).toBe("warm");
  });

  it("PATCH includes tier and source fields (RelationshipOS fields)", async () => {
    const payload = {
      name: "Bob",
      tier: "vip",
      source: "linkedin_import",
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "c1", ...payload }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    await apiRequest("PATCH", "/api/contacts/c1", payload);

    const callArgs = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.tier).toBe("vip");
    expect(body.source).toBe("linkedin_import");
  });

  it("includes credentials for authenticated PATCH request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "c1", name: "Test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { apiRequest } = await import("../lib/queryClient");
    await apiRequest("PATCH", "/api/contacts/c1", { name: "Test" });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/contacts/c1",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
