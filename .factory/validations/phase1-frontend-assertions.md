# Phase 1 Frontend Validation Assertions

> RelationshipOS Phase 1 — UI behavioral assertions for all testable frontend scenarios.

---

## 1 — Authentication Flow

### VAL-UI-001: Unauthenticated visitor is redirected to Google OAuth

**Title:** First-visit redirect to Google auth  
**Behavioral description:** When an unauthenticated user navigates to any application route (e.g. `/`, `/contacts`, `/settings`), the app issues `GET /auth/me`. On receiving a 401 response, the browser is redirected to `/auth/google` (the Google OAuth initiation endpoint). The user must **not** see the main app shell (sidebar, header, page content) at any point before authentication completes.  
**Pass criteria:**
- Network tab shows `GET /auth/me` returning 401.
- Browser location changes to `/auth/google` (or the Google consent screen URL).
- No flash of the sidebar, dashboard, or any authenticated content.  
**Fail criteria:** App shell renders before redirect; redirect does not happen; a different auth route is used; an error page is shown instead of redirect.  
**Evidence:** Network waterfall screenshot showing the `/auth/me` → 401 → redirect sequence; browser URL bar showing Google OAuth domain.

---

### VAL-UI-002: Authenticated user sees main app shell after login

**Title:** Post-login app shell renders correctly  
**Behavioral description:** After a successful Google OAuth callback, `GET /auth/me` returns 200 with user data. The app renders the full shell: sidebar (with all navigation items), header (with sidebar toggle and theme toggle), and the default route content (Dashboard or the route the user was trying to access).  
**Pass criteria:**
- `GET /auth/me` returns 200.
- Sidebar is visible with all menu items (Prospect Research, Import Prospects, Contacts, Outreach Log, Dashboard, Decisions, Settings, and the new **Relationships** section).
- Header renders `SidebarTrigger` and `ThemeToggle`.
- Main content area loads the correct page component.  
**Fail criteria:** App stays on a loading/blank screen; sidebar is missing items; header controls are absent; page content does not render.  
**Evidence:** Full-page screenshot of the authenticated app; network tab showing `GET /auth/me` → 200.

---

### VAL-UI-003: Session expiry triggers re-authentication

**Title:** Expired/invalid session redirects to auth  
**Behavioral description:** If the user's session expires or becomes invalid (e.g. cookie cleared), subsequent API calls from TanStack Query return 401. The app detects this and redirects the user to `/auth/google` rather than displaying broken UI or stale data.  
**Pass criteria:**
- After session invalidation, at least one API call returns 401.
- User is redirected to the Google OAuth flow.
- No console errors indicating unhandled 401s (beyond the expected redirect logic).  
**Fail criteria:** App continues rendering with stale data; error toasts flood the screen; no redirect happens; page crashes.  
**Evidence:** Console log showing 401 detection; network tab; browser URL showing redirect.

---

## 2 — Contact List (API-First Data Loading)

### VAL-UI-004: Contact list loads from API, not localStorage

**Title:** Contacts fetched from `GET /api/contacts`  
**Behavioral description:** When the `/contacts` page mounts, the `useContacts` hook's TanStack Query issues `GET /api/contacts` to fetch contact data. The response populates the contact list. localStorage is used only as a write-through cache (writes happen to both API and localStorage), but the **read source of truth** is the API.  
**Pass criteria:**
- Network tab shows `GET /api/contacts` request on page load.
- Contact list renders data matching the API response (not stale localStorage data).
- If localStorage contains contacts that are not in the API response, those contacts do **not** appear in the list.  
**Fail criteria:** No `GET /api/contacts` request is made; contacts are loaded from localStorage as primary source; data mismatch between API response and displayed list.  
**Evidence:** Network tab showing `GET /api/contacts` → 200 with response body; screenshot of rendered list matching API data; comparison with localStorage contents.

---

### VAL-UI-005: Contact list search/filter still works

**Title:** Search input filters contacts in real-time  
**Behavioral description:** The search input (`data-testid="input-search"` or equivalent) filters the displayed contact list by name, company, or role as the user types. This filtering operates on the API-fetched data in memory.  
**Pass criteria:**
- Typing a search term reduces the visible contact cards to only matching entries.
- Clearing the search input restores the full list.
- No additional network requests are made during client-side filtering (unless debounced server-side search is implemented).  
**Fail criteria:** Search does not filter; filtering uses stale data; page crashes on search; results are incorrect.  
**Evidence:** Screenshot of filtered results; console showing no errors.

---

### VAL-UI-006: Contact list supports sorting by last_interaction_at

**Title:** Contacts sortable by last interaction date  
**Behavioral description:** The contact list provides a sort control (dropdown, button, or column header) that allows sorting by `last_interaction_at`. Contacts with more recent interactions appear first when sorted descending. Contacts with no interactions sort to the bottom (or a defined position).  
**Pass criteria:**
- Sort control is visible and functional.
- Selecting "Last Interaction" sort reorders the list correctly.
- Contacts with `null` / no interaction date are handled gracefully (sorted last or grouped separately).  
**Fail criteria:** Sort control is missing; sorting produces incorrect order; contacts with null dates cause errors; UI does not update on sort change.  
**Evidence:** Screenshots of list before and after sorting; inspection of sort order against known data.

---

## 3 — Contact Detail Panel

### VAL-UI-007: Contact detail shows tier badge

**Title:** Tier badge displayed on contact detail  
**Behavioral description:** When a contact is selected and the detail panel opens, a visual badge indicates the contact's tier (e.g., "Tier 1", "Tier 2", "Tier 3", or equivalent labels). The badge uses semantic coloring consistent with the design system (e.g., green for high-priority tier). If the contact has no tier set, the badge is either absent or shows a neutral "Untiered" state.  
**Pass criteria:**
- Tier badge is visible in the contact detail header area.
- Badge text matches the contact's `tier` (or equivalent field) from the API response.
- Badge uses appropriate color/variant per tier level.
- Null/undefined tier does not cause a rendering error.  
**Fail criteria:** Badge is missing; badge shows wrong tier; badge renders for null tier without a graceful fallback; styling does not match design system.  
**Evidence:** Screenshot of contact detail with tier badge visible; API response showing the tier field value.

---

### VAL-UI-008: Contact detail shows source tag

**Title:** Source tag displayed on contact detail  
**Behavioral description:** The contact detail panel displays a tag or badge indicating how the contact was imported (e.g., "LinkedIn PDF", "CSV", "Google Sheets", "Airtable", "Manual", "Google Calendar"). This uses a `source` field from the contact data.  
**Pass criteria:**
- Source tag is visible in the contact detail view.
- Tag text corresponds to the contact's source value.
- Multiple source types render with correct labels.
- Missing/null source handled gracefully (hidden or "Unknown").  
**Fail criteria:** Source tag missing; wrong label; crashes on null source.  
**Evidence:** Screenshot showing source tag; API response with source field.

---

### VAL-UI-009: Contact detail shows last_interaction_at timestamp

**Title:** Last interaction date visible in contact detail  
**Behavioral description:** The contact detail panel displays the `last_interaction_at` timestamp in a human-readable format (e.g., "3 days ago", "Mar 15, 2026", or relative time). If the contact has no recorded interactions, a placeholder such as "No interactions yet" is shown.  
**Pass criteria:**
- Timestamp is visible and correctly formatted.
- Value matches the `last_interaction_at` field from the API.
- Null value shows appropriate empty state text.  
**Fail criteria:** Date missing; shows raw ISO string; shows "Invalid Date"; crashes on null.  
**Evidence:** Screenshot of contact detail; API response showing `last_interaction_at` value.

---

## 4 — Interaction Timeline Component

### VAL-UI-010: Interaction timeline renders in chronological order

**Title:** Interactions listed chronologically (newest first)  
**Behavioral description:** The interaction timeline component (`interaction-timeline.tsx`) renders a list of all interactions for a given contact, sorted by date with the most recent interaction at the top. Each entry displays: date, interaction channel (e.g., LinkedIn, Email, Phone, Meeting), a direction indicator (inbound vs. outbound), and a summary or note.  
**Pass criteria:**
- Timeline entries are sorted newest-first.
- Each entry shows date, channel, direction, and content summary.
- Channel is indicated by an icon or label (using Lucide icons per design system).
- Direction (inbound/outbound) is visually distinguishable (icon, color, or text label).  
**Fail criteria:** Entries are unsorted or sorted oldest-first; missing channel/direction indicators; entries are duplicated or missing.  
**Evidence:** Screenshot of timeline with 3+ entries showing correct order; comparison with API data.

---

### VAL-UI-011: Interaction timeline shows channel icons and direction indicators

**Title:** Visual channel and direction indicators per interaction  
**Behavioral description:** Each interaction entry in the timeline displays an icon representing the communication channel (e.g., `Linkedin` icon for LinkedIn, `Mail` icon for email, `Phone` icon for calls, `Calendar` icon for meetings) and a direction indicator (e.g., arrow icon, "Sent"/"Received" label, or color coding for inbound vs. outbound).  
**Pass criteria:**
- Each distinct channel type has a recognizable Lucide icon.
- Direction indicator is present and correct for each entry.
- Icons use consistent sizing (`h-4 w-4` per design system).  
**Fail criteria:** Generic/missing icons; no direction indicator; icons from a non-Lucide library; inconsistent sizing.  
**Evidence:** Screenshot showing multiple interaction types with distinct icons and direction labels.

---

### VAL-UI-012: Interaction timeline shows empty state

**Title:** Empty state when no interactions exist  
**Behavioral description:** When a contact has zero interactions, the timeline component renders a meaningful empty state (e.g., an illustration or text like "No interactions recorded yet" with an optional CTA to log the first interaction).  
**Pass criteria:**
- Empty state message is displayed when interaction list is empty.
- No broken layout, empty container, or console errors.
- Optional: A call-to-action button/link to create the first interaction is shown.  
**Fail criteria:** Blank/invisible component; "undefined" or error text; layout shifts; console errors.  
**Evidence:** Screenshot of empty timeline state for a contact with no interactions.

---

## 5 — Manual Interaction Entry Form

### VAL-UI-013: Manual interaction form is accessible from contact detail

**Title:** "Log Interaction" action available from contact detail  
**Behavioral description:** The contact detail panel includes a button or link (e.g., "Log Interaction", "Add Interaction") that opens a form (dialog, sheet, or inline) for manually recording an interaction. The form is reachable without navigating away from the contact detail view.  
**Pass criteria:**
- Button/link is visible in the contact detail panel.
- Clicking it opens the interaction entry form.
- Form is contextually pre-filled with the contact's ID (no need to select the contact again).  
**Fail criteria:** No entry point for logging interactions; button exists but does nothing; form opens for wrong contact.  
**Evidence:** Screenshot of contact detail showing the action button; screenshot of the opened form.

---

### VAL-UI-014: Manual interaction form validates required fields

**Title:** Form validation on interaction submission  
**Behavioral description:** The manual interaction form requires at minimum: interaction type/channel, date, and direction (inbound/outbound). Submitting the form with any required field missing shows a validation error (inline or toast). The form does not submit an API request until all required fields are valid.  
**Pass criteria:**
- Submitting with empty required fields shows validation error messages.
- No `POST` request is made to the API when validation fails.
- Error messages are specific to the missing/invalid field.
- After fixing errors, the form submits successfully.  
**Fail criteria:** Form submits with missing required fields; no validation feedback; generic error without field identification; API receives invalid data.  
**Evidence:** Screenshot of validation errors; network tab showing no request on invalid submit; screenshot of successful submit after correction.

---

### VAL-UI-015: Successful interaction creation shows feedback and updates timeline

**Title:** Success toast and timeline refresh on interaction save  
**Behavioral description:** After successfully submitting the manual interaction form, the user sees: (1) a success toast notification, (2) the form closes/resets, and (3) the interaction timeline refreshes to include the newly created entry (via TanStack Query invalidation).  
**Pass criteria:**
- Toast notification appears with success message.
- Form closes or resets to empty state.
- Timeline shows the new interaction without a full page reload.
- Network tab shows the `POST` request succeeded (2xx) and a subsequent query invalidation/refetch for the timeline.  
**Fail criteria:** No feedback on success; form stays open with stale data; timeline does not update; toast shows error despite successful save.  
**Evidence:** Screenshot of success toast; screenshot of updated timeline; network tab showing POST → 2xx → refetch.

---

## 6 — Sidebar Navigation

### VAL-UI-016: "Relationships" section visible in sidebar

**Title:** Sidebar includes Relationships navigation section  
**Behavioral description:** The sidebar (`app-sidebar.tsx`) includes a new "Relationships" section or menu item, visually distinct (possibly as a `SidebarGroup` with its own header or as a new item in the existing menu). It links to the relationships/contacts area and uses a Lucide icon.  
**Pass criteria:**
- "Relationships" text is visible in the sidebar.
- Clicking it navigates to the correct route.
- It uses a Lucide icon consistent with the design system (`h-5 w-5`).
- It appears in a logical position within the sidebar hierarchy.  
**Fail criteria:** "Relationships" item is missing; link navigates to wrong route; icon is missing or from wrong library; item is hidden or unreachable.  
**Evidence:** Screenshot of sidebar with Relationships item highlighted; URL after clicking.

---

### VAL-UI-017: All existing sidebar navigation items still work

**Title:** Backward compatibility of sidebar navigation  
**Behavioral description:** All pre-existing sidebar items — Prospect Research, Import Prospects, Contacts, Outreach Log, Dashboard, Decisions, Settings — remain present, clickable, and navigate to their correct routes. Active-state highlighting still works for each.  
**Pass criteria:**
- All 7 original menu items are present.
- Clicking each navigates to the correct route (`/prospect-research`, `/research-setup`, `/contacts`, `/outreach-log`, `/`, `/decisions`, `/settings`).
- Active state (visual highlight) applies to the current route's menu item.  
**Fail criteria:** Any existing item is missing; any link is broken; active states are incorrect; items are reordered unexpectedly.  
**Evidence:** Screenshot of sidebar showing all items; click-through test of each item with URL verification.

---

## 7 — Backward Compatibility

### VAL-UI-018: Dashboard page loads and functions

**Title:** Dashboard page unaffected by Phase 1 changes  
**Behavioral description:** The Dashboard page (`/`) loads without errors, renders metrics/charts, and all interactive elements (filters, date ranges, etc.) remain functional. No console errors related to Phase 1 changes appear.  
**Pass criteria:**
- Dashboard route renders the `Dashboard` component.
- Metrics and charts display data (or appropriate empty states).
- No JavaScript console errors.
- No visual regressions (layout, spacing, typography).  
**Fail criteria:** Page crashes; blank content; console errors; layout broken; charts missing.  
**Evidence:** Screenshot of dashboard; console log showing zero errors on this page.

---

### VAL-UI-019: Outreach log, research, and decisions pages load

**Title:** Existing feature pages are unbroken  
**Behavioral description:** The following pages load without errors and retain their existing functionality:
- `/outreach-log` — Outreach Log
- `/prospect-research` — Prospect Research
- `/research-queue` — Research Queue
- `/research-setup` — Import Prospects / Research Setup
- `/decisions` — Decisions / Experiments  
**Pass criteria:**
- Each page renders its component correctly.
- No console errors on any page.
- Core functionality (viewing data, triggering actions) works.  
**Fail criteria:** Any page fails to load; 500 errors from APIs these pages depend on; console errors; blank screens.  
**Evidence:** Screenshots of each page; console logs per page.

---

### VAL-UI-020: Contact creation and edit forms still work

**Title:** Contact CRUD operations unbroken  
**Behavioral description:** Creating a new contact via the Add Contact modal (manual entry, single PDF, batch upload) and editing existing contact fields still works. The data flows through the updated `useContacts` hook to the API. Deletions (single and bulk) also still function.  
**Pass criteria:**
- Add Contact modal opens and all three tabs (Single PDF, Batch Upload, Manual Entry) work.
- Manual entry: filling required fields and submitting creates a contact (visible in the list after).
- Delete: single and bulk delete remove contacts from the list.
- Network tab shows appropriate `POST`/`DELETE` API calls.  
**Fail criteria:** Modal doesn't open; form submission fails; created contact doesn't appear; deletion doesn't remove contact; API errors.  
**Evidence:** Screenshot of successful contact creation; network tab showing API calls; list before/after deletion.

---

### VAL-UI-021: Dark mode toggle still functions

**Title:** Theme toggle switches between light and dark mode  
**Behavioral description:** The `ThemeToggle` component in the header switches the application between light and dark modes. All Phase 1 additions (tier badges, source tags, interaction timeline, Relationships sidebar item) render correctly in both themes.  
**Pass criteria:**
- Clicking the toggle switches the theme.
- New components (tier badge, source tag, interaction timeline entries) have appropriate dark mode styles.
- No elements become invisible or unreadable in either mode.
- Preference persists across page reloads (localStorage or cookie).  
**Fail criteria:** Toggle doesn't work; new components have no dark mode styles; text/backgrounds clash; preference doesn't persist.  
**Evidence:** Screenshots of the contact detail panel (with tier badge, source tag, timeline) in both light and dark modes.

---

## 8 — Responsive Behavior

### VAL-UI-022: Contact detail panel behaves correctly on mobile viewports

**Title:** Mobile-responsive contact detail  
**Behavioral description:** On viewports ≤768px wide, the contact detail panel adapts its layout: either becoming a full-screen overlay / sheet, or stacking vertically instead of a side panel. The tier badge, source tag, interaction timeline, and action buttons remain accessible and usable. The sidebar collapses (as per existing `SidebarTrigger` behavior).  
**Pass criteria:**
- Contact detail is fully viewable on a 375px-wide viewport.
- All new Phase 1 elements (tier badge, source tag, last interaction date, timeline, log interaction button) are visible without horizontal scrolling.
- Close/back navigation works to return to the contact list.
- Sidebar is collapsed by default on mobile.  
**Fail criteria:** Content overflows horizontally; elements are cut off; close button unreachable; sidebar overlaps content.  
**Evidence:** Mobile-viewport screenshot (375px × 812px) of contact detail showing all Phase 1 elements.

---

## Summary

| ID | Area | Title |
|---|---|---|
| VAL-UI-001 | Auth | Unauthenticated redirect to Google OAuth |
| VAL-UI-002 | Auth | Post-login app shell renders |
| VAL-UI-003 | Auth | Session expiry re-authentication |
| VAL-UI-004 | Contact List | API-first data loading |
| VAL-UI-005 | Contact List | Search/filter works |
| VAL-UI-006 | Contact List | Sort by last_interaction_at |
| VAL-UI-007 | Contact Detail | Tier badge display |
| VAL-UI-008 | Contact Detail | Source tag display |
| VAL-UI-009 | Contact Detail | Last interaction timestamp |
| VAL-UI-010 | Interaction Timeline | Chronological order |
| VAL-UI-011 | Interaction Timeline | Channel icons & direction |
| VAL-UI-012 | Interaction Timeline | Empty state |
| VAL-UI-013 | Manual Interaction | Form accessible from detail |
| VAL-UI-014 | Manual Interaction | Required field validation |
| VAL-UI-015 | Manual Interaction | Success feedback & timeline refresh |
| VAL-UI-016 | Sidebar | Relationships section visible |
| VAL-UI-017 | Sidebar | Existing items still work |
| VAL-UI-018 | Backward Compat | Dashboard loads |
| VAL-UI-019 | Backward Compat | Other feature pages load |
| VAL-UI-020 | Backward Compat | Contact CRUD forms work |
| VAL-UI-021 | Backward Compat | Dark mode toggle works |
| VAL-UI-022 | Responsive | Mobile contact detail panel |
