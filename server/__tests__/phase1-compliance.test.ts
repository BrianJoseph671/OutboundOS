/**
 * Phase 1 Compliance Test Suite
 *
 * Comprehensive tests for RelationshipOS Phase 1 API compliance:
 *
 * 1. Contact dedup (25 cases): email, LinkedIn URL, edge cases
 * 2. Contact CRUD integration (6 tests)
 * 3. Cascade delete (2 tests): contact deletion cascades to interactions
 * 4. User isolation (6 tests): contacts and interactions scoped per user
 *
 * All tests authenticate via session (req.login) — no seed user fallback.
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
import { registerRoutes } from "../routes";
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

// ── Test Helpers ──────────────────────────────────────────────────────────────

async function createTestUser(suffix = "") {
  const ts = Date.now();
  const [user] = await db
    .insert(users)
    .values({
      username: `phase1_${suffix}_${ts}`,
      password: "test_password_hash",
      email: `phase1_${suffix}_${ts}@test.com`,
    })
    .returning();
  testIds.userIds.push(user.id);
  return user;
}

/**
 * Creates a full Express app with session, passport, auth routes, and all
 * API routes registered (contacts + interactions + all others).
 */
async function createFullApp(): Promise<express.Application> {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret-phase1-compliance",
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  // Test-only route to bypass OAuth and establish a session via req.login()
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

/**
 * Creates an authenticated supertest agent for the given user.
 * Logs in via /test/login (req.login) and returns a persistent session agent.
 */
async function createAuthenticatedAgent(
  app: express.Application,
  user: typeof users.$inferSelect,
) {
  const agent = request.agent(app);
  await agent.post("/test/login").send({ user }).expect(200);
  return agent;
}

// =============================================================================
// SECTION 1: Contact Dedup Tests (25 cases, 20+ required)
// =============================================================================

// ─── Dedup: Email matching ────────────────────────────────────────────────────

describe("Contact dedup — email matching", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("dedup_email_a");
    userB = await createTestUser("dedup_email_b");
  });

  // Case 1: Exact email match → 409
  it("exact email match returns 409", async () => {
    const ts = Date.now();
    const email = `exact_match_${ts}@example.com`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent.post("/api/contacts").send({ name: "First", email });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent.post("/api/contacts").send({ name: "Second", email });
    expect(second.status).toBe(409);
    expect(second.body).toHaveProperty("error");
  });

  // Case 2: Case-insensitive email (lowercase existing, UPPERCASE new) → 409
  it("fully uppercase email matches lowercase existing (case-insensitive) — returns 409", async () => {
    const ts = Date.now();
    const emailLower = `case_test_lower_${ts}@example.com`;
    const emailUpper = `CASE_TEST_LOWER_${ts}@EXAMPLE.COM`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "Lower Case Email", email: emailLower });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent
      .post("/api/contacts")
      .send({ name: "Upper Case Email", email: emailUpper });
    expect(second.status).toBe(409);
  });

  // Case 3: Mixed-case email → 409
  it("mixed-case email (Test@Example.com vs test@example.com) returns 409", async () => {
    const ts = Date.now();
    const emailOrig = `mixed_case_${ts}@domain.com`;
    const emailMixed = `Mixed_Case_${ts}@Domain.Com`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "Mixed Case Orig", email: emailOrig });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent
      .post("/api/contacts")
      .send({ name: "Mixed Case New", email: emailMixed });
    expect(second.status).toBe(409);
  });

  // Case 4: Email match + different LinkedIn → 409 (email wins)
  it("email match with different LinkedIn URL returns 409", async () => {
    const ts = Date.now();
    const email = `email_diff_li_${ts}@example.com`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent.post("/api/contacts").send({
      name: "Email Match Diff LI 1",
      email,
      linkedinUrl: `https://linkedin.com/in/original-${ts}`,
    });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent.post("/api/contacts").send({
      name: "Email Match Diff LI 2",
      email,
      linkedinUrl: `https://linkedin.com/in/different-${ts}`,
    });
    expect(second.status).toBe(409);
  });

  // Case 5: Null email on existing contact → 201 (null email cannot match a real email)
  it("existing contact with null email — new contact with email returns 201", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, userA);

    // Create contact with no email (null)
    const first = await agent
      .post("/api/contacts")
      .send({ name: `No Email Contact ${ts}` });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // New contact with email — existing null email can't match
    const second = await agent.post("/api/contacts").send({
      name: `Has Email Contact ${ts}`,
      email: `new_email_${ts}@example.com`,
    });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });

  // Case 6: Different email, different LinkedIn → 201
  it("completely different email and LinkedIn returns 201 (no dedup)", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent.post("/api/contacts").send({
      name: `Unique A ${ts}`,
      email: `unique_a_${ts}@example.com`,
      linkedinUrl: `https://linkedin.com/in/person-a-${ts}`,
    });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent.post("/api/contacts").send({
      name: `Unique B ${ts}`,
      email: `unique_b_${ts}@example.com`,
      linkedinUrl: `https://linkedin.com/in/person-b-${ts}`,
    });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });

  // Case 7: Same email, different user → 201 (per-user isolation)
  it("same email for different users returns 201 (per-user dedup isolation)", async () => {
    const ts = Date.now();
    const email = `cross_user_dedup_${ts}@example.com`;
    const agentA = await createAuthenticatedAgent(app, userA);
    const agentB = await createAuthenticatedAgent(app, userB);

    const forA = await agentA
      .post("/api/contacts")
      .send({ name: "User A Person", email });
    expect(forA.status).toBe(201);
    testIds.contactIds.push(forA.body.id);

    // Different user — dedup is per-user, so this should succeed
    const forB = await agentB
      .post("/api/contacts")
      .send({ name: "User B Person", email });
    expect(forB.status).toBe(201);
    testIds.contactIds.push(forB.body.id);
  });

  // Case 8: Empty string email → 201 (empty string is falsy, dedup not triggered)
  it("empty string email does not trigger dedup — returns 201", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: `Empty Email 1 ${ts}`, email: "" });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // Second empty string email also returns 201 (no dedup for empty string)
    const second = await agent
      .post("/api/contacts")
      .send({ name: `Empty Email 2 ${ts}`, email: "" });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });

  // Case 9: No email, no LinkedIn on input → 201 (dedup not triggered)
  it("no email and no LinkedIn on input returns 201 (dedup check not triggered)", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: `No Fields 1 ${ts}` });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent
      .post("/api/contacts")
      .send({ name: `No Fields 2 ${ts}` });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });

  // Case 10: Email match, existing has no LinkedIn → 409 (email wins)
  it("email match where existing contact has no LinkedIn still returns 409", async () => {
    const ts = Date.now();
    const email = `email_no_li_${ts}@example.com`;
    const agent = await createAuthenticatedAgent(app, userA);

    // Existing contact has email but no LinkedIn
    const first = await agent
      .post("/api/contacts")
      .send({ name: "Email No LI 1", email });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // New contact with same email + some LinkedIn → still 409 (email matched)
    const second = await agent.post("/api/contacts").send({
      name: "Email No LI 2",
      email,
      linkedinUrl: `https://linkedin.com/in/someone-${ts}`,
    });
    expect(second.status).toBe(409);
  });

  // Case 11: 409 response body includes existingId
  it("409 response includes existingId of the matched contact", async () => {
    const ts = Date.now();
    const email = `existing_id_check_${ts}@example.com`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "Original For ID Check", email });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent
      .post("/api/contacts")
      .send({ name: "Dup For ID Check", email });
    expect(second.status).toBe(409);
    expect(second.body).toHaveProperty("existingId", first.body.id);
  });

  // Case 12: Multiple contacts in DB — email matches second one → 409
  it("email matching the second of multiple existing contacts returns 409", async () => {
    const ts = Date.now();
    const email1 = `multi_1_${ts}@example.com`;
    const email2 = `multi_2_${ts}@example.com`;
    const agent = await createAuthenticatedAgent(app, userA);

    const c1 = await agent
      .post("/api/contacts")
      .send({ name: "Multi Contact 1", email: email1 });
    expect(c1.status).toBe(201);
    testIds.contactIds.push(c1.body.id);

    const c2 = await agent
      .post("/api/contacts")
      .send({ name: "Multi Contact 2", email: email2 });
    expect(c2.status).toBe(201);
    testIds.contactIds.push(c2.body.id);

    // Match the second contact's email
    const dup = await agent
      .post("/api/contacts")
      .send({ name: "Dup of Multi 2", email: email2 });
    expect(dup.status).toBe(409);
  });

  // Case 13: Email-only dedup (no LinkedIn on either) → 409
  it("email-only dedup (no LinkedIn on either contact) returns 409", async () => {
    const ts = Date.now();
    const email = `email_only_dedup_${ts}@example.com`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "Email Only 1", email });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent
      .post("/api/contacts")
      .send({ name: "Email Only 2", email });
    expect(second.status).toBe(409);
  });
});

// ─── Dedup: LinkedIn URL matching ────────────────────────────────────────────

describe("Contact dedup — LinkedIn URL matching", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("dedup_linkedin_a");
    userB = await createTestUser("dedup_linkedin_b");
  });

  // Case 14: LinkedIn URL exact match → 409
  it("exact LinkedIn URL match returns 409", async () => {
    const ts = Date.now();
    const linkedinUrl = `https://linkedin.com/in/exact-match-${ts}`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "LinkedIn First", linkedinUrl });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent
      .post("/api/contacts")
      .send({ name: "LinkedIn Second", linkedinUrl });
    expect(second.status).toBe(409);
  });

  // Case 15: LinkedIn match + different email → 409
  it("LinkedIn URL match with different email returns 409", async () => {
    const ts = Date.now();
    const linkedinUrl = `https://linkedin.com/in/li-diff-email-${ts}`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent.post("/api/contacts").send({
      name: "LI Diff Email 1",
      linkedinUrl,
      email: `li_email_1_${ts}@example.com`,
    });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent.post("/api/contacts").send({
      name: "LI Diff Email 2",
      linkedinUrl,
      email: `li_email_2_${ts}@example.com`,
    });
    expect(second.status).toBe(409);
  });

  // Case 16: Both email and LinkedIn match → 409
  it("both email and LinkedIn match returns 409", async () => {
    const ts = Date.now();
    const email = `both_match_${ts}@example.com`;
    const linkedinUrl = `https://linkedin.com/in/both-match-${ts}`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "Both Match 1", email, linkedinUrl });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent
      .post("/api/contacts")
      .send({ name: "Both Match 2", email, linkedinUrl });
    expect(second.status).toBe(409);
  });

  // Case 17: Same LinkedIn, different user → 201 (per-user isolation)
  it("same LinkedIn URL for different users returns 201 (per-user dedup isolation)", async () => {
    const ts = Date.now();
    const linkedinUrl = `https://linkedin.com/in/cross-user-li-${ts}`;
    const agentA = await createAuthenticatedAgent(app, userA);
    const agentB = await createAuthenticatedAgent(app, userB);

    const forA = await agentA
      .post("/api/contacts")
      .send({ name: "User A LI", linkedinUrl });
    expect(forA.status).toBe(201);
    testIds.contactIds.push(forA.body.id);

    const forB = await agentB
      .post("/api/contacts")
      .send({ name: "User B LI", linkedinUrl });
    expect(forB.status).toBe(201);
    testIds.contactIds.push(forB.body.id);
  });

  // Case 18: LinkedIn URL with trailing slash vs without → 201 (exact comparison)
  it("LinkedIn URL with trailing slash vs without does not match (exact comparison) — 201", async () => {
    const ts = Date.now();
    const liWithout = `https://linkedin.com/in/trailing-slash-${ts}`;
    const liWith = `https://linkedin.com/in/trailing-slash-${ts}/`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "LI No Trailing Slash", linkedinUrl: liWithout });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // Different URL (trailing slash) → different string → no match → 201
    const second = await agent
      .post("/api/contacts")
      .send({ name: "LI With Trailing Slash", linkedinUrl: liWith });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });

  // Case 19: LinkedIn URL http vs https → 201 (exact comparison, different protocol)
  it("LinkedIn URL http vs https does not match (different protocol) — returns 201", async () => {
    const ts = Date.now();
    const liHttp = `http://linkedin.com/in/protocol-test-${ts}`;
    const liHttps = `https://linkedin.com/in/protocol-test-${ts}`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "LI HTTP", linkedinUrl: liHttp });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // Different protocol → different string → no match → 201
    const second = await agent
      .post("/api/contacts")
      .send({ name: "LI HTTPS", linkedinUrl: liHttps });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });

  // Case 20: LinkedIn URL case sensitivity (lowercase vs uppercase) → 201
  it("LinkedIn URL with different casing does not match (case-sensitive) — returns 201", async () => {
    const ts = Date.now();
    const liLower = `https://linkedin.com/in/case-test-${ts}`;
    const liUpper = `https://linkedin.com/in/CASE-TEST-${ts}`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "LI Lowercase", linkedinUrl: liLower });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // Different casing → exact comparison → no match → 201
    const second = await agent
      .post("/api/contacts")
      .send({ name: "LI Uppercase", linkedinUrl: liUpper });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });

  // Case 21: LinkedIn match, existing has no email → 409 (LinkedIn wins)
  it("LinkedIn match where existing has no email returns 409", async () => {
    const ts = Date.now();
    const linkedinUrl = `https://linkedin.com/in/no-email-li-${ts}`;
    const agent = await createAuthenticatedAgent(app, userA);

    // Existing contact has LinkedIn but no email
    const first = await agent
      .post("/api/contacts")
      .send({ name: "LI No Email 1", linkedinUrl });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // New contact with same LinkedIn + some email → still 409 (LinkedIn matched)
    const second = await agent.post("/api/contacts").send({
      name: "LI No Email 2",
      linkedinUrl,
      email: `no_email_li_${ts}@example.com`,
    });
    expect(second.status).toBe(409);
  });

  // Case 22: LinkedIn-only dedup (no email on either) → 409
  it("LinkedIn-only dedup (no email on either contact) returns 409", async () => {
    const ts = Date.now();
    const linkedinUrl = `https://linkedin.com/in/linkedin-only-dedup-${ts}`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "LI Only 1", linkedinUrl });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    const second = await agent
      .post("/api/contacts")
      .send({ name: "LI Only 2", linkedinUrl });
    expect(second.status).toBe(409);
  });
});

// ─── Dedup: Edge cases ────────────────────────────────────────────────────────

describe("Contact dedup — edge cases (whitespace, empty, special values)", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("dedup_edge");
  });

  // Case 23: Email with trailing spaces → 201 (different from clean email, no match)
  it("email with trailing spaces does not match a clean email — returns 201", async () => {
    const ts = Date.now();
    const cleanEmail = `trailing_spaces_${ts}@example.com`;
    const spacedEmail = `trailing_spaces_${ts}@example.com `;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "Clean Email Contact", email: cleanEmail });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // Email with trailing space → different string → no match → 201
    const second = await agent
      .post("/api/contacts")
      .send({ name: "Spaced Email Contact", email: spacedEmail });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });

  // Case 24: Whitespace-only email → behavior test (should not be 409 vs real emails)
  it("whitespace-only email does not match a real email — returns 201", async () => {
    const ts = Date.now();
    const realEmail = `real_email_${ts}@example.com`;
    const whitespaceEmail = "   ";
    const agent = await createAuthenticatedAgent(app, userA);

    // Create contact with real email
    const first = await agent
      .post("/api/contacts")
      .send({ name: `Real Email Contact ${ts}`, email: realEmail });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // Create contact with whitespace email — different value, no match
    const second = await agent
      .post("/api/contacts")
      .send({ name: `Whitespace Email Contact ${ts}`, email: whitespaceEmail });
    // Should return 201 (whitespace doesn't match real email) or 400 (schema rejects it)
    // Either way, must NOT be 409 (no duplicate detection for non-matching emails)
    expect(second.status).not.toBe(409);
    if (second.status === 201) {
      testIds.contactIds.push(second.body.id);
    }
  });

  // Case 25: Email with leading spaces → 201 (different string from clean email)
  it("email with leading spaces does not match a clean email — returns 201", async () => {
    const ts = Date.now();
    const cleanEmail = `leading_spaces_${ts}@example.com`;
    const leadingSpacedEmail = ` leading_spaces_${ts}@example.com`;
    const agent = await createAuthenticatedAgent(app, userA);

    const first = await agent
      .post("/api/contacts")
      .send({ name: "Clean Leading Email", email: cleanEmail });
    expect(first.status).toBe(201);
    testIds.contactIds.push(first.body.id);

    // Leading space → different string → no match → 201
    const second = await agent
      .post("/api/contacts")
      .send({ name: "Leading Spaced Email", email: leadingSpacedEmail });
    expect(second.status).toBe(201);
    testIds.contactIds.push(second.body.id);
  });
});

// =============================================================================
// SECTION 2: Contact CRUD Integration Tests (6 tests)
// =============================================================================

describe("Contact CRUD integration — authenticated", () => {
  let app: express.Application;
  let crudUser: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    crudUser = await createTestUser("crud");
  });

  // Test 1: GET /api/contacts returns 200 with array
  it("GET /api/contacts returns 200 with array (authenticated)", async () => {
    const agent = await createAuthenticatedAgent(app, crudUser);
    const res = await agent.get("/api/contacts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // Test 2: POST /api/contacts creates contact and returns 201
  it("POST /api/contacts creates contact and returns 201 with id", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, crudUser);
    const res = await agent.post("/api/contacts").send({
      name: `CRUD Test Contact ${ts}`,
      email: `crud_test_${ts}@example.com`,
      company: "CRUD Corp",
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe(`CRUD Test Contact ${ts}`);
    expect(res.body.company).toBe("CRUD Corp");
    testIds.contactIds.push(res.body.id);
  });

  // Test 3: GET /api/contacts/:id returns the created contact
  it("GET /api/contacts/:id returns the created contact", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, crudUser);

    // Create contact
    const created = await agent.post("/api/contacts").send({
      name: `Get By ID Test ${ts}`,
      email: `get_by_id_${ts}@example.com`,
    });
    expect(created.status).toBe(201);
    const contactId = created.body.id;
    testIds.contactIds.push(contactId);

    // Fetch by ID
    const res = await agent.get(`/api/contacts/${contactId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(contactId);
    expect(res.body.name).toBe(`Get By ID Test ${ts}`);
    expect(res.body.email).toBe(`get_by_id_${ts}@example.com`);
  });

  // Test 4: PATCH /api/contacts/:id updates and returns 200
  it("PATCH /api/contacts/:id updates fields and returns 200 with merged state", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, crudUser);

    // Create contact
    const created = await agent.post("/api/contacts").send({
      name: `Patch Test ${ts}`,
      email: `patch_test_${ts}@example.com`,
    });
    expect(created.status).toBe(201);
    const contactId = created.body.id;
    testIds.contactIds.push(contactId);

    // Update some fields
    const res = await agent.patch(`/api/contacts/${contactId}`).send({
      company: "Updated Corp",
      notes: "Updated notes",
    });
    expect(res.status).toBe(200);
    expect(res.body.company).toBe("Updated Corp");
    expect(res.body.notes).toBe("Updated notes");
    // Unmodified fields remain unchanged
    expect(res.body.name).toBe(`Patch Test ${ts}`);
    expect(res.body.email).toBe(`patch_test_${ts}@example.com`);
  });

  // Test 5: DELETE /api/contacts/:id removes and returns 204
  it("DELETE /api/contacts/:id removes contact and returns 204", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, crudUser);

    // Create contact
    const created = await agent.post("/api/contacts").send({
      name: `Delete Test ${ts}`,
    });
    expect(created.status).toBe(201);
    const contactId = created.body.id;
    // Don't add to cleanup — we're deleting it here

    // Delete
    const res = await agent.delete(`/api/contacts/${contactId}`);
    expect(res.status).toBe(204);
  });

  // Test 6: GET /api/contacts after delete confirms removal
  it("GET /api/contacts/:id after delete returns 404 (contact removed)", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, crudUser);

    // Create contact
    const created = await agent.post("/api/contacts").send({
      name: `Delete Confirm ${ts}`,
      email: `delete_confirm_${ts}@example.com`,
    });
    expect(created.status).toBe(201);
    const contactId = created.body.id;
    // Don't add to cleanup — we're deleting it here

    // Delete
    await agent.delete(`/api/contacts/${contactId}`).expect(204);

    // Verify removed via GET /:id
    const getRes = await agent.get(`/api/contacts/${contactId}`);
    expect(getRes.status).toBe(404);

    // Verify removed via GET list
    const listRes = await agent.get("/api/contacts");
    expect(listRes.status).toBe(200);
    const ids = listRes.body.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(contactId);
  });
});

// =============================================================================
// SECTION 3: Cascade Delete Tests (2 tests)
// =============================================================================

describe("Cascade delete — contact deletion removes associated interactions", () => {
  let app: express.Application;
  let cascadeUser: typeof users.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    cascadeUser = await createTestUser("cascade");
  });

  // Test 1: Create contact + 3 interactions → delete contact → all interactions gone
  it("deleting a contact with 3 interactions cascades — all interactions removed", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, cascadeUser);

    // 1. Create a contact
    const contactRes = await agent.post("/api/contacts").send({
      name: `Cascade Test Contact ${ts}`,
    });
    expect(contactRes.status).toBe(201);
    const contactId = contactRes.body.id;
    // Don't add to contactIds cleanup — cascade delete removes everything

    // 2. Create 3 interactions for this contact
    for (let i = 0; i < 3; i++) {
      const intRes = await agent.post("/api/interactions").send({
        contactId,
        channel: "email",
        direction: "outbound",
        occurredAt: new Date().toISOString(),
        summary: `Cascade Interaction ${i + 1}`,
      });
      expect(intRes.status).toBe(201);
      // Don't add to interactionIds cleanup — cascade delete handles it
    }

    // Verify 3 interactions exist before delete
    const beforeDelete = await agent.get(
      `/api/interactions?contactId=${contactId}`,
    );
    expect(beforeDelete.status).toBe(200);
    expect(beforeDelete.body.length).toBe(3);

    // 3. Delete the contact
    await agent.delete(`/api/contacts/${contactId}`).expect(204);

    // 4. Verify all interactions are gone (cascade delete)
    const afterDelete = await agent.get(
      `/api/interactions?contactId=${contactId}`,
    );
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body).toEqual([]);
  });

  // Test 2: Verify via GET /api/interactions?contactId=X returns empty after cascade
  it("GET /api/interactions?contactId=X returns empty after contact cascade delete", async () => {
    const ts = Date.now();
    const agent = await createAuthenticatedAgent(app, cascadeUser);

    // Create contact
    const contactRes = await agent.post("/api/contacts").send({
      name: `Cascade Verify Contact ${ts}`,
    });
    expect(contactRes.status).toBe(201);
    const contactId = contactRes.body.id;

    // Create 2 interactions
    for (let i = 0; i < 2; i++) {
      const intRes = await agent.post("/api/interactions").send({
        contactId,
        channel: "linkedin",
        direction: "inbound",
        occurredAt: new Date().toISOString(),
      });
      expect(intRes.status).toBe(201);
    }

    // Delete contact → cascade deletes interactions
    await agent.delete(`/api/contacts/${contactId}`).expect(204);

    // GET interactions for the deleted contact → empty array (not 404)
    const res = await agent.get(`/api/interactions?contactId=${contactId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });
});

// =============================================================================
// SECTION 4: User Isolation Tests (6+ tests)
// =============================================================================

// ─── User isolation: Contacts ────────────────────────────────────────────────

describe("User isolation — contacts", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contactA: typeof contacts.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("iso_contact_a");
    userB = await createTestUser("iso_contact_b");

    // User A creates a contact directly via storage
    contactA = await storage.createContact({
      userId: userA.id,
      name: "User A Private Contact",
    });
    testIds.contactIds.push(contactA.id);
  });

  // Test 1: User B GET /api/contacts sees empty (User A's contact not visible)
  it("User B GET /api/contacts does not see User A's contact", async () => {
    const agentB = await createAuthenticatedAgent(app, userB);
    const res = await agentB.get("/api/contacts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(contactA.id);
  });

  // Test 2: User B GET /api/contacts/:id returns 404
  it("User B GET /api/contacts/:id returns 404 for User A's contact", async () => {
    const agentB = await createAuthenticatedAgent(app, userB);
    const res = await agentB.get(`/api/contacts/${contactA.id}`);
    expect(res.status).toBe(404);
  });

  // Test 3: User B PATCH /api/contacts/:id returns 404
  it("User B PATCH /api/contacts/:id returns 404 for User A's contact", async () => {
    const agentB = await createAuthenticatedAgent(app, userB);
    const res = await agentB
      .patch(`/api/contacts/${contactA.id}`)
      .send({ notes: "Cross-user PATCH attempt" });
    expect(res.status).toBe(404);
  });

  // Test 4: User B DELETE /api/contacts/:id returns 404
  it("User B DELETE /api/contacts/:id returns 404 for User A's contact", async () => {
    const agentB = await createAuthenticatedAgent(app, userB);
    const res = await agentB.delete(`/api/contacts/${contactA.id}`);
    expect(res.status).toBe(404);
  });

  // Verify User A's contact is unaffected after User B's failed attempts
  it("User A can still GET their own contact after User B's failed cross-user attempts", async () => {
    const agentA = await createAuthenticatedAgent(app, userA);
    const res = await agentA.get(`/api/contacts/${contactA.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(contactA.id);
    expect(res.body.name).toBe("User A Private Contact");
  });
});

// ─── User isolation: Interactions ────────────────────────────────────────────

describe("User isolation — interactions", () => {
  let app: express.Application;
  let userA: typeof users.$inferSelect;
  let userB: typeof users.$inferSelect;
  let contactA: typeof contacts.$inferSelect;
  let interactionA: typeof interactions.$inferSelect;

  beforeAll(async () => {
    app = await createFullApp();
    userA = await createTestUser("iso_interaction_a");
    userB = await createTestUser("iso_interaction_b");

    // User A creates a contact and an interaction directly via storage
    contactA = await storage.createContact({
      userId: userA.id,
      name: "User A Contact (Interaction Isolation)",
    });
    testIds.contactIds.push(contactA.id);

    interactionA = await storage.createInteraction({
      userId: userA.id,
      contactId: contactA.id,
      channel: "email",
      direction: "outbound",
      occurredAt: new Date(),
    });
    testIds.interactionIds.push(interactionA.id);
  });

  // Test 5: User B GET /api/interactions returns empty (no User A interactions)
  it("User B GET /api/interactions returns empty — does not see User A's interactions", async () => {
    const agentB = await createAuthenticatedAgent(app, userB);
    const res = await agentB.get("/api/interactions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((i: { id: string }) => i.id);
    expect(ids).not.toContain(interactionA.id);
  });

  // Test 6: User B GET /api/interactions/:id returns 404
  it("User B GET /api/interactions/:id returns 404 for User A's interaction", async () => {
    const agentB = await createAuthenticatedAgent(app, userB);
    const res = await agentB.get(`/api/interactions/${interactionA.id}`);
    expect(res.status).toBe(404);
  });

  // Verify User A's interaction is intact
  it("User A can still GET their own interaction after User B's failed access attempts", async () => {
    const agentA = await createAuthenticatedAgent(app, userA);
    const res = await agentA.get(`/api/interactions/${interactionA.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(interactionA.id);
    expect(res.body.userId).toBe(userA.id);
  });
});
