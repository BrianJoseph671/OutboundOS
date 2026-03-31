# Phase 2 Cross-Area Validation Assertions

Assertions covering flows that span UI → API → Backend (storage/agent) layers.

---

## 1. Sync End-to-End

**VAL-CROSS-SYNC-001:** When the user clicks `Sync Recent` on the Actions Page, the UI sends `POST /api/sync` to the server. The server invokes the LangGraph agent, which pulls interactions from MCP sources, writes them to the `interactions` table via `interactionWriter`, runs `actionDetector` to create new `actions` rows, and returns `{ newInteractions: number, newActions: number, errors: string[] }`. The UI displays a success toast with counts and the action list refreshes to include newly created actions.

**VAL-CROSS-SYNC-002:** If `POST /api/sync` returns a partial failure (e.g., Granola MCP times out but Superhuman succeeds), the response still includes interactions/actions from successful sources. The UI shows a warning toast listing failed sources while rendering actions from successful sources.

**VAL-CROSS-SYNC-003:** On repeated `Sync Recent`, the `interactionWriter` deduplicates by `(channel, source_id)` via the partial unique index `interactions_channel_source_id_unique`. The `interactions` row count must not increase for already-ingested items. The `actions` table must not produce duplicate actions for the same `(contact_id, action_type, trigger_interaction_id)` tuple.

**VAL-CROSS-SYNC-004:** After a successful sync, `contacts.last_synced_at` is updated for every contact that received new interactions. `GET /api/contacts/:id` reflects the updated timestamp. The UI can display "last synced" metadata per contact.

**VAL-CROSS-SYNC-005:** During sync, the UI shows a loading/spinner state on the `Sync Recent` button. The button is disabled to prevent concurrent sync requests. On completion (success or error), the button returns to its idle state.

**VAL-CROSS-SYNC-006:** The `contactMatcher` service resolves interaction participants to existing `contacts` rows using case-insensitive email matching. If a synced interaction references `BJoseph2@nd.edu`, it matches the contact with `email = 'bjoseph2@nd.edu'`. The resulting `interactions.contact_id` FK is valid and references the matched contact.

---

## 2. Dismiss End-to-End

**VAL-CROSS-DISMISS-001:** When the user clicks the dismiss button on an action card, the UI sends `PATCH /api/actions/:id` with `{ status: "dismissed" }`. The server updates the `actions` row, setting `status = 'dismissed'` and `completed_at = now()`. The response returns the updated action object. The UI removes the card from the visible action list without a full page reload (optimistic or query invalidation).

**VAL-CROSS-DISMISS-002:** After dismissal, `GET /api/actions?status=pending` no longer includes the dismissed action. A direct `GET /api/actions/:id` returns the action with `status: "dismissed"` and a non-null `completed_at` timestamp.

**VAL-CROSS-DISMISS-003:** Dismissing an action that does not exist (`PATCH /api/actions/nonexistent-uuid`) returns HTTP 404. The UI handles this gracefully (e.g., removes stale card, shows error toast).

**VAL-CROSS-DISMISS-004:** Dismissing an action belonging to a different user returns HTTP 404 (user-scoped query finds no match). The action's status in the database remains unchanged.

---

## 3. Snooze End-to-End

**VAL-CROSS-SNOOZE-001:** When the user snoozes an action, the UI sends `PATCH /api/actions/:id` with `{ status: "snoozed", snoozed_until: "<ISO timestamp>" }`. The server sets `status = 'snoozed'` and stores the `snoozed_until` value. The action card disappears from the default pending action list.

**VAL-CROSS-SNOOZE-002:** `GET /api/actions?status=pending` excludes snoozed actions. `GET /api/actions?status=snoozed` returns snoozed actions with their `snoozed_until` timestamps.

**VAL-CROSS-SNOOZE-003:** When the current time passes `snoozed_until`, the action resurfaces. The backend query for pending actions includes a clause: actions where `status = 'pending'` OR (`status = 'snoozed'` AND `snoozed_until <= now()`). The UI shows the resurfaced action in the pending list on next load or refresh.

**VAL-CROSS-SNOOZE-004:** Snoozing with an invalid or past `snoozed_until` timestamp is handled gracefully. The server either rejects with HTTP 400 or accepts and the action immediately resurfaces on the next query (treating it as effectively un-snoozed).

---

## 4. Filter End-to-End

**VAL-CROSS-FILTER-001:** When the user selects a filter (e.g., `type=follow_up`), the UI sends `GET /api/actions?type=follow_up`. The server queries the `actions` table with `WHERE action_type = 'follow_up' AND status = 'pending'` (scoped by `user_id`). Only matching actions are returned. The UI renders only those action cards.

**VAL-CROSS-FILTER-002:** Combining filters works correctly. `GET /api/actions?type=reconnect&status=snoozed` returns only snoozed reconnect actions. The UI correctly reflects the combined filter state.

**VAL-CROSS-FILTER-003:** Clearing all filters returns the full pending action list. `GET /api/actions` (no query params) defaults to `status=pending` and returns all action types for the authenticated user.

**VAL-CROSS-FILTER-004:** Filtering with an invalid `type` value (e.g., `type=invalid_type`) returns an empty array (not a 400 error), and the UI shows the empty state.

**VAL-CROSS-FILTER-005:** Filter state in the UI is preserved during the session. After dismissing an action while a filter is active, the remaining filtered list updates correctly (dismissed action removed, other filtered actions remain).

---

## 5. Tab Switching (Actions / Rolodex)

**VAL-CROSS-TAB-001:** The Actions Page has two tabs: "Actions" and "Rolodex". The "Actions" tab displays the action queue sourced from `GET /api/actions`. The "Rolodex" tab displays the contacts list sourced from `GET /api/contacts`. Both tabs use the same authenticated session and `user_id` scoping.

**VAL-CROSS-TAB-002:** Switching from "Actions" to "Rolodex" tab does not trigger a re-fetch of actions data (TanStack Query caching). Switching back to "Actions" does not trigger a re-fetch of contacts data. Each tab's data is independently cached.

**VAL-CROSS-TAB-003:** The Rolodex tab reuses the existing Phase 1 contacts list component (or extends it). Contact data shape from `GET /api/contacts` is identical to Phase 1. No regression in contacts display, search, sort, or tier filtering.

**VAL-CROSS-TAB-004:** If a contact is visible in Rolodex and also has a pending action, the action card in the Actions tab references the same `contact_id`. Clicking a contact in Rolodex and viewing their action (if any) shows consistent data (name, company, role).

---

## 6. Auth Gate

**VAL-CROSS-AUTH-001:** An unauthenticated request to `GET /api/actions` returns HTTP 401 (enforced by the `/api` catch-all `isAuthenticated` middleware). The response body does not leak any action data.

**VAL-CROSS-AUTH-002:** An unauthenticated request to `PATCH /api/actions/:id` returns HTTP 401. No database mutation occurs.

**VAL-CROSS-AUTH-003:** An unauthenticated request to `POST /api/sync` returns HTTP 401. No agent execution or interaction writing occurs.

**VAL-CROSS-AUTH-004:** The frontend `AuthGate` component redirects unauthenticated users to `/auth/google` before any Actions Page component mounts. The `/actions` route is only rendered inside the authenticated `AppShell`.

**VAL-CROSS-AUTH-005:** All actions API responses are scoped by `user_id` from `req.user.id` (session). User A cannot see, dismiss, snooze, or modify User B's actions, even by guessing action UUIDs.

**VAL-CROSS-AUTH-006:** The `POST /api/sync` endpoint scopes the agent's interaction writing and action detection to the authenticated user. Interactions and actions created during sync have `user_id` matching the session user.

---

## 7. Navigation

**VAL-CROSS-NAV-001:** The `AppSidebar` includes a navigation item for the Actions Page (e.g., "Actions" with an appropriate Lucide icon). Clicking it navigates to `/actions` via Wouter's `<Link>` component.

**VAL-CROSS-NAV-002:** When the user is on the `/actions` route, the Actions sidebar item is visually highlighted (`isActive = true`). Other sidebar items are not active.

**VAL-CROSS-NAV-003:** The `/actions` route is registered in `client/src/App.tsx` inside the `<Router>` component's `<Switch>`. The route renders the Actions Page component.

**VAL-CROSS-NAV-004:** Navigating from any existing page (e.g., `/contacts`, `/outreach-log`) to `/actions` via the sidebar works without a full page reload. The Actions Page component mounts and fetches data.

**VAL-CROSS-NAV-005:** The browser URL updates to `/actions` when the Actions Page is active. Direct navigation to `/actions` (e.g., pasting URL) loads the page correctly for authenticated users.

---

## 8. Mock → Real Transition

**VAL-CROSS-MOCK-001:** The mock data shape for actions matches the exact API response shape from `GET /api/actions`. Fields include: `id`, `user_id`, `contact_id`, `action_type`, `trigger_interaction_id`, `priority`, `status`, `snoozed_until`, `reason`, `created_at`, `completed_at`. The UI components accept both mock and real data without code changes beyond swapping the data source.

**VAL-CROSS-MOCK-002:** When mock data is replaced with TanStack Query hooks calling `GET /api/actions`, all UI behaviors remain identical: action cards render, filters work, dismiss/snooze mutate via API, empty state displays when no actions exist.

**VAL-CROSS-MOCK-003:** The mock data includes all four `action_type` values (`follow_up`, `reconnect`, `open_thread`, `new_contact`) and all four `status` values (`pending`, `completed`, `dismissed`, `snoozed`). The UI handles each type/status combination correctly in both mock and real modes.

**VAL-CROSS-MOCK-004:** Mock contact names use realistic values from Brian's network (Vince Signori, Andrei, Paul Dornier, Noah Lovati, Aron Schwartz, George Gardner, Sean) as specified in the PRD. When wired to real API, these are replaced by actual `contacts` table data.

**VAL-CROSS-MOCK-005:** The transition from mock to real data does not require changes to any UI component's props interface, rendering logic, or event handlers. Only the data-fetching layer (mock import → useQuery hook) changes.

---

## 9. Action Auto-Complete

**VAL-CROSS-AUTOCOMP-001:** When a `Sync Recent` run ingests a new outbound interaction (e.g., `direction = 'outbound'`, `channel = 'email'`) for a contact that has a pending `follow_up` action, the `actionDetector` automatically sets that action's `status` to `completed` and `completed_at` to `now()`.

**VAL-CROSS-AUTOCOMP-002:** After auto-completion, `GET /api/actions?status=pending` no longer includes the auto-completed action. The UI refreshes post-sync and the completed action is absent from the pending list.

**VAL-CROSS-AUTOCOMP-003:** Auto-completion only targets `follow_up` actions (not `reconnect` or `open_thread`). A `reconnect` action for a contact is not auto-completed when a new outbound interaction is synced; it requires explicit user action or a different detection rule.

**VAL-CROSS-AUTOCOMP-004:** Auto-completion matches the outbound interaction's `contact_id` to the action's `contact_id`. If multiple pending follow-up actions exist for the same contact, all are auto-completed when an outbound interaction is synced.

**VAL-CROSS-AUTOCOMP-005:** The auto-completion runs within the same sync transaction/flow. The sync response includes auto-completed actions in its count or summary. The UI reflects both new actions and auto-completed ones after a single sync refresh.

---

## 10. Empty State After Dismiss-All

**VAL-CROSS-EMPTY-001:** When the user dismisses the last remaining pending action, `GET /api/actions?status=pending` returns an empty array `[]`. The UI renders the empty state: "All caught up. Hit Sync Recent to check for new activity."

**VAL-CROSS-EMPTY-002:** The empty state includes a visible and functional `Sync Recent` button. Clicking it triggers the full sync flow (`POST /api/sync`). If new actions are detected, they appear and replace the empty state.

**VAL-CROSS-EMPTY-003:** If all actions are dismissed but the user switches to the Rolodex tab, the contacts list still renders normally (contacts exist independently of actions). Switching back to Actions shows the empty state.

**VAL-CROSS-EMPTY-004:** After reaching the empty state, snoozing (rather than dismissing) the last action also shows the empty state (since snoozed actions are excluded from the default pending view). When the snoozed action resurfaces, the empty state is replaced by the action card.

**VAL-CROSS-EMPTY-005:** The empty state does not flash or appear momentarily during loading. While `GET /api/actions` is in flight, a loading skeleton or spinner is shown. The empty state only renders after the query resolves with zero results.
