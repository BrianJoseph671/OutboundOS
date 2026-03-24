import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Router } from "express";
// Import express-session to activate its global Request.session type augmentation
import "express-session";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { User as DbUser } from "@shared/schema";

// Augment Express.User so req.user is properly typed throughout the app.
// Must match the shape of DbUser (inferred from the users Drizzle table).
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends DbUser {}
  }
}

// ── Passport serialization ────────────────────────────────────────────────────
// Store only the user ID in the session; never the password.
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    done(null, user ?? false);
  } catch (err) {
    done(err as Error);
  }
});

// ── Google OAuth strategy ─────────────────────────────────────────────────────
// Only register the strategy when credentials are provided (allows tests to run
// without Google credentials while still exercising other auth routes).
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (clientId && clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: clientId,
        clientSecret,
        callbackURL: "/auth/google/callback",
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value ?? null;
          const fullName = profile.displayName ?? null;
          const avatarUrl = profile.photos?.[0]?.value ?? null;

          // Look up existing user by google_id
          const [existing] = await db
            .select()
            .from(users)
            .where(eq(users.googleId, googleId));

          if (existing) {
            // Returning user — update mutable profile fields
            const [updated] = await db
              .update(users)
              .set({ email, fullName, avatarUrl })
              .where(eq(users.id, existing.id))
              .returning();
            return done(null, updated);
          }

          // First login — create new user (no password; OAuth-only account)
          const [newUser] = await db
            .insert(users)
            .values({
              username: email ?? googleId,
              password: "", // OAuth users have no local password
              googleId,
              email,
              fullName,
              avatarUrl,
            })
            .returning();

          return done(null, newUser);
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );
}

// ── Auth router ───────────────────────────────────────────────────────────────
export const authRouter = Router();

/**
 * GET /auth/google
 * Redirects to Google's OAuth consent screen.
 */
authRouter.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["openid", "profile", "email"] }),
);

/**
 * GET /auth/google/callback
 * Google redirects here after the user grants/denies access.
 * On success → redirect to app root; on failure → redirect to login.
 */
authRouter.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    successRedirect: "/",
    failureRedirect: "/auth/google",
  }),
);

/**
 * GET /auth/me
 * Returns the currently authenticated user (without password) or 401.
 */
authRouter.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  // Strip password before sending to client
  const { password: _password, ...safeUser } = req.user;
  res.json(safeUser);
});

/**
 * POST /auth/logout
 * Destroys the server-side session and clears the session cookie.
 */
authRouter.post("/auth/logout", (req, res) => {
  req.logout((logoutErr) => {
    if (logoutErr) {
      return res.status(500).json({ error: "Logout failed" });
    }
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        return res.status(500).json({ error: "Session destroy failed" });
      }
      res.clearCookie("connect.sid");
      res.status(200).json({ success: true });
    });
  });
});

export { passport };
