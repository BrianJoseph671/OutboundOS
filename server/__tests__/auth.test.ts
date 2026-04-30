/**
 * Tests for Google OAuth authentication layer (Phase 1: RelationshipOS)
 *
 * Covers:
 * - requireAuth middleware unit tests
 * - GET /auth/me — unauthenticated returns 401
 * - GET /auth/me — authenticated returns user without password field
 * - POST /auth/logout — destroys session; subsequent /auth/me returns 401
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { db, pool } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { authRouter, isNotreDameEmail, passport } from "../auth";
import { requireAuth } from "../middleware/auth";

// ── Test user cleanup ─────────────────────────────────────────────────────────

const testUserIds: string[] = [];

afterAll(async () => {
  for (const id of testUserIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  await pool.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createTestUser(suffix = "") {
  const [user] = await db
    .insert(users)
    .values({
      username: `auth_test_${suffix}_${Date.now()}`,
      password: "test_password_hash",
      email: `auth_test_${suffix}_${Date.now()}@test.com`,
    })
    .returning();
  testUserIds.push(user.id);
  return user;
}

/**
 * Creates a minimal Express app with session + passport + authRouter.
 * Optionally accepts an additional setup callback to add test-only routes
 * (e.g. a `/test/login` endpoint for bypassing OAuth in tests).
 */
function createTestApp(
  setup?: (app: express.Application) => void,
): express.Application {
  const app = express();
  app.use(express.json());

  // Use MemoryStore (default) — no DB session table needed in tests.
  app.use(
    session({
      secret: "test-only-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  if (setup) {
    setup(app);
  }

  app.use(authRouter);

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// requireAuth middleware — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("requireAuth middleware", () => {
  it("calls next() when user is authenticated", () => {
    const req = { isAuthenticated: () => true } as unknown as express.Request;
    const res = {} as express.Response;
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 401 when user is not authenticated", () => {
    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const req = {
      isAuthenticated: () => false,
    } as unknown as express.Request;
    const res = { status: statusFn } as unknown as express.Response;
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith({ error: "Not authenticated" });
    expect(next).not.toHaveBeenCalled();
  });

  it("does not call next() when user is not authenticated", () => {
    const req = {
      isAuthenticated: () => false,
    } as unknown as express.Request;
    const res = {
      status: () => ({ json: () => {} }),
    } as unknown as express.Response;
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });
});

describe("isNotreDameEmail", () => {
  it("returns true for nd.edu emails with varied casing/spacing", () => {
    expect(isNotreDameEmail("user@nd.edu")).toBe(true);
    expect(isNotreDameEmail("USER@ND.EDU")).toBe(true);
    expect(isNotreDameEmail("  user@nd.edu  ")).toBe(true);
  });

  it("returns false for other domains and non-strings", () => {
    expect(isNotreDameEmail("user@gmail.com")).toBe(false);
    expect(isNotreDameEmail("nd.edu")).toBe(false);
    expect(isNotreDameEmail(null)).toBe(false);
    expect(isNotreDameEmail(undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/me
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /auth/me — unauthenticated", () => {
  it("returns 401 with an error body when no session exists", async () => {
    const app = createTestApp();
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect(res.body).not.toHaveProperty("id");
  });

  it("does not leak user data in the 401 response", async () => {
    const app = createTestApp();
    const res = await request(app).get("/auth/me");
    // Must not include any user-identifying fields
    expect(res.body).not.toHaveProperty("email");
    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("googleId");
  });
});

describe("GET /auth/me — authenticated", () => {
  it("returns 200 with user data (no password field) when session is active", async () => {
    const testUser = await createTestUser("me_auth");

    const app = createTestApp((a) => {
      // Test-only route to bypass OAuth and establish a session
      a.post("/test/login", (req, res, next) => {
        req.login(testUser, (err) => {
          if (err) return next(err);
          res.json({ ok: true });
        });
      });
    });

    const agent = request.agent(app);

    // Establish session via test login
    const loginRes = await agent.post("/test/login").send({});
    expect(loginRes.status).toBe(200);

    // /auth/me should return the user
    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body).toHaveProperty("id", testUser.id);
    expect(meRes.body).toHaveProperty("email");
    expect(meRes.body).not.toHaveProperty("password");
    expect(meRes.body).not.toHaveProperty("password");
  });

  it("includes expected user fields: id, email, fullName, avatarUrl", async () => {
    const testUser = await createTestUser("me_fields");

    const app = createTestApp((a) => {
      a.post("/test/login", (req, res, next) => {
        req.login(testUser, (err) => {
          if (err) return next(err);
          res.json({ ok: true });
        });
      });
    });

    const agent = request.agent(app);
    await agent.post("/test/login").send({}).expect(200);

    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body).toHaveProperty("id");
    expect(meRes.body).toHaveProperty("username");
    // fullName and avatarUrl may be null for test users but should be present as keys
    expect("fullName" in meRes.body).toBe(true);
    expect("avatarUrl" in meRes.body).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/logout
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /auth/logout", () => {
  it("returns 200 and subsequent GET /auth/me returns 401", async () => {
    const testUser = await createTestUser("logout");

    const app = createTestApp((a) => {
      a.post("/test/login", (req, res, next) => {
        req.login(testUser, (err) => {
          if (err) return next(err);
          res.json({ ok: true });
        });
      });
    });

    const agent = request.agent(app);

    // Log in
    await agent.post("/test/login").send({}).expect(200);

    // Verify authenticated
    const meBeforeLogout = await agent.get("/auth/me");
    expect(meBeforeLogout.status).toBe(200);

    // Logout
    const logoutRes = await agent.post("/auth/logout");
    expect(logoutRes.status).toBe(200);

    // Session should now be destroyed
    const meAfterLogout = await agent.get("/auth/me");
    expect(meAfterLogout.status).toBe(401);
  });

  it("returns success JSON on logout", async () => {
    const testUser = await createTestUser("logout_resp");

    const app = createTestApp((a) => {
      a.post("/test/login", (req, res, next) => {
        req.login(testUser, (err) => {
          if (err) return next(err);
          res.json({ ok: true });
        });
      });
    });

    const agent = request.agent(app);
    await agent.post("/test/login").send({}).expect(200);

    const logoutRes = await agent.post("/auth/logout");
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toHaveProperty("success", true);
  });

  it("returns 401 from /auth/me even if same cookie is reused after logout", async () => {
    const testUser = await createTestUser("logout_cookie");

    const app = createTestApp((a) => {
      a.post("/test/login", (req, res, next) => {
        req.login(testUser, (err) => {
          if (err) return next(err);
          res.json({ ok: true });
        });
      });
    });

    const agent = request.agent(app);
    await agent.post("/test/login").send({}).expect(200);
    await agent.post("/auth/logout").expect(200);

    // Second GET /auth/me after logout
    const meRes = await agent.get("/auth/me");
    expect(meRes.status).toBe(401);

    // Third request — still 401
    const meRes2 = await agent.get("/auth/me");
    expect(meRes2.status).toBe(401);
  });
});
