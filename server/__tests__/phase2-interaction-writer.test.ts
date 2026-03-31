/**
 * Tests for interactionWriter service (Phase 2 — RelationshipOS)
 *
 * Covers:
 * - Source ID dedup: write once, skip duplicate
 * - Calendar/Granola date dedup
 * - Mapping correctness (channel, direction, sourceId, summary for each source type)
 * - Multiple interactions written in a single batch
 * - Partial dedup (some new, some duplicate)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db, pool } from "../db";
import { users, contacts, interactions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { writeInteractions, type RawInteraction } from "../agent/services/interactionWriter";

// ── Cleanup tracking ──────────────────────────────────────────────────────────

const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  interactionIds: [] as string[],
};

afterAll(async () => {
  // Clean up interactions first, then contacts, then users
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
      username: `iwriter_test_${suffix}_${ts}`,
      password: "hashed_test_password",
      email: `iwriter_${suffix}_${ts}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

async function createTestContact(userId: string, name?: string) {
  const ts = Date.now();
  const [contact] = await db
    .insert(contacts)
    .values({
      userId,
      name: name ?? `Writer Contact ${ts}`,
    })
    .returning();
  testIds.contactIds.push(contact.id);
  return contact;
}

/** Fetch interactions for a user+contact and track their IDs for cleanup */
async function getUserInteractions(userId: string, contactId: string) {
  const result = await storage.getInteractions(userId, contactId);
  for (const i of result) {
    if (!testIds.interactionIds.includes(i.id)) {
      testIds.interactionIds.push(i.id);
    }
  }
  return result;
}

function makeRaw(
  contactId: string,
  overrides: Partial<RawInteraction> = {}
): RawInteraction {
  return {
    contactId,
    channel: "email",
    direction: "outbound",
    occurredAt: new Date("2025-01-15T10:00:00Z"),
    sourceId: `test-src-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    summary: "Test email summary",
    ...overrides,
  };
}

// ── Source ID dedup tests ─────────────────────────────────────────────────────

describe("writeInteractions — source_id dedup", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("srcdedup");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("writes a new interaction and returns written=1, skipped=0", async () => {
    const raw = makeRaw(contactId, { sourceId: "email-thread-001" });
    const result = await writeInteractions(userId, [raw]);
    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);

    const saved = await getUserInteractions(userId, contactId);
    const found = saved.find((i) => i.sourceId === "email-thread-001");
    expect(found).toBeDefined();
  });

  it("skips duplicate interaction with same source_id (written=0, skipped=1)", async () => {
    const sourceId = `dedup-test-${Date.now()}`;
    const raw = makeRaw(contactId, { sourceId });

    // Write first time
    const first = await writeInteractions(userId, [raw]);
    expect(first.written).toBe(1);

    // Write again with same sourceId
    const second = await writeInteractions(userId, [raw]);
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it("writes interactions with different source_ids independently", async () => {
    const raw1 = makeRaw(contactId, { sourceId: `unique-src-${Date.now()}-a` });
    const raw2 = makeRaw(contactId, { sourceId: `unique-src-${Date.now()}-b` });

    const result = await writeInteractions(userId, [raw1, raw2]);
    expect(result.written).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("handles mixed batch of new and duplicate interactions", async () => {
    const existingSourceId = `existing-${Date.now()}`;
    const newSourceId = `new-${Date.now()}`;

    // Write the first one
    await writeInteractions(userId, [makeRaw(contactId, { sourceId: existingSourceId })]);

    // Now write a batch with one duplicate and one new
    const result = await writeInteractions(userId, [
      makeRaw(contactId, { sourceId: existingSourceId }), // duplicate
      makeRaw(contactId, { sourceId: newSourceId }),       // new
    ]);
    expect(result.written).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("dedup is per-user: different users use unique source_ids independently", async () => {
    const user2 = await createTestUser("srcdedup_u2");
    const contact2 = await createTestContact(user2.id);

    // Each user gets their own unique source_id (in practice, Superhuman/Granola UUIDs are unique)
    const sourceIdForUser1 = `user1-src-${Date.now()}-a`;
    const sourceIdForUser2 = `user2-src-${Date.now()}-b`;

    // Write for user 1
    const r1 = await writeInteractions(userId, [makeRaw(contactId, { sourceId: sourceIdForUser1 })]);
    expect(r1.written).toBe(1);

    // Re-write for user 1 — should be skipped
    const r1dup = await writeInteractions(userId, [makeRaw(contactId, { sourceId: sourceIdForUser1 })]);
    expect(r1dup.written).toBe(0);
    expect(r1dup.skipped).toBe(1);

    // Write for user 2 with their own unique source_id
    const r2 = await writeInteractions(user2.id, [makeRaw(contact2.id, { sourceId: sourceIdForUser2 })]);
    expect(r2.written).toBe(1);

    // Re-write for user 2 — should be skipped
    const r2dup = await writeInteractions(user2.id, [makeRaw(contact2.id, { sourceId: sourceIdForUser2 })]);
    expect(r2dup.written).toBe(0);
    expect(r2dup.skipped).toBe(1);
  });
});

// ── Calendar/Granola date dedup tests ─────────────────────────────────────────

describe("writeInteractions — Calendar/Granola date dedup", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("caldedup");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("writes a Granola meeting interaction", async () => {
    const raw = makeRaw(contactId, {
      channel: "meeting",
      direction: "mutual",
      sourceId: `granola-mtg-${Date.now()}`,
      occurredAt: new Date("2025-01-20T14:00:00Z"),
      summary: "Granola meeting summary",
      source: "granola",
    });
    const result = await writeInteractions(userId, [raw]);
    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("skips calendar event when Granola meeting exists for same contact on same date", async () => {
    const meetingDate = new Date("2025-01-22T15:00:00Z");
    const granolaSourceId = `granola-${Date.now()}`;
    const calendarSourceId = `gcal-${Date.now()}`;

    // Write Granola first
    await writeInteractions(userId, [
      makeRaw(contactId, {
        channel: "meeting",
        direction: "mutual",
        sourceId: granolaSourceId,
        occurredAt: meetingDate,
        summary: "Granola: Team sync",
        source: "granola",
      }),
    ]);

    // Try to write Calendar event on same date (source: 'calendar' triggers dedup)
    const calResult = await writeInteractions(userId, [
      makeRaw(contactId, {
        channel: "meeting",
        direction: "mutual",
        sourceId: calendarSourceId,
        occurredAt: new Date("2025-01-22T16:00:00Z"), // same date, different time
        summary: "Calendar: Team sync",
        source: "calendar",
      }),
    ]);

    expect(calResult.written).toBe(0);
    expect(calResult.skipped).toBe(1);
  });

  it("allows calendar event when Granola meeting is on different date", async () => {
    const granolaSourceId = `granola-diff-${Date.now()}`;
    const calendarSourceId = `gcal-diff-${Date.now()}`;

    // Write Granola on Jan 24
    await writeInteractions(userId, [
      makeRaw(contactId, {
        channel: "meeting",
        direction: "mutual",
        sourceId: granolaSourceId,
        occurredAt: new Date("2025-01-24T14:00:00Z"),
        summary: "Granola: Monday sync",
        source: "granola",
      }),
    ]);

    // Write Calendar on Jan 25 — different date, should be allowed
    const calResult = await writeInteractions(userId, [
      makeRaw(contactId, {
        channel: "meeting",
        direction: "mutual",
        sourceId: calendarSourceId,
        occurredAt: new Date("2025-01-25T14:00:00Z"),
        summary: "Calendar: Tuesday meeting",
        source: "calendar",
      }),
    ]);

    expect(calResult.written).toBe(1);
    expect(calResult.skipped).toBe(0);
  });

  it("allows calendar events for different contacts on the same date", async () => {
    const user = await createTestUser("caldedup_c2");
    const contact2 = await createTestContact(user.id, "Contact 2");
    const contact3 = await createTestContact(user.id, "Contact 3");

    const meetingDate = "2025-01-26";
    const granolaSourceId = `granola-c2-${Date.now()}`;
    const calendarSourceId = `gcal-c3-${Date.now()}`;

    // Write Granola for contact2 on the date
    await writeInteractions(user.id, [
      makeRaw(contact2.id, {
        channel: "meeting",
        direction: "mutual",
        sourceId: granolaSourceId,
        occurredAt: new Date(`${meetingDate}T14:00:00Z`),
        summary: "Granola: contact2 meeting",
        source: "granola",
      }),
    ]);

    // Calendar event for contact3 on same date — different contact, should be allowed
    const calResult = await writeInteractions(user.id, [
      makeRaw(contact3.id, {
        channel: "meeting",
        direction: "mutual",
        sourceId: calendarSourceId,
        occurredAt: new Date(`${meetingDate}T15:00:00Z`),
        summary: "Calendar: contact3 meeting",
        source: "calendar",
      }),
    ]);

    expect(calResult.written).toBe(1);
    expect(calResult.skipped).toBe(0);
  });
});

// ── Mapping correctness tests ─────────────────────────────────────────────────

describe("writeInteractions — mapping correctness", () => {
  let userId: string;
  let contactId: string;

  beforeAll(async () => {
    const user = await createTestUser("mapping");
    userId = user.id;
    const contact = await createTestContact(userId);
    contactId = contact.id;
  });

  it("maps channel correctly for Superhuman (email)", async () => {
    const sourceId = `email-map-${Date.now()}`;
    const raw: RawInteraction = {
      contactId,
      channel: "email",
      direction: "outbound",
      occurredAt: new Date("2025-02-01T10:00:00Z"),
      sourceId,
      summary: "Re: Partnership Intro | Snippet text here",
    };

    await writeInteractions(userId, [raw]);
    const saved = await getUserInteractions(userId, contactId);
    const found = saved.find((i) => i.sourceId === sourceId);

    expect(found).toBeDefined();
    expect(found!.channel).toBe("email");
    expect(found!.direction).toBe("outbound");
    expect(found!.sourceId).toBe(sourceId);
    expect(found!.summary).toBe("Re: Partnership Intro | Snippet text here");
  });

  it("maps channel correctly for Granola (meeting/mutual)", async () => {
    const sourceId = `granola-map-${Date.now()}`;
    const raw: RawInteraction = {
      contactId,
      channel: "meeting",
      direction: "mutual",
      occurredAt: new Date("2025-02-05T09:00:00Z"),
      sourceId,
      summary: "Quarterly review meeting — discussed roadmap and next steps",
    };

    await writeInteractions(userId, [raw]);
    const saved = await getUserInteractions(userId, contactId);
    const found = saved.find((i) => i.sourceId === sourceId);

    expect(found).toBeDefined();
    expect(found!.channel).toBe("meeting");
    expect(found!.direction).toBe("mutual");
    expect(found!.sourceId).toBe(sourceId);
    expect(found!.summary).toContain("Quarterly review");
  });

  it("maps channel correctly for Calendar (meeting/mutual)", async () => {
    const sourceId = `gcal-map-${Date.now()}`;
    const raw: RawInteraction = {
      contactId,
      channel: "meeting",
      direction: "mutual",
      occurredAt: new Date("2025-02-10T14:00:00Z"),
      sourceId,
      summary: "Design Review",
    };

    await writeInteractions(userId, [raw]);
    const saved = await getUserInteractions(userId, contactId);
    const found = saved.find((i) => i.sourceId === sourceId);

    expect(found).toBeDefined();
    expect(found!.channel).toBe("meeting");
    expect(found!.direction).toBe("mutual");
    expect(found!.sourceId).toBe(sourceId);
    expect(found!.summary).toBe("Design Review");
  });

  it("stores openThreads field when provided", async () => {
    const sourceId = `thread-map-${Date.now()}`;
    const raw: RawInteraction = {
      contactId,
      channel: "email",
      direction: "inbound",
      occurredAt: new Date("2025-02-15T12:00:00Z"),
      sourceId,
      summary: "Follow up on proposal",
      openThreads: "Waiting for budget approval decision",
    };

    await writeInteractions(userId, [raw]);
    const saved = await getUserInteractions(userId, contactId);
    const found = saved.find((i) => i.sourceId === sourceId);

    expect(found).toBeDefined();
    expect(found!.openThreads).toBe("Waiting for budget approval decision");
  });

  it("stores rawContent field when provided", async () => {
    const sourceId = `raw-map-${Date.now()}`;
    const raw: RawInteraction = {
      contactId,
      channel: "email",
      direction: "outbound",
      occurredAt: new Date("2025-02-20T08:00:00Z"),
      sourceId,
      summary: "Intro email",
      rawContent: "Hi there, I wanted to reach out about...",
    };

    await writeInteractions(userId, [raw]);
    const saved = await getUserInteractions(userId, contactId);
    const found = saved.find((i) => i.sourceId === sourceId);

    expect(found).toBeDefined();
    expect(found!.rawContent).toBe("Hi there, I wanted to reach out about...");
  });

  it("stores inbound direction correctly", async () => {
    const sourceId = `inbound-map-${Date.now()}`;
    const raw: RawInteraction = {
      contactId,
      channel: "email",
      direction: "inbound",
      occurredAt: new Date("2025-02-25T11:00:00Z"),
      sourceId,
      summary: "Reply from contact",
    };

    await writeInteractions(userId, [raw]);
    const saved = await getUserInteractions(userId, contactId);
    const found = saved.find((i) => i.sourceId === sourceId);

    expect(found).toBeDefined();
    expect(found!.direction).toBe("inbound");
  });
});

// ── Empty batch ───────────────────────────────────────────────────────────────

describe("writeInteractions — edge cases", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser("edge");
    userId = user.id;
  });

  it("handles empty batch gracefully", async () => {
    const result = await writeInteractions(userId, []);
    expect(result.written).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
