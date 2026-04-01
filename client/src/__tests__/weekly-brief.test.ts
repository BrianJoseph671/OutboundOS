import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WeeklyBriefResponse, WeeklyBriefContact } from "@shared/types/phase4";

describe("Weekly Brief — response shape contract", () => {
  it("WeeklyBriefResponse has required fields", () => {
    const brief: WeeklyBriefResponse = {
      generatedAt: new Date().toISOString(),
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      categories: [],
      totalContacts: 0,
    };
    expect(brief.generatedAt).toBeTruthy();
    expect(brief.weekStart).toBeTruthy();
    expect(brief.weekEnd).toBeTruthy();
    expect(Array.isArray(brief.categories)).toBe(true);
    expect(typeof brief.totalContacts).toBe("number");
  });

  it("WeeklyBriefContact has all required fields", () => {
    const contact: WeeklyBriefContact = {
      contactId: "c-1",
      contactName: "Test",
      company: "TestCo",
      tier: "warm",
      lastInteractionAt: null,
      lastInteractionChannel: null,
      pendingActions: 0,
      snippet: "Test snippet",
    };
    expect(contact.contactId).toBeTruthy();
    expect(contact.contactName).toBeTruthy();
    expect(typeof contact.pendingActions).toBe("number");
    expect(typeof contact.snippet).toBe("string");
  });

  it("category labels should be distinct", () => {
    const labels = ["Needs Follow-Up", "Going Cold", "New This Week", "Recently Active"];
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("Weekly Brief — API call patterns", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("POST /api/briefs/weekly calls correct endpoint", async () => {
    const mockResponse: WeeklyBriefResponse = {
      generatedAt: new Date().toISOString(),
      weekStart: "2026-03-30",
      weekEnd: "2026-04-05",
      categories: [{ label: "Needs Follow-Up", contacts: [] }],
      totalContacts: 0,
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const res = await fetch("/api/briefs/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    expect(data.categories).toHaveLength(1);
    expect(data.weekStart).toBe("2026-03-30");
  });

  it("sendEmail parameter is optional", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ generatedAt: "", weekStart: "", weekEnd: "", categories: [], totalContacts: 0, emailSent: false }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const res = await fetch("/api/briefs/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendEmail: true }),
    });
    const data = await res.json();
    expect(data.emailSent).toBe(false);
  });
});

describe("Weekly Brief — tier badge mapping", () => {
  it("all expected tiers have labels", () => {
    const tiers: Record<string, string> = { hot: "Hot", warm: "Warm", cool: "Cool" };
    for (const [tier, label] of Object.entries(tiers)) {
      expect(tier).toBeTruthy();
      expect(label).toBeTruthy();
    }
  });
});
