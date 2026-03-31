/**
 * Phase 2 Sync Plumbing Tests — comprehensive acceptance coverage.
 *
 * All 7 required acceptance criteria are asserted:
 *
 * 1. First sync uses 90-day window.
 * 2. Subsequent sync uses incremental start from earliest non-null lastSyncedAt.
 * 3. Non-empty adapter outputs produce:
 *    - newInteractions > 0
 *    - expected persisted interactions
 *    - newActions behavior for at least one detector scenario
 * 4. lastSyncedAt updates only for contacts with newly written interactions.
 * 5. Partial failure:
 *    - one adapter throws
 *    - others succeed
 *    - sync returns partial counts and populated errors[]
 * 6. Idempotency:
 *    - second sync with same adapter payload does not duplicate interactions/actions.
 * 7. Multi-user safety:
 *    - two users can persist same (channel, source_id) with user-scoped unique index.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import { users, contacts, actions, interactions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import {
  computeSyncWindow,
  runSync,
  runSyncWithDeps,
  type RunSyncDeps,
} from "../agent/index";
import { writeInteractions, type RawInteraction } from "../agent/services/interactionWriter";
import { mapEmailToInteraction } from "../agent/adapters/superhuman";
import { mapMeetingToInteraction, computeTimeRange } from "../agent/adapters/granola";
import { mapEventToInteraction } from "../agent/adapters/calendar";
import type { SuperhumanEmail, GranolaMeeting, CalendarEvent } from "@shared/types/mcp";

// ── Cleanup tracking ──────────────────────────────────────────────────────────

const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  actionIds: [] as string[],
  interactionIds: [] as string[],
};

afterAll(async () => {
  for (const id of testIds.interactionIds) {
    await db.delete(interactions).where(eq(interactions.id, id)).catch(() => {});
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createUser(suffix: string) {
  const ts = Date.now();
  const [user] = await db
    .insert(users)
    .values({
      username: `sync_test_${suffix}_${ts}`,
      password: "hashed",
      email: `sync_${suffix}_${ts}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

async function createContact(
  userId: string,
  overrides: Partial<{
    name: string;
    email: string;
    lastSyncedAt: Date | null;
    tier: string;
  }> = {},
) {
  const ts = Date.now();
  const contact = await storage.createContact({
    name: overrides.name ?? `Contact ${ts}`,
    email: overrides.email ?? `contact_${ts}@example.com`,
    userId,
  });
  if (overrides.lastSyncedAt !== undefined || overrides.tier) {
    const updateData: Record<string, unknown> = {};
    if (overrides.lastSyncedAt !== undefined) updateData.lastSyncedAt = overrides.lastSyncedAt;
    if (overrides.tier) updateData.tier = overrides.tier;
    await storage.updateContact(contact.id, userId, updateData);
  }
  testIds.contactIds.push(contact.id);
  return (await storage.getContact(contact.id, userId))!;
}

async function trackActions(userId: string) {
  const all = await storage.getActions(userId);
  for (const a of all) {
    if (!testIds.actionIds.includes(a.id)) testIds.actionIds.push(a.id);
  }
}

async function trackInteractions(userId: string) {
  const all = await storage.getInteractions(userId);
  for (const i of all) {
    if (!testIds.interactionIds.includes(i.id)) testIds.interactionIds.push(i.id);
  }
}

/** Build a no-op adapter set (all return empty). */
function emptyDeps(): RunSyncDeps {
  return {
    fetchAndMapEmails: async () => ({ interactions: [], errors: [] }),
    fetchAndMapMeetings: async () => ({ interactions: [], errors: [] }),
    fetchAndMapEvents: async () => ({ interactions: [], errors: [] }),
  };
}

/** Build deps that inject specific RawInteraction arrays per adapter. */
function mockDeps(opts: {
  emails?: RawInteraction[];
  meetings?: RawInteraction[];
  events?: RawInteraction[];
  emailError?: string;
  meetingError?: string;
  eventError?: string;
}): RunSyncDeps {
  return {
    fetchAndMapEmails: async () => ({
      interactions: opts.emails ?? [],
      errors: opts.emailError ? [opts.emailError] : [],
    }),
    fetchAndMapMeetings: async () => ({
      interactions: opts.meetings ?? [],
      errors: opts.meetingError ? [opts.meetingError] : [],
    }),
    fetchAndMapEvents: async () => ({
      interactions: opts.events ?? [],
      errors: opts.eventError ? [opts.eventError] : [],
    }),
  };
}

/** Build deps where one adapter throws an exception. */
function throwingDeps(opts: {
  throwOn: "emails" | "meetings" | "events";
  emails?: RawInteraction[];
  meetings?: RawInteraction[];
  events?: RawInteraction[];
}): RunSyncDeps {
  return {
    fetchAndMapEmails:
      opts.throwOn === "emails"
        ? async () => { throw new Error("Superhuman MCP unreachable"); }
        : async () => ({ interactions: opts.emails ?? [], errors: [] }),
    fetchAndMapMeetings:
      opts.throwOn === "meetings"
        ? async () => { throw new Error("Granola MCP unreachable"); }
        : async () => ({ interactions: opts.meetings ?? [], errors: [] }),
    fetchAndMapEvents:
      opts.throwOn === "events"
        ? async () => { throw new Error("Calendar MCP unreachable"); }
        : async () => ({ interactions: opts.events ?? [], errors: [] }),
  };
}

// =============================================================================
// CRITERION 1: First sync uses 90-day window
// =============================================================================

describe("Criterion 1: First sync uses 90-day window", () => {
  it("returns 90-day window when user has no contacts", async () => {
    const user = await createUser("c1_no_contacts");
    const { startDate, endDate } = await computeSyncWindow(user.id);
    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(90, 0);
  });

  it("returns 90-day window when all contacts have null lastSyncedAt", async () => {
    const user = await createUser("c1_null_sync");
    await createContact(user.id, { lastSyncedAt: null });
    await createContact(user.id, { lastSyncedAt: null });

    const { startDate, endDate } = await computeSyncWindow(user.id);
    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(90, 0);
  });
});

// =============================================================================
// CRITERION 2: Subsequent sync uses incremental start from earliest lastSyncedAt
// =============================================================================

describe("Criterion 2: Subsequent sync uses incremental window", () => {
  it("uses earliest lastSyncedAt across contacts", async () => {
    const user = await createUser("c2_incr");
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

    await createContact(user.id, { lastSyncedAt: threeDaysAgo });
    await createContact(user.id, { lastSyncedAt: oneDayAgo });

    const { startDate } = await computeSyncWindow(user.id);
    const diffMs = Math.abs(startDate.getTime() - threeDaysAgo.getTime());
    expect(diffMs).toBeLessThan(5000);
  });

  it("uses the one existing synced date when mixed with nulls", async () => {
    const user = await createUser("c2_mixed");
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

    await createContact(user.id, { lastSyncedAt: null });
    await createContact(user.id, { lastSyncedAt: oneDayAgo });

    const { startDate } = await computeSyncWindow(user.id);
    const diffMs = Math.abs(startDate.getTime() - oneDayAgo.getTime());
    expect(diffMs).toBeLessThan(5000);
  });
});

// =============================================================================
// CRITERION 3: Non-empty adapter outputs produce real interactions + actions
// =============================================================================

describe("Criterion 3: Non-empty adapter outputs produce interactions and actions", () => {
  it("inbound email produces interaction and follow_up action", async () => {
    const user = await createUser("c3_email");
    const contact = await createContact(user.id, { email: "alice@test.com" });
    const ts = Date.now();

    const deps = mockDeps({
      emails: [
        {
          contactId: contact.id,
          channel: "email",
          direction: "inbound",
          occurredAt: new Date(),
          sourceId: `thread-c3-${ts}`,
          summary: "Follow up on proposal",
          source: "superhuman",
        },
      ],
    });

    const result = await runSyncWithDeps(user.id, deps);
    await trackInteractions(user.id);
    await trackActions(user.id);

    expect(result.newInteractions).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Verify interaction persisted in DB
    const userInteractions = await storage.getInteractions(user.id);
    const written = userInteractions.find((i) => i.sourceId === `thread-c3-${ts}`);
    expect(written).toBeDefined();
    expect(written!.channel).toBe("email");
    expect(written!.direction).toBe("inbound");
    expect(written!.contactId).toBe(contact.id);

    // Inbound email with no outbound → follow_up action should be detected.
    // runSyncWithDeps identifies newly written interactions by their IDs
    // (not by time-window filtering) and passes them to actionDetector.
    expect(result.newActions).toBeGreaterThanOrEqual(1);
    const userActions = await storage.getActions(user.id, { status: "pending" });
    const followUp = userActions.find(
      (a) => a.contactId === contact.id && a.actionType === "follow_up",
    );
    expect(followUp).toBeDefined();
  });

  it("meeting from granola produces interaction and counts correctly", async () => {
    const user = await createUser("c3_meeting");
    const contact = await createContact(user.id, { email: "vince@langchain.dev" });
    const ts = Date.now();

    const deps = mockDeps({
      meetings: [
        {
          contactId: contact.id,
          channel: "meeting",
          direction: "mutual",
          occurredAt: new Date(),
          sourceId: `granola-mtg-${ts}`,
          summary: "Sprint planning with Vince",
          source: "granola",
        },
      ],
    });

    const result = await runSyncWithDeps(user.id, deps);
    await trackInteractions(user.id);
    await trackActions(user.id);

    expect(result.newInteractions).toBe(1);

    const userInteractions = await storage.getInteractions(user.id);
    const written = userInteractions.find((i) => i.sourceId === `granola-mtg-${ts}`);
    expect(written).toBeDefined();
    expect(written!.channel).toBe("meeting");
    expect(written!.direction).toBe("mutual");
  });

  it("multiple adapters produce combined interaction count", async () => {
    const user = await createUser("c3_multi");
    const contact = await createContact(user.id, { email: "multi@test.com" });
    const ts = Date.now();

    const deps = mockDeps({
      emails: [
        {
          contactId: contact.id,
          channel: "email",
          direction: "inbound",
          occurredAt: new Date(),
          sourceId: `email-c3m-${ts}`,
          summary: "Email from multi",
          source: "superhuman",
        },
      ],
      meetings: [
        {
          contactId: contact.id,
          channel: "meeting",
          direction: "mutual",
          occurredAt: new Date(Date.now() - 86400000),
          sourceId: `meeting-c3m-${ts}`,
          summary: "Meeting with multi",
          source: "granola",
        },
      ],
      events: [
        {
          contactId: contact.id,
          channel: "meeting",
          direction: "mutual",
          occurredAt: new Date(Date.now() - 2 * 86400000),
          sourceId: `event-c3m-${ts}`,
          summary: "Calendar event with multi",
          source: "calendar",
        },
      ],
    });

    const result = await runSyncWithDeps(user.id, deps);
    await trackInteractions(user.id);
    await trackActions(user.id);

    expect(result.newInteractions).toBe(3);
  });
});

// =============================================================================
// CRITERION 4: lastSyncedAt updates only for contacts with newly written interactions
// =============================================================================

describe("Criterion 4: lastSyncedAt updates only for contacts with newly written interactions", () => {
  it("updates lastSyncedAt on contact that had interaction written", async () => {
    const user = await createUser("c4_update");
    const contactA = await createContact(user.id, { name: "Written Contact", lastSyncedAt: null });
    const contactB = await createContact(user.id, { name: "Untouched Contact", lastSyncedAt: null });
    const ts = Date.now();

    const deps = mockDeps({
      emails: [
        {
          contactId: contactA.id,
          channel: "email",
          direction: "inbound",
          occurredAt: new Date(),
          sourceId: `c4-${ts}`,
          summary: "Test",
          source: "superhuman",
        },
      ],
    });

    const result = await runSyncWithDeps(user.id, deps);
    await trackInteractions(user.id);
    await trackActions(user.id);

    expect(result.newInteractions).toBe(1);

    // contactA should now have lastSyncedAt set
    const refreshedA = await storage.getContact(contactA.id, user.id);
    expect(refreshedA!.lastSyncedAt).not.toBeNull();

    // contactB should still have null lastSyncedAt
    const refreshedB = await storage.getContact(contactB.id, user.id);
    expect(refreshedB!.lastSyncedAt).toBeNull();
  });

  it("does NOT update lastSyncedAt when all interactions are deduped (zero writes)", async () => {
    const user = await createUser("c4_nodedup");
    const contact = await createContact(user.id, { name: "Dedup Contact", lastSyncedAt: null });
    const ts = Date.now();
    const sourceId = `c4-nodedup-${ts}`;

    // First sync writes the interaction
    const deps1 = mockDeps({
      emails: [
        {
          contactId: contact.id,
          channel: "email",
          direction: "outbound",
          occurredAt: new Date(),
          sourceId,
          summary: "Original",
          source: "superhuman",
        },
      ],
    });
    await runSyncWithDeps(user.id, deps1);
    await trackInteractions(user.id);
    await trackActions(user.id);

    // Record the lastSyncedAt after first sync
    const afterFirst = await storage.getContact(contact.id, user.id);
    const firstSyncedAt = afterFirst!.lastSyncedAt;
    expect(firstSyncedAt).not.toBeNull();

    // Small delay so timestamps would differ
    await new Promise((r) => setTimeout(r, 50));

    // Second sync with same sourceId — all deduped, zero writes
    const result2 = await runSyncWithDeps(user.id, deps1);
    expect(result2.newInteractions).toBe(0);

    // lastSyncedAt should NOT have been updated
    const afterSecond = await storage.getContact(contact.id, user.id);
    expect(afterSecond!.lastSyncedAt!.getTime()).toBe(firstSyncedAt!.getTime());
  });
});

// =============================================================================
// CRITERION 5: Partial failure — one adapter errors, others succeed
// =============================================================================

describe("Criterion 5: Partial failure — one adapter throws, others succeed", () => {
  it("email adapter throws, meeting adapter succeeds — partial counts + errors", async () => {
    const user = await createUser("c5_partial");
    const contact = await createContact(user.id, { email: "partial@test.com" });
    const ts = Date.now();

    const deps = throwingDeps({
      throwOn: "emails",
      meetings: [
        {
          contactId: contact.id,
          channel: "meeting",
          direction: "mutual",
          occurredAt: new Date(),
          sourceId: `mtg-c5-${ts}`,
          summary: "Meeting despite email failure",
          source: "granola",
        },
      ],
    });

    const result = await runSyncWithDeps(user.id, deps);
    await trackInteractions(user.id);
    await trackActions(user.id);

    // Meeting adapter succeeded → 1 interaction written
    expect(result.newInteractions).toBe(1);

    // Email adapter threw → error surfaced (wrapped by runSyncWithDeps)
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const emailError = result.errors.find((e) => e.includes("Superhuman") && e.includes("unreachable"));
    expect(emailError).toBeDefined();

    // Verify meeting interaction actually persisted
    const ints = await storage.getInteractions(user.id);
    const written = ints.find((i) => i.sourceId === `mtg-c5-${ts}`);
    expect(written).toBeDefined();
  });

  it("meeting adapter throws, email+calendar succeed — two interactions written", async () => {
    const user = await createUser("c5_partial2");
    const contact = await createContact(user.id, { email: "partial2@test.com" });
    const ts = Date.now();

    const deps = throwingDeps({
      throwOn: "meetings",
      emails: [
        {
          contactId: contact.id,
          channel: "email",
          direction: "inbound",
          occurredAt: new Date(),
          sourceId: `email-c5b-${ts}`,
          summary: "Email ok",
          source: "superhuman",
        },
      ],
      events: [
        {
          contactId: contact.id,
          channel: "meeting",
          direction: "mutual",
          occurredAt: new Date(Date.now() - 86400000),
          sourceId: `cal-c5b-${ts}`,
          summary: "Calendar ok",
          source: "calendar",
        },
      ],
    });

    const result = await runSyncWithDeps(user.id, deps);
    await trackInteractions(user.id);
    await trackActions(user.id);

    expect(result.newInteractions).toBe(2);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.includes("Granola") && e.includes("unreachable"))).toBe(true);
  });

  it("adapter returning error string (not throwing) is included in errors[]", async () => {
    const user = await createUser("c5_errmsg");

    const deps = mockDeps({
      emailError: "Superhuman auth expired",
    });

    const result = await runSyncWithDeps(user.id, deps);
    expect(result.errors).toContain("Superhuman auth expired");
    expect(result.newInteractions).toBe(0);
  });
});

// =============================================================================
// CRITERION 6: Idempotency — second sync with same payload does not duplicate
// =============================================================================

describe("Criterion 6: Idempotency on repeated sync", () => {
  it("second sync with same adapter payload produces zero new interactions", async () => {
    const user = await createUser("c6_idem");
    const contact = await createContact(user.id, { email: "idem@test.com" });
    const ts = Date.now();

    const deps = mockDeps({
      emails: [
        {
          contactId: contact.id,
          channel: "email",
          direction: "inbound",
          occurredAt: new Date(),
          sourceId: `idem-${ts}`,
          summary: "First sync",
          source: "superhuman",
        },
      ],
    });

    const r1 = await runSyncWithDeps(user.id, deps);
    await trackInteractions(user.id);
    await trackActions(user.id);
    expect(r1.newInteractions).toBe(1);

    // Second sync — same payload
    const r2 = await runSyncWithDeps(user.id, deps);
    expect(r2.newInteractions).toBe(0);

    // Verify DB row count did not increase
    const allInts = await storage.getInteractions(user.id);
    const matchingInts = allInts.filter((i) => i.sourceId === `idem-${ts}`);
    expect(matchingInts.length).toBe(1);
  });

  it("second sync does not create duplicate actions", async () => {
    const user = await createUser("c6_idem_act");
    const contact = await createContact(user.id, { email: "idemact@test.com" });
    const ts = Date.now();

    const deps = mockDeps({
      emails: [
        {
          contactId: contact.id,
          channel: "email",
          direction: "inbound",
          occurredAt: new Date(),
          sourceId: `idemact-${ts}`,
          summary: "Inbound",
          source: "superhuman",
        },
      ],
    });

    const r1 = await runSyncWithDeps(user.id, deps);
    await trackInteractions(user.id);
    await trackActions(user.id);
    expect(r1.newActions).toBeGreaterThanOrEqual(1);

    const r2 = await runSyncWithDeps(user.id, deps);
    // No new interactions written → no new actions created
    expect(r2.newActions).toBe(0);

    // Verify single follow_up action exists
    const userActions = await storage.getActions(user.id, { status: "pending" });
    const followUps = userActions.filter(
      (a) => a.contactId === contact.id && a.actionType === "follow_up",
    );
    expect(followUps.length).toBe(1);
  });

  it("third sync of same data still idempotent", async () => {
    const user = await createUser("c6_third");
    const contact = await createContact(user.id, { email: "third@test.com" });
    const ts = Date.now();

    const deps = mockDeps({
      meetings: [
        {
          contactId: contact.id,
          channel: "meeting",
          direction: "mutual",
          occurredAt: new Date(),
          sourceId: `third-${ts}`,
          summary: "Meeting",
          source: "granola",
        },
      ],
    });

    await runSyncWithDeps(user.id, deps);
    await runSyncWithDeps(user.id, deps);
    const r3 = await runSyncWithDeps(user.id, deps);
    await trackInteractions(user.id);
    await trackActions(user.id);

    expect(r3.newInteractions).toBe(0);
    expect(r3.newActions).toBe(0);
  });
});

// =============================================================================
// CRITERION 7: Multi-user safety — same source_id for different users
// =============================================================================

describe("Criterion 7: Multi-user dedup safety (user-scoped unique index)", () => {
  it("two users can persist interactions with the same (channel, source_id)", async () => {
    const userA = await createUser("c7_a");
    const userB = await createUser("c7_b");
    const contactA = await createContact(userA.id, { name: "ContactA" });
    const contactB = await createContact(userB.id, { name: "ContactB" });
    const sharedSourceId = `shared-thread-c7-${Date.now()}`;

    const intA = await storage.createInteraction({
      userId: userA.id,
      contactId: contactA.id,
      channel: "email",
      direction: "inbound",
      occurredAt: new Date(),
      sourceId: sharedSourceId,
    });
    testIds.interactionIds.push(intA.id);

    const intB = await storage.createInteraction({
      userId: userB.id,
      contactId: contactB.id,
      channel: "email",
      direction: "inbound",
      occurredAt: new Date(),
      sourceId: sharedSourceId,
    });
    testIds.interactionIds.push(intB.id);

    expect(intA.id).toBeDefined();
    expect(intB.id).toBeDefined();
    expect(intA.id).not.toBe(intB.id);
  });

  it("same user still blocked from duplicate (channel, source_id)", async () => {
    const user = await createUser("c7_dup");
    const contact = await createContact(user.id);
    const sourceId = `c7-dup-${Date.now()}`;

    const int1 = await storage.createInteraction({
      userId: user.id,
      contactId: contact.id,
      channel: "email",
      direction: "inbound",
      occurredAt: new Date(),
      sourceId,
    });
    testIds.interactionIds.push(int1.id);

    await expect(
      storage.createInteraction({
        userId: user.id,
        contactId: contact.id,
        channel: "email",
        direction: "outbound",
        occurredAt: new Date(),
        sourceId,
      }),
    ).rejects.toThrow();
  });

  it("two users running runSyncWithDeps with same source_ids both succeed", async () => {
    const userA = await createUser("c7_syncA");
    const userB = await createUser("c7_syncB");
    const contactA = await createContact(userA.id, { email: "shared@test.com" });
    const contactB = await createContact(userB.id, { email: "shared@test.com" });
    const ts = Date.now();
    const sharedSourceId = `sync-shared-${ts}`;

    const depsA = mockDeps({
      emails: [
        {
          contactId: contactA.id,
          channel: "email",
          direction: "inbound",
          occurredAt: new Date(),
          sourceId: sharedSourceId,
          summary: "User A email",
          source: "superhuman",
        },
      ],
    });

    const depsB = mockDeps({
      emails: [
        {
          contactId: contactB.id,
          channel: "email",
          direction: "inbound",
          occurredAt: new Date(),
          sourceId: sharedSourceId,
          summary: "User B email",
          source: "superhuman",
        },
      ],
    });

    const rA = await runSyncWithDeps(userA.id, depsA);
    const rB = await runSyncWithDeps(userB.id, depsB);
    await trackInteractions(userA.id);
    await trackInteractions(userB.id);
    await trackActions(userA.id);
    await trackActions(userB.id);

    expect(rA.newInteractions).toBe(1);
    expect(rB.newInteractions).toBe(1);
    expect(rA.errors.length).toBe(0);
    expect(rB.errors.length).toBe(0);
  });
});

// =============================================================================
// Additional: Adapter mapping unit tests
// =============================================================================

describe("Adapter mapping functions", () => {
  const mockEmail: SuperhumanEmail = {
    messageId: "msg-1",
    threadId: "thread-abc",
    from: "alice@example.com",
    to: ["brian@nd.edu"],
    cc: [],
    subject: "Follow up on our meeting",
    date: "2026-03-25T10:00:00Z",
    snippet: "Great talking to you yesterday.",
    hasAttachments: false,
  };

  it("mapEmailToInteraction: inbound direction when from != user", () => {
    const r = mapEmailToInteraction(mockEmail, "c1", "brian@nd.edu");
    expect(r.direction).toBe("inbound");
    expect(r.channel).toBe("email");
    expect(r.sourceId).toBe("thread-abc");
    expect(r.source).toBe("superhuman");
  });

  it("mapEmailToInteraction: outbound direction when from == user", () => {
    const out = { ...mockEmail, from: "brian@nd.edu", to: ["alice@example.com"] };
    expect(mapEmailToInteraction(out, "c1", "brian@nd.edu").direction).toBe("outbound");
  });

  it("mapEmailToInteraction: summary truncated to 200 chars", () => {
    const long = { ...mockEmail, snippet: "x".repeat(300) };
    expect(mapEmailToInteraction(long, "c1", "brian@nd.edu").summary.length).toBeLessThanOrEqual(200);
  });

  it("mapMeetingToInteraction: mutual direction, granola source", () => {
    const meeting: GranolaMeeting = {
      id: "mtg-1", title: "Standup", date: "2026-03-25",
      knownParticipants: ["a@b.com"], summary: "Discussed things",
    };
    const r = mapMeetingToInteraction(meeting, "c1");
    expect(r.direction).toBe("mutual");
    expect(r.source).toBe("granola");
    expect(r.sourceId).toBe("mtg-1");
  });

  it("mapMeetingToInteraction: summary truncated to 500 chars", () => {
    const long: GranolaMeeting = {
      id: "mtg-2", title: "T", date: "2026-03-25",
      knownParticipants: [], summary: "y".repeat(600),
    };
    expect(mapMeetingToInteraction(long, "c1").summary.length).toBeLessThanOrEqual(500);
  });

  it("mapEventToInteraction: mutual direction, calendar source", () => {
    const event: CalendarEvent = {
      eventId: "evt-1", title: "Coffee", start: "2026-03-25T14:00:00Z",
      end: "2026-03-25T15:00:00Z", attendees: ["a@b.com"], description: null,
    };
    const r = mapEventToInteraction(event, "c1");
    expect(r.direction).toBe("mutual");
    expect(r.source).toBe("calendar");
    expect(r.sourceId).toBe("evt-1");
    expect(r.summary).toBe("Coffee");
  });
});

describe("computeTimeRange", () => {
  it("this_week for 3 days ago", () => {
    expect(computeTimeRange(new Date(Date.now() - 3 * 86400000))).toBe("this_week");
  });
  it("last_week for 10 days ago", () => {
    expect(computeTimeRange(new Date(Date.now() - 10 * 86400000))).toBe("last_week");
  });
  it("last_30_days for 20 days ago", () => {
    expect(computeTimeRange(new Date(Date.now() - 20 * 86400000))).toBe("last_30_days");
  });
});

describe("writeInteractions returns writtenContactIds", () => {
  it("includes only contactIds with actually written interactions", async () => {
    const user = await createUser("wr_cids");
    const cA = await createContact(user.id, { name: "WrA" });
    const cB = await createContact(user.id, { name: "WrB" });
    const ts = Date.now();

    // Write for contactA
    const r1 = await writeInteractions(user.id, [
      {
        contactId: cA.id,
        channel: "email",
        direction: "inbound",
        occurredAt: new Date(),
        sourceId: `wr-a-${ts}`,
        summary: "a",
      },
    ]);
    expect(r1.writtenContactIds).toContain(cA.id);
    expect(r1.writtenContactIds).not.toContain(cB.id);
    await trackInteractions(user.id);
  });

  it("returns empty writtenContactIds when all deduped", async () => {
    const user = await createUser("wr_empty");
    const c = await createContact(user.id, { name: "WrE" });
    const ts = Date.now();
    const sid = `wr-e-${ts}`;

    await writeInteractions(user.id, [
      { contactId: c.id, channel: "email", direction: "inbound", occurredAt: new Date(), sourceId: sid, summary: "x" },
    ]);
    const r2 = await writeInteractions(user.id, [
      { contactId: c.id, channel: "email", direction: "inbound", occurredAt: new Date(), sourceId: sid, summary: "x" },
    ]);
    expect(r2.writtenContactIds).toHaveLength(0);
    expect(r2.written).toBe(0);
    await trackInteractions(user.id);
  });
});

describe("getActionWithContact", () => {
  it("returns action with joined contact fields", async () => {
    const user = await createUser("awc");
    const contact = await createContact(user.id, { name: "Alice Test", email: "alice@test.com" });
    await storage.updateContact(contact.id, user.id, { company: "Test Corp" });

    const action = await storage.createAction({
      userId: user.id,
      contactId: contact.id,
      actionType: "follow_up",
      status: "pending",
      priority: 1,
      reason: "Test reason",
      snoozedUntil: null,
    });
    testIds.actionIds.push(action.id);

    const result = await storage.getActionWithContact(action.id, user.id);
    expect(result).toBeDefined();
    expect(result!.contactName).toBe("Alice Test");
    expect(result!.contactCompany).toBe("Test Corp");
    expect(result!.contactEmail).toBe("alice@test.com");
  });

  it("returns undefined for wrong user", async () => {
    const userA = await createUser("awc_a");
    const userB = await createUser("awc_b");
    const contact = await createContact(userA.id);
    const action = await storage.createAction({
      userId: userA.id,
      contactId: contact.id,
      actionType: "reconnect",
      status: "pending",
      priority: 0,
      reason: "Test isolation",
      snoozedUntil: null,
    });
    testIds.actionIds.push(action.id);
    expect(await storage.getActionWithContact(action.id, userB.id)).toBeUndefined();
  });
});
