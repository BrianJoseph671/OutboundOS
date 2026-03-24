/**
 * Integration tests for interaction CRUD storage methods (Phase 1: RelationshipOS)
 * Tests verify IStorage interface + DatabaseStorage implementations.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import {
  users,
  contacts,
  interactions,
  type InsertInteraction,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";

// Track IDs for cleanup
const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  interactionIds: [] as string[],
};

afterAll(async () => {
  // Clean up in reverse dependency order
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

// Helpers
async function createTestUser(suffix = "") {
  const [user] = await db
    .insert(users)
    .values({
      username: `interactions_test_user_${suffix}_${Date.now()}`,
      password: "test_password",
      email: `interactions_${suffix}_${Date.now()}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

async function createTestContact(userId: string, name?: string) {
  const [contact] = await db
    .insert(contacts)
    .values({
      name: name ?? `Interaction Contact ${Date.now()}`,
      userId,
    })
    .returning();
  testIds.contactIds.push(contact.id);
  return contact;
}

function makeInteraction(userId: string, contactId: string, overrides: Partial<InsertInteraction> = {}): InsertInteraction {
  return {
    userId,
    contactId,
    channel: "email",
    direction: "outbound",
    occurredAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Basic CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe("createInteraction", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("create");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("inserts a row and returns it with generated id and ingestedAt", async () => {
    const input = makeInteraction(userId, contactId, { summary: "First email sent" });
    const result = await storage.createInteraction(input);
    testIds.interactionIds.push(result.id);

    expect(result.id).toBeTruthy();
    expect(result.userId).toBe(userId);
    expect(result.contactId).toBe(contactId);
    expect(result.channel).toBe("email");
    expect(result.direction).toBe("outbound");
    expect(result.summary).toBe("First email sent");
    expect(result.ingestedAt).toBeInstanceOf(Date);
  });

  it("updates parent contact's last_interaction_at and last_interaction_channel", async () => {
    // Use a fresh contact so last_interaction_at starts as NULL
    const freshContact = await createTestContact(userId, `Fresh Contact ${Date.now()}`);
    const occurred = new Date("2025-06-15T10:00:00Z");
    const result = await storage.createInteraction(
      makeInteraction(userId, freshContact.id, { channel: "linkedin", occurredAt: occurred })
    );
    testIds.interactionIds.push(result.id);

    const contact = await storage.getContact(freshContact.id);
    expect(contact).toBeDefined();
    expect(contact!.lastInteractionAt).toBeInstanceOf(Date);
    // Should be equal to occurred (allow 1 second tolerance for timestamp precision)
    const diff = Math.abs(contact!.lastInteractionAt!.getTime() - occurred.getTime());
    expect(diff).toBeLessThan(1000);
    expect(contact!.lastInteractionChannel).toBe("linkedin");
  });

  it("does not overwrite last_interaction_at with an older occurred_at", async () => {
    // Create a newer interaction first
    const newer = new Date("2025-12-01T10:00:00Z");
    const newerInteraction = await storage.createInteraction(
      makeInteraction(userId, contactId, { channel: "email", occurredAt: newer })
    );
    testIds.interactionIds.push(newerInteraction.id);

    // Now create an older interaction
    const older = new Date("2025-01-01T10:00:00Z");
    const olderInteraction = await storage.createInteraction(
      makeInteraction(userId, contactId, { channel: "whatsapp", occurredAt: older })
    );
    testIds.interactionIds.push(olderInteraction.id);

    // Contact's last_interaction_at should still be the newer date
    const contact = await storage.getContact(contactId);
    expect(contact!.lastInteractionAt).toBeDefined();
    expect(contact!.lastInteractionAt!.getTime()).toBeGreaterThanOrEqual(newer.getTime() - 1000);
    // The channel should still be "email" from the newer interaction, not "whatsapp"
    expect(contact!.lastInteractionChannel).toBe("email");
  });

  it("truncates raw_content to 10,000 characters when exceeded", async () => {
    const longContent = "a".repeat(15000);
    const result = await storage.createInteraction(
      makeInteraction(userId, contactId, { rawContent: longContent })
    );
    testIds.interactionIds.push(result.id);

    expect(result.rawContent).toBeDefined();
    expect(result.rawContent!.length).toBe(10000);
  });

  it("does not truncate raw_content when it is exactly 10,000 characters", async () => {
    const exactContent = "b".repeat(10000);
    const result = await storage.createInteraction(
      makeInteraction(userId, contactId, { rawContent: exactContent })
    );
    testIds.interactionIds.push(result.id);

    expect(result.rawContent!.length).toBe(10000);
  });

  it("does not truncate raw_content when it is under 10,000 characters", async () => {
    const shortContent = "c".repeat(500);
    const result = await storage.createInteraction(
      makeInteraction(userId, contactId, { rawContent: shortContent })
    );
    testIds.interactionIds.push(result.id);

    expect(result.rawContent!.length).toBe(500);
  });

  it("accepts null raw_content without issue", async () => {
    const result = await storage.createInteraction(
      makeInteraction(userId, contactId, { rawContent: undefined })
    );
    testIds.interactionIds.push(result.id);

    expect(result.rawContent).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getInteraction
// ─────────────────────────────────────────────────────────────────────────────

describe("getInteraction", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("get_one");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("returns the interaction by id when userId matches", async () => {
    const created = await storage.createInteraction(makeInteraction(userId, contactId));
    testIds.interactionIds.push(created.id);

    const found = await storage.getInteraction(created.id, userId);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it("returns undefined for non-existent id", async () => {
    const found = await storage.getInteraction("00000000-0000-0000-0000-000000000000", userId);
    expect(found).toBeUndefined();
  });

  it("returns undefined when userId does not match (cross-user isolation)", async () => {
    const otherUser = await createTestUser("get_one_other");
    testIds.userIds.push(otherUser.id);
    const created = await storage.createInteraction(makeInteraction(userId, contactId));
    testIds.interactionIds.push(created.id);

    // Looking up with another userId should return undefined
    const found = await storage.getInteraction(created.id, otherUser.id);
    expect(found).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getInteractions
// ─────────────────────────────────────────────────────────────────────────────

describe("getInteractions", () => {
  let userId: string;
  let otherUserId: string;
  let contactId: string;
  let otherContactId: string;

  beforeAll(async () => {
    const user = await createTestUser("list");
    userId = user.id;
    const otherUser = await createTestUser("list_other");
    otherUserId = otherUser.id;

    const contact = await createTestContact(userId, "List Contact A");
    contactId = contact.id;
    const otherContact = await createTestContact(userId, "List Contact B");
    otherContactId = otherContact.id;
  });

  it("returns interactions filtered by userId", async () => {
    const created = await storage.createInteraction(makeInteraction(userId, contactId));
    testIds.interactionIds.push(created.id);

    const results = await storage.getInteractions(userId);
    expect(results.some(i => i.id === created.id)).toBe(true);
  });

  it("does not return interactions from another user", async () => {
    // Create contact owned by otherUser
    const otherContact = await createTestContact(otherUserId, "Other User Contact");
    const otherCreated = await storage.createInteraction(
      makeInteraction(otherUserId, otherContact.id)
    );
    testIds.interactionIds.push(otherCreated.id);

    const results = await storage.getInteractions(userId);
    expect(results.some(i => i.id === otherCreated.id)).toBe(false);
  });

  it("filters by contactId when provided", async () => {
    const i1 = await storage.createInteraction(makeInteraction(userId, contactId));
    testIds.interactionIds.push(i1.id);
    const i2 = await storage.createInteraction(makeInteraction(userId, otherContactId));
    testIds.interactionIds.push(i2.id);

    const results = await storage.getInteractions(userId, contactId);
    expect(results.some(i => i.id === i1.id)).toBe(true);
    expect(results.some(i => i.id === i2.id)).toBe(false);
  });

  it("returns interactions ordered by occurredAt DESC", async () => {
    const earlier = new Date("2024-01-01T00:00:00Z");
    const later = new Date("2024-12-31T23:59:59Z");

    const i1 = await storage.createInteraction(
      makeInteraction(userId, contactId, { occurredAt: earlier })
    );
    testIds.interactionIds.push(i1.id);
    const i2 = await storage.createInteraction(
      makeInteraction(userId, contactId, { occurredAt: later })
    );
    testIds.interactionIds.push(i2.id);

    const results = await storage.getInteractions(userId, contactId);
    const relevantResults = results.filter(r => r.id === i1.id || r.id === i2.id);
    // later should come first
    const laterIdx = relevantResults.findIndex(r => r.id === i2.id);
    const earlierIdx = relevantResults.findIndex(r => r.id === i1.id);
    expect(laterIdx).toBeLessThan(earlierIdx);
  });

  it("returns empty array when no interactions exist for user", async () => {
    const freshUser = await createTestUser("empty_user");
    const results = await storage.getInteractions(freshUser.id);
    expect(results).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateInteraction
// ─────────────────────────────────────────────────────────────────────────────

describe("updateInteraction", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("update");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("updates specified fields and returns the updated interaction", async () => {
    const created = await storage.createInteraction(
      makeInteraction(userId, contactId, { summary: "Original summary" })
    );
    testIds.interactionIds.push(created.id);

    const updated = await storage.updateInteraction(created.id, userId, { summary: "Updated summary" });
    expect(updated).toBeDefined();
    expect(updated!.summary).toBe("Updated summary");
    // Other fields unchanged
    expect(updated!.channel).toBe("email");
  });

  it("returns undefined for non-existent id", async () => {
    const result = await storage.updateInteraction("00000000-0000-0000-0000-000000000000", userId, { summary: "x" });
    expect(result).toBeUndefined();
  });

  it("returns undefined when userId does not match (cross-user isolation)", async () => {
    const otherUser = await createTestUser("update_other");
    testIds.userIds.push(otherUser.id);
    const created = await storage.createInteraction(
      makeInteraction(userId, contactId, { summary: "Should not update" })
    );
    testIds.interactionIds.push(created.id);

    // Attempt update with wrong userId — should return undefined and not update
    const result = await storage.updateInteraction(created.id, otherUser.id, { summary: "Cross-user update" });
    expect(result).toBeUndefined();

    // Original should be unchanged
    const original = await storage.getInteraction(created.id, userId);
    expect(original!.summary).toBe("Should not update");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteInteraction
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteInteraction", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("delete");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("deletes an existing interaction and returns true", async () => {
    const created = await storage.createInteraction(makeInteraction(userId, contactId));
    // Don't add to cleanup list since we're deleting it

    const result = await storage.deleteInteraction(created.id, userId);
    expect(result).toBe(true);

    // Verify it's gone
    const found = await storage.getInteraction(created.id, userId);
    expect(found).toBeUndefined();
  });

  it("returns false for non-existent id", async () => {
    const result = await storage.deleteInteraction("00000000-0000-0000-0000-000000000000", userId);
    expect(result).toBe(false);
  });

  it("returns false when userId does not match (cross-user isolation)", async () => {
    const otherUser = await createTestUser("delete_other");
    testIds.userIds.push(otherUser.id);
    const created = await storage.createInteraction(makeInteraction(userId, contactId));
    testIds.interactionIds.push(created.id);

    // Attempt delete with wrong userId — should return false
    const result = await storage.deleteInteraction(created.id, otherUser.id);
    expect(result).toBe(false);

    // Original should still exist
    const found = await storage.getInteraction(created.id, userId);
    expect(found).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getInteractionBySourceId
// ─────────────────────────────────────────────────────────────────────────────

describe("getInteractionBySourceId", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("source_id");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("returns the interaction matching channel + sourceId + userId", async () => {
    const sourceId = `src_test_${Date.now()}`;
    const created = await storage.createInteraction(
      makeInteraction(userId, contactId, { channel: "linkedin", sourceId })
    );
    testIds.interactionIds.push(created.id);

    const found = await storage.getInteractionBySourceId("linkedin", sourceId, userId);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.sourceId).toBe(sourceId);
  });

  it("returns undefined for non-existent channel+sourceId", async () => {
    const found = await storage.getInteractionBySourceId("email", "non-existent-source-id", userId);
    expect(found).toBeUndefined();
  });

  it("returns undefined when channel does not match even if sourceId matches", async () => {
    const sourceId = `src_channel_mismatch_${Date.now()}`;
    const created = await storage.createInteraction(
      makeInteraction(userId, contactId, { channel: "email", sourceId })
    );
    testIds.interactionIds.push(created.id);

    const found = await storage.getInteractionBySourceId("linkedin", sourceId, userId);
    expect(found).toBeUndefined();
  });

  it("returns undefined when userId does not match even if channel+sourceId match", async () => {
    const otherUser = await createTestUser("source_id_other");
    testIds.userIds.push(otherUser.id);
    const sourceId = `src_user_mismatch_${Date.now()}`;
    const created = await storage.createInteraction(
      makeInteraction(userId, contactId, { channel: "email", sourceId })
    );
    testIds.interactionIds.push(created.id);

    // Query with correct channel+sourceId but different userId
    const found = await storage.getInteractionBySourceId("email", sourceId, otherUser.id);
    expect(found).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateContact — updated_at auto-set
// ─────────────────────────────────────────────────────────────────────────────

describe("updateContact — updated_at always set", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser("updated_at");
    userId = user.id;
  });

  it("sets updated_at to current time even when not provided in payload", async () => {
    const contact = await createTestContact(userId);
    const originalUpdatedAt = contact.updatedAt;

    // Small delay to ensure clock advances
    await new Promise(resolve => setTimeout(resolve, 50));

    const updated = await storage.updateContact(contact.id, { notes: "Updated notes" });
    expect(updated).toBeDefined();
    expect(updated!.updatedAt).toBeInstanceOf(Date);
    if (originalUpdatedAt) {
      expect(updated!.updatedAt!.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    }
  });

  it("overrides any updated_at provided in the payload with current time", async () => {
    const contact = await createTestContact(userId);

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 50));

    const staleDate = new Date("2020-01-01T00:00:00Z");
    const updated = await storage.updateContact(contact.id, {
      notes: "New notes",
      updatedAt: staleDate,
    });
    expect(updated).toBeDefined();
    // updated_at should be close to now, NOT 2020
    expect(updated!.updatedAt!.getFullYear()).toBeGreaterThan(2020);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// User scoping / multi-tenant isolation
// ─────────────────────────────────────────────────────────────────────────────

describe("user scoping", () => {
  let userAId: string;
  let userBId: string;
  let contactAId: string;
  let contactBId: string;

  beforeAll(async () => {
    const userA = await createTestUser("scope_a");
    userAId = userA.id;
    const userB = await createTestUser("scope_b");
    userBId = userB.id;

    const contactA = await createTestContact(userAId, "Scoped Contact A");
    contactAId = contactA.id;
    const contactB = await createTestContact(userBId, "Scoped Contact B");
    contactBId = contactB.id;
  });

  it("getInteractions only returns interactions for the given userId", async () => {
    const iA = await storage.createInteraction(makeInteraction(userAId, contactAId, { summary: "User A interaction" }));
    testIds.interactionIds.push(iA.id);
    const iB = await storage.createInteraction(makeInteraction(userBId, contactBId, { summary: "User B interaction" }));
    testIds.interactionIds.push(iB.id);

    const resultsA = await storage.getInteractions(userAId);
    const resultsB = await storage.getInteractions(userBId);

    expect(resultsA.every(i => i.userId === userAId)).toBe(true);
    expect(resultsB.every(i => i.userId === userBId)).toBe(true);
    expect(resultsA.some(i => i.id === iB.id)).toBe(false);
    expect(resultsB.some(i => i.id === iA.id)).toBe(false);
  });
});
