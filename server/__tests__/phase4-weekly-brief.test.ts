import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { users, contacts, interactions, actions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { generateWeeklyBrief } from "../services/weeklyBriefService";

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
  const user = await storage.createUser({ username: `wb-test-${Date.now()}`, password: "test" });
  userId = user.id;
  testIds.userIds.push(user.id);

  // Contact needing follow-up
  const c1 = await storage.createContact({ userId, name: "Follow Up Person", company: "FollowCo", tier: "hot" as string });
  testIds.contactIds.push(c1.id);
  const int1 = await storage.createInteraction({ userId, contactId: c1.id, channel: "email", direction: "inbound", occurredAt: new Date(Date.now() - 2 * 86400000), sourceId: `wb-src-${Date.now()}-1`, summary: "Discussed pricing" });
  testIds.interactionIds.push(int1.id);
  const act1 = await storage.createAction({ userId, contactId: c1.id, actionType: "follow_up", priority: 2, reason: "No reply sent" });
  testIds.actionIds.push(act1.id);

  // Warm contact going cold (last interaction 20 days ago)
  const c2 = await storage.createContact({ userId, name: "Going Cold Person", company: "ColdCo", tier: "warm" as string });
  testIds.contactIds.push(c2.id);
  await db.update(contacts).set({ lastInteractionAt: new Date(Date.now() - 20 * 86400000) }).where(eq(contacts.id, c2.id));

  // New contact (created now)
  const c3 = await storage.createContact({ userId, name: "New Person", company: "NewCo" });
  testIds.contactIds.push(c3.id);

  // Recently active contact
  const c4 = await storage.createContact({ userId, name: "Active Person", company: "ActiveCo", tier: "warm" as string });
  testIds.contactIds.push(c4.id);
  const int2 = await storage.createInteraction({ userId, contactId: c4.id, channel: "meeting", direction: "outbound", occurredAt: new Date(Date.now() - 1 * 86400000), sourceId: `wb-src-${Date.now()}-2`, summary: "Pipeline review" });
  testIds.interactionIds.push(int2.id);
});

describe("Weekly Brief generation", () => {
  it("returns valid response shape", async () => {
    const brief = await generateWeeklyBrief(userId);
    expect(brief.generatedAt).toBeTruthy();
    expect(brief.weekStart).toBeTruthy();
    expect(brief.weekEnd).toBeTruthy();
    expect(Array.isArray(brief.categories)).toBe(true);
    expect(typeof brief.totalContacts).toBe("number");
  });

  it("places follow-up contacts in Needs Follow-Up category", async () => {
    const brief = await generateWeeklyBrief(userId);
    const followUp = brief.categories.find((c) => c.label === "Needs Follow-Up");
    expect(followUp).toBeDefined();
    expect(followUp!.contacts.length).toBeGreaterThan(0);
    const match = followUp!.contacts.find((c) => c.contactName === "Follow Up Person");
    expect(match).toBeDefined();
    expect(match!.pendingActions).toBeGreaterThan(0);
  });

  it("places stale warm/hot contacts in Going Cold category", async () => {
    const brief = await generateWeeklyBrief(userId);
    const cold = brief.categories.find((c) => c.label === "Going Cold");
    expect(cold).toBeDefined();
    const match = cold!.contacts.find((c) => c.contactName === "Going Cold Person");
    expect(match).toBeDefined();
  });

  it("places newly created contacts in New This Week category", async () => {
    const brief = await generateWeeklyBrief(userId);
    const newCat = brief.categories.find((c) => c.label === "New This Week");
    expect(newCat).toBeDefined();
    const match = newCat!.contacts.find((c) => c.contactName === "New Person");
    expect(match).toBeDefined();
  });

  it("each contact appears in exactly one category", async () => {
    const brief = await generateWeeklyBrief(userId);
    const allIds = brief.categories.flatMap((c) => c.contacts.map((ct) => ct.contactId));
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("totalContacts matches sum of all category contacts", async () => {
    const brief = await generateWeeklyBrief(userId);
    const sum = brief.categories.reduce((s, c) => s + c.contacts.length, 0);
    expect(brief.totalContacts).toBe(sum);
  });

  it("each contact has required fields", async () => {
    const brief = await generateWeeklyBrief(userId);
    for (const cat of brief.categories) {
      for (const contact of cat.contacts) {
        expect(contact.contactId).toBeTruthy();
        expect(contact.contactName).toBeTruthy();
        expect(typeof contact.tier).toBe("string");
        expect(typeof contact.pendingActions).toBe("number");
        expect(typeof contact.snippet).toBe("string");
      }
    }
  });
});

describe("Weekly Brief — empty DB", () => {
  it("returns valid but empty response for user with no data", async () => {
    const emptyUser = await storage.createUser({ username: `wb-empty-${Date.now()}`, password: "test" });
    testIds.userIds.push(emptyUser.id);
    const brief = await generateWeeklyBrief(emptyUser.id);
    expect(brief.categories).toHaveLength(0);
    expect(brief.totalContacts).toBe(0);
  });
});
