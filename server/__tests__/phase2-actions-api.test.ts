/**
 * Phase 2 API route tests for actions and sync.
 *
 * Covers:
 * - Auth enforcement: GET/PATCH/DELETE /api/actions returns 401 without session
 * - Auth enforcement: POST /api/sync returns 401 without session
 * - GET /api/actions returns 200 with array (authenticated)
 * - GET /api/actions?status=pending returns only pending
 * - GET /api/actions?type=follow_up returns only follow_up
 * - GET /api/actions?limit=2&offset=0 returns correct page
 * - PATCH /api/actions/:id with {status:'completed'} returns 200, sets completed_at
 * - PATCH /api/actions/:id with {status:'dismissed'} returns 200, sets completed_at
 * - PATCH /api/actions/:id with {status:'snoozed', snoozedUntil:...} returns 200
 * - PATCH /api/actions/:id with {status:'snoozed'} without snoozedUntil returns 400
 * - PATCH /api/actions/:id with invalid status returns 400
 * - PATCH /api/actions/:id for other user returns 404
 * - POST /api/sync returns 200 with { newInteractions, newActions, errors }
 * - User isolation: user A's actions not visible to user B
 * - GET /api/actions with invalid status param returns 400
 * - GET /api/actions with invalid type param returns 400
 * - DELETE /api/actions/:id returns 200 on success
 * - DELETE /api/actions/:id returns 404 for other user
 * - GET /api/actions/:id returns 404 for other user
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import http from "http";
import { db, pool } from "../db";
import { users, contacts, actions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { passport, authRouter } from "../auth";
import { registerRoutes } from "../routes";
import { storage } from "../storage";

// ── Cleanup tracking ───────────────────────────────────────────────────────────

const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  actionIds: [] as string[],
};

afterAll(async () => {
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
      username: `act_api_test_${suffix}_${ts}`,
      password: "hashed_test_password",
      email: `act_api_${suffix}_${ts}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

async function createTestContact(userId: string) {
  const ts = Date.now();
  const contact = await storage.createContact({
    name: `Actions API Test Contact ${ts}`,
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
    reason: overrides.reason ?? "Test reason",
    snoozedUntil: overrides.snoozedUntil ?? null,
  });
  testIds.actionIds.push(action.id);
  return action;
}

/**
 * Creates a full Express app using registerRoutes() so all /api/* routes are available.
 * Used for testing /api/actions and /api/sync endpoints.
 */
async function createFullApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: "test-secret-actions-api", resave: false, saveUninitialized: false }),
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

// =============================================================================
// AUTH ENFORCEMENT
// =============================================================================

describe("Auth enforcement — /api/actions and /api/sync return 401 without session", () => {
  let app: express.Application;

  beforeAll(async () => {
    app = await createFullApp();
  });

  it("GET /api/actions returns 401 without session", async () => {
    const res = await request(app).get("/api/actions");
    expect(res.status).toBe(401);
  });

  it("GET /api/actions/:id returns 401 without session", async () => {
    const res = await request(app).get("/api/actions/some-id");
    expect(res.status).toBe(401);
  });

  it("PATCH /api/actions/:id returns 401 without session", async () => {
    const res = await request(app).patch("/api/actions/some-id").send({ status: "completed" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/actions/:id returns 401 without session", async () => {
    const res = await request(app).delete("/api/actions/some-id");
    expect(res.status).toBe(401);
  });

  it("POST /api/sync returns 401 without session", async () => {
    const res = await request(app).post("/api/sync");
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// GET /api/actions — list actions
// =============================================================================

describe("GET /api/actions — list actions (authenticated)", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;
  let testContact: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("get_list");
    testContact = await createTestContact(testUser.id);
    // Create 4 actions: 3 pending (2 follow_up, 1 reconnect), 1 completed
    await createTestAction(testUser.id, testContact.id, { actionType: "follow_up", status: "pending", priority: 2 });
    await createTestAction(testUser.id, testContact.id, { actionType: "follow_up", status: "pending", priority: 1 });
    await createTestAction(testUser.id, testContact.id, { actionType: "reconnect", status: "pending", priority: 0 });
    await createTestAction(testUser.id, testContact.id, { actionType: "open_thread", status: "completed", priority: 0 });
  });

  async function getAsUser(query = "") {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: testUser }).expect(200);
    return agent.get(`/api/actions${query}`);
  }

  it("returns 200 with JSON array", async () => {
    const res = await getAsUser();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns only the authenticated user's actions", async () => {
    const res = await getAsUser();
    expect(res.status).toBe(200);
    for (const action of res.body) {
      expect(action.userId).toBe(testUser.id);
    }
  });

  it("GET /api/actions?status=pending returns only pending", async () => {
    const res = await getAsUser("?status=pending");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const action of res.body) {
      // pending or snoozed with past snoozed_until (both included in pending)
      expect(["pending", "snoozed"].includes(action.status)).toBe(true);
    }
    // Should include 3 pending actions
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it("GET /api/actions?status=completed returns only completed", async () => {
    const res = await getAsUser("?status=completed");
    expect(res.status).toBe(200);
    for (const action of res.body) {
      expect(action.status).toBe("completed");
    }
  });

  it("GET /api/actions?type=follow_up returns only follow_up actions", async () => {
    const res = await getAsUser("?type=follow_up");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const action of res.body) {
      expect(action.actionType).toBe("follow_up");
    }
    // Should include at least the 2 follow_up actions created above
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /api/actions?limit=2&offset=0 returns at most 2 results", async () => {
    const res = await getAsUser("?limit=2&offset=0");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(2);
  });

  it("GET /api/actions?limit=2&offset=2 returns offset page", async () => {
    const [page1, page2] = await Promise.all([
      getAsUser("?limit=2&offset=0"),
      getAsUser("?limit=2&offset=2"),
    ]);
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    // Pages should not overlap (if there are enough actions)
    if (page1.body.length >= 2 && page2.body.length > 0) {
      const page1Ids = new Set(page1.body.map((a: { id: string }) => a.id));
      for (const action of page2.body) {
        expect(page1Ids.has(action.id)).toBe(false);
      }
    }
  });

  it("GET /api/actions with invalid status returns 400", async () => {
    const res = await getAsUser("?status=invalid_status");
    expect(res.status).toBe(400);
  });

  it("GET /api/actions with invalid type returns 400", async () => {
    const res = await getAsUser("?type=invalid_type");
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// GET /api/actions/:id — get single action
// =============================================================================

describe("GET /api/actions/:id", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contactA: typeof contacts.$inferSelect;
  let contactB: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("get_single_a");
    userB = await createTestUser("get_single_b");
    contactA = await createTestContact(userA.id);
    contactB = await createTestContact(userB.id);
  });

  it("returns 200 for own action", async () => {
    const action = await createTestAction(userA.id, contactA.id);
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);
    const res = await agent.get(`/api/actions/${action.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(action.id);
  });

  it("returns 404 for another user's action", async () => {
    const action = await createTestAction(userB.id, contactB.id);
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);
    const res = await agent.get(`/api/actions/${action.id}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent action", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);
    const res = await agent.get("/api/actions/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// PATCH /api/actions/:id — update action status
// =============================================================================

describe("PATCH /api/actions/:id — status transitions", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contactA: typeof contacts.$inferSelect;
  let contactB: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("patch_a");
    userB = await createTestUser("patch_b");
    contactA = await createTestContact(userA.id);
    contactB = await createTestContact(userB.id);
  });

  async function patchAsUser(actionId: string, body: Record<string, unknown>, user = userA) {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user }).expect(200);
    return agent.patch(`/api/actions/${actionId}`).send(body);
  }

  it("PATCH with {status:'completed'} returns 200 with updated action", async () => {
    const action = await createTestAction(userA.id, contactA.id, { status: "pending" });
    const res = await patchAsUser(action.id, { status: "completed" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });

  it("PATCH with {status:'completed'} sets completed_at", async () => {
    const action = await createTestAction(userA.id, contactA.id, { status: "pending" });
    const res = await patchAsUser(action.id, { status: "completed" });
    expect(res.status).toBe(200);
    expect(res.body.completedAt).toBeTruthy();
    // Verify completedAt is a valid timestamp
    expect(new Date(res.body.completedAt).getTime()).toBeGreaterThan(0);
  });

  it("PATCH with {status:'dismissed'} returns 200", async () => {
    const action = await createTestAction(userA.id, contactA.id, { status: "pending" });
    const res = await patchAsUser(action.id, { status: "dismissed" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("dismissed");
  });

  it("PATCH with {status:'dismissed'} sets completed_at", async () => {
    const action = await createTestAction(userA.id, contactA.id, { status: "pending" });
    const res = await patchAsUser(action.id, { status: "dismissed" });
    expect(res.status).toBe(200);
    expect(res.body.completedAt).toBeTruthy();
  });

  it("PATCH with {status:'snoozed', snoozedUntil:...} returns 200", async () => {
    const action = await createTestAction(userA.id, contactA.id, { status: "pending" });
    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // +1 day
    const res = await patchAsUser(action.id, { status: "snoozed", snoozedUntil });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("snoozed");
    expect(res.body.snoozedUntil).toBeTruthy();
  });

  it("PATCH with {status:'snoozed'} without snoozedUntil returns 400", async () => {
    const action = await createTestAction(userA.id, contactA.id, { status: "pending" });
    const res = await patchAsUser(action.id, { status: "snoozed" });
    expect(res.status).toBe(400);
  });

  it("PATCH with invalid status returns 400", async () => {
    const action = await createTestAction(userA.id, contactA.id, { status: "pending" });
    const res = await patchAsUser(action.id, { status: "invalid_status" });
    expect(res.status).toBe(400);
  });

  it("PATCH another user's action returns 404", async () => {
    const action = await createTestAction(userB.id, contactB.id, { status: "pending" });
    const res = await patchAsUser(action.id, { status: "completed" }, userA);
    expect(res.status).toBe(404);
  });

  it("PATCH non-existent action returns 404", async () => {
    const res = await patchAsUser("00000000-0000-0000-0000-000000000000", { status: "completed" });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// DELETE /api/actions/:id
// =============================================================================

describe("DELETE /api/actions/:id", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contactA: typeof contacts.$inferSelect;
  let contactB: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("delete_a");
    userB = await createTestUser("delete_b");
    contactA = await createTestContact(userA.id);
    contactB = await createTestContact(userB.id);
  });

  it("DELETE own action returns 200", async () => {
    const action = await createTestAction(userA.id, contactA.id);
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);
    const res = await agent.delete(`/api/actions/${action.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Remove from cleanup tracking since already deleted
    const idx = testIds.actionIds.indexOf(action.id);
    if (idx !== -1) testIds.actionIds.splice(idx, 1);
  });

  it("DELETE another user's action returns 404", async () => {
    const action = await createTestAction(userB.id, contactB.id);
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);
    const res = await agent.delete(`/api/actions/${action.id}`);
    expect(res.status).toBe(404);
  });

  it("DELETE non-existent action returns 404", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);
    const res = await agent.delete("/api/actions/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// POST /api/sync
// =============================================================================

describe("POST /api/sync", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("sync");
  });

  it("returns 200 with mock summary (authenticated)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: testUser }).expect(200);
    const res = await agent.post("/api/sync");
    expect(res.status).toBe(200);
    expect(typeof res.body.newInteractions).toBe("number");
    expect(typeof res.body.newActions).toBe("number");
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("returns correct shape with zero counts (TODO adapters return empty data)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: testUser }).expect(200);
    const res = await agent.post("/api/sync");
    expect(res.status).toBe(200);
    // TODO adapters return empty arrays, so counts should be 0
    // Errors may be non-empty if ANTHROPIC_API_KEY is unavailable in test env
    expect(res.body.newInteractions).toBe(0);
    expect(res.body.newActions).toBe(0);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});

// =============================================================================
// USER ISOLATION — user A cannot see user B's actions
// =============================================================================

describe("User isolation — user A cannot see user B's actions", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contactA: typeof contacts.$inferSelect;
  let contactB: typeof contacts.$inferSelect;
  let actionBId: string;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("iso_a");
    userB = await createTestUser("iso_b");
    contactA = await createTestContact(userA.id);
    contactB = await createTestContact(userB.id);

    // Create actions for both users
    await createTestAction(userA.id, contactA.id, { reason: "User A action" });
    const actionB = await createTestAction(userB.id, contactB.id, { reason: "User B action" });
    actionBId = actionB.id;
  });

  it("user A's GET /api/actions does not include user B's actions", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);
    const res = await agent.get("/api/actions");
    expect(res.status).toBe(200);
    const returnedIds = res.body.map((a: { id: string }) => a.id);
    expect(returnedIds).not.toContain(actionBId);
    for (const action of res.body) {
      expect(action.userId).toBe(userA.id);
    }
  });

  it("user A cannot PATCH user B's action (returns 404)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);
    const res = await agent.patch(`/api/actions/${actionBId}`).send({ status: "completed" });
    expect(res.status).toBe(404);
  });

  it("user A cannot DELETE user B's action (returns 404)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);
    const res = await agent.delete(`/api/actions/${actionBId}`);
    expect(res.status).toBe(404);
  });

  it("user A cannot GET user B's action by id (returns 404)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);
    const res = await agent.get(`/api/actions/${actionBId}`);
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// RESPONSE SHAPE — no internal errors exposed
// =============================================================================

describe("Error response hygiene — no stack traces in responses", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("err_shape");
  });

  it("404 response has no stack trace or SQL errors", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: testUser }).expect(200);
    const res = await agent.get("/api/actions/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("stack");
    expect(body).not.toContain("at Object.");
    expect(body).not.toContain("SQL");
  });

  it("400 response for invalid status has no stack trace", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: testUser }).expect(200);
    const res = await agent.get("/api/actions?status=bad_value");
    expect(res.status).toBe(400);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("stack");
    expect(body).not.toContain("at Object.");
  });
});

// =============================================================================
// PAGINATION PARAM VALIDATION — limit and offset
// =============================================================================

describe("GET /api/actions — pagination param validation", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    testUser = await createTestUser("pagination_val");
  });

  async function getAsUser(query: string) {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: testUser }).expect(200);
    return agent.get(`/api/actions${query}`);
  }

  it("limit=-1 returns 400", async () => {
    const res = await getAsUser("?limit=-1");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("limit=abc returns 400", async () => {
    const res = await getAsUser("?limit=abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("offset=-5 returns 400", async () => {
    const res = await getAsUser("?offset=-5");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("limit=200 is capped to 100 and returns 200", async () => {
    const res = await getAsUser("?limit=200");
    expect(res.status).toBe(200);
    // Response is a valid array — limit was silently capped to 100 on the server
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(100);
  });

  it("valid limit=10 and offset=0 returns 200", async () => {
    const res = await getAsUser("?limit=10&offset=0");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("offset=abc returns 400", async () => {
    const res = await getAsUser("?offset=abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});
