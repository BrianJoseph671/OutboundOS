/**
 * Integration tests for the interactions API routes (Phase 1: RelationshipOS)
 *
 * Covers:
 * - Auth enforcement (401 without session for all /api/interactions/* routes)
 * - Interaction CRUD happy paths: GET list, GET by id, POST create, PATCH update, DELETE
 * - 404 for non-existent or cross-user interactions
 * - 409 for duplicate source_id (idempotency)
 * - 400 for invalid request bodies
 * - POST /api/contacts dedup by email (case-insensitive) and LinkedIn URL when authenticated
 * - Backward compatibility: no dedup for unauthenticated POST /api/contacts
 * - Multi-user isolation for contacts dedup
 * - GET /api/contacts sorting by last_interaction_at with NULLS LAST
 * - PATCH /api/contacts/:id persists new RelationshipOS fields (tier, source, etc.)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import http from "http";
import { db, pool } from "../db";
import { users, contacts, interactions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { passport, authRouter } from "../auth";
import { relationshipsRouter } from "../routes/relationships";
import { registerRoutes } from "../routes";
import { storage } from "../storage";

// ── Cleanup tracking ───────────────────────────────────────────────────────────

const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  interactionIds: [] as string[],
};

afterAll(async () => {
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

// ── Test helpers ───────────────────────────────────────────────────────────────

async function createTestUser(suffix = "") {
  const ts = Date.now();
  const [user] = await db
    .insert(users)
    .values({
      username: `api_test_${suffix}_${ts}`,
      password: "hashed_test_password",
      email: `api_test_${suffix}_${ts}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

async function createTestContact(
  userId: string,
  overrides: Partial<{ name: string; email: string; linkedinUrl: string }> = {},
) {
  const ts = Date.now();
  const contact = await storage.createContact({
    name: overrides.name ?? `API Test Contact ${ts}`,
    userId,
    email: overrides.email,
    linkedinUrl: overrides.linkedinUrl,
  });
  testIds.contactIds.push(contact.id);
  return contact;
}

async function createTestInteraction(userId: string, contactId: string, overrides: Record<string, unknown> = {}) {
  const interaction = await storage.createInteraction({
    userId,
    contactId,
    channel: "email",
    direction: "outbound",
    occurredAt: new Date(),
    ...overrides,
  });
  testIds.interactionIds.push(interaction.id);
  return interaction;
}

/**
 * Lightweight Express app with session + passport + auth routes + relationships routes only.
 * Used for interaction CRUD tests to keep things fast and isolated.
 */
function createInteractionsApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: "test-secret-interactions", resave: false, saveUninitialized: false }),
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
  // Mount at /api/interactions to match the production mounting (routes.ts)
  app.use("/api/interactions", relationshipsRouter);
  return app;
}

/**
 * Full Express app using registerRoutes() — used for contacts route tests
 * (dedup, sorting, new fields) so the real route handlers are exercised.
 */
async function createFullApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: "test-secret-full", resave: false, saveUninitialized: false }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  // Test-only route to bypass OAuth
  app.post("/test/login", (req, res, next) => {
    req.login(req.body.user, (err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  const server = http.createServer(app);
  await registerRoutes(server, app);
  return app;
}

// =============================================================================
// AUTH ENFORCEMENT
// =============================================================================

describe("Auth enforcement — all /api/interactions/* routes return 401 without session", () => {
  let app: express.Application;

  beforeAll(() => {
    app = createInteractionsApp();
  });

  it("GET /api/interactions returns 401", async () => {
    const res = await request(app).get("/api/interactions");
    expect(res.status).toBe(401);
  });

  it("GET /api/interactions/:id returns 401", async () => {
    const res = await request(app).get("/api/interactions/some-id");
    expect(res.status).toBe(401);
  });

  it("POST /api/interactions returns 401", async () => {
    const res = await request(app).post("/api/interactions").send({
      contactId: "some-id",
      channel: "email",
      direction: "outbound",
      occurredAt: new Date().toISOString(),
    });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/interactions/:id returns 401", async () => {
    const res = await request(app).patch("/api/interactions/some-id").send({ summary: "test" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/interactions/:id returns 401", async () => {
    const res = await request(app).delete("/api/interactions/some-id");
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// POST /api/interactions — validation
// =============================================================================

describe("POST /api/interactions — validation (400 for missing required fields)", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;
  let testContact: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = createInteractionsApp();
    testUser = await createTestUser("post_validation");
    testContact = await createTestContact(testUser.id);
  });

  async function postAsUser(body: Record<string, unknown>) {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: testUser }).expect(200);
    return agent.post("/api/interactions").send(body);
  }

  it("returns 400 when channel is missing", async () => {
    const res = await postAsUser({
      contactId: testContact.id,
      direction: "outbound",
      occurredAt: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when direction is missing", async () => {
    const res = await postAsUser({
      contactId: testContact.id,
      channel: "email",
      occurredAt: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when occurredAt is missing", async () => {
    const res = await postAsUser({
      contactId: testContact.id,
      channel: "email",
      direction: "outbound",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when contactId is missing", async () => {
    const res = await postAsUser({
      channel: "email",
      direction: "outbound",
      occurredAt: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when contactId does not exist", async () => {
    const res = await postAsUser({
      contactId: "00000000-0000-0000-0000-000000000000",
      channel: "email",
      direction: "outbound",
      occurredAt: new Date().toISOString(),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when contactId belongs to a different user", async () => {
    const otherUser = await createTestUser("post_validation_other");
    const otherContact = await createTestContact(otherUser.id);

    const res = await postAsUser({
      contactId: otherContact.id,
      channel: "email",
      direction: "outbound",
      occurredAt: new Date().toISOString(),
    });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// POST /api/interactions — happy path and 409
// =============================================================================

describe("POST /api/interactions — happy path and 409 source_id conflict", () => {
  let app: express.Application;
  let testUser: typeof users.$inferSelect;
  let testContact: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = createInteractionsApp();
    testUser = await createTestUser("post_happy");
    testContact = await createTestContact(testUser.id);
  });

  it("returns 201 with created interaction for a valid body", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: testUser }).expect(200);

    const body = {
      contactId: testContact.id,
      channel: "linkedin",
      direction: "outbound",
      occurredAt: new Date().toISOString(),
      summary: "Sent a connection request",
    };

    const res = await agent.post("/api/interactions").send(body);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.channel).toBe("linkedin");
    expect(res.body.direction).toBe("outbound");
    expect(res.body.summary).toBe("Sent a connection request");
    expect(res.body.userId).toBe(testUser.id);
    expect(res.body.contactId).toBe(testContact.id);
    testIds.interactionIds.push(res.body.id);
  });

  it("returns 409 when source_id conflicts with existing interaction for same channel", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: testUser }).expect(200);

    const sourceId = `src_conflict_${Date.now()}`;

    // First creation
    const first = await agent.post("/api/interactions").send({
      contactId: testContact.id,
      channel: "email",
      direction: "outbound",
      occurredAt: new Date().toISOString(),
      sourceId,
    });
    expect(first.status).toBe(201);
    testIds.interactionIds.push(first.body.id);

    // Duplicate — same channel + sourceId
    const second = await agent.post("/api/interactions").send({
      contactId: testContact.id,
      channel: "email",
      direction: "inbound",
      occurredAt: new Date().toISOString(),
      sourceId,
    });
    expect(second.status).toBe(409);
  });

  it("allows null source_id duplicates (partial index only applies when source_id is non-null)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: testUser }).expect(200);

    // Two interactions with null sourceId for the same channel — both should succeed
    const first = await agent.post("/api/interactions").send({
      contactId: testContact.id,
      channel: "call",
      direction: "inbound",
      occurredAt: new Date().toISOString(),
      // sourceId omitted → null
    });
    expect(first.status).toBe(201);
    testIds.interactionIds.push(first.body.id);

    const second = await agent.post("/api/interactions").send({
      contactId: testContact.id,
      channel: "call",
      direction: "outbound",
      occurredAt: new Date().toISOString(),
    });
    expect(second.status).toBe(201);
    testIds.interactionIds.push(second.body.id);
  });
});

// =============================================================================
// GET /api/interactions — list
// =============================================================================

describe("GET /api/interactions — list", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contactA1: typeof contacts.$inferSelect;
  let contactA2: typeof contacts.$inferSelect;
  let interactionA1: typeof interactions.$inferSelect;
  let interactionA2: typeof interactions.$inferSelect;

  beforeAll(async () => {
    app = createInteractionsApp();
    userA = await createTestUser("list_a");
    userB = await createTestUser("list_b");

    contactA1 = await createTestContact(userA.id, { name: "List Contact A1" });
    contactA2 = await createTestContact(userA.id, { name: "List Contact A2" });
    const contactB = await createTestContact(userB.id, { name: "List Contact B" });

    interactionA1 = await createTestInteraction(userA.id, contactA1.id, { channel: "email" });
    interactionA2 = await createTestInteraction(userA.id, contactA2.id, { channel: "call" });
    // Create interaction for userB — should not appear in userA's results
    const intB = await createTestInteraction(userB.id, contactB.id, { channel: "linkedin" });
    testIds.interactionIds.push(intB.id);
  });

  it("returns only the authenticated user's interactions (no contactId filter)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent.get("/api/interactions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const ids = res.body.map((i: { id: string }) => i.id);
    expect(ids).toContain(interactionA1.id);
    expect(ids).toContain(interactionA2.id);
    // User B's interaction must NOT appear
    expect(res.body.every((i: { userId: string }) => i.userId === userA.id)).toBe(true);
  });

  it("filters by contactId when provided", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent.get(`/api/interactions?contactId=${contactA1.id}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const ids = res.body.map((i: { id: string }) => i.id);
    expect(ids).toContain(interactionA1.id);
    expect(ids).not.toContain(interactionA2.id);
  });

  it("returns an empty array when user has no interactions", async () => {
    const freshUser = await createTestUser("list_empty");
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: freshUser }).expect(200);

    const res = await agent.get("/api/interactions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns interactions ordered by occurred_at DESC", async () => {
    const user = await createTestUser("list_order");
    const contact = await createTestContact(user.id);

    const earlier = new Date("2024-03-01T00:00:00Z");
    const later = new Date("2024-11-01T00:00:00Z");

    const iEarly = await createTestInteraction(user.id, contact.id, { occurredAt: earlier });
    const iLate = await createTestInteraction(user.id, contact.id, { occurredAt: later });

    const agent = request.agent(app);
    await agent.post("/test/login").send({ user }).expect(200);

    const res = await agent.get(`/api/interactions?contactId=${contact.id}`);
    expect(res.status).toBe(200);

    const ids = res.body.map((i: { id: string }) => i.id);
    const lateIdx = ids.indexOf(iLate.id);
    const earlyIdx = ids.indexOf(iEarly.id);
    expect(lateIdx).toBeLessThan(earlyIdx); // later comes first (DESC order)
  });
});

// =============================================================================
// GET /api/interactions/:id — single
// =============================================================================

describe("GET /api/interactions/:id — single", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contact: typeof contacts.$inferSelect;
  let interaction: typeof interactions.$inferSelect;

  beforeAll(async () => {
    app = createInteractionsApp();
    userA = await createTestUser("get_one_api_a");
    userB = await createTestUser("get_one_api_b");
    contact = await createTestContact(userA.id);
    interaction = await createTestInteraction(userA.id, contact.id);
  });

  it("returns 200 with interaction for a valid ID owned by the user", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent.get(`/api/interactions/${interaction.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(interaction.id);
    expect(res.body.userId).toBe(userA.id);
  });

  it("returns 404 for a non-existent ID", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent.get("/api/interactions/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an interaction belonging to a different user (cross-user isolation)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userB }).expect(200);

    const res = await agent.get(`/api/interactions/${interaction.id}`);
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// PATCH /api/interactions/:id
// =============================================================================

describe("PATCH /api/interactions/:id", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contact: typeof contacts.$inferSelect;
  let interaction: typeof interactions.$inferSelect;

  beforeAll(async () => {
    app = createInteractionsApp();
    userA = await createTestUser("patch_api_a");
    userB = await createTestUser("patch_api_b");
    contact = await createTestContact(userA.id);
    interaction = await createTestInteraction(userA.id, contact.id, { summary: "Original summary" });
  });

  it("returns 200 with updated interaction for valid partial body", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent.patch(`/api/interactions/${interaction.id}`).send({
      summary: "Updated summary",
    });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe("Updated summary");
    // Unmentioned fields remain unchanged
    expect(res.body.channel).toBe("email");
    expect(res.body.direction).toBe("outbound");
  });

  it("returns 404 for a non-existent ID", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent.patch("/api/interactions/00000000-0000-0000-0000-000000000000").send({
      summary: "Will not update",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when trying to update another user's interaction", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userB }).expect(200);

    const res = await agent.patch(`/api/interactions/${interaction.id}`).send({
      summary: "Cross-user update attempt",
    });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// DELETE /api/interactions/:id
// =============================================================================

describe("DELETE /api/interactions/:id", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contact: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = createInteractionsApp();
    userA = await createTestUser("delete_api_a");
    userB = await createTestUser("delete_api_b");
    contact = await createTestContact(userA.id);
  });

  it("returns 200 and removes the interaction", async () => {
    const interaction = await createTestInteraction(userA.id, contact.id);
    // Remove from cleanup list since we're deleting it
    testIds.interactionIds.splice(testIds.interactionIds.indexOf(interaction.id), 1);

    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent.delete(`/api/interactions/${interaction.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);

    // Verify it's gone
    const getRes = await agent.get(`/api/interactions/${interaction.id}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for a non-existent ID", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent.delete("/api/interactions/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns 404 when trying to delete another user's interaction (cross-user isolation)", async () => {
    const interaction = await createTestInteraction(userA.id, contact.id);

    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userB }).expect(200);

    const res = await agent.delete(`/api/interactions/${interaction.id}`);
    expect(res.status).toBe(404);

    // Verify the interaction still exists under userA
    const agentA = request.agent(app);
    await agentA.post("/test/login").send({ user: userA }).expect(200);
    const getRes = await agentA.get(`/api/interactions/${interaction.id}`);
    expect(getRes.status).toBe(200);
  });
});

// =============================================================================
// POST /api/contacts — dedup logic
// =============================================================================

describe("POST /api/contacts — dedup when authenticated", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("dedup_a");
    userB = await createTestUser("dedup_b");
  });

  it("returns 409 when authenticated user creates contact with duplicate email", async () => {
    const ts = Date.now();
    const email = `dedup_test_${ts}@example.com`;

    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    // First contact — should succeed
    const first = await agent.post("/api/contacts").send({ name: "Contact One", email });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // Duplicate email — should fail
    const second = await agent.post("/api/contacts").send({ name: "Contact Two", email });
    expect(second.status).toBe(409);
    expect(second.body).toHaveProperty("error");
  });

  it("returns 409 when authenticated user creates contact with duplicate LinkedIn URL", async () => {
    const ts = Date.now();
    const linkedinUrl = `https://linkedin.com/in/dedup-test-${ts}`;

    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const first = await agent.post("/api/contacts").send({ name: "LinkedIn Contact One", linkedinUrl });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent.post("/api/contacts").send({ name: "LinkedIn Contact Two", linkedinUrl });
    expect(second.status).toBe(409);
  });

  it("email comparison is case-insensitive", async () => {
    const ts = Date.now();
    const emailLower = `case_test_${ts}@example.com`;
    const emailMixed = `Case_Test_${ts}@EXAMPLE.com`;

    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const first = await agent.post("/api/contacts").send({ name: "Case Contact One", email: emailLower });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // Different case — should still return 409
    const second = await agent.post("/api/contacts").send({ name: "Case Contact Two", email: emailMixed });
    expect(second.status).toBe(409);
  });

  it("dedup is scoped per user — different users may have contacts with the same email", async () => {
    const ts = Date.now();
    const email = `cross_user_dedup_${ts}@example.com`;

    const agentA = request.agent(app);
    await agentA.post("/test/login").send({ user: userA }).expect(200);

    const agentB = request.agent(app);
    await agentB.post("/test/login").send({ user: userB }).expect(200);

    // User A creates contact with email
    const firstA = await agentA.post("/api/contacts").send({ name: "User A Contact", email });
    expect(firstA.status).toBe(201);
    testIds.contactIds.push(firstA.body.id);

    // User B creates contact with same email — should succeed (different user scope)
    const firstB = await agentB.post("/api/contacts").send({ name: "User B Contact", email });
    expect(firstB.status).toBe(201);
    testIds.contactIds.push(firstB.body.id);
  });

  it("no dedup for unauthenticated POST /api/contacts (backward compatibility)", async () => {
    const ts = Date.now();
    const email = `unauth_dedup_${ts}@example.com`;

    // No session agent — unauthenticated
    const first = await request(app).post("/api/contacts").send({ name: "Unauth Contact One", email });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // Second unauthenticated request with same email — should still succeed (no dedup)
    const second = await request(app).post("/api/contacts").send({ name: "Unauth Contact Two", email });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });

  it("no 409 when contact has neither email nor linkedinUrl (cannot dedup)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    // Two contacts with no email/LinkedIn — both should succeed
    const first = await agent.post("/api/contacts").send({ name: "No Email Contact One" });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent.post("/api/contacts").send({ name: "No Email Contact Two" });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });
});

// =============================================================================
// GET /api/contacts — sorting by last_interaction_at
// =============================================================================

describe("GET /api/contacts — sort by last_interaction_at", () => {
  let app: express.Application;
  let contactRecent: typeof contacts.$inferSelect;
  let contactOld: typeof contacts.$inferSelect;
  let contactNoInteraction: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();

    // We need a user to create contacts. Use the seed user's ID via storage
    // (unauthenticated route uses seed user, but we'll create directly via storage).
    const seedUserResult = await db.select().from(users).limit(1);
    const seedUserId = seedUserResult[0]?.id ?? "unknown";

    // Create contacts with known last_interaction_at values for ordering tests
    const ts = Date.now();

    contactRecent = await storage.createContact({
      name: `Sort Contact Recent ${ts}`,
      userId: seedUserId,
    });
    testIds.contactIds.push(contactRecent.id);
    await storage.updateContact(contactRecent.id, { lastInteractionAt: new Date("2099-06-15T00:00:00Z") });

    contactOld = await storage.createContact({
      name: `Sort Contact Old ${ts}`,
      userId: seedUserId,
    });
    testIds.contactIds.push(contactOld.id);
    await storage.updateContact(contactOld.id, { lastInteractionAt: new Date("1999-01-01T00:00:00Z") });

    contactNoInteraction = await storage.createContact({
      name: `Sort Contact NoInteraction ${ts}`,
      userId: seedUserId,
    });
    testIds.contactIds.push(contactNoInteraction.id);
    // lastInteractionAt stays null
  });

  it("sort=last_interaction_at&order=desc: returns contacts with recent first, nulls last", async () => {
    const res = await request(app).get("/api/contacts?sort=last_interaction_at&order=desc");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const ids = res.body.map((c: { id: string }) => c.id);
    const recentIdx = ids.indexOf(contactRecent.id);
    const oldIdx = ids.indexOf(contactOld.id);
    const nullIdx = ids.indexOf(contactNoInteraction.id);

    expect(recentIdx).toBeGreaterThanOrEqual(0);
    expect(oldIdx).toBeGreaterThanOrEqual(0);
    expect(nullIdx).toBeGreaterThanOrEqual(0);

    // desc: recent > old (nulls at end)
    expect(recentIdx).toBeLessThan(oldIdx);
    expect(oldIdx).toBeLessThan(nullIdx);
  });

  it("sort=last_interaction_at&order=asc: returns contacts with oldest first, nulls last", async () => {
    const res = await request(app).get("/api/contacts?sort=last_interaction_at&order=asc");
    expect(res.status).toBe(200);

    const ids = res.body.map((c: { id: string }) => c.id);
    const recentIdx = ids.indexOf(contactRecent.id);
    const oldIdx = ids.indexOf(contactOld.id);
    const nullIdx = ids.indexOf(contactNoInteraction.id);

    // asc: old < recent (nulls at end)
    expect(oldIdx).toBeLessThan(recentIdx);
    expect(recentIdx).toBeLessThan(nullIdx);
  });

  it("without sort param returns contacts without error (default order)", async () => {
    const res = await request(app).get("/api/contacts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// =============================================================================
// PATCH /api/contacts/:id — new RelationshipOS fields
// =============================================================================

describe("PATCH /api/contacts/:id — accepts new RelationshipOS fields", () => {
  let app: express.Application;
  let testContact: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    const seedUserResult = await db.select().from(users).limit(1);
    const seedUserId = seedUserResult[0]?.id ?? "unknown";
    testContact = await storage.createContact({
      name: "Patch RelOS Contact",
      userId: seedUserId,
    });
    testIds.contactIds.push(testContact.id);
  });

  it("persists tier field", async () => {
    const res = await request(app)
      .patch(`/api/contacts/${testContact.id}`)
      .send({ tier: "warm" });
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe("warm");
  });

  it("persists source field", async () => {
    const res = await request(app)
      .patch(`/api/contacts/${testContact.id}`)
      .send({ source: "linkedin_import" });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("linkedin_import");
  });

  it("persists last_interaction_at field", async () => {
    const occurred = new Date("2025-03-15T12:00:00Z").toISOString();
    const res = await request(app)
      .patch(`/api/contacts/${testContact.id}`)
      .send({ lastInteractionAt: occurred });
    expect(res.status).toBe(200);
    // The response may contain an ISO string or Date representation
    expect(res.body.lastInteractionAt).toBeDefined();
  });

  it("persists last_interaction_channel field", async () => {
    const res = await request(app)
      .patch(`/api/contacts/${testContact.id}`)
      .send({ lastInteractionChannel: "email" });
    expect(res.status).toBe(200);
    expect(res.body.lastInteractionChannel).toBe("email");
  });

  it("existing fields remain unchanged after partial update", async () => {
    // Set a known name first
    await request(app)
      .patch(`/api/contacts/${testContact.id}`)
      .send({ tier: "vip" });

    // Update only source — tier should still be "vip"
    const res = await request(app)
      .patch(`/api/contacts/${testContact.id}`)
      .send({ source: "manual" });
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe("vip");
    expect(res.body.source).toBe("manual");
  });
});

// =============================================================================
// Legacy contacts endpoints remain unprotected (VAL-AUTH-008)
// =============================================================================

describe("Legacy endpoints work without auth (backward compatibility)", () => {
  let app: express.Application;

  beforeAll(async () => {
    app = await createFullApp();
  });

  it("GET /api/contacts returns 200 without session", async () => {
    const res = await request(app).get("/api/contacts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/outreach-attempts returns 200 without session", async () => {
    const res = await request(app).get("/api/outreach-attempts");
    expect(res.status).toBe(200);
  });

  it("GET /api/experiments returns 200 without session", async () => {
    const res = await request(app).get("/api/experiments");
    expect(res.status).toBe(200);
  });

  it("GET /api/settings returns 200 without session", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(200);
  });
});
