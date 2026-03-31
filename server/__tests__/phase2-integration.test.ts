/**
 * Phase 2 Integration Tests — Actions API end-to-end flows.
 *
 * These tests verify the full integration between the storage layer, API routes,
 * and HTTP responses, focusing on real user scenarios:
 *
 * - Create actions in DB via storage, verify GET /api/actions returns them
 * - Dismiss action via PATCH, verify removed from GET pending list
 * - Snooze action via PATCH, verify removed from pending, snoozed_until set
 * - POST /api/sync returns valid response shape
 * - Filter: create mixed actions, verify ?type=follow_up returns only follow_ups
 * - Full flow: create contact → create interaction → create action → dismiss → verify
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import http from "http";
import { db, pool } from "../db";
import { users, contacts, actions, interactions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { passport, authRouter } from "../auth";
import { registerRoutes } from "../routes";
import { storage } from "../storage";

// ── Cleanup tracking ───────────────────────────────────────────────────────────

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

// ── Test helpers ───────────────────────────────────────────────────────────────

async function createTestUser(suffix = "") {
  const ts = Date.now();
  const [user] = await db
    .insert(users)
    .values({
      username: `p2_int_test_${suffix}_${ts}`,
      password: "hashed_test_password",
      email: `p2_int_${suffix}_${ts}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

async function createTestContact(userId: string, overrides: Partial<{ name: string; company: string }> = {}) {
  const ts = Date.now();
  const contact = await storage.createContact({
    name: overrides.name ?? `Integration Test Contact ${ts}`,
    company: overrides.company,
    userId,
  });
  testIds.contactIds.push(contact.id);
  return contact;
}

async function createTestAction(
  userId: string,
  contactId: string,
  overrides: Partial<{
    actionType: string;
    status: string;
    priority: number;
    reason: string;
    snoozedUntil: Date | null;
  }> = {},
) {
  const action = await storage.createAction({
    userId,
    contactId,
    actionType: overrides.actionType ?? "follow_up",
    status: overrides.status ?? "pending",
    priority: overrides.priority ?? 0,
    reason: overrides.reason ?? "Integration test reason",
    snoozedUntil: overrides.snoozedUntil ?? null,
  });
  testIds.actionIds.push(action.id);
  return action;
}

async function createTestInteraction(userId: string, contactId: string, overrides: Partial<{
  channel: string;
  direction: string;
  occurredAt: Date;
  sourceId: string;
}> = {}) {
  const interaction = await storage.createInteraction({
    userId,
    contactId,
    channel: overrides.channel ?? "email",
    direction: overrides.direction ?? "inbound",
    occurredAt: overrides.occurredAt ?? new Date(),
    sourceId: overrides.sourceId ?? null,
  });
  testIds.interactionIds.push(interaction.id);
  return interaction;
}

/**
 * Creates a full Express app using registerRoutes() so all /api/* routes are available.
 */
async function createFullApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: "changeme", resave: false, saveUninitialized: false }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  // Test-only route to bypass OAuth and establish a session
  app.post("/test/login", (req, res, next) => {
    req.login(req.body.user, (err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  app.use(authRouter);
  const server = http.createServer(app);
  await registerRoutes(server, app);
  return app;
}

// Helper: create authenticated supertest agent
async function createAuthenticatedAgent(
  app: express.Application,
  user: typeof users.$inferSelect,
) {
  const agent = request.agent(app);
  await agent.post("/test/login").send({ user }).expect(200);
  return agent;
}

// =============================================================================
// TEST 1: Create actions in DB, verify GET /api/actions returns them
// =============================================================================

describe("Integration: Create actions in DB, verify GET returns them", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;
  let testContact: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("get_verify");
    testContact = await createTestContact(testUser.id);
  });

  it("action created in DB appears in GET /api/actions response", async () => {
    const action = await createTestAction(testUser.id, testContact.id, {
      actionType: "follow_up",
      reason: "Test action for GET verification",
    });

    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent.get("/api/actions");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((a: { id: string }) => a.id === action.id);
    expect(found).toBeDefined();
    expect(found.actionType).toBe("follow_up");
    expect(found.reason).toBe("Test action for GET verification");
  });

  it("action includes userId in response", async () => {
    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent.get("/api/actions");

    expect(res.status).toBe(200);
    for (const action of res.body) {
      expect(action.userId).toBe(testUser.id);
    }
  });

  it("returns empty array when user has no actions", async () => {
    const emptyUser = await createTestUser("empty_user");
    const agent = await createAuthenticatedAgent(app, emptyUser);
    const res = await agent.get("/api/actions");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });
});

// =============================================================================
// TEST 2: Dismiss action via PATCH, verify removed from pending list
// =============================================================================

describe("Integration: Dismiss action via PATCH, verify removed from GET pending list", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;
  let testContact: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("dismiss_flow");
    testContact = await createTestContact(testUser.id);
  });

  it("dismissed action no longer appears in pending list", async () => {
    const action = await createTestAction(testUser.id, testContact.id, {
      actionType: "follow_up",
      status: "pending",
    });

    const agent = await createAuthenticatedAgent(app, testUser);

    // Verify it's in the pending list before dismissal
    const beforeRes = await agent.get("/api/actions?status=pending");
    expect(beforeRes.status).toBe(200);
    const beforeIds = beforeRes.body.map((a: { id: string }) => a.id);
    expect(beforeIds).toContain(action.id);

    // Dismiss the action
    const patchRes = await agent
      .patch(`/api/actions/${action.id}`)
      .send({ status: "dismissed" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("dismissed");
    expect(patchRes.body.completedAt).toBeTruthy();

    // Verify it's no longer in the pending list
    const afterRes = await agent.get("/api/actions?status=pending");
    expect(afterRes.status).toBe(200);
    const afterIds = afterRes.body.map((a: { id: string }) => a.id);
    expect(afterIds).not.toContain(action.id);
  });

  it("dismissed action appears in dismissed query", async () => {
    const action = await createTestAction(testUser.id, testContact.id, {
      actionType: "reconnect",
      status: "pending",
    });

    const agent = await createAuthenticatedAgent(app, testUser);
    await agent.patch(`/api/actions/${action.id}`).send({ status: "dismissed" });

    const dismissedRes = await agent.get("/api/actions?status=dismissed");
    expect(dismissedRes.status).toBe(200);
    const dismissedIds = dismissedRes.body.map((a: { id: string }) => a.id);
    expect(dismissedIds).toContain(action.id);
  });
});

// =============================================================================
// TEST 3: Snooze action via PATCH, verify removed from pending, snoozed_until set
// =============================================================================

describe("Integration: Snooze action via PATCH, verify snoozed_until set", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;
  let testContact: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("snooze_flow");
    testContact = await createTestContact(testUser.id);
  });

  it("snoozed action removed from pending list and snoozedUntil is set", async () => {
    const action = await createTestAction(testUser.id, testContact.id, {
      actionType: "open_thread",
      status: "pending",
    });

    const agent = await createAuthenticatedAgent(app, testUser);

    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // +1 day

    const patchRes = await agent
      .patch(`/api/actions/${action.id}`)
      .send({ status: "snoozed", snoozedUntil });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("snoozed");
    expect(patchRes.body.snoozedUntil).toBeTruthy();
    // Verify snoozedUntil is in the future
    expect(new Date(patchRes.body.snoozedUntil).getTime()).toBeGreaterThan(Date.now());

    // Verify not in pending list
    const pendingRes = await agent.get("/api/actions?status=pending");
    expect(pendingRes.status).toBe(200);
    const pendingIds = pendingRes.body.map((a: { id: string }) => a.id);
    expect(pendingIds).not.toContain(action.id);
  });

  it("snooze without snoozedUntil returns 400", async () => {
    const action = await createTestAction(testUser.id, testContact.id, {
      status: "pending",
    });

    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent
      .patch(`/api/actions/${action.id}`)
      .send({ status: "snoozed" });

    expect(res.status).toBe(400);
  });

  it("past-snoozed action resurfaces in pending list", async () => {
    // Create action with snoozedUntil in the past
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // -1 day
    const action = await createTestAction(testUser.id, testContact.id, {
      actionType: "reconnect",
      status: "snoozed",
      snoozedUntil: pastDate,
    });

    const agent = await createAuthenticatedAgent(app, testUser);
    const pendingRes = await agent.get("/api/actions?status=pending");
    expect(pendingRes.status).toBe(200);
    const pendingIds = pendingRes.body.map((a: { id: string }) => a.id);
    // Past-snoozed should be included
    expect(pendingIds).toContain(action.id);
  });
});

// =============================================================================
// TEST 4: POST /api/sync returns valid response shape
// =============================================================================

describe("Integration: POST /api/sync returns valid response shape", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("sync_shape");
  });

  it("returns 200 with newInteractions, newActions, errors fields", async () => {
    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent.post("/api/sync");

    expect(res.status).toBe(200);
    expect(typeof res.body.newInteractions).toBe("number");
    expect(typeof res.body.newActions).toBe("number");
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("TODO adapters return zero counts", async () => {
    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent.post("/api/sync");

    expect(res.status).toBe(200);
    expect(res.body.newInteractions).toBe(0);
    expect(res.body.newActions).toBe(0);
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app).post("/api/sync");
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// TEST 5: Filter by type — only follow_up actions returned
// =============================================================================

describe("Integration: Filter by type returns correct subset", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;
  let testContact: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("type_filter");
    testContact = await createTestContact(testUser.id);

    // Create actions of different types
    await createTestAction(testUser.id, testContact.id, { actionType: "follow_up" });
    await createTestAction(testUser.id, testContact.id, { actionType: "follow_up" });
    await createTestAction(testUser.id, testContact.id, { actionType: "reconnect" });
    await createTestAction(testUser.id, testContact.id, { actionType: "open_thread" });
    await createTestAction(testUser.id, testContact.id, { actionType: "new_contact" });
  });

  it("?type=follow_up returns only follow_up actions", async () => {
    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent.get("/api/actions?type=follow_up");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const action of res.body) {
      expect(action.actionType).toBe("follow_up");
    }
    // At least 2 follow_up actions exist
    const followUps = res.body.filter((a: { userId: string }) => a.userId === testUser.id);
    expect(followUps.length).toBeGreaterThanOrEqual(2);
  });

  it("?type=reconnect returns only reconnect actions", async () => {
    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent.get("/api/actions?type=reconnect");

    expect(res.status).toBe(200);
    for (const action of res.body) {
      expect(action.actionType).toBe("reconnect");
    }
  });

  it("?type=open_thread returns only open_thread actions", async () => {
    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent.get("/api/actions?type=open_thread");

    expect(res.status).toBe(200);
    for (const action of res.body) {
      expect(action.actionType).toBe("open_thread");
    }
  });

  it("?type=new_contact returns only new_contact actions", async () => {
    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent.get("/api/actions?type=new_contact");

    expect(res.status).toBe(200);
    for (const action of res.body) {
      expect(action.actionType).toBe("new_contact");
    }
  });

  it("unfiltered query returns all types for user", async () => {
    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent.get("/api/actions");

    expect(res.status).toBe(200);
    const types = new Set(
      res.body
        .filter((a: { userId: string }) => a.userId === testUser.id)
        .map((a: { actionType: string }) => a.actionType),
    );
    // All four types should be present for this user
    expect(types.has("follow_up")).toBe(true);
    expect(types.has("reconnect")).toBe(true);
    expect(types.has("open_thread")).toBe(true);
    expect(types.has("new_contact")).toBe(true);
  });
});

// =============================================================================
// TEST 6: Full flow — create contact → interaction → action → dismiss → verify
// =============================================================================

describe("Integration: Full flow — contact → interaction → action → dismiss", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("full_flow");
  });

  it("creates contact, interaction, action, dismisses and verifies persistence", async () => {
    // Step 1: Create a contact
    const contact = await createTestContact(testUser.id, {
      name: "Integration Test Person",
      company: "Test Corp",
    });

    // Step 2: Create an interaction for the contact
    const interaction = await createTestInteraction(testUser.id, contact.id, {
      channel: "email",
      direction: "inbound",
      occurredAt: new Date(),
    });

    // Step 3: Create an action linked to the interaction
    const action = await createTestAction(testUser.id, contact.id, {
      actionType: "follow_up",
      status: "pending",
      reason: "Full flow test action",
    });

    const agent = await createAuthenticatedAgent(app, testUser);

    // Step 4: Verify action appears in GET /api/actions
    const getRes = await agent.get("/api/actions");
    expect(getRes.status).toBe(200);
    const found = getRes.body.find((a: { id: string }) => a.id === action.id);
    expect(found).toBeDefined();
    expect(found.actionType).toBe("follow_up");
    expect(found.contactId).toBe(contact.id);

    // Step 5: Dismiss the action
    const dismissRes = await agent
      .patch(`/api/actions/${action.id}`)
      .send({ status: "dismissed" });
    expect(dismissRes.status).toBe(200);
    expect(dismissRes.body.status).toBe("dismissed");
    expect(dismissRes.body.completedAt).toBeTruthy();

    // Step 6: Verify action no longer appears in pending GET
    const afterRes = await agent.get("/api/actions?status=pending");
    expect(afterRes.status).toBe(200);
    const pendingIds = afterRes.body.map((a: { id: string }) => a.id);
    expect(pendingIds).not.toContain(action.id);

    // Clean up interaction (not tracked in testIds since created via storage directly)
    testIds.interactionIds.push(interaction.id);
  });

  it("completed action is excluded from pending list", async () => {
    const contact = await createTestContact(testUser.id);
    const action = await createTestAction(testUser.id, contact.id, {
      actionType: "reconnect",
      status: "pending",
    });

    const agent = await createAuthenticatedAgent(app, testUser);

    // Complete the action
    const completeRes = await agent
      .patch(`/api/actions/${action.id}`)
      .send({ status: "completed" });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.completedAt).toBeTruthy();

    // Verify not in pending list
    const pendingRes = await agent.get("/api/actions?status=pending");
    expect(pendingRes.status).toBe(200);
    const pendingIds = pendingRes.body.map((a: { id: string }) => a.id);
    expect(pendingIds).not.toContain(action.id);

    // Verify in completed list
    const completedRes = await agent.get("/api/actions?status=completed");
    expect(completedRes.status).toBe(200);
    const completedIds = completedRes.body.map((a: { id: string }) => a.id);
    expect(completedIds).toContain(action.id);
  });
});

// =============================================================================
// TEST 7: User isolation — user A cannot access user B's actions
// =============================================================================

describe("Integration: User isolation in full flow", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contactA: typeof contacts.$inferSelect;
  let contactB: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("iso_full_a");
    userB = await createTestUser("iso_full_b");
    contactA = await createTestContact(userA.id);
    contactB = await createTestContact(userB.id);
  });

  it("user A's GET /api/actions does not include user B's actions", async () => {
    const actionA = await createTestAction(userA.id, contactA.id, { reason: "User A action" });
    const actionB = await createTestAction(userB.id, contactB.id, { reason: "User B action" });

    const agentA = await createAuthenticatedAgent(app, userA);
    const res = await agentA.get("/api/actions");
    expect(res.status).toBe(200);

    const ids = res.body.map((a: { id: string }) => a.id);
    expect(ids).toContain(actionA.id);
    expect(ids).not.toContain(actionB.id);
  });

  it("user A cannot dismiss user B's action", async () => {
    const actionB = await createTestAction(userB.id, contactB.id, { reason: "B isolation test" });
    const agentA = await createAuthenticatedAgent(app, userA);
    const res = await agentA.patch(`/api/actions/${actionB.id}`).send({ status: "dismissed" });
    expect(res.status).toBe(404);
  });

  it("user A cannot snooze user B's action", async () => {
    const actionB = await createTestAction(userB.id, contactB.id, { reason: "B snooze test" });
    const agentA = await createAuthenticatedAgent(app, userA);
    const snoozedUntil = new Date(Date.now() + 86400000).toISOString();
    const res = await agentA
      .patch(`/api/actions/${actionB.id}`)
      .send({ status: "snoozed", snoozedUntil });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// TEST 8: Ordering — highest priority + newest first
// =============================================================================

describe("Integration: Actions ordered by priority DESC, createdAt DESC", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;
  let testContact: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("ordering");
    testContact = await createTestContact(testUser.id);

    // Create actions with different priorities
    await createTestAction(testUser.id, testContact.id, {
      actionType: "follow_up",
      priority: 1,
      reason: "Low priority",
    });
    await createTestAction(testUser.id, testContact.id, {
      actionType: "reconnect",
      priority: 3,
      reason: "High priority",
    });
    await createTestAction(testUser.id, testContact.id, {
      actionType: "open_thread",
      priority: 2,
      reason: "Medium priority",
    });
  });

  it("returns actions ordered by priority DESC", async () => {
    const agent = await createAuthenticatedAgent(app, testUser);
    const res = await agent.get("/api/actions");
    expect(res.status).toBe(200);

    // Filter to this user's actions
    const userActions = res.body.filter(
      (a: { userId: string }) => a.userId === testUser.id,
    );
    // Verify priorities are non-increasing
    for (let i = 1; i < userActions.length; i++) {
      expect(userActions[i].priority).toBeLessThanOrEqual(userActions[i - 1].priority);
    }
  });
});
