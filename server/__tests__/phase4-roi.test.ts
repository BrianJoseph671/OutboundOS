import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { users, contacts, interactions, actions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { getRoiMetrics, roiMetricsToCsv } from "../services/roiService";

const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  interactionIds: [] as string[],
  actionIds: [] as string[],
};

afterAll(async () => {
  for (const id of testIds.actionIds) await db.delete(actions).where(eq(actions.id, id)).catch(() => {});
  for (const id of testIds.interactionIds) await db.delete(interactions).where(eq(interactions.id, id)).catch(() => {});
  for (const id of testIds.contactIds) await db.delete(contacts).where(eq(contacts.id, id)).catch(() => {});
  for (const id of testIds.userIds) await db.delete(users).where(eq(users.id, id)).catch(() => {});
});

let userId: string;

beforeAll(async () => {
  const user = await storage.createUser({ username: `roi-test-${Date.now()}`, password: "test" });
  userId = user.id;
  testIds.userIds.push(user.id);

  // 2 hot, 1 warm, 1 cool contact
  for (const [name, tier] of [["Hot A", "hot"], ["Hot B", "hot"], ["Warm A", "warm"], ["Cool A", "cool"]] as const) {
    const c = await storage.createContact({ userId, name, company: "TestCo", tier: tier as string });
    testIds.contactIds.push(c.id);
  }

  // Interactions: 2 email (recent), 1 meeting (40 days ago)
  const c1 = testIds.contactIds[0];
  const int1 = await storage.createInteraction({ userId, contactId: c1, channel: "email", direction: "inbound", occurredAt: new Date(Date.now() - 5 * 86400000), sourceId: `roi-src-${Date.now()}-1` });
  testIds.interactionIds.push(int1.id);
  const int2 = await storage.createInteraction({ userId, contactId: c1, channel: "email", direction: "outbound", occurredAt: new Date(Date.now() - 10 * 86400000), sourceId: `roi-src-${Date.now()}-2` });
  testIds.interactionIds.push(int2.id);
  const int3 = await storage.createInteraction({ userId, contactId: testIds.contactIds[1], channel: "meeting", direction: "inbound", occurredAt: new Date(Date.now() - 40 * 86400000), sourceId: `roi-src-${Date.now()}-3` });
  testIds.interactionIds.push(int3.id);

  // Actions: 1 completed, 1 pending, 1 dismissed
  const act1 = await storage.createAction({ userId, contactId: c1, actionType: "follow_up", priority: 1, reason: "Test", status: "completed" } as Parameters<typeof storage.createAction>[0]);
  testIds.actionIds.push(act1.id);
  const act2 = await storage.createAction({ userId, contactId: c1, actionType: "reconnect", priority: 1, reason: "Test" });
  testIds.actionIds.push(act2.id);
  const act3 = await storage.createAction({ userId, contactId: testIds.contactIds[1], actionType: "follow_up", priority: 1, reason: "Test", status: "dismissed" } as Parameters<typeof storage.createAction>[0]);
  testIds.actionIds.push(act3.id);
});

describe("ROI metrics — contactsByTier", () => {
  it("counts contacts per tier correctly", async () => {
    const metrics = await getRoiMetrics(userId);
    const hotCount = metrics.contactsByTier.find((t) => t.tier === "hot");
    const warmCount = metrics.contactsByTier.find((t) => t.tier === "warm");
    const coolCount = metrics.contactsByTier.find((t) => t.tier === "cool");
    expect(hotCount?.count).toBe(2);
    expect(warmCount?.count).toBe(1);
    expect(coolCount?.count).toBe(1);
  });
});

describe("ROI metrics — interactionsByChannel", () => {
  it("counts email interactions within 30d window", async () => {
    const metrics = await getRoiMetrics(userId);
    const email = metrics.interactionsByChannel.find((c) => c.channel === "email");
    expect(email).toBeDefined();
    expect(email!.last30).toBe(2);
    expect(email!.last60).toBe(2);
    expect(email!.last90).toBe(2);
  });

  it("meeting interaction at 40 days ago is outside 30d but inside 60d and 90d", async () => {
    const metrics = await getRoiMetrics(userId);
    const meeting = metrics.interactionsByChannel.find((c) => c.channel === "meeting");
    expect(meeting).toBeDefined();
    expect(meeting!.last30).toBe(0);
    expect(meeting!.last60).toBe(1);
    expect(meeting!.last90).toBe(1);
  });
});

describe("ROI metrics — actionCompletion", () => {
  it("computes correct totals and rate", async () => {
    const metrics = await getRoiMetrics(userId);
    expect(metrics.actionCompletion.total).toBe(3);
    expect(metrics.actionCompletion.completed).toBe(1);
    expect(metrics.actionCompletion.dismissed).toBe(1);
    expect(metrics.actionCompletion.pending).toBe(1);
    expect(metrics.actionCompletion.completionRate).toBeCloseTo(33.3, 0);
  });
});

describe("ROI metrics — conversionTags", () => {
  it("returns empty array when no contacts have conversion tags", async () => {
    const metrics = await getRoiMetrics(userId);
    expect(metrics.conversionTags).toHaveLength(0);
  });

  it("counts tags correctly when present", async () => {
    const taggedContact = await storage.createContact({
      userId,
      name: "Tagged Person",
      company: "TagCo",
      tags: "interview, referral, other_tag",
    });
    testIds.contactIds.push(taggedContact.id);

    const metrics = await getRoiMetrics(userId);
    const interview = metrics.conversionTags.find((t) => t.tag === "interview");
    const referral = metrics.conversionTags.find((t) => t.tag === "referral");
    expect(interview?.count).toBe(1);
    expect(referral?.count).toBe(1);
    // "other_tag" is not a known conversion tag
    const other = metrics.conversionTags.find((t) => t.tag === "other_tag");
    expect(other).toBeUndefined();
  });
});

describe("ROI CSV export", () => {
  it("CSV contains header row", async () => {
    const metrics = await getRoiMetrics(userId);
    const csv = roiMetricsToCsv(metrics);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Section,Label,Value");
  });

  it("CSV contains tier data matching JSON metrics", async () => {
    const metrics = await getRoiMetrics(userId);
    const csv = roiMetricsToCsv(metrics);
    for (const tier of metrics.contactsByTier) {
      expect(csv).toContain(`Contacts by Tier,${tier.tier},${tier.count}`);
    }
  });

  it("CSV contains action completion data", async () => {
    const metrics = await getRoiMetrics(userId);
    const csv = roiMetricsToCsv(metrics);
    expect(csv).toContain(`Action Completion,total,${metrics.actionCompletion.total}`);
    expect(csv).toContain(`Action Completion,completed,${metrics.actionCompletion.completed}`);
  });
});

describe("ROI metrics — empty DB", () => {
  it("returns zeroed metrics for user with no data", async () => {
    const emptyUser = await storage.createUser({ username: `roi-empty-${Date.now()}`, password: "test" });
    testIds.userIds.push(emptyUser.id);
    const metrics = await getRoiMetrics(emptyUser.id);
    expect(metrics.contactsByTier).toHaveLength(0);
    expect(metrics.interactionsByChannel).toHaveLength(0);
    expect(metrics.actionCompletion.total).toBe(0);
    expect(metrics.actionCompletion.completionRate).toBe(0);
    expect(metrics.conversionTags).toHaveLength(0);
  });
});
