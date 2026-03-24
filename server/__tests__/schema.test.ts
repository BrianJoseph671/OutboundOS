/**
 * Schema integration tests for Phase 1: RelationshipOS schema changes
 * Tests verify the correct structure and constraints of the extended schema.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  users,
  contacts,
  interactions,
  insertUserSchema,
  insertContactSchema,
  insertInteractionSchema,
  type InsertContact,
  type InsertInteraction,
} from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

// Test user and contact IDs to clean up after tests
const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  interactionIds: [] as string[],
};

afterAll(async () => {
  // Clean up test data in reverse dependency order
  if (testIds.interactionIds.length > 0) {
    for (const id of testIds.interactionIds) {
      await db.delete(interactions).where(eq(interactions.id, id)).catch(() => {});
    }
  }
  if (testIds.contactIds.length > 0) {
    for (const id of testIds.contactIds) {
      await db.delete(contacts).where(eq(contacts.id, id)).catch(() => {});
    }
  }
  if (testIds.userIds.length > 0) {
    for (const id of testIds.userIds) {
      await db.delete(users).where(eq(users.id, id)).catch(() => {});
    }
  }
  await pool.end();
});

// Helper to create a test user
async function createTestUser(suffix = "") {
  const [user] = await db
    .insert(users)
    .values({
      username: `test_schema_user_${suffix}_${Date.now()}`,
      password: "test_password",
      email: `test_${suffix}_${Date.now()}@example.com`,
      fullName: "Test User",
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

// Helper to create a test contact
async function createTestContact(userId: string, overrides: Partial<InsertContact> = {}) {
  const [contact] = await db
    .insert(contacts)
    .values({
      name: `Test Contact ${Date.now()}`,
      userId,
      ...overrides,
    })
    .returning();
  testIds.contactIds.push(contact.id);
  return contact;
}

describe("Users table — extended schema", () => {
  it("should allow creating a user with just username and password", async () => {
    const [user] = await db
      .insert(users)
      .values({
        username: `minimal_user_${Date.now()}`,
        password: "hashed_password",
      })
      .returning();
    testIds.userIds.push(user.id);

    expect(user.id).toBeTruthy();
    expect(user.username).toMatch(/^minimal_user_/);
    expect(user.password).toBe("hashed_password");
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it("should allow creating a user with all new OAuth columns", async () => {
    const [user] = await db
      .insert(users)
      .values({
        username: `oauth_user_${Date.now()}`,
        password: "n/a",
        email: `oauth_${Date.now()}@example.com`,
        fullName: "Brian Joseph",
        googleId: `google_${Date.now()}`,
        avatarUrl: "https://example.com/avatar.jpg",
      })
      .returning();
    testIds.userIds.push(user.id);

    expect(user.email).toMatch(/@example\.com$/);
    expect(user.fullName).toBe("Brian Joseph");
    expect(user.googleId).toMatch(/^google_/);
    expect(user.avatarUrl).toBe("https://example.com/avatar.jpg");
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it("should enforce unique email constraint", async () => {
    const uniqueEmail = `unique_${Date.now()}@example.com`;
    const [user1] = await db
      .insert(users)
      .values({
        username: `email_test1_${Date.now()}`,
        password: "pass",
        email: uniqueEmail,
      })
      .returning();
    testIds.userIds.push(user1.id);

    await expect(
      db.insert(users).values({
        username: `email_test2_${Date.now()}`,
        password: "pass",
        email: uniqueEmail,
      })
    ).rejects.toThrow();
  });

  it("should enforce unique google_id constraint", async () => {
    const uniqueGoogleId = `google_unique_${Date.now()}`;
    const [user1] = await db
      .insert(users)
      .values({
        username: `gid_test1_${Date.now()}`,
        password: "pass",
        googleId: uniqueGoogleId,
      })
      .returning();
    testIds.userIds.push(user1.id);

    await expect(
      db.insert(users).values({
        username: `gid_test2_${Date.now()}`,
        password: "pass",
        googleId: uniqueGoogleId,
      })
    ).rejects.toThrow();
  });

  it("should have created_at auto-populated", async () => {
    const [user] = await db
      .insert(users)
      .values({
        username: `created_at_test_${Date.now()}`,
        password: "pass",
      })
      .returning();
    testIds.userIds.push(user.id);

    // Verify it's a Date object and is within 24 hours of now
    // (loose range to handle server timezone differences)
    expect(user.createdAt).toBeInstanceOf(Date);
    const diffMs = Math.abs(Date.now() - user.createdAt.getTime());
    expect(diffMs).toBeLessThan(24 * 60 * 60 * 1000); // within 24 hours
  });
});

describe("Contacts table — extended schema", () => {
  let testUserId: string;

  beforeAll(async () => {
    const user = await createTestUser("contacts");
    testUserId = user.id;
  });

  it("should default tier to 'cool'", async () => {
    const [contact] = await db
      .insert(contacts)
      .values({
        name: `Tier Test ${Date.now()}`,
        userId: testUserId,
      })
      .returning();
    testIds.contactIds.push(contact.id);

    expect(contact.tier).toBe("cool");
  });

  it("should allow setting tier to other values", async () => {
    const [contact] = await db
      .insert(contacts)
      .values({
        name: `Tier Hot ${Date.now()}`,
        userId: testUserId,
        tier: "hot",
      })
      .returning();
    testIds.contactIds.push(contact.id);

    expect(contact.tier).toBe("hot");
  });

  it("should allow nullable source", async () => {
    const [contact] = await db
      .insert(contacts)
      .values({
        name: `No Source ${Date.now()}`,
        userId: testUserId,
      })
      .returning();
    testIds.contactIds.push(contact.id);

    expect(contact.source).toBeNull();
  });

  it("should allow setting source", async () => {
    const [contact] = await db
      .insert(contacts)
      .values({
        name: `Source Test ${Date.now()}`,
        userId: testUserId,
        source: "linkedin_import",
      })
      .returning();
    testIds.contactIds.push(contact.id);

    expect(contact.source).toBe("linkedin_import");
  });

  it("should have nullable last_interaction_at and last_interaction_channel by default", async () => {
    const [contact] = await db
      .insert(contacts)
      .values({
        name: `Interaction Fields ${Date.now()}`,
        userId: testUserId,
      })
      .returning();
    testIds.contactIds.push(contact.id);

    expect(contact.lastInteractionAt).toBeNull();
    expect(contact.lastInteractionChannel).toBeNull();
  });

  it("should have updated_at populated on create", async () => {
    const [contact] = await db
      .insert(contacts)
      .values({
        name: `Updated At ${Date.now()}`,
        userId: testUserId,
      })
      .returning();
    testIds.contactIds.push(contact.id);

    expect(contact.updatedAt).toBeInstanceOf(Date);
  });

  it("should have user_id FK to users table", async () => {
    // Non-existent user_id should fail with FK violation
    await expect(
      db.insert(contacts).values({
        name: `FK Test ${Date.now()}`,
        userId: "non-existent-user-id",
      })
    ).rejects.toThrow();
  });

  it("should have user_id NOT NULL", async () => {
    // Attempting to insert contact without user_id should fail
    await expect(
      db.execute(sql`INSERT INTO contacts (name) VALUES ('no_user_test_${Date.now()}')`)
    ).rejects.toThrow();
  });

  it("VAL-SCHEMA-006: no existing contacts should have NULL user_id", async () => {
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM contacts WHERE user_id IS NULL`
    );
    const count = Number((result.rows[0] as Record<string, unknown>).count);
    expect(count).toBe(0);
  });

  it("VAL-SCHEMA-012: tier defaults to 'cool' on create", async () => {
    const [contact] = await db
      .insert(contacts)
      .values({ name: `Default Tier ${Date.now()}`, userId: testUserId })
      .returning();
    testIds.contactIds.push(contact.id);
    expect(contact.tier).toBe("cool");
  });
});

describe("Interactions table — new schema", () => {
  let testUserId: string;
  let testContactId: string;

  beforeAll(async () => {
    const user = await createTestUser("interactions");
    testUserId = user.id;
    const [contact] = await db
      .insert(contacts)
      .values({ name: `Interaction Contact ${Date.now()}`, userId: testUserId })
      .returning();
    testIds.contactIds.push(contact.id);
    testContactId = contact.id;
  });

  it("should create an interaction with all required fields", async () => {
    const occurred = new Date();
    const [interaction] = await db
      .insert(interactions)
      .values({
        userId: testUserId,
        contactId: testContactId,
        channel: "email",
        direction: "outbound",
        occurredAt: occurred,
      })
      .returning();
    testIds.interactionIds.push(interaction.id);

    expect(interaction.id).toBeTruthy();
    expect(interaction.userId).toBe(testUserId);
    expect(interaction.contactId).toBe(testContactId);
    expect(interaction.channel).toBe("email");
    expect(interaction.direction).toBe("outbound");
    expect(interaction.occurredAt).toBeInstanceOf(Date);
    expect(interaction.ingestedAt).toBeInstanceOf(Date);
    expect(interaction.sourceId).toBeNull();
    expect(interaction.summary).toBeNull();
    expect(interaction.rawContent).toBeNull();
    expect(interaction.openThreads).toBeNull();
  });

  it("VAL-SCHEMA-004: should prevent duplicate (channel, source_id) where source_id IS NOT NULL", async () => {
    const sourceId = `src_${Date.now()}`;
    const [first] = await db
      .insert(interactions)
      .values({
        userId: testUserId,
        contactId: testContactId,
        channel: "linkedin",
        direction: "inbound",
        occurredAt: new Date(),
        sourceId,
      })
      .returning();
    testIds.interactionIds.push(first.id);

    // Second insert with same channel + source_id should fail
    await expect(
      db.insert(interactions).values({
        userId: testUserId,
        contactId: testContactId,
        channel: "linkedin",
        direction: "outbound",
        occurredAt: new Date(),
        sourceId,
      })
    ).rejects.toThrow();
  });

  it("VAL-SCHEMA-013: should allow multiple interactions with source_id=NULL and same channel", async () => {
    const [int1] = await db
      .insert(interactions)
      .values({
        userId: testUserId,
        contactId: testContactId,
        channel: "email",
        direction: "outbound",
        occurredAt: new Date(),
        sourceId: null,
      })
      .returning();
    testIds.interactionIds.push(int1.id);

    const [int2] = await db
      .insert(interactions)
      .values({
        userId: testUserId,
        contactId: testContactId,
        channel: "email",
        direction: "outbound",
        occurredAt: new Date(),
        sourceId: null,
      })
      .returning();
    testIds.interactionIds.push(int2.id);

    expect(int1.id).toBeTruthy();
    expect(int2.id).toBeTruthy();
    expect(int1.id).not.toBe(int2.id);
  });

  it("VAL-SCHEMA-007: should cascade delete interactions when contact is deleted", async () => {
    // Create a fresh contact for this test
    const [cascadeContact] = await db
      .insert(contacts)
      .values({ name: `Cascade Test ${Date.now()}`, userId: testUserId })
      .returning();

    const [interaction] = await db
      .insert(interactions)
      .values({
        userId: testUserId,
        contactId: cascadeContact.id,
        channel: "email",
        direction: "outbound",
        occurredAt: new Date(),
      })
      .returning();

    // Delete contact — should cascade delete interaction
    await db.delete(contacts).where(eq(contacts.id, cascadeContact.id));

    // Interaction should be gone
    const remaining = await db
      .select()
      .from(interactions)
      .where(eq(interactions.id, interaction.id));
    expect(remaining).toHaveLength(0);
  });

  it("VAL-SCHEMA-008: should fail with non-existent contact_id", async () => {
    await expect(
      db.insert(interactions).values({
        userId: testUserId,
        contactId: "non-existent-contact-id",
        channel: "email",
        direction: "outbound",
        occurredAt: new Date(),
      })
    ).rejects.toThrow();
  });

  it("VAL-SCHEMA-008: should fail with non-existent user_id", async () => {
    await expect(
      db.insert(interactions).values({
        userId: "non-existent-user-id",
        contactId: testContactId,
        channel: "email",
        direction: "outbound",
        occurredAt: new Date(),
      })
    ).rejects.toThrow();
  });
});

describe("Seed data validation", () => {
  it("VAL-SCHEMA-005: seed user exists in database", async () => {
    const result = await db.execute(sql`SELECT * FROM users LIMIT 1`);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("VAL-SCHEMA-006: all contacts have user_id set", async () => {
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM contacts WHERE user_id IS NULL`
    );
    const count = Number((result.rows[0] as Record<string, unknown>).count);
    expect(count).toBe(0);
  });
});

describe("Schema types and exports", () => {
  it("should have correct TypeScript types for insertInteractionSchema", () => {
    const validData: InsertInteraction = {
      userId: "user-id",
      contactId: "contact-id",
      channel: "email",
      direction: "outbound",
      occurredAt: new Date(),
    };
    const parsed = insertInteractionSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
  });

  it("should reject insertInteractionSchema with missing required fields", () => {
    const invalidData = {
      channel: "email",
      // missing userId, contactId, direction, occurredAt
    };
    const parsed = insertInteractionSchema.safeParse(invalidData);
    expect(parsed.success).toBe(false);
  });
});
