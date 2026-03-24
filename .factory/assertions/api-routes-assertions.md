# API Routes — Validation Assertions

> Area: RelationshipOS Phase 1 — API Routes
> Scope: Interaction CRUD endpoints, contact dedup, contact sorting, contact field updates, auth guards, multi-user isolation

---

## Interaction CRUD

### VAL-API-001: Create interaction returns 201 with valid payload

**Title:** POST /api/interactions — successful creation

**Behavioral description:**
When an authenticated user sends POST /api/interactions with a valid body containing at minimum `channel`, `direction`, `occurred_at`, and `contact_id` (referencing a contact owned by that user), the server returns HTTP 201 and a JSON body containing the newly created interaction with a generated `id`, all submitted fields, and server-set timestamps.

**Pass criteria:**
- Response status is `201`
- Response body includes `id` (UUID string)
- All submitted fields (`channel`, `direction`, `occurred_at`, `contact_id`) match the request
- Optional fields (`subject`, `body`, `source_id`, `sentiment`, `notes`) are present if provided, null/default otherwise
- `created_at` and `updated_at` are set by the server

**Fail criteria:**
- Status is not 201
- Body is missing `id` or any required field echo
- Submitted field values differ from request

**Evidence requirements:**
- HTTP request/response pair logged
- Database row exists with matching `id` after call

---

### VAL-API-002: Create interaction rejects missing required fields

**Title:** POST /api/interactions — validation rejects incomplete body

**Behavioral description:**
When an authenticated user sends POST /api/interactions with a body missing one or more required fields (`channel`, `direction`, `occurred_at`, `contact_id`), the server returns HTTP 400 with `{ error: "<message>" }`. No interaction row is created in the database.

**Pass criteria:**
- Response status is `400`
- Body contains `error` key with a human-readable message
- No new interaction row exists in the database

**Fail criteria:**
- Status is 201 or 500
- An interaction row is created despite invalid input

**Evidence requirements:**
- Send payloads with each required field individually omitted
- Verify 400 for each case
- Count interactions before and after — no increase

---

### VAL-API-003: Create interaction rejects invalid enum values

**Title:** POST /api/interactions — validation rejects invalid channel/direction

**Behavioral description:**
When an authenticated user sends POST /api/interactions with an invalid `channel` value (e.g., `"fax"`) or invalid `direction` value (e.g., `"sideways"`), the server returns HTTP 400. Valid channels include values like `linkedin_message`, `email`, `phone`, `meeting`, `whatsapp`, etc. Valid directions include `inbound` and `outbound`.

**Pass criteria:**
- Response status is `400`
- Body contains `error` key
- No row created

**Fail criteria:**
- Status 201 with invalid enum stored in DB

**Evidence requirements:**
- Request with `channel: "fax"` → 400
- Request with `direction: "sideways"` → 400

---

### VAL-API-004: List interactions filtered by contactId

**Title:** GET /api/interactions?contactId=X — returns only interactions for that contact

**Behavioral description:**
When an authenticated user sends GET /api/interactions?contactId=\<uuid\>, the server returns HTTP 200 with a JSON array containing only interactions where `contact_id` matches the given UUID and the contact belongs to the authenticated user. If the contact has no interactions, an empty array `[]` is returned (not 404).

**Pass criteria:**
- Response status is `200`
- Body is a JSON array
- Every element's `contact_id` matches the query param
- Interactions for other contacts are excluded
- Empty array returned when contact has no interactions

**Fail criteria:**
- Array includes interactions for a different `contact_id`
- 404 returned for a valid contact with no interactions

**Evidence requirements:**
- Create 2 contacts with interactions, query each separately, verify disjoint sets
- Query contact with 0 interactions → `[]`

---

### VAL-API-005: Get single interaction by ID

**Title:** GET /api/interactions/:id — returns the interaction

**Behavioral description:**
When an authenticated user sends GET /api/interactions/:id with a valid interaction ID that belongs to one of their contacts, the server returns HTTP 200 with the full interaction object. When the ID does not exist, the server returns HTTP 404 with `{ error: "<message>" }`.

**Pass criteria:**
- 200 with correct interaction data for existing ID
- 404 with `error` message for non-existent ID

**Fail criteria:**
- 200 for non-existent ID
- 500 instead of 404

**Evidence requirements:**
- Create interaction, GET by its ID → 200, fields match
- GET with random UUID → 404

---

### VAL-API-006: Update interaction via PATCH

**Title:** PATCH /api/interactions/:id — updates specified fields only

**Behavioral description:**
When an authenticated user sends PATCH /api/interactions/:id with a partial body (e.g., `{ sentiment: "positive", notes: "Great call" }`), the server updates only those fields, leaves others unchanged, and returns HTTP 200 with the full updated interaction. The `updated_at` timestamp advances. If the ID does not exist, 404 is returned.

**Pass criteria:**
- Response status `200`
- Patched fields reflect new values
- Unmentioned fields retain original values
- `updated_at` >= previous `updated_at`
- Returns 404 for non-existent ID

**Fail criteria:**
- Unrelated fields are reset to default/null
- `updated_at` not advanced
- 500 for valid PATCH

**Evidence requirements:**
- Create interaction → PATCH subset of fields → GET same ID → verify merged state
- PATCH non-existent ID → 404

---

### VAL-API-007: Delete interaction

**Title:** DELETE /api/interactions/:id — removes the interaction

**Behavioral description:**
When an authenticated user sends DELETE /api/interactions/:id for an existing interaction belonging to their contact, the server deletes the row and returns HTTP 204 (no body). Subsequent GET for the same ID returns 404. If the ID does not exist, DELETE returns 404.

**Pass criteria:**
- 204 with empty body for existing interaction
- Subsequent GET returns 404
- DELETE on non-existent ID returns 404

**Fail criteria:**
- 200 instead of 204
- Interaction still retrievable after delete
- 500 for non-existent ID

**Evidence requirements:**
- Create interaction → DELETE → GET → 404
- DELETE random UUID → 404

---

## Authentication & Authorization

### VAL-API-008: All interaction endpoints require authentication

**Title:** Interaction endpoints return 401 without valid session

**Behavioral description:**
When an unauthenticated request (no session cookie / invalid session) is sent to any of GET /api/interactions, GET /api/interactions/:id, POST /api/interactions, PATCH /api/interactions/:id, or DELETE /api/interactions/:id, the server returns HTTP 401 with `{ error: "<message>" }`. No data is leaked or modified.

**Pass criteria:**
- All five endpoints return `401` when called without authentication
- Response body contains `error` key
- No interaction data appears in any response

**Fail criteria:**
- Any endpoint returns 200/201/204 without auth
- Interaction data is leaked in 401 response body

**Evidence requirements:**
- Call each endpoint without session cookie → 401 for all

---

### VAL-API-009: Multi-user isolation — user cannot access other user's interactions

**Title:** Interaction endpoints enforce user-scoped data access

**Behavioral description:**
User A creates a contact and an interaction. User B, authenticated separately, attempts to:
1. GET /api/interactions?contactId=\<A's contact\> — should return `[]` or 403
2. GET /api/interactions/\<A's interaction ID\> — should return 404 or 403
3. PATCH /api/interactions/\<A's interaction ID\> — should return 404 or 403
4. DELETE /api/interactions/\<A's interaction ID\> — should return 404 or 403

The server never returns User A's data to User B.

**Pass criteria:**
- All four operations return 404 or 403 (not 200)
- No interaction data from User A appears in any response to User B

**Fail criteria:**
- User B receives 200 with User A's interaction data
- User B can modify or delete User A's interactions

**Evidence requirements:**
- Create two separate sessions (user A, user B)
- User A creates contact + interaction
- User B attempts all four operations → 404/403

---

## Contact Dedup on Create

### VAL-API-010: Contact creation detects duplicate by email

**Title:** POST /api/contacts — returns 409 when email matches existing contact for same user

**Behavioral description:**
When an authenticated user sends POST /api/contacts with an `email` that exactly matches an existing contact's email (for the same `user_id`), the server returns HTTP 409 with `{ error: "<message>" }` and does not create a duplicate row. The existing contact is not modified.

**Pass criteria:**
- Response status is `409`
- Body contains `error` key describing the conflict
- No new contact row created
- Original contact unchanged

**Fail criteria:**
- Duplicate contact created (status 201)
- Original contact modified

**Evidence requirements:**
- Create contact with email "test@example.com"
- POST again with same email → 409
- GET /api/contacts → count unchanged

---

### VAL-API-011: Contact creation detects duplicate by LinkedIn URL

**Title:** POST /api/contacts — returns 409 when linkedin_url matches existing contact for same user

**Behavioral description:**
When an authenticated user sends POST /api/contacts with a `linkedinUrl` that exactly matches an existing contact's `linkedin_url` (for the same `user_id`), the server returns HTTP 409 with `{ error: "<message>" }`. No duplicate is created.

**Pass criteria:**
- Response status is `409`
- Body contains `error` key
- No new contact row created

**Fail criteria:**
- Duplicate contact created with identical LinkedIn URL

**Evidence requirements:**
- Create contact with linkedinUrl "https://linkedin.com/in/johndoe"
- POST again with same URL → 409

---

### VAL-API-012: Contact dedup is scoped per user

**Title:** POST /api/contacts — different users can have contacts with same email

**Behavioral description:**
User A creates a contact with email "shared@example.com". User B sends POST /api/contacts with the same email. Because the dedup check is scoped by `user_id`, User B's creation succeeds with HTTP 201. Each user has their own contact row.

**Pass criteria:**
- User A creates contact → 201
- User B creates contact with same email → 201
- Each user's GET /api/contacts shows exactly one contact with that email

**Fail criteria:**
- User B gets 409 due to User A's contact
- Cross-user dedup prevents legitimate creation

**Evidence requirements:**
- Two authenticated sessions
- User A: POST contact → 201
- User B: POST contact with same email → 201
- Both users query their contacts → each sees exactly 1

---

### VAL-API-013: Contact dedup allows creation when no match exists

**Title:** POST /api/contacts — creates contact when email and LinkedIn URL are unique

**Behavioral description:**
When an authenticated user sends POST /api/contacts with an email and LinkedIn URL that do not match any existing contact for that user, the server creates the contact normally and returns HTTP 201.

**Pass criteria:**
- Response status is `201`
- Contact row created with submitted data
- `id` is generated

**Fail criteria:**
- 409 when no actual duplicate exists

**Evidence requirements:**
- POST with unique email and URL → 201
- Verify contact exists via GET

---

## Contact Sorting

### VAL-API-014: Contacts sortable by last_interaction_at descending

**Title:** GET /api/contacts?sort=last_interaction_at&order=desc — most recently interacted contacts first

**Behavioral description:**
When an authenticated user sends GET /api/contacts with query params `sort=last_interaction_at` and `order=desc`, the server returns contacts ordered by their `last_interaction_at` timestamp in descending order. Contacts with no interactions (null `last_interaction_at`) appear at the end.

**Pass criteria:**
- Response status `200`
- Contacts array is sorted: each contact's `last_interaction_at` >= the next contact's
- Null values sort to end
- All contacts still returned (sorting, not filtering)

**Fail criteria:**
- Contacts not in descending order
- Contacts with null `last_interaction_at` appear before those with values
- Some contacts missing from response

**Evidence requirements:**
- Create 3 contacts, log interactions at different times
- GET with sort params → verify order
- Include 1 contact with no interactions → appears last

---

### VAL-API-015: Contacts sortable by last_interaction_at ascending

**Title:** GET /api/contacts?sort=last_interaction_at&order=asc — least recently interacted contacts first

**Behavioral description:**
When an authenticated user sends GET /api/contacts with `sort=last_interaction_at&order=asc`, contacts are returned in ascending order of `last_interaction_at`. Contacts with null values appear at the beginning or end (implementation-dependent, but consistently).

**Pass criteria:**
- Response status `200`
- Contacts in ascending order by `last_interaction_at`
- Null-value contacts grouped consistently at one end

**Fail criteria:**
- Not in ascending order
- Null placement is inconsistent across calls

**Evidence requirements:**
- Same data setup as VAL-API-014, request with `order=asc`
- Verify ascending order

---

## Contact Update with New Fields

### VAL-API-016: PATCH contact updates RelationshipOS fields (tier, source, etc.)

**Title:** PATCH /api/contacts/:id — accepts and persists new RelationshipOS fields

**Behavioral description:**
When an authenticated user sends PATCH /api/contacts/:id with new RelationshipOS fields such as `tier` (e.g., `"tier_1"`), `source` (e.g., `"linkedin"`), or any other Phase 1 contact fields, the server updates those fields and returns HTTP 200 with the updated contact. Pre-existing fields not included in the PATCH remain unchanged.

**Pass criteria:**
- Response status `200`
- New fields (`tier`, `source`, etc.) reflect submitted values
- Existing fields (`name`, `company`, `email`) unchanged
- Subsequent GET confirms persistence

**Fail criteria:**
- New fields silently dropped (not persisted)
- Existing fields reset
- 400 for valid new field values

**Evidence requirements:**
- Create contact → PATCH with `{ tier: "tier_1", source: "referral" }` → 200
- GET contact → verify `tier` = "tier_1", `source` = "referral", `name` unchanged

---

### VAL-API-017: PATCH contact rejects invalid tier value

**Title:** PATCH /api/contacts/:id — returns 400 for invalid tier enum

**Behavioral description:**
When an authenticated user sends PATCH /api/contacts/:id with an invalid `tier` value (e.g., `"platinum"`), the server returns HTTP 400 with `{ error: "<message>" }`. The contact is not modified.

**Pass criteria:**
- Response status `400`
- Body contains `error` key
- Contact unchanged (GET confirms original values)

**Fail criteria:**
- Invalid tier stored in database
- 200 returned

**Evidence requirements:**
- Create contact → PATCH `{ tier: "platinum" }` → 400
- GET contact → tier unchanged

---

## Cascade Delete

### VAL-API-018: Deleting a contact cascades to its interactions

**Title:** DELETE /api/contacts/:id — deletes associated interactions

**Behavioral description:**
When an authenticated user deletes a contact that has associated interactions, all interactions referencing that `contact_id` are also deleted (cascade). After deletion, GET /api/interactions?contactId=\<deleted contact\> returns an empty array.

**Pass criteria:**
- Contact DELETE returns 204
- All associated interactions are gone
- GET /api/interactions?contactId=\<id\> returns `[]`
- Other contacts' interactions are unaffected

**Fail criteria:**
- Orphaned interaction rows remain after contact deletion
- Delete fails due to FK constraint without cascade

**Evidence requirements:**
- Create contact with 2 interactions
- DELETE contact → 204
- Query interactions for that contact → `[]`
- Verify other contacts' interactions intact

---

## Edge Cases

### VAL-API-019: Create interaction with non-existent contact_id returns 400 or 404

**Title:** POST /api/interactions — rejects non-existent contact_id

**Behavioral description:**
When an authenticated user sends POST /api/interactions with a `contact_id` that does not exist in the database (or belongs to another user), the server returns HTTP 400 or 404 with `{ error: "<message>" }`. No interaction row is created.

**Pass criteria:**
- Response status is `400` or `404`
- Body contains `error` key
- No interaction row created

**Fail criteria:**
- 201 with orphaned interaction
- FK violation causes 500

**Evidence requirements:**
- POST with random UUID as contact_id → 400/404
- Verify no interaction row exists

---

### VAL-API-020: Contact dedup is case-insensitive for email (if applicable)

**Title:** POST /api/contacts — dedup handles email case variations

**Behavioral description:**
When an authenticated user creates a contact with email "Test@Example.com", a subsequent POST with "test@example.com" should be handled consistently. If dedup is case-insensitive, 409 is returned. If case-sensitive, 201 is returned. The behavior must be documented and consistent.

**Pass criteria:**
- Behavior is consistent across repeated calls
- If case-insensitive: 409 returned for case-variant email
- If case-sensitive: 201 returned and both contacts exist
- Behavior matches what is documented/specified in the PRD

**Fail criteria:**
- Inconsistent behavior (sometimes 409, sometimes 201 for same input)
- Error/500 on case-variant email

**Evidence requirements:**
- Create contact with "Test@Example.com"
- POST with "test@example.com" → record status code
- Repeat to confirm consistency

---

### VAL-API-021: GET /api/interactions without contactId filter returns all user interactions

**Title:** GET /api/interactions (no filter) — returns all interactions for authenticated user

**Behavioral description:**
When an authenticated user sends GET /api/interactions without a `contactId` query parameter, the server returns all interactions across all of the user's contacts. The response is a JSON array. If the user has no interactions, an empty array is returned.

**Pass criteria:**
- Response status `200`
- Body is a JSON array
- Contains interactions across multiple contacts (if they exist)
- All returned interactions belong to the authenticated user's contacts
- Empty array if no interactions exist

**Fail criteria:**
- Only returns interactions for a single contact
- Returns interactions belonging to other users

**Evidence requirements:**
- Create 2 contacts with 1 interaction each
- GET /api/interactions (no params) → both interactions present

---

### VAL-API-022: Interaction list ordered by occurred_at descending by default

**Title:** GET /api/interactions — default order is most recent first

**Behavioral description:**
When an authenticated user sends GET /api/interactions (with or without contactId), the returned interactions are ordered by `occurred_at` in descending order (most recent first) by default.

**Pass criteria:**
- Each interaction's `occurred_at` >= the next interaction's `occurred_at` in the array
- Order is consistent across calls

**Fail criteria:**
- Random/unsorted order
- Ascending instead of descending

**Evidence requirements:**
- Create 3 interactions with different `occurred_at` values
- GET → verify descending order

---

### VAL-API-023: Modified contact endpoints also require authentication

**Title:** Modified contact endpoints (POST, GET, PATCH) require auth under requireAuth middleware

**Behavioral description:**
The modified contact endpoints — POST /api/contacts (with dedup), GET /api/contacts (with sorting), and PATCH /api/contacts/:id (with new fields) — all require a valid authenticated session. Unauthenticated requests return 401.

**Pass criteria:**
- POST /api/contacts without auth → 401
- GET /api/contacts without auth → 401
- PATCH /api/contacts/:id without auth → 401

**Fail criteria:**
- Any of the three returns data or accepts writes without auth

**Evidence requirements:**
- Call each endpoint without session cookie → 401

---

### VAL-API-024: POST /api/interactions returns conflict or handles duplicate source_id

**Title:** POST /api/interactions — idempotency via (channel, source_id) uniqueness

**Behavioral description:**
If the interactions table enforces a unique constraint on `(channel, source_id)` (or `(contact_id, channel, source_id)`), then creating an interaction with the same `channel` and `source_id` as an existing one returns HTTP 409. If no such constraint exists, a duplicate is allowed (201). The behavior must be consistent and intentional.

**Pass criteria:**
- If uniqueness enforced: second POST with same (channel, source_id) → 409
- If not enforced: second POST → 201, two rows exist
- No 500 error in either case

**Fail criteria:**
- 500 from unhandled unique constraint violation
- Inconsistent behavior

**Evidence requirements:**
- Create interaction with `source_id: "ext-123"`, `channel: "email"`
- POST again with same values → record status code
- Query interactions to verify row count

---

## Summary

| ID | Title | Category |
|---|---|---|
| VAL-API-001 | Create interaction — success | Interaction CRUD |
| VAL-API-002 | Create interaction — missing required fields | Validation |
| VAL-API-003 | Create interaction — invalid enum values | Validation |
| VAL-API-004 | List interactions filtered by contactId | Interaction CRUD |
| VAL-API-005 | Get single interaction by ID | Interaction CRUD |
| VAL-API-006 | Update interaction via PATCH | Interaction CRUD |
| VAL-API-007 | Delete interaction | Interaction CRUD |
| VAL-API-008 | All interaction endpoints require auth | Auth |
| VAL-API-009 | Multi-user isolation for interactions | Auth / Multi-tenant |
| VAL-API-010 | Contact dedup by email | Contact Dedup |
| VAL-API-011 | Contact dedup by LinkedIn URL | Contact Dedup |
| VAL-API-012 | Contact dedup scoped per user | Contact Dedup |
| VAL-API-013 | Contact dedup allows unique creation | Contact Dedup |
| VAL-API-014 | Contacts sort by last_interaction_at desc | Contact Sorting |
| VAL-API-015 | Contacts sort by last_interaction_at asc | Contact Sorting |
| VAL-API-016 | PATCH contact with new RelationshipOS fields | Contact Update |
| VAL-API-017 | PATCH contact rejects invalid tier | Validation |
| VAL-API-018 | Delete contact cascades to interactions | Cascade |
| VAL-API-019 | Create interaction with invalid contact_id | Edge Case |
| VAL-API-020 | Contact dedup email case sensitivity | Edge Case |
| VAL-API-021 | List all interactions (no filter) | Interaction CRUD |
| VAL-API-022 | Interaction list default ordering | Interaction CRUD |
| VAL-API-023 | Modified contact endpoints require auth | Auth |
| VAL-API-024 | Interaction idempotency via source_id | Edge Case |
