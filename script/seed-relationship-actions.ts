/**
 * Local dev seed — pending Actions + Interactions for RelationshipOS UI testing.
 *
 * Usage (PowerShell):
 *   $env:DEV_SEED_USER_EMAIL="you@example.com"; npm run dev:seed-actions
 *   # or
 *   $env:DEV_SEED_USER_ID="<uuid-from-users-table>"; npm run dev:seed-actions
 *
 * Prefer (no user id guesswork): while logged in at http://localhost:5000, run in the browser console:
 *   fetch("/api/dev/seed-relationship-actions", { method: "POST", credentials: "include" }).then(r => r.json()).then(console.log)
 *
 * Idempotent: safe to re-run; skips if seed interactions already exist.
 * Requires DATABASE_URL (same as the app).
 */
import "dotenv/config";
import { storage } from "../server/storage";
import { pool } from "../server/db";
import { seedRelationshipActionsForUser } from "../server/services/seedRelationshipActions";

async function resolveUserId(): Promise<string> {
  const id = process.env.DEV_SEED_USER_ID?.trim();
  if (id) {
    const user = await storage.getUser(id);
    if (!user) {
      throw new Error(`DEV_SEED_USER_ID=${id}: no user with that id`);
    }
    return user.id;
  }

  const email = process.env.DEV_SEED_USER_EMAIL?.trim();
  if (email) {
    const user = await storage.getUserByEmail(email);
    if (!user) {
      throw new Error(`DEV_SEED_USER_EMAIL=${email}: no user with that email`);
    }
    return user.id;
  }

  throw new Error(
    "Set DEV_SEED_USER_ID or DEV_SEED_USER_EMAIL to a user in your DB,\n" +
      "or use POST /api/dev/seed-relationship-actions while logged in (see script header).\n" +
      "Tip: GET /auth/me in the browser shows your real session id — use that as DEV_SEED_USER_ID.",
  );
}

async function main(): Promise<void> {
  const userId = await resolveUserId();
  const result = await seedRelationshipActionsForUser(userId);
  console.log(result.message);
  if (!result.skipped && result.contactId) {
    console.log("Dev contact id:", result.contactId);
  }
  console.log("Seeded user id:", result.userId, "(must match GET /auth/me → id when testing in the browser)");
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
