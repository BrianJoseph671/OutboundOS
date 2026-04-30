import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Router, type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";

// Export passport so tests can import it directly
export { passport };

/** Same-origin path only — prevents open redirects after OAuth. */
export function safeOAuthReturnPath(next: unknown): string {
  if (typeof next !== "string") return "/";
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  if (trimmed.includes("://")) return "/";
  return trimmed.split("#")[0] || "/";
}

declare module "express-session" {
  interface SessionData {
    oauthReturnTo?: string;
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      email: string | null;
      googleId: string | null;
      fullName: string | null;
      avatarUrl: string | null;
      createdAt: Date;
      password: string | null;
    }
  }
}

const BCRYPT_ROUNDS = 12;

// ── Module-level passport configuration (registers once on import) ────────────

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    done(null, user ? (user as Express.User) : false);
  } catch (err) {
    done(err);
  }
});

// ── authRouter — auth routes usable independently of setupAuth() ──────────────
// Exported so tests can mount it directly without calling setupAuth().

export const authRouter = Router();

function meHandler(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = req.user as any;
  res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    displayName: user.fullName ?? user.displayName ?? null,
    picture: user.avatarUrl ?? user.picture ?? null,
  });
}

function logoutHandler(req: Request, res: Response, next: NextFunction) {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
}

export function isNotreDameEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase().endsWith("@nd.edu");
}

authRouter.get("/api/auth/me", meHandler);
authRouter.get("/auth/me", meHandler);
authRouter.post("/api/auth/logout", logoutHandler);
authRouter.post("/auth/logout", logoutHandler);

// ─────────────────────────────────────────────────────────────────────────────

async function generateUniqueUsername(baseUsername: string): Promise<string> {
  const sanitized = baseUsername.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24);
  const [existing] = await db.select().from(users).where(eq(users.username, sanitized));
  if (!existing) return sanitized;
  const suffix = randomBytes(3).toString("hex");
  return `${sanitized}_${suffix}`;
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith("sha256:")) {
    return false;
  }
  return bcrypt.compare(password, hash);
}

export async function findOrCreateGoogleUser(profile: {
  id: string;
  displayName: string;
  emails?: Array<{ value: string }>;
  photos?: Array<{ value: string }>;
}): Promise<Express.User> {
  const googleId = profile.id;
  const email = profile.emails?.[0]?.value ?? null;
  const displayName = profile.displayName;
  const picture = profile.photos?.[0]?.value ?? null;

  const conditions = [eq(users.googleId, googleId)];
  if (email) conditions.push(eq(users.email, email));

  const [existing] = await db.select().from(users).where(or(...conditions));

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        googleId,
        fullName: displayName,
        avatarUrl: picture,
        email: email ?? existing.email,
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated as Express.User;
  }

  const usernameBase = email
    ? email.split("@")[0]
    : `google_${googleId.slice(0, 8)}`;
  const username = await generateUniqueUsername(usernameBase);
  // Keep Google-only accounts compatible with older DBs that still enforce
  // users.password NOT NULL locally.
  const generatedPassword = await hashPassword(randomBytes(24).toString("hex"));

  const [created] = await db
    .insert(users)
    .values({
      username,
      password: generatedPassword,
      email,
      googleId,
      fullName: displayName,
      avatarUrl: picture,
    })
    .returning();

  return created as Express.User;
}

async function ensureSessionTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      ) WITH (OIDS=FALSE);
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
  } catch (err) {
    console.error("[Auth] Failed to create session table:", err);
  }
}

export async function setupAuth(app: Express) {
  await ensureSessionTable();

  const PgSession = connectPgSimple(session);

  const sessionSecret = process.env.SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  if (!sessionSecret) {
    if (isProduction) {
      console.error("[Auth] FATAL: SESSION_SECRET environment variable is required in production.");
      process.exit(1);
    } else {
      console.warn(
        "[Auth] WARNING: SESSION_SECRET not set. Using insecure default — only acceptable in development."
      );
    }
  }

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
      }),
      secret: sessionSecret || "outboundos-dev-only-insecure-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          if (isNotreDameEmail(email)) {
            return done(null, false, { message: "Notre Dame accounts must sign in with Google." });
          }
          const [user] = await db
            .select()
            .from(users)
            .where(or(eq(users.email, email), eq(users.username, email)));

          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }
          if (!user.password) {
            return done(null, false, { message: "This account uses Google sign-in" });
          }
          const valid = await verifyPassword(password, user.password);
          if (!valid) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, user as Express.User);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (googleClientId && googleClientSecret) {
    const baseUrl = process.env.APP_URL ||
      (process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
        : "http://localhost:5000");
    const callbackURL = process.env.GOOGLE_CALLBACK_URL || `${baseUrl}/api/auth/google/callback`;
    console.info(`[Auth] Google OAuth callback URL: ${callbackURL}`);

    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const user = await findOrCreateGoogleUser(profile);
            return done(null, user);
          } catch (err) {
            return done(err as Error);
          }
        }
      )
    );

    const startGoogleOAuth = (req: Request, res: Response, next: NextFunction) => {
      const raw = req.query.next;
      const rawHd = req.query.hd;
      const hd = typeof rawHd === "string" && rawHd.trim() ? rawHd.trim() : undefined;
      if (typeof raw === "string") {
        req.session.oauthReturnTo = safeOAuthReturnPath(raw);
      } else {
        delete req.session.oauthReturnTo;
      }
      req.session.save((err) => {
        if (err) return next(err);
        passport.authenticate("google", {
          scope: ["profile", "email"],
          prompt: "login select_account",
          ...(hd ? { hd } : {}),
        })(req, res, next);
      });
    };

    app.get("/api/auth/google", startGoogleOAuth);
    app.get("/auth/google", startGoogleOAuth);

    const afterGoogleCallback = (req: Request, res: Response) => {
      const dest = safeOAuthReturnPath(req.session.oauthReturnTo);
      delete req.session.oauthReturnTo;
      res.redirect(dest);
    };

    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login?error=google_auth_failed" }),
      afterGoogleCallback,
    );
    app.get(
      "/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login?error=google_auth_failed" }),
      afterGoogleCallback,
    );
  } else {
    console.info("[Auth] Google OAuth not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set)");
  }

  // Mount authRouter (me, logout, config routes)
  app.use(authRouter);

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, displayName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      if (isNotreDameEmail(email)) {
        return res.status(400).json({ message: "Notre Dame accounts must sign in with Google." });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing) {
        return res.status(409).json({ message: "Email already registered" });
      }

      const username = await generateUniqueUsername(email.split("@")[0]);
      const hashedPassword = await hashPassword(password);

      const [user] = await db
        .insert(users)
        .values({
          username,
          email,
          password: hashedPassword,
          fullName: displayName || username,
        })
        .returning();

      req.login(user as Express.User, (err) => {
        if (err) return res.status(500).json({ message: "Login after register failed" });
        return res.json({
          id: user.id,
          email: user.email,
          displayName: (user as any).fullName ?? null,
          picture: (user as any).avatarUrl ?? null,
        });
      });
    } catch (err: any) {
      console.error("[Auth] Register error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: { message: string } | undefined) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        return res.json({
          id: user.id,
          email: user.email,
          displayName: (user as any).fullName ?? null,
          picture: (user as any).avatarUrl ?? null,
        });
      });
    })(req, res, next);
  });

  app.get("/api/auth/config", (_req: Request, res: Response) => {
    res.json({
      googleEnabled: !!(googleClientId && googleClientSecret),
    });
  });
}

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Authentication required" });
}
