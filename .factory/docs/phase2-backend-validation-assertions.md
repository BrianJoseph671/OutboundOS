# Phase 2 Backend Validation Assertions

> Prefix: **VAL-API-**
> Scope: Schema, Storage Layer, API Routes for Phase 2 (Agent + Ingestion + Actions Page)

---

## 1. Schema Correctness

### contacts.last_synced_at

- **VAL-API-SCH-001**: `contacts` table includes a `last_synced_at` column of type `TIMESTAMPTZ`, nullable, with no default value.
- **VAL-API-SCH-002**: `last_synced_at` defaults to `NULL` for new contacts (never synced).
- **VAL-API-SCH-003**: `last_synced_at` is exposed on the `Contact` TypeScript type via Drizzle `$inferSelect`.
- **VAL-API-SCH-004**: Existing contacts are unaffected by migration — `last_synced_at` is `NULL` after migration runs.

### actions table

- **VAL-API-SCH-010**: `actions` table exists with columns: `id` (UUID PK, auto-generated), `user_id` (UUID FK → `users.id`, NOT NULL), `contact_id` (UUID FK → `contacts.id`, NOT NULL), `action_type` (TEXT NOT NULL), `trigger_interaction_id` (UUID FK → `interactions.id`, nullable), `priority` (INTEGER NOT NULL DEFAULT 0), `status` (TEXT NOT NULL DEFAULT `'pending'`), `snoozed_until` (TIMESTAMPTZ, nullable), `reason` (TEXT NOT NULL), `created_at` (TIMESTAMPTZ DEFAULT `now()`), `completed_at` (TIMESTAMPTZ, nullable).
- **VAL-API-SCH-011**: `actions.user_id` has a foreign key to `users.id` with `ON DELETE CASCADE`.
- **VAL-API-SCH-012**: `actions.contact_id` has a foreign key to `contacts.id` with `ON DELETE CASCADE`.
- **VAL-API-SCH-013**: `actions.trigger_interaction_id` has a foreign key to `interactions.id`; nullable (actions can exist without a source interaction).
- **VAL-API-SCH-014**: `action_type` only accepts values: `follow_up`, `reconnect`, `open_thread`, `new_contact`. Enforced via TypeScript enum/const array and Zod validation (DB-level TEXT allows flexibility; app-level validation is strict).
- **VAL-API-SCH-015**: `status` only accepts values: `pending`, `completed`, `dismissed`, `snoozed`. Enforced via TypeScript enum/const array and Zod validation.
- **VAL-API-SCH-016**: `priority` defaults to `0` when not specified.
- **VAL-API-SCH-017**: `status` defaults to `'pending'` when not specified.
- **VAL-API-SCH-018**: `completed_at` is `NULL` for newly created actions and set to a timestamp when status transitions to `completed` or `dismissed`.
- **VAL-API-SCH-019**: `snoozed_until` is `NULL` for non-snoozed actions and set to a future timestamp when status is `snoozed`.
- **VAL-API-SCH-020**: A Drizzle Zod insert schema (`insertActionSchema`) is generated and exported from `shared/schema.ts`.
- **VAL-API-SCH-021**: TypeScript types `Action` (select) and `InsertAction` (insert) are exported from `shared/schema.ts`.
- **VAL-API-SCH-022**: An index exists on `actions(user_id)` for efficient user-scoped queries.
- **VAL-API-SCH-023**: An index exists on `actions(user_id, status)` for efficient filtered queries.

### drafts_log table

- **VAL-API-SCH-030**: `drafts_log` table exists with columns: `id` (UUID PK, auto-generated), `user_id` (UUID FK → `users.id`, NOT NULL), `contact_id` (UUID FK → `contacts.id`, NOT NULL), `action_id` (UUID FK → `actions.id`, nullable), `superhuman_draft_id` (TEXT), `instructions` (TEXT), `generated_body` (TEXT), `final_body` (TEXT, nullable), `play_type` (TEXT, nullable), `created_at` (TIMESTAMPTZ DEFAULT `now()`).
- **VAL-API-SCH-031**: `drafts_log.user_id` has a foreign key to `users.id` with `ON DELETE CASCADE`.
- **VAL-API-SCH-032**: `drafts_log.contact_id` has a foreign key to `contacts.id` with `ON DELETE CASCADE`.
- **VAL-API-SCH-033**: `drafts_log.action_id` has a foreign key to `actions.id`; nullable (drafts can exist without an action context).
- **VAL-API-SCH-034**: `play_type` accepts `warm`, `cold`, `intro`, or `NULL`. Enforced via Zod validation.
- **VAL-API-SCH-035**: A Drizzle Zod insert schema (`insertDraftsLogSchema`) is generated and exported from `shared/schema.ts`.
- **VAL-API-SCH-036**: TypeScript types `DraftsLog` (select) and `InsertDraftsLog` (insert) are exported from `shared/schema.ts`.

### Migration

- **VAL-API-SCH-040**: A single new migration file is created (never modifying existing migration files).
- **VAL-API-SCH-041**: Migration adds `last_synced_at` to `contacts`, creates `actions` table, and creates `drafts_log` table.
- **VAL-API-SCH-042**: Migration is idempotent — running it twice does not error or duplicate structures.

---

## 2. Storage Layer (IStorage Interface)

### Actions CRUD

- **VAL-API-STG-001**: `IStorage` interface includes method `getActions(userId: string, filters?: { status?: string; type?: string; limit?: number; offset?: number }): Promise<Action[]>`.
- **VAL-API-STG-002**: `getActions` returns only actions where `user_id = userId` (user isolation).
- **VAL-API-STG-003**: `getActions` with `status` filter returns only actions matching that status (e.g., `status='pending'` excludes completed/dismissed/snoozed).
- **VAL-API-STG-004**: `getActions` with `type` filter returns only actions matching that `action_type`.
- **VAL-API-STG-005**: `getActions` with `limit` and `offset` returns the correct page of results.
- **VAL-API-STG-006**: `getActions` with no filters returns all actions for the user, ordered by `priority DESC, created_at DESC` (highest priority first, newest first within same priority).
- **VAL-API-STG-007**: `getActions` with `status='pending'` excludes snoozed actions whose `snoozed_until` is still in the future.
- **VAL-API-STG-008**: `getActions` with `status='pending'` includes snoozed actions whose `snoozed_until` has passed (resurfacing).
- **VAL-API-STG-009**: `IStorage` interface includes method `getAction(id: string, userId: string): Promise<Action | undefined>`.
- **VAL-API-STG-010**: `getAction` returns `undefined` when queried with a valid action ID belonging to a different user (user isolation).
- **VAL-API-STG-011**: `getAction` returns `undefined` for a non-existent action ID.
- **VAL-API-STG-012**: `IStorage` interface includes method `createAction(action: InsertAction): Promise<Action>`.
- **VAL-API-STG-013**: `createAction` returns the created action with a generated `id` and `created_at`.
- **VAL-API-STG-014**: `createAction` sets `status` to `'pending'` and `priority` to `0` when not provided.
- **VAL-API-STG-015**: `IStorage` interface includes method `updateAction(id: string, userId: string, data: Partial<InsertAction>): Promise<Action | undefined>`.
- **VAL-API-STG-016**: `updateAction` returns `undefined` when the action ID does not belong to the given `userId` (user isolation — no cross-user mutation).
- **VAL-API-STG-017**: `updateAction` sets `completed_at` to current timestamp when `status` transitions to `completed` or `dismissed`.
- **VAL-API-STG-018**: `updateAction` sets `snoozed_until` when `status` transitions to `snoozed` (caller must provide `snoozed_until` value).
- **VAL-API-STG-019**: `updateAction` clears `snoozed_until` when status transitions away from `snoozed` (e.g., back to `pending`).
- **VAL-API-STG-020**: `IStorage` interface includes method `deleteAction(id: string, userId: string): Promise<boolean>`.
- **VAL-API-STG-021**: `deleteAction` returns `false` when the action ID does not belong to the given `userId`.

### Drafts Log CRUD

- **VAL-API-STG-030**: `IStorage` interface includes method `getDraftsLogs(userId: string, contactId?: string): Promise<DraftsLog[]>`.
- **VAL-API-STG-031**: `getDraftsLogs` returns only drafts where `user_id = userId`.
- **VAL-API-STG-032**: `getDraftsLogs` with `contactId` filters to drafts for that specific contact.
- **VAL-API-STG-033**: `IStorage` interface includes method `getDraftsLog(id: string, userId: string): Promise<DraftsLog | undefined>`.
- **VAL-API-STG-034**: `getDraftsLog` returns `undefined` for a draft belonging to a different user.
- **VAL-API-STG-035**: `IStorage` interface includes method `createDraftsLog(draft: InsertDraftsLog): Promise<DraftsLog>`.
- **VAL-API-STG-036**: `createDraftsLog` returns the created draft with a generated `id` and `created_at`.
- **VAL-API-STG-037**: `IStorage` interface includes method `updateDraftsLog(id: string, userId: string, data: Partial<InsertDraftsLog>): Promise<DraftsLog | undefined>`.
- **VAL-API-STG-038**: `updateDraftsLog` returns `undefined` for a draft belonging to a different user (user isolation).

### Contacts last_synced_at

- **VAL-API-STG-040**: `updateContact` accepts `last_synced_at` as a partial field and persists it correctly.
- **VAL-API-STG-041**: `getContact` / `getContacts` returns `last_synced_at` field on every contact (null or timestamp).

---

## 3. API Routes

### Authentication

- **VAL-API-AUTH-001**: `GET /api/actions` returns `401` when no session/cookie is present (unauthenticated).
- **VAL-API-AUTH-002**: `PATCH /api/actions/:id` returns `401` when no session/cookie is present.
- **VAL-API-AUTH-003**: `POST /api/sync` returns `401` when no session/cookie is present.
- **VAL-API-AUTH-004**: All three routes use `req.user!.id` for user scoping (consistent with existing route pattern).

### GET /api/actions

- **VAL-API-GET-001**: Returns `200` with a JSON array of actions for the authenticated user.
- **VAL-API-GET-002**: Returns an empty array `[]` when user has no actions (not an error).
- **VAL-API-GET-003**: Supports query parameter `?status=pending` and returns only pending actions.
- **VAL-API-GET-004**: Supports query parameter `?type=follow_up` and returns only follow_up actions.
- **VAL-API-GET-005**: Supports query parameter `?limit=20` and returns at most 20 actions.
- **VAL-API-GET-006**: Supports query parameter `?offset=0` for pagination (skip N results).
- **VAL-API-GET-007**: Supports combined filters: `?status=pending&type=follow_up&limit=20&offset=0`.
- **VAL-API-GET-008**: Invalid `status` value (e.g., `?status=invalid`) returns `400` with descriptive error.
- **VAL-API-GET-009**: Invalid `type` value (e.g., `?type=invalid`) returns `400` with descriptive error.
- **VAL-API-GET-010**: Actions belonging to other users are never returned (user isolation).
- **VAL-API-GET-011**: Dismissed actions do not appear when filtering by `?status=pending`.
- **VAL-API-GET-012**: Completed actions do not appear when filtering by `?status=pending`.
- **VAL-API-GET-013**: Snoozed actions with `snoozed_until` in the future do not appear when filtering by `?status=pending`.
- **VAL-API-GET-014**: Snoozed actions with `snoozed_until` in the past resurface and appear when filtering by `?status=pending`.
- **VAL-API-GET-015**: Results are ordered by `priority DESC, created_at DESC` by default.
- **VAL-API-GET-016**: Returns `500` with generic error message on storage/database failure (no stack traces leaked).

### PATCH /api/actions/:id

- **VAL-API-PATCH-001**: Returns `200` with the updated action on success.
- **VAL-API-PATCH-002**: Accepts `{ "status": "completed" }` and sets `completed_at` to current timestamp.
- **VAL-API-PATCH-003**: Accepts `{ "status": "dismissed" }` and sets `completed_at` to current timestamp.
- **VAL-API-PATCH-004**: Accepts `{ "status": "snoozed", "snoozed_until": "<ISO timestamp>" }` and sets `snoozed_until`.
- **VAL-API-PATCH-005**: Returns `400` when `status` is `snoozed` but `snoozed_until` is missing or invalid.
- **VAL-API-PATCH-006**: Returns `404` when the action ID does not exist.
- **VAL-API-PATCH-007**: Returns `404` when the action ID belongs to a different user (no information leakage — same error as non-existent).
- **VAL-API-PATCH-008**: Does not allow updating `user_id`, `id`, or `contact_id` (immutable fields).
- **VAL-API-PATCH-009**: Returns `400` for invalid `status` transition values (e.g., `status: "invalid"`).
- **VAL-API-PATCH-010**: Transitioning from `snoozed` to `pending` clears `snoozed_until` to `NULL`.
- **VAL-API-PATCH-011**: Transitioning from `snoozed` to `completed` sets `completed_at` and clears `snoozed_until`.
- **VAL-API-PATCH-012**: Returns `500` with generic error message on storage failure.

### POST /api/sync

- **VAL-API-SYNC-001**: Returns `200` with JSON body `{ newInteractions: number, newActions: number, errors: string[] }`.
- **VAL-API-SYNC-002**: Returns `{ newInteractions: 0, newActions: 0, errors: [] }` when no new data is found (not an error).
- **VAL-API-SYNC-003**: Populates `errors` array with descriptive messages when individual MCP sources fail (partial success allowed).
- **VAL-API-SYNC-004**: Updates `contacts.last_synced_at` for all contacts that received new interactions during sync.
- **VAL-API-SYNC-005**: Uses `contacts.last_synced_at` to determine sync window (pull since last sync, or 90 days for first sync when `NULL`).
- **VAL-API-SYNC-006**: Returns within 30 seconds (timeout constraint from PRD § 7.1).
- **VAL-API-SYNC-007**: Deduplicates interactions by `source_id` — calling sync twice with no new data creates zero duplicate interactions.
- **VAL-API-SYNC-008**: Creates follow-up actions for inbound interactions with no outbound follow-up.
- **VAL-API-SYNC-009**: Creates reconnect actions for warm/VIP contacts stale >14 days.
- **VAL-API-SYNC-010**: Does not create duplicate actions for the same contact+type when an existing pending action already exists.
- **VAL-API-SYNC-011**: Returns `500` on total failure (all MCP sources fail).
- **VAL-API-SYNC-012**: Scoped entirely to `req.user!.id` — never reads or writes data for other users.

---

## 4. Error Handling

- **VAL-API-ERR-001**: No route returns raw stack traces, SQL errors, or internal implementation details to the client.
- **VAL-API-ERR-002**: All `500` responses use a generic error message pattern (e.g., `{ error: "Failed to <action>" }`), consistent with existing routes.
- **VAL-API-ERR-003**: `400` responses include a descriptive, user-facing error message explaining what was invalid.
- **VAL-API-ERR-004**: `404` responses use the pattern `{ error: "<Resource> not found" }`, consistent with existing routes.
- **VAL-API-ERR-005**: Zod validation errors on action creation/update return `400` with a descriptive message (not raw Zod output).

---

## 5. Data Integrity

- **VAL-API-INT-001**: Deleting a contact cascades and deletes all related actions (FK `ON DELETE CASCADE`).
- **VAL-API-INT-002**: Deleting a contact cascades and deletes all related drafts_log entries (FK `ON DELETE CASCADE`).
- **VAL-API-INT-003**: Deleting an interaction sets `trigger_interaction_id` to `NULL` on related actions (or cascades, depending on FK strategy — must be explicitly defined).
- **VAL-API-INT-004**: Deleting an action sets `action_id` to `NULL` on related drafts_log entries (or cascades — must be explicitly defined).
- **VAL-API-INT-005**: Creating an action with a non-existent `contact_id` fails with a FK constraint error (not silently succeeding).
- **VAL-API-INT-006**: Creating an action with a non-existent `user_id` fails with a FK constraint error.
- **VAL-API-INT-007**: Creating a drafts_log entry with a non-existent `contact_id` fails with a FK constraint error.

---

## 6. User Isolation (Cross-Cutting)

- **VAL-API-ISO-001**: User A cannot read User B's actions via `GET /api/actions`.
- **VAL-API-ISO-002**: User A cannot update User B's actions via `PATCH /api/actions/:id` (returns 404, not 403).
- **VAL-API-ISO-003**: User A's `POST /api/sync` never creates interactions or actions under User B's scope.
- **VAL-API-ISO-004**: Every storage method for actions and drafts_log includes `userId` in its WHERE clause.
- **VAL-API-ISO-005**: `getAction(id, userId)` uses `AND` condition on both `id` and `user_id` (not sequential check).

---

## 7. Status Transition Rules

- **VAL-API-TRANS-001**: `pending` → `completed` is a valid transition; sets `completed_at`.
- **VAL-API-TRANS-002**: `pending` → `dismissed` is a valid transition; sets `completed_at`.
- **VAL-API-TRANS-003**: `pending` → `snoozed` is a valid transition; requires `snoozed_until`.
- **VAL-API-TRANS-004**: `snoozed` → `pending` is a valid transition; clears `snoozed_until`.
- **VAL-API-TRANS-005**: `snoozed` → `completed` is a valid transition; sets `completed_at`, clears `snoozed_until`.
- **VAL-API-TRANS-006**: `snoozed` → `dismissed` is a valid transition; sets `completed_at`, clears `snoozed_until`.
- **VAL-API-TRANS-007**: `completed` → any other status: implementation must define whether re-opening is allowed or blocked (document decision).
- **VAL-API-TRANS-008**: `dismissed` → any other status: implementation must define whether un-dismissing is allowed or blocked (document decision).
