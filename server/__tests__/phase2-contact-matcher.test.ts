/**
 * Tests for contactMatcher service (Phase 2 — RelationshipOS)
 *
 * Covers:
 * - Case-insensitive email match (upper, lower, mixed case)
 * - Returns correct Contact object when matched
 * - Returns undefined when no match found
 * - Returns undefined when contact has no email
 * - Multi-user isolation (does not match across users)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import { users, contacts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { matchContact } from "../agent/services/contactMatcher";

// ── Cleanup tracking ──────────────────────────────────────────────────────────

const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
};

afterAll(async () => {
  for (const id of testIds.contactIds) {
    await db.delete(contacts).where(eq(contacts.id, id)).catch(() => {});
  }
  for (const id of testIds.userIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  await pool.end();
});

// ── Test helpers ──────────────────────────────────────────────────────────────

async function createTestUser(suffix = "") {
  const ts = Date.now();
  const [user] = await db
    .insert(users)
    .values({
      username: `matcher_test_${suffix}_${ts}`,
      password: "hashed_test_password",
      email: `matcher_test_${suffix}_${ts}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

async function createTestContact(
  userId: string,
  email: string | null,
  name?: string
) {
  const ts = Date.now();
  const [contact] = await db
    .insert(contacts)
    .values({
      userId,
      name: name ?? `Matcher Contact ${ts}`,
      email: email,
    })
    .returning();
  testIds.contactIds.push(contact.id);
  return contact;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("matchContact — exact case-insensitive email match", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("exact");
    userId = user.id;
    const contact = await createTestContact(userId, "alice@example.com", "Alice Smith");
    contactId = contact.id;
  });

  it("matches exact lowercase email", async () => {
    const result = await matchContact("alice@example.com", userId);
    expect(result).toBeDefined();
    expect(result!.id).toBe(contactId);
    expect(result!.name).toBe("Alice Smith");
  });

  it("matches uppercase email (case-insensitive)", async () => {
    const result = await matchContact("ALICE@EXAMPLE.COM", userId);
    expect(result).toBeDefined();
    expect(result!.id).toBe(contactId);
  });

  it("matches mixed-case email (case-insensitive)", async () => {
    const result = await matchContact("Alice@Example.Com", userId);
    expect(result).toBeDefined();
    expect(result!.id).toBe(contactId);
  });

  it("matches email with leading/trailing whitespace trimmed", async () => {
    const result = await matchContact("  alice@example.com  ", userId);
    expect(result).toBeDefined();
    expect(result!.id).toBe(contactId);
  });
});

describe("matchContact — no match cases", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser("nomatch");
    userId = user.id;
    // Contact with no email
    await createTestContact(userId, null, "Bob Jones");
    // Contact with a different email
    await createTestContact(userId, "carol@example.com", "Carol White");
  });

  it("returns undefined for non-existent email", async () => {
    const result = await matchContact("nobody@example.com", userId);
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty string email", async () => {
    const result = await matchContact("", userId);
    expect(result).toBeUndefined();
  });

  it("returns undefined when contact has null email", async () => {
    // bob@example.com doesn't exist — bob has no email
    const result = await matchContact("bob@example.com", userId);
    expect(result).toBeUndefined();
  });

  it("returns undefined for partial email match (not substring)", async () => {
    // "carol" is a substring, but should not match
    const result = await matchContact("carol", userId);
    expect(result).toBeUndefined();
  });

  it("returns undefined for subdomain variation", async () => {
    const result = await matchContact("carol@sub.example.com", userId);
    expect(result).toBeUndefined();
  });
});

describe("matchContact — multi-user isolation", () => {
  let userA: { id: string };
  let userB: { id: string };

  beforeAll(async () => {
    userA = await createTestUser("iso_a");
    userB = await createTestUser("iso_b");
    // Both users have contacts, but with different emails
    await createTestContact(userA.id, "shared@example.com", "User A Contact");
    await createTestContact(userB.id, "other@example.com", "User B Contact");
  });

  it("returns contact for correct user", async () => {
    const result = await matchContact("shared@example.com", userA.id);
    expect(result).toBeDefined();
    expect(result!.userId).toBe(userA.id);
  });

  it("returns undefined for another user's contact email", async () => {
    // User B does not have a contact with shared@example.com
    const result = await matchContact("shared@example.com", userB.id);
    expect(result).toBeUndefined();
  });

  it("user A cannot match user B's contacts", async () => {
    const result = await matchContact("other@example.com", userA.id);
    expect(result).toBeUndefined();
  });
});

describe("matchContact — multiple contacts, correct match returned", () => {
  let userId: string;
  let expectedContactId: string;

  beforeAll(async () => {
    const user = await createTestUser("multi");
    userId = user.id;
    await createTestContact(userId, "first@domain.com", "First Contact");
    const target = await createTestContact(userId, "target@domain.com", "Target Contact");
    expectedContactId = target.id;
    await createTestContact(userId, "third@domain.com", "Third Contact");
  });

  it("returns the correct contact among multiple", async () => {
    const result = await matchContact("target@domain.com", userId);
    expect(result).toBeDefined();
    expect(result!.id).toBe(expectedContactId);
    expect(result!.name).toBe("Target Contact");
  });

  it("does not match other contacts in the list", async () => {
    const first = await matchContact("first@domain.com", userId);
    expect(first).toBeDefined();
    expect(first!.name).toBe("First Contact");

    const third = await matchContact("third@domain.com", userId);
    expect(third).toBeDefined();
    expect(third!.name).toBe("Third Contact");

    // These should be different contacts
    expect(first!.id).not.toBe(expectedContactId);
    expect(third!.id).not.toBe(expectedContactId);
  });
});
