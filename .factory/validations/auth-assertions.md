# Authentication — Validation Contract

> Area: Google OAuth Authentication (Phase 1)
> Prefix: `VAL-AUTH`
> Status: Draft
> Last updated: 2026-03-23

---

## VAL-AUTH-001 — OAuth redirect initiates correctly

**Title:** GET /auth/google redirects to Google consent screen

**Behavioral description:**
When an unauthenticated client sends `GET /auth/google`, the server must respond with an HTTP 302 redirect whose `Location` header points to `https://accounts.google.com/o/oauth2/v2/auth` with the correct `client_id`, `redirect_uri` (pointing to `/auth/google/callback`), `response_type=code`, and requested scopes (`openid`, `profile`, `email`).

**Pass criteria:**
- Response status is 302.
- `Location` header starts with `https://accounts.google.com/o/oauth2/v2/auth`.
- Query parameters include `client_id`, `redirect_uri`, `response_type=code`, and `scope` containing `openid`, `profile`, and `email`.
- A `state` parameter is present for CSRF protection (if passport uses it).

**Fail criteria:**
- Response is not a redirect (e.g., 200 or 500).
- `Location` header is missing or points to wrong URL.
- Required scopes are missing.

**Evidence requirements:**
- HTTP response capture showing status 302 and full `Location` header.
- Parsed query parameters from the redirect URL.

---

## VAL-AUTH-002 — OAuth callback creates new user on first login

**Title:** First-time Google login creates a new user record

**Behavioral description:**
When Google redirects back to `GET /auth/google/callback?code=VALID_CODE`, the server exchanges the code for tokens, retrieves the user's Google profile (email, name, avatar, google_id), and inserts a new row into the `users` table with `google_id`, `email`, `full_name`, and `avatar_url` populated. A session is created and the user is redirected to the app (e.g., `/` or `/dashboard`).

**Pass criteria:**
- A new row exists in the `users` table with the correct `google_id`, `email`, `full_name`, and `avatar_url`.
- The response sets a session cookie (e.g., `connect.sid`).
- The response is a 302 redirect to the frontend (e.g., `/`).

**Fail criteria:**
- No user row is created.
- Session cookie is not set.
- User data fields are null or mismatched.
- Response is an error status (4xx/5xx).

**Evidence requirements:**
- Database query showing the new user row.
- HTTP response headers showing `Set-Cookie` with session ID.
- Redirect location in response.

---

## VAL-AUTH-003 — OAuth callback upserts returning user

**Title:** Returning Google user updates existing record, does not create duplicate

**Behavioral description:**
When a user who already has a `users` row (matched by `google_id`) completes the OAuth callback, the server updates `full_name`, `avatar_url`, and `email` (if changed) on the existing record instead of creating a duplicate. The `users` table must not contain two rows with the same `google_id`.

**Pass criteria:**
- Only one row exists in `users` with the given `google_id` after login.
- Updated fields reflect the latest Google profile data.
- Session is created normally.

**Fail criteria:**
- A second user row with the same `google_id` is created.
- Existing user fields are not updated.

**Evidence requirements:**
- Database query counting rows with the `google_id` (must be exactly 1).
- Before/after comparison of `full_name` and `avatar_url` if they changed.

---

## VAL-AUTH-004 — GET /auth/me returns authenticated user

**Title:** Authenticated session returns current user profile

**Behavioral description:**
When a client with a valid session cookie sends `GET /auth/me`, the server responds with 200 and a JSON body containing the user's `id`, `email`, `full_name`, `avatar_url`, and `google_id`. Sensitive fields (like internal password hashes, session tokens) must NOT be included.

**Pass criteria:**
- Response status is 200.
- Response body contains `id`, `email`, `full_name`, `avatar_url`.
- Response body does NOT contain `password` or session secret material.

**Fail criteria:**
- Response is 401 or 500.
- Response body is empty or missing required fields.
- Sensitive fields are leaked in the response.

**Evidence requirements:**
- Full JSON response body.
- Confirmation that `password` key is absent from response.

---

## VAL-AUTH-005 — GET /auth/me rejects unauthenticated request

**Title:** Unauthenticated /auth/me returns 401

**Behavioral description:**
When a client without a session cookie (or with an expired/invalid session cookie) sends `GET /auth/me`, the server must respond with HTTP 401 Unauthorized and a JSON error body. It must NOT return user data or a 200 response.

**Pass criteria:**
- Response status is 401.
- Response body contains an error message (e.g., `{ "error": "Not authenticated" }` or similar).
- No user data is returned.

**Fail criteria:**
- Response is 200 with user data (information leak).
- Response is 500 (server error instead of proper auth check).

**Evidence requirements:**
- HTTP response with status 401 and error body.
- Request headers showing absent or invalid cookie.

---

## VAL-AUTH-006 — POST /auth/logout destroys session

**Title:** Logout endpoint clears session and cookie

**Behavioral description:**
When an authenticated client sends `POST /auth/logout`, the server destroys the server-side session (removes from PostgreSQL session store), clears the session cookie, and responds with 200 OK. Subsequent requests with the old cookie must be treated as unauthenticated.

**Pass criteria:**
- Response status is 200.
- The session cookie is cleared (e.g., `Set-Cookie` with `Max-Age=0` or `Expires` in the past).
- A follow-up `GET /auth/me` with the same cookie returns 401.

**Fail criteria:**
- Session persists after logout (subsequent `/auth/me` still returns 200).
- Cookie is not cleared.
- Response is an error status.

**Evidence requirements:**
- Response headers showing cookie clearance.
- Follow-up `/auth/me` request returning 401.
- Database session store verification (session row deleted or expired).

---

## VAL-AUTH-007 — requireAuth middleware protects /api/interactions/*

**Title:** Protected endpoints reject unauthenticated requests with 401

**Behavioral description:**
All endpoints under `/api/interactions/*` (and any new RelationshipOS Phase 1 endpoints) must be guarded by `requireAuth` middleware. When an unauthenticated client (no session or invalid session) sends any request (GET, POST, PATCH, DELETE) to these endpoints, the server must respond with 401 Unauthorized before reaching the route handler.

**Pass criteria:**
- Any unauthenticated request to `/api/interactions/*` returns 401.
- The response body contains an error message.
- The route handler logic is NOT executed (no side effects, no DB writes).

**Fail criteria:**
- The request succeeds (200/201) without authentication.
- The server returns 500 instead of 401.
- Data is modified despite the 401 (middleware runs after handler).

**Evidence requirements:**
- HTTP responses for unauthenticated GET, POST, PATCH, DELETE to at least one `/api/interactions/` endpoint.
- Database state unchanged after the rejected request.

---

## VAL-AUTH-008 — Legacy endpoints remain unprotected

**Title:** Existing /api/contacts, /api/outreach-attempts, etc. remain accessible without auth

**Behavioral description:**
Existing endpoints (`/api/contacts`, `/api/outreach-attempts`, `/api/experiments`, `/api/settings`, `/api/export/*`, `/api/parse-pdf`, `/api/batch/*`, etc.) must continue to work WITHOUT authentication. Adding auth must not break the existing OutboundOS functionality by accidentally requiring login for these routes.

**Pass criteria:**
- `GET /api/contacts` returns 200 with data (no session cookie needed).
- `POST /api/contacts` creates a contact (no session cookie needed).
- `GET /api/outreach-attempts` returns 200 (no session cookie needed).
- `GET /api/experiments` returns 200 (no session cookie needed).
- `GET /api/settings` returns 200 (no session cookie needed).

**Fail criteria:**
- Any of the above endpoints returns 401 when called without auth.
- Existing functionality is broken by the auth middleware.

**Evidence requirements:**
- HTTP responses from each legacy endpoint without any session cookie, all returning 2xx.

---

## VAL-AUTH-009 — Session persists across page reloads

**Title:** Authenticated session survives browser refresh

**Behavioral description:**
After a successful Google OAuth login, the session cookie persists in the browser. When the user reloads the page (or the React SPA re-fetches `/auth/me`), the session is still valid and the user remains authenticated without re-triggering the OAuth flow.

**Pass criteria:**
- `GET /auth/me` returns 200 with the same user data after a simulated reload (same cookie re-sent).
- No redirect to `/auth/google` is needed.

**Fail criteria:**
- Session is lost on reload (cookie missing or session expired prematurely).
- `/auth/me` returns 401 despite using a valid, non-expired cookie.

**Evidence requirements:**
- Two sequential `GET /auth/me` requests with the same cookie, both returning 200.
- Time gap between requests (e.g., > 1 second) to simulate reload.

---

## VAL-AUTH-010 — OAuth callback handles invalid/missing authorization code

**Title:** Invalid OAuth code returns error, not crash

**Behavioral description:**
When Google redirects to `GET /auth/google/callback` with an invalid, expired, or missing `code` parameter, the server must handle the error gracefully. It should either redirect the user to a login/error page or return a meaningful error response. The server must NOT crash, return a 500 with a stack trace, or create a partial user record.

**Pass criteria:**
- Server does not crash or return a raw stack trace.
- No partial or corrupt user row is created in the database.
- Response is either a redirect to an error page or a 4xx status with a clean error message.

**Fail criteria:**
- Server returns 500 with unhandled exception details.
- A user row with null/empty `google_id` or `email` is created.
- Server process crashes.

**Evidence requirements:**
- HTTP response for `GET /auth/google/callback?code=INVALID_CODE`.
- Database query showing no new corrupt user rows.
- Server logs showing graceful error handling.

---

## VAL-AUTH-011 — Session stored in PostgreSQL via connect-pg-simple

**Title:** Sessions are persisted in PostgreSQL, not in-memory

**Behavioral description:**
The session store must use `connect-pg-simple` backed by the PostgreSQL database (referenced by `DATABASE_URL`). This ensures sessions survive server restarts. After login, a corresponding session row must exist in the `session` table (or equivalent table used by connect-pg-simple). In-memory session storage (`MemoryStore`) must NOT be used.

**Pass criteria:**
- After login, a row exists in the PostgreSQL session table with the correct session ID.
- Server restart does not invalidate existing sessions (session cookie still works after restart).
- Express session config does NOT use `MemoryStore`.

**Fail criteria:**
- Sessions are stored only in memory (lost on restart).
- No session table exists in PostgreSQL.
- Session cookie becomes invalid after server restart.

**Evidence requirements:**
- Database query showing session row after login.
- Server configuration code showing `connect-pg-simple` as store.
- (Optional) Test: login → restart server → `/auth/me` still returns 200.

---

## VAL-AUTH-012 — User table schema includes required columns

**Title:** Users table has google_id, email, full_name, avatar_url, created_at

**Behavioral description:**
The `users` table in `shared/schema.ts` must be extended (via a new migration) to include: `email` (text, not null, unique), `full_name` (text), `google_id` (text, unique), `avatar_url` (text), and `created_at` (timestamp, defaultNow). The existing `username` and `password` columns may be retained for backward compatibility but are not used by Google OAuth. The `google_id` column must have a unique constraint to prevent duplicate accounts.

**Pass criteria:**
- `shared/schema.ts` defines `email`, `full_name`, `google_id`, `avatar_url`, `created_at` on the `users` table.
- A new migration file exists that adds these columns (existing migrations are untouched).
- `google_id` has a unique constraint.
- `email` has a unique constraint.

**Fail criteria:**
- Missing columns in the schema.
- Existing migration files were modified.
- No unique constraint on `google_id` or `email`.

**Evidence requirements:**
- Contents of `shared/schema.ts` showing updated `users` table.
- New migration SQL file in `migrations/`.
- Database `\d users` output showing all columns and constraints.

---

## VAL-AUTH-013 — Multi-user query scoping by user_id

**Title:** New RelationshipOS queries are scoped to the authenticated user

**Behavioral description:**
All new Phase 1 endpoints (interactions, relationship scores, etc.) must scope database queries by the authenticated user's `id` (from `req.user.id`). User A must never see User B's interactions or relationship data. This means every `WHERE` clause on new tables includes `user_id = req.user.id`.

**Pass criteria:**
- Creating an interaction as User A and querying as User B returns empty results (User B does not see User A's data).
- Creating an interaction as User A and querying as User A returns the interaction.

**Fail criteria:**
- User B can see User A's interactions.
- Queries do not filter by `user_id`.
- A missing `user_id` on insert causes data to be globally visible.

**Evidence requirements:**
- Two authenticated sessions (User A, User B).
- User A creates an interaction → User A sees it, User B does not.
- Database query showing `user_id` column is populated on insert.

---

## VAL-AUTH-014 — Seed user exists with placeholder values

**Title:** Database seed creates initial user with placeholder data

**Behavioral description:**
On first application startup (or via migration/seed script), a seed user row must exist in the `users` table with placeholder values for `username`, `email`, `full_name`, etc. This ensures the app can function before any real Google login occurs. The first real Google OAuth login upserts over this seed user (matched by some criteria) or creates a fresh user alongside it.

**Pass criteria:**
- After running migrations, at least one user row exists in the `users` table.
- The seed user has non-null placeholder values.
- A real Google login does not conflict with the seed user (no unique constraint violation).

**Fail criteria:**
- The `users` table is empty after migration, causing errors in code that assumes a user exists.
- Real Google login fails due to conflict with the seed user.

**Evidence requirements:**
- Database query showing seed user row after migration.
- Successful Google OAuth login after seed user exists.

---

## VAL-AUTH-015 — Expired session returns 401

**Title:** Requests with expired session cookie are rejected

**Behavioral description:**
When a session has expired (based on `maxAge` or `cookie.expires` configuration in express-session), subsequent requests with that session cookie must be treated as unauthenticated. `GET /auth/me` must return 401, and protected endpoints must also return 401. The server must not serve stale user data from an expired session.

**Pass criteria:**
- After session expiry, `GET /auth/me` returns 401.
- Protected endpoints return 401.
- No user data is returned.

**Fail criteria:**
- Expired session is still honored (returns 200 with user data).
- Server crashes on expired session lookup.

**Evidence requirements:**
- Session created with a known `maxAge`.
- Request after `maxAge` elapses returns 401.
- (May require adjusting session config for testability, or mocking time.)

---

## VAL-AUTH-016 — POST /auth/logout is idempotent for unauthenticated users

**Title:** Logout without active session returns graceful response

**Behavioral description:**
When a client without an active session (or already logged out) sends `POST /auth/logout`, the server must respond gracefully — either with 200 OK (no-op) or 401. It must NOT crash, return 500, or produce side effects.

**Pass criteria:**
- Response is 200 (no-op acknowledged) or 401 (already unauthenticated).
- No server error or crash.

**Fail criteria:**
- Response is 500 or server crashes.
- Unexpected side effects (e.g., another user's session is destroyed).

**Evidence requirements:**
- HTTP response for `POST /auth/logout` without a session cookie.
- Server logs showing no errors.

---

## VAL-AUTH-017 — OAuth callback rejects forged state parameter

**Title:** CSRF protection via state parameter on OAuth callback

**Behavioral description:**
If the OAuth flow includes a `state` parameter for CSRF protection (as recommended), the callback must verify that the `state` in the callback URL matches the `state` stored in the user's session. A forged or mismatched `state` must result in an authentication failure, not a successful login.

**Pass criteria:**
- Callback with mismatched `state` returns an error (redirect to error page or 403).
- No user session is created.
- No user row is created or updated.

**Fail criteria:**
- Login succeeds despite forged `state`.
- Server ignores the `state` parameter entirely.

**Evidence requirements:**
- HTTP request to callback with tampered `state` parameter.
- Response showing authentication failure.
- Database unchanged.

---

## VAL-AUTH-018 — Session cookie has secure attributes

**Title:** Session cookie uses httpOnly, secure, sameSite attributes

**Behavioral description:**
The session cookie (`connect.sid` or custom name) must be configured with security best practices: `httpOnly: true` (prevents XSS access), `secure: true` in production (HTTPS only), and `sameSite: 'lax'` or `'strict'` (CSRF mitigation). In development, `secure` may be `false` to allow HTTP.

**Pass criteria:**
- `Set-Cookie` header includes `HttpOnly` flag.
- In production, `Set-Cookie` includes `Secure` flag.
- `SameSite` attribute is `Lax` or `Strict`.

**Fail criteria:**
- `HttpOnly` is missing (cookie accessible via JavaScript).
- `Secure` is missing in production (cookie sent over HTTP).
- `SameSite=None` without justification.

**Evidence requirements:**
- Full `Set-Cookie` header from login response.
- Express session configuration showing cookie options.
