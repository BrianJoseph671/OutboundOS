/**
 * Tests for scrutiny-identified fixes in the API layer.
 *
 * Fix 1: Cross-user source_id constraint — when two users share the same
 *         (channel, source_id), the second insert hits the global DB unique
 *         index and must return 409, not 500.
 *
 * Fix 2: PATCH /api/interactions/:id — if the body includes contactId, validate
 *         that the new contactId belongs to the authenticated user before updating.
 *         Returns 400/404 for contacts that don't exist or belong to another user.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { db, pool } from "../db";
import { users, contacts, interactions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { passport, authRouter } from "../auth";
import { relationshipsRouter } from "../routes/relationships";
import { storage } from "../storage";

// ── Cleanup tracking ──────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createTestUser(suffix = "") {
  const ts = Date.now();
  const [user] = await db
    .insert(users)
    .values({
      username: `scrutiny_${suffix}_${ts}`,
      password: "hashed_test_password",
      email: `scrutiny_${suffix}_${ts}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

async function createTestContact(
  userId: string,
  overrides: Partial<{ name: string }> = {},
) {
  const ts = Date.now();
  const contact = await storage.createContact({
    name: overrides.name ?? `Scrutiny Test Contact ${ts}`,
    userId,
  });
  testIds.contactIds.push(contact.id);
  return contact;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret-scrutiny",
      resave: false,
      saveUninitialized: false,
    }),
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
  app.use("/api/interactions", relationshipsRouter);
  return app;
}

// =============================================================================
// Fix 1: POST /api/interactions — cross-user source_id conflict returns 409
// =============================================================================

describe("Fix 1: POST /api/interactions — cross-user (channel, source_id) conflict returns 409 not 500", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contactA: typeof contacts.$inferSelect;
  let contactB: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = createApp();
    userA = await createTestUser("src_a");
    userB = await createTestUser("src_b");
    contactA = await createTestContact(userA.id);
    contactB = await createTestContact(userB.id);
  });

  it(
    "returns 201 when User B creates an interaction with the same (channel, source_id) " +
      "that User A already owns — unique index is now user-scoped",
    async () => {
      const sharedSourceId = `cross_user_src_${Date.now()}`;
      const channel = "email";

      // Insert User A's interaction directly into the DB.
      const [directInsert] = await db
        .insert(interactions)
        .values({
          userId: userA.id,
          contactId: contactA.id,
          channel,
          direction: "outbound",
          occurredAt: new Date(),
          sourceId: sharedSourceId,
        })
        .returning();
      testIds.interactionIds.push(directInsert.id);

      // User B's API request: the user-scoped unique index allows different
      // users to have the same (channel, source_id) combination.
      const agentB = request.agent(app);
      await agentB.post("/test/login").send({ user: userB }).expect(200);

      const res = await agentB.post("/api/interactions").send({
        contactId: contactB.id,
        channel,
        direction: "outbound",
        occurredAt: new Date().toISOString(),
        sourceId: sharedSourceId,
      });

      // User-scoped index: User B can write the same source_id as User A
      expect(res.status).toBe(201);
      if (res.body?.id) testIds.interactionIds.push(res.body.id);
    },
  );

  it("pre-check still catches same-user source_id duplicates with 409", async () => {
    const sourceId = `same_user_src_${Date.now()}`;
    const agentA = request.agent(app);
    await agentA.post("/test/login").send({ user: userA }).expect(200);

    const first = await agentA.post("/api/interactions").send({
      contactId: contactA.id,
      channel: "linkedin",
      direction: "outbound",
      occurredAt: new Date().toISOString(),
      sourceId,
    });
    expect(first.status).toBe(201);
    testIds.interactionIds.push(first.body.id);

    // Same user, same channel+sourceId — pre-check catches it
    const second = await agentA.post("/api/interactions").send({
      contactId: contactA.id,
      channel: "linkedin",
      direction: "inbound",
      occurredAt: new Date().toISOString(),
      sourceId,
    });
    expect(second.status).toBe(409);
    expect(second.body).toHaveProperty("error");
  });

  it("null source_id rows are still allowed to duplicate (partial index only applies to non-null)", async () => {
    const agentA = request.agent(app);
    await agentA.post("/test/login").send({ user: userA }).expect(200);

    const first = await agentA.post("/api/interactions").send({
      contactId: contactA.id,
      channel: "whatsapp",
      direction: "inbound",
      occurredAt: new Date().toISOString(),
      // sourceId omitted (null)
    });
    expect(first.status).toBe(201);
    testIds.interactionIds.push(first.body.id);

    const second = await agentA.post("/api/interactions").send({
      contactId: contactA.id,
      channel: "whatsapp",
      direction: "outbound",
      occurredAt: new Date().toISOString(),
      // sourceId omitted (null)
    });
    expect(second.status).toBe(201);
    testIds.interactionIds.push(second.body.id);
  });
});

// =============================================================================
// Fix 2: PATCH /api/interactions/:id — contactId reassignment validates ownership
// =============================================================================

describe("Fix 2: PATCH /api/interactions/:id — contactId reassignment validates ownership", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contactA: typeof contacts.$inferSelect;
  let contactA2: typeof contacts.$inferSelect;
  let contactB: typeof contacts.$inferSelect;
  let interactionA: typeof interactions.$inferSelect;

  beforeAll(async () => {
    app = createApp();
    userA = await createTestUser("patch_ci_a");
    userB = await createTestUser("patch_ci_b");
    contactA = await createTestContact(userA.id, { name: "User A Contact 1" });
    contactA2 = await createTestContact(userA.id, { name: "User A Contact 2" });
    contactB = await createTestContact(userB.id, { name: "User B Contact" });
    interactionA = await storage.createInteraction({
      userId: userA.id,
      contactId: contactA.id,
      channel: "email",
      direction: "outbound",
      occurredAt: new Date(),
    });
    testIds.interactionIds.push(interactionA.id);
  });

  it("returns 404 when reassigning contactId to another user's contact", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent
      .patch(`/api/interactions/${interactionA.id}`)
      .send({ contactId: contactB.id });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 404 when reassigning contactId to a non-existent contact", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent
      .patch(`/api/interactions/${interactionA.id}`)
      .send({ contactId: "00000000-0000-0000-0000-000000000000" });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("allows reassigning contactId to another contact owned by the same user", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent
      .patch(`/api/interactions/${interactionA.id}`)
      .send({ contactId: contactA2.id });

    expect(res.status).toBe(200);
    expect(res.body.contactId).toBe(contactA2.id);

    // Restore original contactId for subsequent tests
    await agent
      .patch(`/api/interactions/${interactionA.id}`)
      .send({ contactId: contactA.id });
  });

  it("allows PATCH without contactId field (no ownership check needed)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userA }).expect(200);

    const res = await agent
      .patch(`/api/interactions/${interactionA.id}`)
      .send({ summary: "Updated summary, no contact change" });

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe("Updated summary, no contact change");
    // contactId should remain unchanged
    expect(res.body.contactId).toBe(contactA.id);
  });

  it("returns 404 when trying to PATCH an interaction belonging to another user (pre-existing behavior)", async () => {
    const agent = request.agent(app);
    await agent.post("/test/login").send({ user: userB }).expect(200);

    const res = await agent
      .patch(`/api/interactions/${interactionA.id}`)
      .send({ contactId: contactB.id });

    expect(res.status).toBe(404);
  });
});
