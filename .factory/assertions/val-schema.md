# VAL-SCHEMA: Database Schema & Storage Layer Assertions

> RelationshipOS Phase 1 — testable behavioral assertions for schema migrations, seed data, storage methods, and application-level logic.

---

## Schema Integrity

### VAL-SCHEMA-001: Users table has new Phase 1 columns with correct types and constraints

**Title:** Users table extended with email, full_name, google_id, avatar_url, created_at

**Behavioral description:**  
After migration, the `users` table includes: `email` (text, unique, nullable), `full_name` (text, nullable), `google_id` (text, unique, nullable), `avatar_url` (text, nullable), `created_at` (timestamp, NOT NULL, default `now()`). Selecting `information_schema.columns` for `users` returns all five new columns with the expected `data_type`, `is_nullable`, and `column_default` values. The existing `id`, `username`, and `password` columns remain unchanged.

**Pass criteria:**  
- `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'users'` shows all 8 columns (3 original + 5 new).  
- `email` and `google_id` each have a `UNIQUE` constraint in `pg_indexes`.  
- `created_at` is NOT NULL with default `now()`.  
- `email`, `full_name`, `google_id`, `avatar_url` are all nullable.

**Fail criteria:** Any column missing, wrong type, wrong nullability, or missing unique constraint.

**Evidence:** Query `information_schema.columns` and `pg_indexes`; or inspect Drizzle schema object at runtime.

---

### VAL-SCHEMA-002: Contacts table has new Phase 1 columns with correct types, defaults, and FK

**Title:** Contacts table extended with user_id, source, tier, last_interaction_at, last_interaction_channel, updated_at

**Behavioral description:**  
After migration and backfill, the `contacts` table includes: `user_id` (varchar, NOT NULL, FK → `users.id`), `source` (text, nullable), `tier` (text, NOT NULL, default `'cool'`), `last_interaction_at` (timestamp, nullable), `last_interaction_channel` (text, nullable), `updated_at` (timestamp, NOT NULL, default `now()`). All existing columns remain unchanged.

**Pass criteria:**  
- All six new columns exist with expected types.  
- `user_id` is NOT NULL and has a foreign key constraint referencing `users(id)`.  
- `tier` defaults to `'cool'`.  
- `updated_at` defaults to `now()`.  
- Inserting a contact without `user_id` fails with a NOT NULL constraint violation.  
- Inserting a contact with a nonexistent `user_id` fails with a FK violation.

**Fail criteria:** Missing column, wrong default, nullable `user_id`, or missing FK constraint.

**Evidence:** `information_schema.columns`, `information_schema.table_constraints`, `information_schema.key_column_usage`.

---

### VAL-SCHEMA-003: Interactions table created with all columns, constraints, and indexes

**Title:** Interactions table schema is correct

**Behavioral description:**  
A new `interactions` table exists with columns: `id` (varchar, PK, default `gen_random_uuid()`), `user_id` (varchar, NOT NULL, FK → `users.id`), `contact_id` (varchar, NOT NULL, FK → `contacts.id` ON DELETE CASCADE), `channel` (text, NOT NULL), `direction` (text, NOT NULL), `occurred_at` (timestamp, NOT NULL), `source_id` (text, nullable), `summary` (text, nullable), `raw_content` (text, nullable), `open_threads` (jsonb, nullable), `ingested_at` (timestamp, NOT NULL, default `now()`).

**Pass criteria:**  
- Table `interactions` exists.  
- All 11 columns present with correct types and constraints.  
- `id` is PK with UUID default.  
- `contact_id` FK cascades on delete.  
- `user_id` FK exists to `users.id`.

**Fail criteria:** Table missing, column missing, wrong types, missing FK or cascade behavior.

**Evidence:** `information_schema.columns`, `information_schema.table_constraints`.

---

### VAL-SCHEMA-004: Composite unique partial index on interactions (channel, source_id) WHERE source_id IS NOT NULL

**Title:** Deduplication index prevents duplicate interactions from the same external source

**Behavioral description:**  
A unique index exists on `interactions(channel, source_id)` filtered to rows where `source_id IS NOT NULL`. Inserting two interactions with the same `(channel, source_id)` where `source_id` is non-null causes a unique constraint violation. Inserting two interactions with `source_id = NULL` and the same `channel` succeeds (NULLs are not considered equal in partial indexes).

**Pass criteria:**  
- `pg_indexes` shows the index with the `WHERE source_id IS NOT NULL` predicate.  
- INSERT of a duplicate `(channel, source_id)` pair (both non-null) raises a unique violation error.  
- INSERT of two rows with `source_id = NULL` and same `channel` succeeds without error.

**Fail criteria:** Index missing, index not partial, or duplicate non-null inserts succeed.

**Evidence:** `pg_indexes` query; two INSERT attempts with expected outcomes.

---

### VAL-SCHEMA-005: Performance indexes on interactions (user_id, contact_id) and (user_id, occurred_at)

**Title:** Query-performance indexes exist on interactions table

**Behavioral description:**  
Two non-unique indexes exist on the `interactions` table: one on `(user_id, contact_id)` for per-contact interaction lookups, and one on `(user_id, occurred_at)` for chronological timeline queries.

**Pass criteria:**  
- `pg_indexes` contains an index on `interactions` covering `(user_id, contact_id)`.  
- `pg_indexes` contains an index on `interactions` covering `(user_id, occurred_at)`.

**Fail criteria:** Either index missing.

**Evidence:** `SELECT * FROM pg_indexes WHERE tablename = 'interactions'`.

---

## Seed & Backfill

### VAL-SCHEMA-006: Seed user record exists with correct placeholder values

**Title:** A seed user is created during migration

**Behavioral description:**  
After migration completes, a user row exists with known placeholder values (e.g., a deterministic username and hashed password). The `email`, `full_name`, `google_id`, and `avatar_url` fields may be null. The `created_at` timestamp is set.

**Pass criteria:**  
- `SELECT * FROM users LIMIT 1` returns exactly one row.  
- The row has a valid UUID `id`, a non-empty `username`, a non-empty `password`, and a non-null `created_at`.

**Fail criteria:** No user row exists; or the row is missing required fields.

**Evidence:** Direct SELECT on `users` table.

---

### VAL-SCHEMA-007: Existing contacts are backfilled with the seed user's ID

**Title:** All pre-existing contacts have user_id set after migration

**Behavioral description:**  
Before the NOT NULL constraint on `contacts.user_id` is applied, the migration backfills all existing contact rows with the seed user's `id`. After migration, `SELECT count(*) FROM contacts WHERE user_id IS NULL` returns 0.

**Pass criteria:**  
- No contact has a NULL `user_id`.  
- All contacts' `user_id` values match the seed user's `id`.  
- The `user_id` column has a NOT NULL constraint (verified via `information_schema.columns`).

**Fail criteria:** Any contact has NULL `user_id`; or the NOT NULL constraint is absent post-migration.

**Evidence:** `SELECT count(*) FROM contacts WHERE user_id IS NULL`; `information_schema.columns` for `is_nullable`.

---

## Foreign Key Behavior

### VAL-SCHEMA-008: Deleting a contact cascades to delete its interactions

**Title:** CASCADE DELETE on interactions.contact_id

**Behavioral description:**  
When a contact is deleted, all associated interaction rows are automatically removed by the database cascade rule. No orphan interactions remain.

**Pass criteria:**  
1. Create a contact and an interaction linked to it.  
2. Delete the contact.  
3. `SELECT * FROM interactions WHERE contact_id = <deleted_id>` returns 0 rows.

**Fail criteria:** Interactions remain after contact deletion; or a FK violation prevents contact deletion.

**Evidence:** Insert + delete + count query.

---

### VAL-SCHEMA-009: Inserting an interaction with a nonexistent contact_id or user_id fails

**Title:** FK constraints enforce referential integrity on interactions

**Behavioral description:**  
Attempting to insert an interaction row with a `contact_id` that does not exist in `contacts` raises a foreign key violation. Similarly, a `user_id` that does not exist in `users` raises a violation.

**Pass criteria:**  
- INSERT with invalid `contact_id` → FK violation error.  
- INSERT with invalid `user_id` → FK violation error.

**Fail criteria:** Either insert succeeds.

**Evidence:** Two INSERT attempts that both produce expected error codes.

---

## Storage Layer (IStorage Interface)

### VAL-SCHEMA-010: IStorage exposes interaction CRUD methods

**Title:** Storage interface includes createInteraction, getInteraction, getInteractionsByContact, getInteractionsByUser, updateInteraction, deleteInteraction

**Behavioral description:**  
The `IStorage` interface in `server/storage.ts` declares methods for interaction CRUD. The `DatabaseStorage` class implements all of them. Each method correctly maps to the underlying Drizzle query on the `interactions` table.

**Pass criteria:**  
- TypeScript compilation succeeds with the new interface methods.  
- Calling `storage.createInteraction(...)` with valid data returns an `Interaction` object with all columns populated.  
- Calling `storage.getInteraction(id)` retrieves the created row.  
- Calling `storage.getInteractionsByContact(contactId)` returns an array filtered to that contact.  
- Calling `storage.getInteractionsByUser(userId)` returns an array filtered to that user.  
- Calling `storage.updateInteraction(id, {summary: "updated"})` updates the row and returns it.  
- Calling `storage.deleteInteraction(id)` removes the row and returns `true`; a second call returns `false`.

**Fail criteria:** Any method missing, compilation error, or incorrect query behavior.

**Evidence:** TypeScript type check (`npm run check`); runtime integration test or manual API call.

---

## Application-Level Logic

### VAL-SCHEMA-011: contacts.updated_at is set to current timestamp on any contact update

**Title:** Application-level updated_at auto-update on contacts

**Behavioral description:**  
When `storage.updateContact(id, data)` is called, the `updated_at` column is automatically set to the current timestamp regardless of whether the caller included `updated_at` in the payload. This is enforced at the application level (in `DatabaseStorage.updateContact`), not via a database trigger.

**Pass criteria:**  
1. Create a contact. Note its `updated_at` value (T1).  
2. Wait ≥1ms, then call `updateContact(id, { company: "NewCo" })` without passing `updated_at`.  
3. The returned contact has `updated_at` > T1.

**Fail criteria:** `updated_at` remains at T1 after the update; or is not included in the update SET clause.

**Evidence:** Timestamp comparison on the returned Contact object.

---

### VAL-SCHEMA-012: contacts.last_interaction_at is updated when a new interaction is created

**Title:** Creating an interaction updates the linked contact's last_interaction_at

**Behavioral description:**  
When `storage.createInteraction(...)` is called, the storage layer automatically updates the corresponding contact's `last_interaction_at` to the interaction's `occurred_at` value (or `now()`) and `last_interaction_channel` to the interaction's `channel`. This keeps the contact record's interaction summary current without a separate call.

**Pass criteria:**  
1. Create a contact. Confirm `last_interaction_at` is NULL.  
2. Create an interaction with `contact_id` pointing to that contact, `channel: "email"`, `occurred_at: T`.  
3. Fetch the contact. `last_interaction_at` equals T; `last_interaction_channel` equals `"email"`.  
4. Create a second interaction with `occurred_at: T+1`, `channel: "linkedin_connected"`.  
5. Fetch the contact. `last_interaction_at` equals T+1; `last_interaction_channel` equals `"linkedin_connected"`.

**Fail criteria:** Contact's `last_interaction_at` or `last_interaction_channel` is not updated after creating an interaction.

**Evidence:** Fetch contact before and after interaction creation; compare fields.

---

## Multi-User Isolation

### VAL-SCHEMA-013: Contact queries are scoped to the calling user's user_id

**Title:** getContacts returns only contacts belonging to the requesting user

**Behavioral description:**  
The `getContacts(userId)` method (or its updated signature) filters by `user_id`. User A's contacts are never returned when User B queries. This applies to all contact-related reads: `getContacts`, `getContact`, and any search or listing endpoint.

**Pass criteria:**  
1. Create User A and User B.  
2. Create contacts C1 (user_id=A) and C2 (user_id=B).  
3. `getContacts(A)` returns [C1] only.  
4. `getContacts(B)` returns [C2] only.  
5. `getContact(C2.id)` called by User A returns `undefined` (or access denied).

**Fail criteria:** A user can see another user's contacts.

**Evidence:** Two separate `getContacts` calls with different user IDs; compare returned IDs.

---

### VAL-SCHEMA-014: Interaction queries are scoped to the calling user's user_id

**Title:** getInteractionsByUser returns only the requesting user's interactions

**Behavioral description:**  
The `getInteractionsByUser(userId)` method filters by `user_id`. Interactions belonging to User A are never returned to User B, even if they share contacts (which they shouldn't, per VAL-SCHEMA-013).

**Pass criteria:**  
1. Create User A and User B, each with their own contacts and interactions.  
2. `getInteractionsByUser(A)` returns only A's interactions.  
3. `getInteractionsByUser(B)` returns only B's interactions.

**Fail criteria:** Interactions leak across user boundaries.

**Evidence:** Two `getInteractionsByUser` calls; compare results.

---

## Edge Cases

### VAL-SCHEMA-015: Tier column defaults to 'cool' when not specified

**Title:** Default tier value on contact creation

**Behavioral description:**  
When a contact is created via `storage.createContact(...)` without specifying a `tier` value, the resulting contact has `tier = 'cool'`.

**Pass criteria:**  
- `createContact({ name: "Test", userId: seedUserId })` returns a contact with `tier === "cool"`.

**Fail criteria:** `tier` is null or a different default.

**Evidence:** Inspect returned Contact object.

---

### VAL-SCHEMA-016: Interactions with NULL source_id do not trigger the partial unique index

**Title:** Multiple interactions with NULL source_id and same channel are allowed

**Behavioral description:**  
The partial unique index on `(channel, source_id) WHERE source_id IS NOT NULL` must not prevent inserting multiple interactions that have `source_id = NULL` and the same `channel`. This correctly models manually-logged interactions that have no external source identifier.

**Pass criteria:**  
1. Insert interaction with `channel: "email", source_id: null`.  
2. Insert another interaction with `channel: "email", source_id: null`.  
3. Both inserts succeed.

**Fail criteria:** Second insert raises a unique constraint violation.

**Evidence:** Two sequential INSERT operations both return successfully.

---

### VAL-SCHEMA-017: Drizzle schema types align with migration SQL

**Title:** Drizzle ORM `interactions` table definition matches the SQL migration

**Behavioral description:**  
The Drizzle table definition in `shared/schema.ts` for the `interactions` table matches the SQL migration file column-for-column (names, types, constraints, defaults). Running `npm run check` (TypeScript type check) passes, and `drizzle-kit generate` produces no diff (schema is in sync).

**Pass criteria:**  
- `npm run check` exits 0.  
- `drizzle-kit generate` reports "No schema changes detected" (or equivalent).

**Fail criteria:** Type check fails; or drizzle-kit detects a drift between schema.ts and the database.

**Evidence:** CLI output of both commands.

---

## Summary Table

| ID | Area | Title |
|---|---|---|
| VAL-SCHEMA-001 | Schema Integrity | Users table extended columns |
| VAL-SCHEMA-002 | Schema Integrity | Contacts table extended columns + FK |
| VAL-SCHEMA-003 | Schema Integrity | Interactions table creation |
| VAL-SCHEMA-004 | Schema Integrity | Composite unique partial index |
| VAL-SCHEMA-005 | Schema Integrity | Performance indexes |
| VAL-SCHEMA-006 | Seed & Backfill | Seed user exists |
| VAL-SCHEMA-007 | Seed & Backfill | Contacts backfilled with user_id |
| VAL-SCHEMA-008 | FK Behavior | CASCADE DELETE contact → interactions |
| VAL-SCHEMA-009 | FK Behavior | FK violations on invalid references |
| VAL-SCHEMA-010 | Storage Layer | IStorage interaction CRUD methods |
| VAL-SCHEMA-011 | App Logic | updated_at auto-update on contacts |
| VAL-SCHEMA-012 | App Logic | last_interaction_at update on new interaction |
| VAL-SCHEMA-013 | Multi-User | Contact query isolation |
| VAL-SCHEMA-014 | Multi-User | Interaction query isolation |
| VAL-SCHEMA-015 | Edge Cases | Tier default value |
| VAL-SCHEMA-016 | Edge Cases | NULL source_id partial index behavior |
| VAL-SCHEMA-017 | Edge Cases | Drizzle ↔ migration alignment |
