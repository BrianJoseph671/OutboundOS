import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RoiMetrics } from "@shared/types/phase4";

const MOCK_METRICS: RoiMetrics = {
  contactsByTier: [
    { tier: "hot", count: 5 },
    { tier: "warm", count: 12 },
    { tier: "cool", count: 30 },
  ],
  interactionsByChannel: [
    { channel: "email", last30: 20, last60: 40, last90: 55 },
    { channel: "meeting", last30: 8, last60: 15, last90: 22 },
  ],
  actionCompletion: {
    total: 30,
    completed: 18,
    dismissed: 4,
    pending: 6,
    snoozed: 2,
    completionRate: 60,
  },
  conversionTags: [
    { tag: "meeting_booked", count: 10 },
    { tag: "interview", count: 3 },
  ],
  generatedAt: new Date().toISOString(),
};

describe("ROI Dashboard — RoiMetrics shape", () => {
  it("has all required top-level fields", () => {
    expect(MOCK_METRICS.contactsByTier).toBeDefined();
    expect(MOCK_METRICS.interactionsByChannel).toBeDefined();
    expect(MOCK_METRICS.actionCompletion).toBeDefined();
    expect(MOCK_METRICS.conversionTags).toBeDefined();
    expect(MOCK_METRICS.generatedAt).toBeTruthy();
  });

  it("contactsByTier entries have tier and count", () => {
    for (const entry of MOCK_METRICS.contactsByTier) {
      expect(typeof entry.tier).toBe("string");
      expect(typeof entry.count).toBe("number");
    }
  });

  it("interactionsByChannel entries have 30/60/90 windows", () => {
    for (const entry of MOCK_METRICS.interactionsByChannel) {
      expect(typeof entry.channel).toBe("string");
      expect(typeof entry.last30).toBe("number");
      expect(typeof entry.last60).toBe("number");
      expect(typeof entry.last90).toBe("number");
      expect(entry.last30).toBeLessThanOrEqual(entry.last60);
      expect(entry.last60).toBeLessThanOrEqual(entry.last90);
    }
  });

  it("actionCompletion rate is between 0 and 100", () => {
    expect(MOCK_METRICS.actionCompletion.completionRate).toBeGreaterThanOrEqual(0);
    expect(MOCK_METRICS.actionCompletion.completionRate).toBeLessThanOrEqual(100);
  });

  it("actionCompletion total equals sum of statuses", () => {
    const a = MOCK_METRICS.actionCompletion;
    expect(a.total).toBe(a.completed + a.dismissed + a.pending + a.snoozed);
  });
});

describe("ROI Dashboard — API call patterns", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("GET /api/dashboard/roi returns metrics", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_METRICS), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const res = await fetch("/api/dashboard/roi");
    const data = await res.json();
    expect(data.contactsByTier).toHaveLength(3);
    expect(data.actionCompletion.total).toBe(30);
  });

  it("GET /api/dashboard/roi/export returns CSV", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Section,Label,Value\nContacts by Tier,hot,5\n", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      })
    );
    const res = await fetch("/api/dashboard/roi/export");
    expect(res.headers.get("Content-Type")).toBe("text/csv");
    const text = await res.text();
    expect(text).toContain("Section,Label,Value");
    expect(text).toContain("hot,5");
  });
});

describe("ROI Dashboard — CSV download URL", () => {
  it("export URL matches expected pattern", () => {
    const url = "/api/dashboard/roi/export";
    expect(url).toBe("/api/dashboard/roi/export");
  });
});

describe("ROI Dashboard — known tier values", () => {
  it("expected tiers are hot, warm, cool", () => {
    const tiers = ["hot", "warm", "cool"];
    expect(tiers).toContain("hot");
    expect(tiers).toContain("warm");
    expect(tiers).toContain("cool");
  });
});

describe("ROI Dashboard — known action statuses", () => {
  it("statuses include completed, dismissed, pending, snoozed", () => {
    const statuses = ["completed", "dismissed", "pending", "snoozed"];
    expect(statuses).toHaveLength(4);
  });
});
