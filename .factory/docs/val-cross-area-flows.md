# Cross-Area Flow Assertions — RelationshipOS Phase 1

These assertions validate behaviors that span multiple system areas (Auth, API, DB, UI) in Phase 1 of RelationshipOS. Each assertion requires evidence from at least two distinct layers to pass.

---

## VAL-CROSS-001: Google OAuth → Session → API Access → UI Personalization

**Title:** End-to-end Google OAuth login grants authenticated API access and personalizes UI

**Behavioral Description:**
A user clicks "Sign in with Google" on the login page. The server exchanges the OAuth code for tokens, creates or retrieves the `users` row (with `googleId`, `email`, `displayName`, `avatarUrl`), establishes a Passport session stored in PostgreSQL, and redirects to the app shell. Subsequent API requests (e.g., `GET /api/contacts`) include the session cookie and return `200`. The sidebar or header displays the user's display name and/or avatar from the `users` record.

**Pass criteria:**
1. After OAuth callback, `GET /api/auth/me` returns `200` with `{ id, email, displayName, avatarUrl }`.
2. `GET /api/contacts` returns `200` (not `401`).
3. The UI renders the user's display name or avatar somewhere in the app shell (sidebar header or top bar).
4. The session cookie (`connect.sid` or equivalent) is set with `httpOnly` and `secure` (in production) flags.

**Fail criteria:**
- `GET /api/auth/me` returns `401` after OAuth flow completes.
- API endpoints return `401` despite valid session.
- UI shows generic/placeholder identity instead of Google profile data.

**Evidence requirements:**
- HTTP trace of OAuth callback → session creation → authenticated API call.
- Screenshot or DOM snapshot showing user identity in the app shell.
- Database query confirming `users` row with `googleId` populated.

---

## VAL-CROSS-002: Auth Gate Protects All API Endpoints and Redirects Unauthenticated UI

**Title:** Unauthenticated requests receive 401; UI redirects to login

**Behavioral Description:**
When no session is present, all `/api/*` endpoints (except `/api/auth/*` public routes like `/api/auth/google` and `/api/auth/callback`) return `401 Unauthorized`. The React app detects the unauthenticated state (via failed `GET /api/auth/me` or a `401` from any query) and renders the login page instead of the app shell. Existing pages (dashboard, contacts, outreach log, decisions, settings) are all gated.

**Pass criteria:**
1. `GET /api/contacts` without session returns `401`.
2. `GET /api/outreach-attempts` without session returns `401`.
3. `GET /api/experiments` without session returns `401`.
4. `GET /api/settings` without session returns `401`.
5. `POST /api/contacts` without session returns `401`.
6. Navigating to `/contacts` in the browser (no session) shows the login page, not the contacts list.
7. `/api/auth/google` (the OAuth initiation endpoint) remains accessible without a session.

**Fail criteria:**
- Any data endpoint returns `200` without a session.
- UI renders protected content before authentication.

**Evidence requirements:**
- HTTP responses for each endpoint listed, both with and without session.
- Browser screenshot of `/contacts` route when unauthenticated, showing login page.

---

## VAL-CROSS-003: Auth Gate Preserves Existing Feature Functionality for Authenticated Users

**Title:** Existing pages (dashboard, contacts, outreach, decisions, settings) work unchanged for logged-in users

**Behavioral Description:**
After adding the auth gate, all pre-existing features continue to function identically for authenticated users. This is a regression safety assertion. Authenticated users can: view dashboard metrics, list/create/edit/delete contacts, view/log outreach attempts, manage experiments, and update settings. All TanStack Query hooks resolve without `401` errors.

**Pass criteria:**
1. Dashboard page loads and renders metrics (funnel chart, experiment summary) without errors.
2. Contacts page lists existing contacts; creating a new contact succeeds.
3. Outreach log page lists attempts; creating a new attempt succeeds.
4. Decisions page lists experiments; CRUD operations succeed.
5. Settings page loads current settings; saving changes succeeds.
6. No console errors related to `401` or authentication failures appear.

**Fail criteria:**
- Any existing page shows a blank state, error boundary, or loading spinner that never resolves.
- Any CRUD operation that previously worked now fails with `401` or `403`.

**Evidence requirements:**
- Authenticated session HTTP traces for each page's primary API call.
- Screenshot of each page rendering with data for an authenticated user.

---

## VAL-CROSS-004: Contact Creation with Deduplication → API 409 → UI Error Toast

**Title:** Creating a duplicate contact returns 409 and UI shows descriptive error

**Behavioral Description:**
When a user creates a contact via the UI (or API) with a `name + email` or `linkedinUrl` that matches an existing contact owned by the same user, the server returns `409 Conflict` with a JSON body `{ error: "Contact with this email/LinkedIn already exists", existingId: "<id>" }`. The UI catches the `409`, suppresses the generic error, and shows a toast or inline message indicating the duplicate. The contact list does not gain a duplicate row.

**Pass criteria:**
1. `POST /api/contacts` with a duplicate identifier returns `409` with `existingId`.
2. The UI displays a user-friendly error message mentioning the duplicate.
3. The contacts list query (`GET /api/contacts`) count remains unchanged after the rejected create.
4. The form does not reset, allowing the user to modify and retry.

**Fail criteria:**
- Server returns `201` and creates a duplicate row.
- Server returns `400` or `500` instead of `409`.
- UI shows a generic "Failed to create contact" error without dedup context.

**Evidence requirements:**
- HTTP request/response showing `409` with `existingId`.
- UI screenshot showing the dedup error message.
- Database query confirming no duplicate row was created.

---

## VAL-CROSS-005: Interaction Creation → Contact `last_interaction_at` Update → UI Refresh

**Title:** Adding an interaction auto-updates the contact's last_interaction_at and refreshes both the contact list sort order and the detail panel

**Behavioral Description:**
When an interaction is created via `POST /api/interactions` (with `contactId`, `type`, `occurredAt`, `notes`), the server: (a) inserts the `interactions` row, (b) updates the parent contact's `last_interaction_at` to `MAX(current last_interaction_at, interaction.occurredAt)`, and (c) returns the created interaction. The client invalidates both the `["interactions", contactId]` and `["contacts"]` TanStack Query keys. The contact list re-sorts (if sorted by recency), and the contact detail panel's interaction timeline shows the new entry.

**Pass criteria:**
1. `POST /api/interactions` returns `201` with the interaction object.
2. Immediately after, `GET /api/contacts/:id` returns the contact with `last_interaction_at` updated.
3. `GET /api/contacts` returns contacts in an order reflecting the updated `last_interaction_at`.
4. The UI contact list shows the contact moved up (if sorted by recency).
5. The interaction timeline in the contact detail panel includes the new interaction.

**Fail criteria:**
- `last_interaction_at` is not updated on the contact after interaction creation.
- Contact list does not re-sort.
- The interaction timeline does not include the new entry without a manual page refresh.

**Evidence requirements:**
- HTTP trace: `POST /api/interactions` → `GET /api/contacts/:id` showing updated `last_interaction_at`.
- Before/after screenshots of the contact list showing sort order change.
- Screenshot of interaction timeline with the new entry.

---

## VAL-CROSS-006: Contact Deletion → Interaction Cascade → UI Updates Both Lists

**Title:** Deleting a contact cascades to its interactions and updates UI contact and interaction views

**Behavioral Description:**
When `DELETE /api/contacts/:id` is called, the PostgreSQL `ON DELETE CASCADE` foreign key on `interactions.contact_id` deletes all interactions belonging to that contact. The server returns `204`. The client invalidates `["contacts"]` and `["interactions"]` query keys. The contacts list no longer shows the deleted contact. If an interaction list/timeline was open for that contact, it closes or shows an empty state.

**Pass criteria:**
1. `DELETE /api/contacts/:id` returns `204`.
2. `GET /api/contacts` no longer includes the deleted contact.
3. Direct DB query confirms no `interactions` rows with the deleted `contact_id` remain.
4. If the interaction timeline was visible for that contact, UI shows empty state or closes panel.
5. No orphaned interaction rows exist (verified via `SELECT count(*) FROM interactions WHERE contact_id = '<deleted-id>'` returning 0).

**Fail criteria:**
- Interactions survive after contact deletion (orphaned rows).
- UI still shows the deleted contact in the list until manual refresh.
- Server returns `500` due to FK constraint violation (would indicate cascade is misconfigured).

**Evidence requirements:**
- HTTP trace of delete operation.
- DB query showing zero interactions for the deleted contact ID.
- UI screenshot of contacts list post-deletion.

---

## VAL-CROSS-007: First-Visit Flow: Google Login → Empty State → Create Contact → Create Interaction

**Title:** Brand new user can sign in, see empty state, create a contact, and log an interaction

**Behavioral Description:**
A user who has never used the app before completes Google OAuth. The app creates a new `users` row. All list pages (contacts, outreach, interactions) show appropriate empty states with CTAs (e.g., "Add your first contact"). The user creates a contact, which appears in the list. The user then creates an interaction for that contact, which appears in the timeline. This validates the happy path for a fresh account.

**Pass criteria:**
1. After first Google login, `GET /api/contacts` returns `[]` (empty array).
2. Contacts page shows an empty state with a CTA to add a contact.
3. Creating a contact via the UI succeeds; the list now shows 1 contact.
4. Navigating to the contact detail and adding an interaction succeeds.
5. The interaction timeline shows the single interaction.
6. Dashboard shows updated metrics reflecting 1 contact, 1 interaction.

**Fail criteria:**
- App crashes or shows error on empty state.
- Empty state lacks a CTA to guide the user.
- Contact or interaction creation fails for the new user.

**Evidence requirements:**
- Screenshots of each step: empty state → contact created → interaction created.
- HTTP trace of the complete flow.
- DB queries showing the progression of data.

---

## VAL-CROSS-008: Session Persistence Across Browser Restart

**Title:** Authenticated session survives browser close/reopen; data remains accessible

**Behavioral Description:**
After logging in via Google OAuth, the user closes the browser tab (or the entire browser). Upon reopening and navigating to the app URL, the session cookie is still valid. `GET /api/auth/me` returns `200`. All data (contacts, interactions) is accessible without re-authentication. The session is stored server-side in PostgreSQL (not in-memory), so it survives server restarts as well.

**Pass criteria:**
1. After login, close browser, reopen, navigate to app → lands on authenticated app shell (not login page).
2. `GET /api/auth/me` returns `200` with user data.
3. `GET /api/contacts` returns the user's contacts.
4. Session store is PostgreSQL-backed (not `MemoryStore`).
5. After server restart, the same session cookie still works (session not lost).

**Fail criteria:**
- User is redirected to login page after reopening browser.
- Session is lost after server restart (indicates in-memory store).
- `GET /api/auth/me` returns `401` with a previously valid cookie.

**Evidence requirements:**
- Server config showing PostgreSQL session store (e.g., `connect-pg-simple` or equivalent).
- HTTP trace demonstrating session validity after simulated browser restart.
- HTTP trace demonstrating session validity after server restart.

---

## VAL-CROSS-009: Multi-User Data Isolation End-to-End

**Title:** User A's contacts and interactions are invisible to User B

**Behavioral Description:**
Two users (A and B) each log in via Google OAuth with different accounts. User A creates contacts and interactions. When User B queries `GET /api/contacts` and `GET /api/interactions`, they see only their own data (empty if they haven't created any). The `contacts` and `interactions` tables include a `userId` column, and all queries filter by the authenticated user's ID. Neither user can access the other's data by guessing IDs (e.g., `GET /api/contacts/:idOwnedByA` returns `404` for User B, not `403`).

**Pass criteria:**
1. User A creates 3 contacts. User B's `GET /api/contacts` returns `[]`.
2. User A creates an interaction. User B's `GET /api/interactions` returns `[]`.
3. User B attempts `GET /api/contacts/:userA_contact_id` → receives `404`.
4. User B attempts `DELETE /api/contacts/:userA_contact_id` → receives `404`.
5. User B attempts `POST /api/interactions` with `contactId` belonging to User A → receives `404` or `403`.
6. All storage methods filter by `userId` from the session.

**Fail criteria:**
- User B can see User A's contacts or interactions.
- User B can access User A's data by providing the direct ID.
- Any storage method omits the `userId` filter.

**Evidence requirements:**
- HTTP traces from two different authenticated sessions showing isolated data.
- DB queries showing `userId` column populated correctly on contacts and interactions.
- Code review confirming all `IStorage` methods filter by `userId`.

---

## VAL-CROSS-010: Sidebar Navigation Includes All Pages Including New Relationships Section

**Title:** Sidebar renders all navigation items and each links to the correct route

**Behavioral Description:**
The `AppSidebar` component renders menu items for all existing pages (Dashboard, Contacts, Outreach Log, Prospect Research, Import Prospects, Decisions, Settings) plus any new Relationships/Interactions section added in Phase 1. Each item links to the correct Wouter route. Clicking each item navigates to the corresponding page without errors. The active state highlights correctly for each route.

**Pass criteria:**
1. Sidebar contains entries for: Dashboard, Contacts, Outreach Log, Prospect Research, Import Prospects, Decisions, Settings, and any new Relationships/Interactions item.
2. Clicking each entry navigates to the correct URL.
3. The active state (highlighted menu item) matches the current URL.
4. No 404/Not Found page is rendered for any sidebar link.
5. The new Relationships/Interactions section is accessible and renders its page component.

**Fail criteria:**
- Any sidebar item leads to a 404 page.
- Active state is wrong (e.g., Dashboard highlighted when on Contacts).
- New Relationships section is missing from the sidebar.

**Evidence requirements:**
- Screenshot of sidebar with all items visible.
- For each item: URL navigated to and page component rendered (no 404).
- Active state verification for at least 3 different routes.

---

## VAL-CROSS-011: localStorage Migration → API-First Data Loading with Cache Fallback

**Title:** After Phase 1 migration, contacts load from API; localStorage serves as write-through cache only

**Behavioral Description:**
Phase 1 moves the source of truth for contacts from `localStorage` to the PostgreSQL database via the API. After migration: (a) `useContacts` hook fetches from `GET /api/contacts` (filtered by `userId`) as the primary source, (b) contacts are written through to `localStorage` for offline resilience, (c) if `GET /api/contacts` fails (network error), the hook falls back to `localStorage` cache, (d) any `localStorage`-only data from pre-migration is synced to the API on first authenticated load via the existing `POST /api/contacts/sync` endpoint.

**Pass criteria:**
1. After login, `GET /api/contacts` is called (visible in network tab).
2. The contacts list matches the API response, not stale `localStorage`.
3. If the API is unreachable (simulated), the UI falls back to `localStorage` cached data with a "working offline" indicator.
4. Pre-existing `localStorage` contacts (from before Phase 1) are synced to the API on first load.
5. Creating a contact writes to both API and `localStorage`.

**Fail criteria:**
- Contacts are loaded only from `localStorage` (no API call).
- API failure causes a blank screen instead of fallback.
- Pre-migration `localStorage` contacts are lost (not synced).

**Evidence requirements:**
- Network tab showing `GET /api/contacts` call on page load.
- `localStorage` inspection showing cached contacts.
- Simulated offline test showing fallback behavior.
- Test with pre-existing `localStorage` data showing sync operation.

---

## VAL-CROSS-012: Interaction CRUD → Validation → Error Propagation to UI

**Title:** Interaction API validates input and propagates structured errors to the UI

**Behavioral Description:**
The interaction CRUD API validates all inputs using Zod schemas derived from Drizzle. Invalid requests return structured error responses that the UI can parse and display. Specifically: (a) missing required fields (`contactId`, `type`) return `400` with field-level errors, (b) invalid `type` enum values return `400`, (c) referencing a non-existent `contactId` returns `404`, (d) the UI displays field-level validation errors inline in the form.

**Pass criteria:**
1. `POST /api/interactions` with missing `contactId` returns `400` with `{ error: "...", fields: { contactId: "..." } }` or equivalent.
2. `POST /api/interactions` with invalid `type` value returns `400`.
3. `POST /api/interactions` with non-existent `contactId` returns `404`.
4. `PATCH /api/interactions/:id` with invalid `id` returns `404`.
5. `DELETE /api/interactions/:nonexistent` returns `404`.
6. UI form shows inline validation errors for required fields.
7. UI shows a toast for server-side errors (404, 500).

**Fail criteria:**
- Server returns `500` for validation errors instead of `400`.
- UI shows a generic "Something went wrong" for all error types.
- Missing required field is silently accepted (row created with NULL).

**Evidence requirements:**
- HTTP traces for each error case with response bodies.
- UI screenshots showing inline validation errors.
- UI screenshot showing error toast for server-side error.

---

## VAL-CROSS-013: Interaction Timeline Respects Chronological Ordering Across Types

**Title:** Interaction timeline displays all interaction types in correct chronological order

**Behavioral Description:**
The interaction timeline UI (in the contact detail panel) displays interactions of all types (email, call, meeting, note, linkedin_message, etc.) in reverse-chronological order (newest first). When a new interaction is added with an `occurredAt` date in the past, it inserts into the correct position in the timeline—not appended at the top. The UI groups or labels interaction types with distinct icons.

**Pass criteria:**
1. Create 3 interactions with different `occurredAt` dates (past, present, future-ish). Timeline shows them in reverse-chronological order.
2. Create a new interaction with `occurredAt` between two existing ones. It appears in the correct position after query invalidation.
3. Each interaction type shows a distinct icon or label.
4. The `GET /api/interactions?contactId=X` endpoint returns results sorted by `occurredAt DESC`.

**Fail criteria:**
- Interactions appear in insertion order instead of chronological order.
- Backdated interaction appears at the top of the timeline.
- All interaction types show the same generic icon.

**Evidence requirements:**
- HTTP response showing correct sort order from API.
- UI screenshot of timeline with mixed dates showing correct ordering.
- UI screenshot showing distinct icons for at least 2 different interaction types.

---

## VAL-CROSS-014: Logout → Session Destruction → UI Redirect → API Rejection

**Title:** Logging out destroys session, redirects to login, and rejects subsequent API calls

**Behavioral Description:**
When the user clicks "Log out", the client calls `POST /api/auth/logout` (or equivalent). The server destroys the Passport session and clears the session cookie. The client redirects to the login page. Subsequent API calls with the old session cookie return `401`. The UI cannot navigate to any protected route without re-authenticating.

**Pass criteria:**
1. `POST /api/auth/logout` returns `200` (or `204`).
2. After logout, `GET /api/auth/me` returns `401`.
3. After logout, `GET /api/contacts` returns `401`.
4. The browser is on the login page after logout.
5. The session cookie is cleared or invalidated.
6. Pressing browser back button does not show cached authenticated content (or immediately redirects to login).

**Fail criteria:**
- Session remains valid after logout call.
- UI shows authenticated content after logout.
- Old session cookie still grants API access.

**Evidence requirements:**
- HTTP trace of logout → subsequent 401 responses.
- Browser screenshot showing login page post-logout.
- Cookie inspection showing session cookie cleared.

---

## VAL-CROSS-015: Bulk Contact Delete → Cascading Interaction Cleanup → UI Batch Update

**Title:** Bulk deleting contacts cascades to all their interactions and updates the UI atomically

**Behavioral Description:**
When multiple contacts are selected and bulk-deleted via `POST /api/contacts/bulk-delete`, all interactions belonging to those contacts are cascade-deleted. The UI updates the contacts list and any visible interaction views in a single render cycle (via TanStack Query invalidation). The operation is atomic—either all selected contacts are deleted or none (partial failure returns an error and rolls back).

**Pass criteria:**
1. Create 3 contacts, each with 2 interactions (6 interactions total).
2. Bulk-delete 2 of the 3 contacts.
3. `GET /api/contacts` returns only the remaining 1 contact.
4. DB query confirms only 2 interactions remain (those of the surviving contact).
5. UI contacts list shows 1 contact without page refresh.
6. If one deletion fails (e.g., already deleted), the response indicates partial success with count.

**Fail criteria:**
- Orphaned interactions remain for deleted contacts.
- UI still shows deleted contacts until manual refresh.
- Partial failure silently succeeds for some and fails for others without reporting.

**Evidence requirements:**
- HTTP trace of bulk delete request and response.
- DB queries before and after showing contact and interaction counts.
- UI screenshot post-deletion showing updated list.
