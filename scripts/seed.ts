/**
 * Seed script for Phase 1 RelationshipOS schema.
 *
 * Run AFTER `npm run db:push` to:
 * 1. Create the placeholder Brian seed user (if not exists)
 * 2. Backfill all existing contacts with the seed user_id
 * 3. Apply NOT NULL constraint on contacts.user_id
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import { users, contacts } from "../shared/schema";
import { eq, isNull } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  console.log("[seed] Starting Phase 1 seed...");

  // ── Step 1: Ensure the seed user exists ───────────────────────────────────
  // Look for an existing user with the placeholder username
  const SEED_USERNAME = "brian_placeholder";
  const SEED_EMAIL = process.env.BRIAN_EMAIL ?? "brian@example.com";

  let [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.username, SEED_USERNAME))
    .limit(1);

  if (!existingUser) {
    console.log(`[seed] Creating seed user '${SEED_USERNAME}'...`);
    const [created] = await db
      .insert(users)
      .values({
        username: SEED_USERNAME,
        password: "placeholder_change_on_first_login",
        email: SEED_EMAIL,
        fullName: "Brian Joseph",
        // google_id left null — will be filled in on first OAuth login
      })
      .returning();
    existingUser = created;
    console.log(`[seed] Seed user created with ID: ${existingUser.id}`);
  } else {
    console.log(`[seed] Seed user already exists with ID: ${existingUser.id}`);
  }

  const seedUserId = existingUser.id;

  // ── Step 2: Backfill contacts that have no user_id ────────────────────────
  const backfillResult = await db
    .update(contacts)
    .set({ userId: seedUserId })
    .where(isNull(contacts.userId))
    .returning({ id: contacts.id });

  console.log(`[seed] Backfilled ${backfillResult.length} contacts with seed user_id`);

  // ── Step 3: Verify no NULL user_ids remain ────────────────────────────────
  const nullCount = await db.execute(
    sql`SELECT COUNT(*) as count FROM contacts WHERE user_id IS NULL`
  );
  const remaining = Number((nullCount.rows[0] as Record<string, unknown>).count);
  if (remaining > 0) {
    throw new Error(`[seed] ERROR: ${remaining} contacts still have NULL user_id`);
  }

  // ── Step 4: Apply NOT NULL constraint on contacts.user_id ─────────────────
  // This is safe because we just verified there are no NULLs.
  try {
    await db.execute(sql`
      ALTER TABLE contacts
      ALTER COLUMN user_id SET NOT NULL
    `);
    console.log("[seed] Applied NOT NULL constraint on contacts.user_id");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already") || msg.includes("cannot")) {
      // Constraint might already be set — that's fine
      console.log("[seed] NOT NULL constraint already exists on contacts.user_id (skipped)");
    } else {
      throw err;
    }
  }

  console.log("[seed] ✅ Phase 1 seed complete");
  console.log(`[seed] Seed user ID: ${seedUserId}`);
}

main()
  .catch((err) => {
    console.error("[seed] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
