/**
 * Phase 2 Storage tests: Actions CRUD, DraftsLog CRUD, user isolation,
 * snoozed resurfacing, completed_at auto-set, pagination, cascade deletes.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import {
  users,
  contacts,
  actions,
  draftsLog,
  type InsertAction,
  type InsertDraftsLog,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";

// ─── Cleanup tracking ──────────────────────────────────────────────────────────
const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  actionIds: [] as string[],
  draftsLogIds: [] as string[],
};

afterAll(async () => {
  for (const id of testIds.draftsLogIds) {
    await db.delete(draftsLog).where(eq(draftsLog.id, id)).catch(() => {});
  }
  for (const id of testIds.actionIds) {
    await db.delete(actions).where(eq(actions.id, id)).catch(() => {});
  }
  for (const id of testIds.contactIds) {
    await db.delete(contacts).where(eq(contacts.id, id)).catch(() => {});
  }
  for (const id of testIds.userIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  await pool.end();
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
async function createTestUser(suffix = "") {
  const [user] = await db
    .insert(users)
    .values({
      username: `phase2_test_user_${suffix}_${Date.now()}`,
      password: "test_password",
      email: `phase2_${suffix}_${Date.now()}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

async function createTestContact(userId: string, name?: string) {
  const [contact] = await db
    .insert(contacts)
    .values({
      name: name ?? `Phase2 Contact ${Date.now()}`,
      userId,
    })
    .returning();
  testIds.contactIds.push(contact.id);
  return contact;
}

function makeAction(
  userId: string,
  contactId: string,
  overrides: Partial<InsertAction> = {}
): InsertAction {
  return {
    userId,
    contactId,
    actionType: "follow_up",
    reason: "Test reason",
    priority: 0,
    status: "pending",
    ...overrides,
  };
}

function makeDraftsLog(
  userId: string,
  contactId: string,
  overrides: Partial<InsertDraftsLog> = {}
): InsertDraftsLog {
  return {
    userId,
    contactId,
    ...overrides,
  };
}

// ─── Actions CRUD ─────────────────────────────────────────────────────────────

describe("createAction", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("create_action");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("inserts an action and returns it with generated id", async () => {
    const input = makeAction(userId, contactId, {
      actionType: "follow_up",
      reason: "Inbound email needs reply",
      priority: 5,
    });
    const result = await storage.createAction(input);
    testIds.actionIds.push(result.id);

    expect(result.id).toBeTruthy();
    expect(result.userId).toBe(userId);
    expect(result.contactId).toBe(contactId);
    expect(result.actionType).toBe("follow_up");
    expect(result.reason).toBe("Inbound email needs reply");
    expect(result.priority).toBe(5);
    expect(result.status).toBe("pending");
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeNull();
  });

  it("uses default priority 0 and status pending", async () => {
    const input = makeAction(userId, contactId);
    const result = await storage.createAction(input);
    testIds.actionIds.push(result.id);

    expect(result.priority).toBe(0);
    expect(result.status).toBe("pending");
  });
});

describe("getAction", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("get_action");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("returns the action by id and userId", async () => {
    const created = await storage.createAction(makeAction(userId, contactId));
    testIds.actionIds.push(created.id);

    const found = await storage.getAction(created.id, userId);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it("returns undefined when id belongs to another user", async () => {
    const created = await storage.createAction(makeAction(userId, contactId));
    testIds.actionIds.push(created.id);

    const otherUser = await createTestUser("get_action_other");
    const found = await storage.getAction(created.id, otherUser.id);
    expect(found).toBeUndefined();
  });

  it("returns undefined for non-existent id", async () => {
    const found = await storage.getAction("00000000-0000-0000-0000-000000000000", userId);
    expect(found).toBeUndefined();
  });
});

describe("updateAction", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("update_action");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("updates status and returns updated action", async () => {
    const created = await storage.createAction(makeAction(userId, contactId));
    testIds.actionIds.push(created.id);

    const updated = await storage.updateAction(created.id, userId, { status: "dismissed" });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe("dismissed");
  });

  it("sets completedAt when status transitions to completed", async () => {
    const created = await storage.createAction(makeAction(userId, contactId));
    testIds.actionIds.push(created.id);

    const updated = await storage.updateAction(created.id, userId, { status: "completed" });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe("completed");
    expect(updated!.completedAt).toBeInstanceOf(Date);
  });

  it("sets completedAt when status transitions to dismissed", async () => {
    const created = await storage.createAction(makeAction(userId, contactId));
    testIds.actionIds.push(created.id);

    const updated = await storage.updateAction(created.id, userId, { status: "dismissed" });
    expect(updated).toBeDefined();
    expect(updated!.completedAt).toBeInstanceOf(Date);
  });

  it("does not set completedAt when status transitions to snoozed", async () => {
    const created = await storage.createAction(makeAction(userId, contactId));
    testIds.actionIds.push(created.id);

    const snoozeTime = new Date(Date.now() + 3600000);
    const updated = await storage.updateAction(created.id, userId, {
      status: "snoozed",
      snoozedUntil: snoozeTime,
    });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe("snoozed");
    expect(updated!.completedAt).toBeNull();
  });

  it("clears snoozedUntil when transitioning away from snoozed", async () => {
    const snoozeTime = new Date(Date.now() + 3600000);
    const created = await storage.createAction(
      makeAction(userId, contactId, { status: "snoozed", snoozedUntil: snoozeTime })
    );
    testIds.actionIds.push(created.id);

    // Transition away from snoozed back to pending
    const updated = await storage.updateAction(created.id, userId, { status: "pending" });
    expect(updated).toBeDefined();
    expect(updated!.status).toBe("pending");
    expect(updated!.snoozedUntil).toBeNull();
  });

  it("returns undefined when userId does not match", async () => {
    const created = await storage.createAction(makeAction(userId, contactId));
    testIds.actionIds.push(created.id);

    const otherUser = await createTestUser("update_action_other");
    const updated = await storage.updateAction(created.id, otherUser.id, { status: "dismissed" });
    expect(updated).toBeUndefined();
  });
});

describe("deleteAction", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("delete_action");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("deletes an action and returns true", async () => {
    const created = await storage.createAction(makeAction(userId, contactId));
    // Don't push to testIds since it will be deleted

    const result = await storage.deleteAction(created.id, userId);
    expect(result).toBe(true);

    const found = await storage.getAction(created.id, userId);
    expect(found).toBeUndefined();
  });

  it("returns false when action not found", async () => {
    const result = await storage.deleteAction("00000000-0000-0000-0000-000000000000", userId);
    expect(result).toBe(false);
  });

  it("returns false when userId doesn't match", async () => {
    const created = await storage.createAction(makeAction(userId, contactId));
    testIds.actionIds.push(created.id);

    const otherUser = await createTestUser("delete_action_other");
    const result = await storage.deleteAction(created.id, otherUser.id);
    expect(result).toBe(false);
  });
});

// ─── getActions filtering ─────────────────────────────────────────────────────

describe("getActions - filtering", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("get_actions_filter");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;

    // Create various actions
    const a1 = await storage.createAction(makeAction(userId, contactId, { actionType: "follow_up", status: "pending" }));
    const a2 = await storage.createAction(makeAction(userId, contactId, { actionType: "reconnect", status: "pending" }));
    const a3 = await storage.createAction(makeAction(userId, contactId, { actionType: "follow_up", status: "dismissed" }));
    const a4 = await storage.createAction(makeAction(userId, contactId, { actionType: "open_thread", status: "completed" }));
    testIds.actionIds.push(a1.id, a2.id, a3.id, a4.id);
  });

  it("returns all user actions with no filters", async () => {
    const result = await storage.getActions(userId);
    const ids = result.map(a => a.userId);
    expect(ids.every(id => id === userId)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(4);
  });

  it("filters by status=pending", async () => {
    const result = await storage.getActions(userId, { status: "pending" });
    expect(result.every(a => a.status === "pending")).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by status=dismissed", async () => {
    const result = await storage.getActions(userId, { status: "dismissed" });
    expect(result.every(a => a.status === "dismissed")).toBe(true);
  });

  it("filters by type=follow_up", async () => {
    const result = await storage.getActions(userId, { type: "follow_up" });
    expect(result.every(a => a.actionType === "follow_up")).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by type=reconnect", async () => {
    const result = await storage.getActions(userId, { type: "reconnect" });
    expect(result.every(a => a.actionType === "reconnect")).toBe(true);
  });
});

// ─── getActions ordering ──────────────────────────────────────────────────────

describe("getActions - ordering", () => {
  let userId: string;
  let contactId: string;
  let highPrioId: string;
  let lowPrioId: string;
  let newerSamePrioId: string;
  let olderSamePrioId: string;

  beforeAll(async () => {
    const user = await createTestUser("get_actions_order");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;

    // High priority first
    const highPrio = await storage.createAction(
      makeAction(userId, contactId, { priority: 10, actionType: "follow_up" })
    );
    highPrioId = highPrio.id;
    testIds.actionIds.push(highPrioId);

    // Wait a tiny bit to ensure different createdAt
    await new Promise(resolve => setTimeout(resolve, 10));

    const lowPrio = await storage.createAction(
      makeAction(userId, contactId, { priority: 1, actionType: "reconnect" })
    );
    lowPrioId = lowPrio.id;
    testIds.actionIds.push(lowPrioId);

    // Two actions with same priority but different createdAt
    const olderSame = await storage.createAction(
      makeAction(userId, contactId, { priority: 5, actionType: "open_thread" })
    );
    olderSamePrioId = olderSame.id;
    testIds.actionIds.push(olderSamePrioId);

    await new Promise(resolve => setTimeout(resolve, 10));

    const newerSame = await storage.createAction(
      makeAction(userId, contactId, { priority: 5, actionType: "open_thread" })
    );
    newerSamePrioId = newerSame.id;
    testIds.actionIds.push(newerSamePrioId);
  });

  it("orders by priority DESC (highest first)", async () => {
    const result = await storage.getActions(userId);
    const ourActions = result.filter(a =>
      [highPrioId, lowPrioId, newerSamePrioId, olderSamePrioId].includes(a.id)
    );

    const highIdx = ourActions.findIndex(a => a.id === highPrioId);
    const lowIdx = ourActions.findIndex(a => a.id === lowPrioId);
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("orders by createdAt DESC within same priority", async () => {
    const result = await storage.getActions(userId);
    const ourActions = result.filter(a =>
      [newerSamePrioId, olderSamePrioId].includes(a.id)
    );

    const newerIdx = ourActions.findIndex(a => a.id === newerSamePrioId);
    const olderIdx = ourActions.findIndex(a => a.id === olderSamePrioId);
    expect(newerIdx).toBeLessThan(olderIdx);
  });
});

// ─── Snoozed actions ──────────────────────────────────────────────────────────

describe("getActions - snoozed actions", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("snoozed");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("excludes future-snoozed actions from status=pending query", async () => {
    const futureSnoozed = await storage.createAction(
      makeAction(userId, contactId, {
        status: "snoozed",
        snoozedUntil: new Date(Date.now() + 3600000), // 1 hour from now
      })
    );
    testIds.actionIds.push(futureSnoozed.id);

    const result = await storage.getActions(userId, { status: "pending" });
    const ids = result.map(a => a.id);
    expect(ids).not.toContain(futureSnoozed.id);
  });

  it("includes past-snoozed actions in status=pending query (resurfacing)", async () => {
    // Insert a snoozed action directly with past snoozed_until
    const [pastSnoozed] = await db
      .insert(actions)
      .values({
        userId,
        contactId,
        actionType: "follow_up",
        reason: "Resurfacing test",
        status: "snoozed",
        snoozedUntil: new Date(Date.now() - 3600000), // 1 hour ago
      })
      .returning();
    testIds.actionIds.push(pastSnoozed.id);

    const result = await storage.getActions(userId, { status: "pending" });
    const ids = result.map(a => a.id);
    expect(ids).toContain(pastSnoozed.id);
  });
});

// ─── User isolation ───────────────────────────────────────────────────────────

describe("getActions - user isolation", () => {
  let userA: Awaited<ReturnType<typeof createTestUser>>;
  let userB: Awaited<ReturnType<typeof createTestUser>>;
  let contactA: Awaited<ReturnType<typeof createTestContact>>;
  let contactB: Awaited<ReturnType<typeof createTestContact>>;

  beforeAll(async () => {
    userA = await createTestUser("isolation_a");
    userB = await createTestUser("isolation_b");
    contactA = await createTestContact(userA.id, "Contact A");
    contactB = await createTestContact(userB.id, "Contact B");
  });

  it("getActions returns only user A's actions for user A", async () => {
    const aAction = await storage.createAction(makeAction(userA.id, contactA.id));
    const bAction = await storage.createAction(makeAction(userB.id, contactB.id));
    testIds.actionIds.push(aAction.id, bAction.id);

    const resultA = await storage.getActions(userA.id);
    const ids = resultA.map(a => a.id);
    expect(ids).toContain(aAction.id);
    expect(ids).not.toContain(bAction.id);
  });

  it("getAction returns undefined when user B tries to access user A's action", async () => {
    const aAction = await storage.createAction(makeAction(userA.id, contactA.id));
    testIds.actionIds.push(aAction.id);

    const result = await storage.getAction(aAction.id, userB.id);
    expect(result).toBeUndefined();
  });

  it("updateAction returns undefined when user B tries to update user A's action", async () => {
    const aAction = await storage.createAction(makeAction(userA.id, contactA.id));
    testIds.actionIds.push(aAction.id);

    const result = await storage.updateAction(aAction.id, userB.id, { status: "dismissed" });
    expect(result).toBeUndefined();

    // Verify original is unchanged
    const original = await storage.getAction(aAction.id, userA.id);
    expect(original!.status).toBe("pending");
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

describe("getActions - pagination", () => {
  let userId: string;
  let contactId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const user = await createTestUser("pagination");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;

    // Create 6 actions
    for (let i = 0; i < 6; i++) {
      const a = await storage.createAction(
        makeAction(userId, contactId, { priority: i, reason: `Action ${i}` })
      );
      createdIds.push(a.id);
      testIds.actionIds.push(a.id);
    }
  });

  it("respects limit parameter", async () => {
    const result = await storage.getActions(userId, { limit: 3 });
    expect(result.length).toBe(3);
  });

  it("respects offset parameter", async () => {
    const allResults = await storage.getActions(userId);
    const pagedResults = await storage.getActions(userId, { limit: 3, offset: 3 });

    // The offset page should not overlap with the first 3
    const firstPageIds = new Set(allResults.slice(0, 3).map(a => a.id));
    for (const action of pagedResults) {
      expect(firstPageIds.has(action.id)).toBe(false);
    }
  });

  it("returns empty array when offset exceeds total", async () => {
    const result = await storage.getActions(userId, { limit: 10, offset: 1000 });
    expect(result.length).toBe(0);
  });
});

// ─── DraftsLog CRUD ───────────────────────────────────────────────────────────

describe("createDraftsLog", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("create_draft");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("inserts a draft log and returns it with generated id", async () => {
    const input = makeDraftsLog(userId, contactId, {
      instructions: "Write a friendly follow-up",
      generatedBody: "Hi Vince, hope you're well...",
      playType: "follow_up",
    });
    const result = await storage.createDraftsLog(input);
    testIds.draftsLogIds.push(result.id);

    expect(result.id).toBeTruthy();
    expect(result.userId).toBe(userId);
    expect(result.contactId).toBe(contactId);
    expect(result.instructions).toBe("Write a friendly follow-up");
    expect(result.generatedBody).toBe("Hi Vince, hope you're well...");
    expect(result.playType).toBe("follow_up");
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it("allows nullable fields", async () => {
    const input = makeDraftsLog(userId, contactId);
    const result = await storage.createDraftsLog(input);
    testIds.draftsLogIds.push(result.id);

    expect(result.superhumanDraftId).toBeNull();
    expect(result.instructions).toBeNull();
    expect(result.generatedBody).toBeNull();
    expect(result.finalBody).toBeNull();
    expect(result.playType).toBeNull();
  });
});

describe("getDraftsLog", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("get_draft");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("returns a draft log by id and userId", async () => {
    const created = await storage.createDraftsLog(makeDraftsLog(userId, contactId));
    testIds.draftsLogIds.push(created.id);

    const found = await storage.getDraftsLog(created.id, userId);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it("returns undefined when userId doesn't match", async () => {
    const created = await storage.createDraftsLog(makeDraftsLog(userId, contactId));
    testIds.draftsLogIds.push(created.id);

    const otherUser = await createTestUser("get_draft_other");
    const found = await storage.getDraftsLog(created.id, otherUser.id);
    expect(found).toBeUndefined();
  });
});

describe("getDraftsLogs", () => {
  let userId: string;
  let contactId: string;
  let otherContactId: string;

  beforeAll(async () => {
    const user = await createTestUser("get_drafts_logs");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
    const other = await createTestContact(userId, "Other Contact");
    otherContactId = other.id;

    const d1 = await storage.createDraftsLog(makeDraftsLog(userId, contactId));
    const d2 = await storage.createDraftsLog(makeDraftsLog(userId, contactId));
    const d3 = await storage.createDraftsLog(makeDraftsLog(userId, otherContactId));
    testIds.draftsLogIds.push(d1.id, d2.id, d3.id);
  });

  it("returns all drafts for a user", async () => {
    const result = await storage.getDraftsLogs(userId);
    expect(result.every(d => d.userId === userId)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("filters by contactId when provided", async () => {
    const result = await storage.getDraftsLogs(userId, contactId);
    expect(result.every(d => d.contactId === contactId)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

describe("updateDraftsLog", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("update_draft");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("updates fields and returns updated draft", async () => {
    const created = await storage.createDraftsLog(makeDraftsLog(userId, contactId, {
      generatedBody: "Original body",
    }));
    testIds.draftsLogIds.push(created.id);

    const updated = await storage.updateDraftsLog(created.id, userId, {
      finalBody: "Edited final body",
    });
    expect(updated).toBeDefined();
    expect(updated!.finalBody).toBe("Edited final body");
    expect(updated!.generatedBody).toBe("Original body"); // unchanged
  });

  it("returns undefined when userId doesn't match", async () => {
    const created = await storage.createDraftsLog(makeDraftsLog(userId, contactId));
    testIds.draftsLogIds.push(created.id);

    const otherUser = await createTestUser("update_draft_other");
    const result = await storage.updateDraftsLog(created.id, otherUser.id, { finalBody: "hacked" });
    expect(result).toBeUndefined();
  });
});

// ─── DraftsLog user isolation ────────────────────────────────────────────────

describe("DraftsLog user isolation", () => {
  let userA: Awaited<ReturnType<typeof createTestUser>>;
  let userB: Awaited<ReturnType<typeof createTestUser>>;
  let contactA: Awaited<ReturnType<typeof createTestContact>>;
  let contactB: Awaited<ReturnType<typeof createTestContact>>;

  beforeAll(async () => {
    userA = await createTestUser("draft_iso_a");
    userB = await createTestUser("draft_iso_b");
    contactA = await createTestContact(userA.id);
    contactB = await createTestContact(userB.id);
  });

  it("getDraftsLogs returns only user A's drafts", async () => {
    const dA = await storage.createDraftsLog(makeDraftsLog(userA.id, contactA.id));
    const dB = await storage.createDraftsLog(makeDraftsLog(userB.id, contactB.id));
    testIds.draftsLogIds.push(dA.id, dB.id);

    const resultA = await storage.getDraftsLogs(userA.id);
    const ids = resultA.map(d => d.id);
    expect(ids).toContain(dA.id);
    expect(ids).not.toContain(dB.id);
  });
});

// ─── Cascade: delete contact → actions + drafts_log deleted ──────────────────

describe("cascade delete: contact deletion removes actions and drafts_log", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser("cascade");
    userId = user.id;
  });

  it("deletes associated actions when contact is deleted", async () => {
    const contact = await createTestContact(userId, "Cascade Contact Actions");
    // Not tracking contactId here since we'll delete it manually

    const action = await storage.createAction(makeAction(userId, contact.id));
    // Also don't track actionId since cascade should remove it

    // Delete the contact
    await storage.deleteContact(contact.id, userId);

    // The action should be gone
    const found = await storage.getAction(action.id, userId);
    expect(found).toBeUndefined();
  });

  it("deletes associated drafts_log when contact is deleted", async () => {
    const contact = await createTestContact(userId, "Cascade Contact Drafts");

    const draft = await storage.createDraftsLog(makeDraftsLog(userId, contact.id));

    // Delete the contact
    await storage.deleteContact(contact.id, userId);

    // The draft should be gone
    const found = await storage.getDraftsLog(draft.id, userId);
    expect(found).toBeUndefined();
  });
});
