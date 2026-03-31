/**
 * Tests for actionDetector service (Phase 2 — RelationshipOS)
 *
 * Covers:
 * - follow_up detection (inbound with no outbound within 7 days)
 * - reconnect detection (warm/vip tier with no interaction in >14 days)
 * - open_thread detection (interaction has openThreads set)
 * - auto-complete (outbound interaction closes pending follow_up)
 * - no-duplicate-action check (pending action already exists)
 * - cool-tier contacts are not flagged for reconnect
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import { users, contacts, interactions, actions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { detectActions } from "../agent/services/actionDetector";
import type { Interaction } from "@shared/schema";

// ── Cleanup tracking ──────────────────────────────────────────────────────────

const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  interactionIds: [] as string[],
  actionIds: [] as string[],
};

afterAll(async () => {
  for (const id of testIds.actionIds) {
    await db.delete(actions).where(eq(actions.id, id)).catch(() => {});
  }
  for (const id of testIds.interactionIds) {
    await db.delete(interactions).where(eq(interactions.id, id)).catch(() => {});
  }
  for (const id of testIds.contactIds) {
    await db.delete(contacts).where(eq(contacts.id, id)).catch(() => {});
  }
  for (const id of testIds.userIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  await pool.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createTestUser(suffix = "") {
  const ts = Date.now();
  const [user] = await db
    .insert(users)
    .values({
      username: `detector_test_${suffix}_${ts}`,
      password: "hashed_test_password",
      email: `detector_${suffix}_${ts}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

async function createTestContact(
  userId: string,
  opts: { tier?: string; lastInteractionAt?: Date | null; name?: string } = {}
) {
  const ts = Date.now();
  const [contact] = await db
    .insert(contacts)
    .values({
      userId,
      name: opts.name ?? `Detector Contact ${ts}`,
      tier: opts.tier ?? "cool",
      lastInteractionAt: opts.lastInteractionAt ?? null,
    })
    .returning();
  testIds.contactIds.push(contact.id);
  return contact;
}

async function createTestInteraction(
  userId: string,
  contactId: string,
  opts: {
    channel?: string;
    direction?: string;
    occurredAt?: Date;
    sourceId?: string;
    openThreads?: string;
  } = {}
) {
  const ts = Date.now();
  const interaction = await storage.createInteraction({
    userId,
    contactId,
    channel: opts.channel ?? "email",
    direction: opts.direction ?? "outbound",
    occurredAt: opts.occurredAt ?? new Date(),
    sourceId: opts.sourceId ?? `test-src-${ts}-${Math.random().toString(36).slice(2)}`,
    openThreads: opts.openThreads,
  });
  testIds.interactionIds.push(interaction.id);
  return interaction;
}

async function createTestAction(
  userId: string,
  contactId: string,
  opts: { actionType?: string; status?: string } = {}
) {
  const action = await storage.createAction({
    userId,
    contactId,
    actionType: opts.actionType ?? "follow_up",
    status: opts.status ?? "pending",
    priority: 0,
    reason: "Test reason",
    snoozedUntil: null,
  });
  testIds.actionIds.push(action.id);
  return action;
}

// ── follow_up detection ───────────────────────────────────────────────────────

describe("detectActions — follow_up detection", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("followup");
    userId = user.id;
    const contact = await createTestContact(userId, { tier: "warm" });
    contactId = contact.id;
  });

  it("creates follow_up action for inbound interaction with no outbound reply", async () => {
    const contact = await createTestContact(userId, { tier: "cool" });
    const interaction = await createTestInteraction(userId, contact.id, {
      direction: "inbound",
      occurredAt: new Date("2025-03-01T10:00:00Z"),
    });

    const result = await detectActions(userId, [interaction]);
    const followUps = result.filter((a) => a.actionType === "follow_up" && a.contactId === contact.id);
    expect(followUps.length).toBeGreaterThanOrEqual(1);
    expect(followUps[0].status).toBe("pending");
    expect(followUps[0].triggerInteractionId).toBe(interaction.id);
  });

  it("does NOT create follow_up when outbound reply exists within 7 days", async () => {
    const contact = await createTestContact(userId, { tier: "cool" });
    const inboundDate = new Date("2025-03-05T10:00:00Z");
    const outboundDate = new Date("2025-03-06T10:00:00Z"); // 1 day after

    // Create existing outbound interaction
    await createTestInteraction(userId, contact.id, {
      direction: "outbound",
      occurredAt: outboundDate,
      sourceId: `outbound-reply-${Date.now()}`,
    });

    const inbound = await createTestInteraction(userId, contact.id, {
      direction: "inbound",
      occurredAt: inboundDate,
    });

    const result = await detectActions(userId, [inbound]);
    const followUps = result.filter((a) => a.actionType === "follow_up" && a.contactId === contact.id);
    expect(followUps.length).toBe(0);
  });

  it("does NOT create follow_up for outbound interaction", async () => {
    const contact = await createTestContact(userId, { tier: "cool" });
    const outbound = await createTestInteraction(userId, contact.id, {
      direction: "outbound",
    });

    const result = await detectActions(userId, [outbound]);
    const followUps = result.filter((a) => a.actionType === "follow_up" && a.contactId === contact.id);
    expect(followUps.length).toBe(0);
  });
});

// ── reconnect detection ───────────────────────────────────────────────────────

describe("detectActions — reconnect detection", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser("reconnect");
    userId = user.id;
  });

  it("creates reconnect for warm tier contact with no interaction (lastInteractionAt = null)", async () => {
    const contact = await createTestContact(userId, {
      tier: "warm",
      lastInteractionAt: null,
    });

    const result = await detectActions(userId, []);
    const reconnects = result.filter((a) => a.actionType === "reconnect" && a.contactId === contact.id);
    expect(reconnects.length).toBe(1);
    expect(reconnects[0].status).toBe("pending");
  });

  it("creates reconnect for vip tier contact with no interaction (lastInteractionAt = null)", async () => {
    const contact = await createTestContact(userId, {
      tier: "vip",
      lastInteractionAt: null,
    });

    const result = await detectActions(userId, []);
    const reconnects = result.filter((a) => a.actionType === "reconnect" && a.contactId === contact.id);
    expect(reconnects.length).toBe(1);
  });

  it("creates reconnect for warm contact with lastInteractionAt >14 days ago", async () => {
    const staleDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000); // 20 days ago
    const contact = await createTestContact(userId, {
      tier: "warm",
      lastInteractionAt: staleDate,
    });

    const result = await detectActions(userId, []);
    const reconnects = result.filter((a) => a.actionType === "reconnect" && a.contactId === contact.id);
    expect(reconnects.length).toBe(1);
  });

  it("does NOT create reconnect for warm contact with recent interaction (<14 days)", async () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const contact = await createTestContact(userId, {
      tier: "warm",
      lastInteractionAt: recentDate,
    });

    const result = await detectActions(userId, []);
    const reconnects = result.filter((a) => a.actionType === "reconnect" && a.contactId === contact.id);
    expect(reconnects.length).toBe(0);
  });

  it("does NOT create reconnect for cool tier contact even if stale", async () => {
    const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const contact = await createTestContact(userId, {
      tier: "cool",
      lastInteractionAt: staleDate,
    });

    const result = await detectActions(userId, []);
    const reconnects = result.filter((a) => a.actionType === "reconnect" && a.contactId === contact.id);
    expect(reconnects.length).toBe(0);
  });

  it("does NOT create reconnect for cool tier contact with null lastInteractionAt", async () => {
    const contact = await createTestContact(userId, {
      tier: "cool",
      lastInteractionAt: null,
    });

    const result = await detectActions(userId, []);
    const reconnects = result.filter((a) => a.actionType === "reconnect" && a.contactId === contact.id);
    expect(reconnects.length).toBe(0);
  });
});

// ── open_thread detection ─────────────────────────────────────────────────────

describe("detectActions — open_thread detection", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("openthread");
    userId = user.id;
    const contact = await createTestContact(userId, { tier: "cool" });
    contactId = contact.id;
  });

  it("creates open_thread action when interaction has openThreads set", async () => {
    const interaction = await createTestInteraction(userId, contactId, {
      openThreads: "Waiting for budget approval",
    });

    const result = await detectActions(userId, [interaction]);
    const openThreads = result.filter(
      (a) => a.actionType === "open_thread" && a.contactId === contactId
    );
    expect(openThreads.length).toBeGreaterThanOrEqual(1);
    expect(openThreads[0].reason).toContain("Waiting for budget approval");
    expect(openThreads[0].status).toBe("pending");
    expect(openThreads[0].triggerInteractionId).toBe(interaction.id);
  });

  it("does NOT create open_thread when interaction has no openThreads", async () => {
    const contact2 = await createTestContact(userId, { tier: "cool" });
    const interaction = await createTestInteraction(userId, contact2.id, {
      openThreads: undefined,
    });

    const result = await detectActions(userId, [interaction]);
    const openThreads = result.filter(
      (a) => a.actionType === "open_thread" && a.contactId === contact2.id
    );
    expect(openThreads.length).toBe(0);
  });

  it("does NOT create open_thread when openThreads is empty string", async () => {
    const contact3 = await createTestContact(userId, { tier: "cool" });
    const interaction = await createTestInteraction(userId, contact3.id, {
      openThreads: "   ", // whitespace only
    });

    const result = await detectActions(userId, [interaction]);
    const openThreads = result.filter(
      (a) => a.actionType === "open_thread" && a.contactId === contact3.id
    );
    expect(openThreads.length).toBe(0);
  });
});

// ── Auto-complete tests ────────────────────────────────────────────────────────

describe("detectActions — auto-complete follow_up on outbound", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("autocomplete");
    userId = user.id;
    const contact = await createTestContact(userId, { tier: "warm" });
    contactId = contact.id;
  });

  it("auto-completes pending follow_up action when outbound interaction detected", async () => {
    // Create a pending follow_up action
    const followUpAction = await createTestAction(userId, contactId, {
      actionType: "follow_up",
      status: "pending",
    });

    // Detect with an outbound interaction
    const outbound = await createTestInteraction(userId, contactId, {
      direction: "outbound",
    });

    await detectActions(userId, [outbound]);

    // The follow_up action should now be completed
    const updatedAction = await storage.getAction(followUpAction.id, userId);
    expect(updatedAction?.status).toBe("completed");
    expect(updatedAction?.completedAt).toBeTruthy();
  });

  it("does NOT auto-complete when inbound interaction (not outbound)", async () => {
    const contact = await createTestContact(userId, { tier: "warm" });
    const followUpAction = await createTestAction(contact.userId ?? userId, contact.id, {
      actionType: "follow_up",
      status: "pending",
    });

    const inbound = await createTestInteraction(userId, contact.id, {
      direction: "inbound",
    });

    await detectActions(userId, [inbound]);

    const updatedAction = await storage.getAction(followUpAction.id, userId);
    expect(updatedAction?.status).toBe("pending");
  });

  it("auto-completes multiple pending follow_ups for the same contact", async () => {
    const contact = await createTestContact(userId, { tier: "warm" });
    const action1 = await createTestAction(userId, contact.id, { actionType: "follow_up", status: "pending" });
    const action2 = await createTestAction(userId, contact.id, { actionType: "follow_up", status: "pending" });

    const outbound = await createTestInteraction(userId, contact.id, { direction: "outbound" });
    await detectActions(userId, [outbound]);

    const updated1 = await storage.getAction(action1.id, userId);
    const updated2 = await storage.getAction(action2.id, userId);
    expect(updated1?.status).toBe("completed");
    expect(updated2?.status).toBe("completed");
  });
});

// ── No-duplicate-action check ─────────────────────────────────────────────────

describe("detectActions — no duplicate actions", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("nodup");
    userId = user.id;
    const contact = await createTestContact(userId, { tier: "warm", lastInteractionAt: null });
    contactId = contact.id;
  });

  it("does NOT create duplicate follow_up when one already exists for same contact", async () => {
    // Create existing pending follow_up
    await createTestAction(userId, contactId, { actionType: "follow_up", status: "pending" });

    // Try to create another follow_up via detect
    const inbound = await createTestInteraction(userId, contactId, { direction: "inbound" });
    const result = await detectActions(userId, [inbound]);

    const followUps = result.filter((a) => a.actionType === "follow_up" && a.contactId === contactId);
    expect(followUps.length).toBe(0);
  });

  it("does NOT create duplicate reconnect when one already exists for same contact", async () => {
    const contact = await createTestContact(userId, { tier: "warm", lastInteractionAt: null });
    // Create existing pending reconnect
    await createTestAction(userId, contact.id, { actionType: "reconnect", status: "pending" });

    const result = await detectActions(userId, []);
    const reconnects = result.filter((a) => a.actionType === "reconnect" && a.contactId === contact.id);
    expect(reconnects.length).toBe(0);
  });

  it("does NOT create duplicate open_thread when one already exists for same contact", async () => {
    const contact = await createTestContact(userId, { tier: "cool" });
    // Create existing pending open_thread
    await createTestAction(userId, contact.id, { actionType: "open_thread", status: "pending" });

    const interaction = await createTestInteraction(userId, contact.id, {
      openThreads: "Some thread context",
    });
    const result = await detectActions(userId, [interaction]);

    const openThreads = result.filter((a) => a.actionType === "open_thread" && a.contactId === contact.id);
    expect(openThreads.length).toBe(0);
  });

  it("DOES create action when existing one is completed (not pending)", async () => {
    const contact = await createTestContact(userId, { tier: "warm", lastInteractionAt: null });
    // Create a COMPLETED reconnect (not pending)
    await createTestAction(userId, contact.id, { actionType: "reconnect", status: "completed" });

    const result = await detectActions(userId, []);
    const reconnects = result.filter((a) => a.actionType === "reconnect" && a.contactId === contact.id);
    // A new reconnect should be created since the existing one is completed
    expect(reconnects.length).toBe(1);
  });
});
