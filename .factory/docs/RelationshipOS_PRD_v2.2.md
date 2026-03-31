# OUTBOUNDOS — RelationshipOS Module

## Product Requirements Document v2.2

| Field | Value |
|-------|-------|
| Author | Brian Joseph |
| Status | Draft, Ready for Factory AI (plumbing) + Cursor/Claude Code (MCP wiring) |
| Stack | TypeScript / Node / Express / PostgreSQL / React / LangChain.js / LangGraph |
| Created | March 30, 2026 |
| Supersedes | PRD v1.0, v2.0, v2.1. Phase 1 unchanged. Phases 2-4 rewritten with two-state UI. |
| Phases | 4 (Foundation, Agent + Ingestion, Context Engine + Compose, Action Engine) |

---

## 1. Vision and Scope

### 1.1 Problem Statement

Professional relationship management is broken for individual operators. Contacts live across Gmail, LinkedIn, Granola meeting notes, Google Calendar, and memory. There is no single source of truth. Follow-ups fall through the cracks.

The real pain is context switching. To send a single follow-up email after a meeting, Brian currently has to open Granola to find the meeting notes, copy them into Claude for drafting help, switch to Superhuman to compose the email, and bounce between all three until the draft is right. Four apps and six context switches for one email.

### 1.2 Vision

A personal, AI-native CRM for networking. A system that surfaces what needs your attention and gives you everything you need to act on it without leaving the app. Open OutboundOS, see your pending actions, click into one, draft a response with full context from your meetings and emails, send, done, next.

### 1.3 What Changed in v2.2

- Two-state UI replaces three-panel layout: the app has two distinct states, the Actions Page and the Draft Workspace.
- Manual sync via `Sync Recent`: ingestion is user-triggered; no background polling or cron jobs.
- Send returns to Actions Page: after sending, the action is marked complete and the user returns to queue.
- Draft Workspace mirrors Superhuman compose: center draft, left AI assistant, right context panel.

### 1.4 Scope

**In Scope:**

- Contact unification across Superhuman (email), Granola (meetings), and Google Calendar
- Manual on-demand interaction ingestion via `Sync Recent`
- Action queue: pending follow-ups, stale relationships, open threads
- Two-state UI: Actions Page and Draft Workspace
- AI-assisted draft composer via Superhuman MCP `draft_email`
- AI-generated context cards per contact
- Play-specific outreach presets (warm, cold, intro request)
- Weekly prioritization brief
- ROI tracking on networking activity

**Out of Scope:**

- LinkedIn API integration (manual entry or future Chrome extension)
- Mobile app
- Multi-user admin UI (architecture supports it; admin UI deferred)
- CRM sync (Salesforce, HubSpot)
- Background/automated ingestion (manual `Sync Recent` only for now)
- Superhuman UI overlay or Chrome extension (future concept)
- Geographic mapping of contacts (deferred)

**BOUNDARY:** RelationshipOS is a read-and-intelligence layer. It does not replace Superhuman, Granola, or Calendar. It aggregates, reasons, and helps you act without context switching.

### 1.5 Non-Negotiables

- No data is sent, drafted, or acted on without explicit user approval
- Every AI-generated output must show its sources and reasoning
- Contact deduplication must be deterministic, not probabilistic
- All ingestion operations must be idempotent
- TypeScript throughout: strict mode, no `any` types in core data models

---

## 2. Architecture Overview

### 2.1 Three-Layer Model

| Layer | Description |
|-------|-------------|
| Layer 1: Rolodex (Data) | One contacts table. Every interaction attaches to one canonical person record. |
| Layer 2: Context Engine (Intelligence) | AI-generated briefs: history, open threads, relationship health, suggested actions. |
| Layer 3: Action Engine (Execution) | Action queue surfaces who needs attention. Draft workspace helps you act. Play engines generate outreach. |

### 2.2 Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | TypeScript / Node.js / Express (existing OutboundOS) |
| Database | PostgreSQL (existing OutboundOS instance) |
| Frontend | React (existing OutboundOS frontend, new RelationshipOS module) |
| Agent | LangChain.js + LangGraph (multi-step tool-calling agent) |
| Tracing | LangSmith (every agent run logged) |
| AI | Claude API (`claude-sonnet-4-20250514`) |
| Email Data | Superhuman Mail MCP Server |
| Meeting Data | Granola MCP Server |
| Calendar Data | Google Calendar MCP Server |
| Draft Composition | Superhuman Mail MCP `draft_email` (writes in user's voice) |
| Hosting | Replit (existing OutboundOS deployment) |

### 2.3 Data Flow: Sync Recent

When the user clicks `Sync Recent` on the Actions Page:

1. LangGraph agent pulls last N days from all three MCP servers (default 7 days, configurable).
2. Superhuman: `list_email` with `start_date`; optionally `get_email_thread` for full content.
3. Granola: `list_meetings` with time range; `get_meetings` for summaries.
4. Calendar: `gcal_list_events` with `timeMin`/`timeMax`, external attendees only.
5. Agent deduplicates against existing interactions by `source_id`.
6. New interactions are written to `interactions`.
7. Action detection computes follow-ups, stale relationships, and open threads.
8. Actions are written to `actions`.
9. Actions Page refreshes with updated queue.

**FIRST SYNC:** Pull last 90 days to initialize history. Subsequent syncs pull since `last_synced_at`.

### 2.4 Primary User Flow: Two-State UI

#### State 1: Actions Page

- Home screen with a prioritized action list
- Top bar: `Sync Recent`, filters (type/company/tag), Actions/Rolodex tab toggle
- Cards show contact, company, action badge, relative time, source icon, reason
- Card actions: open Draft Workspace, dismiss, snooze
- Empty state: "All caught up. Hit Sync Recent to check for new activity."
- Rolodex tab: searchable/sortable contacts list with tier/tag filters

#### State 2: Draft Workspace

- Full-screen three-column compose environment
- Left: AI chat with play presets (warm/cold/intro)
- Center: editable draft (`To`, `Subject`, `Body`) + send to Superhuman
- Right: read-only context panel (trigger interaction + full context card)
- Send writes draft to Superhuman Drafts, marks action complete, returns to Actions Page
- Back arrow or `Esc` returns to Actions Page at any time
- In-progress draft can resume via `draft_id`/`draft_thread_id`

#### Complete Flow (Example)

1. Brian finishes a Zoom call with Vince at LangChain.
2. Brian clicks `Sync Recent` on Monday.
3. Agent ingests the meeting and creates a follow-up action.
4. Brian opens the action card into Draft Workspace.
5. Right panel shows Granola summary + context card.
6. Brian prompts AI for a follow-up draft in left panel.
7. Draft appears in center panel; Brian edits and sends.
8. Draft saves to Superhuman; action is marked complete; UI returns to Actions Page.

---

## 3. MCP Server Interfaces (Verified)

Verified via live MCP calls on March 30, 2026. Factory and Cursor should code against these exact shapes.

### 3.1 Superhuman Mail MCP

| Tool | Contract |
|------|----------|
| `list_email` | Filters: `from`, `to`, `from_contains`, `to_contains`, `subject_contains`, `body_contains`, `start_date`, `end_date`, `thread_id`, `limit` (max 50), `cursor`. Returns `message_id`, `thread_id`, `from`, `to`, `cc`, `subject`, `date`, `snippet`, `has_attachments`, pagination fields. |
| `get_email_thread` | Input: `thread_id` (required), `message_limit` (default 50, max 100). Returns full message bodies in markdown. |
| `query_email_and_calendar` | Input: natural-language `question`. Returns synthesized answer with reference IDs. |
| `draft_email` | Input: `instructions`, optional `to`, `subject`, optional `thread_id`, revision via `draft_id` + `draft_thread_id`. Returns draft identifiers and composed email in user voice. |

**Draft Workspace Note:** `instructions` receives AI Chat output enriched with context from right panel.

### 3.2 Granola MCP

| Tool | Contract |
|------|----------|
| `list_meetings` | Input `time_range` (`this_week`, `last_week`, `last_30_days`). Returns meeting `id`, `title`, `date`, `known_participants`. |
| `get_meetings` | Input `meeting_ids` (UUID array, max 10). Returns details plus AI summary markdown. |
| `get_meeting_transcript` | Input `meeting_id`. Returns verbatim transcript (use only for exact quotes). |
| `query_granola_meetings` | Input natural-language query. Returns answer with meeting citations. |

### 3.3 Google Calendar MCP

| Tool | Contract |
|------|----------|
| `gcal_list_events` | Input `calendarId`, `timeMin`, `timeMax`, `timeZone`, `q`, `maxResults` (max 250), `condenseEventDetails`, `pageToken`. Returns event details including attendees and metadata. |

---

## 4. Database Schema

**NOTE:** Phase 1 schema unchanged. Additions below.

### 4.1 Addition: `contacts.last_synced_at`

- Type: `TIMESTAMPTZ`, nullable
- Purpose: Tracks when agent last pulled data for this contact (`NULL` = never synced)

### 4.2 New Table: `actions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID, PK | |
| `user_id` | UUID, FK `users(id)`, NOT NULL | User scope |
| `contact_id` | UUID, FK `contacts(id)`, NOT NULL | Contact reference |
| `action_type` | TEXT, NOT NULL | `follow_up`, `reconnect`, `open_thread`, `new_contact` |
| `trigger_interaction_id` | UUID, FK `interactions(id)`, nullable | Source interaction |
| `priority` | INTEGER, NOT NULL, DEFAULT 0 | Higher = more urgent |
| `status` | TEXT, NOT NULL, DEFAULT `pending` | `pending`, `completed`, `dismissed`, `snoozed` |
| `snoozed_until` | TIMESTAMPTZ, nullable | Resurface time |
| `reason` | TEXT, NOT NULL | Human-readable reason |
| `created_at` | TIMESTAMPTZ, DEFAULT `now()` | |
| `completed_at` | TIMESTAMPTZ, nullable | Complete/dismiss timestamp |

### 4.3 New Table: `drafts_log`

Tracks draft iterations for future style feedback loop.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID, PK | |
| `user_id` | UUID, FK `users(id)` | |
| `contact_id` | UUID, FK `contacts(id)` | |
| `action_id` | UUID, FK `actions(id)`, nullable | Triggering action |
| `superhuman_draft_id` | TEXT | From Superhuman MCP response |
| `instructions` | TEXT | User request from AI Chat |
| `generated_body` | TEXT | AI-generated draft |
| `final_body` | TEXT, nullable | User-edited final content |
| `play_type` | TEXT, nullable | `warm`, `cold`, `intro`, or `null` |
| `created_at` | TIMESTAMPTZ, DEFAULT `now()` | |

### 4.4 Existing Tables (Unchanged)

- `users`
- `contacts`
- `interactions`
- `contact_briefs`
- `weekly_briefs`

---

## 5. Build Phases

### 5.0 Build Approach: UI First

**CRITICAL:** For each phase, build React components first using hardcoded mock data, then build backend to match that shape exactly.

1. Define mock data matching UI needs.
2. Build React components with mock data.
3. Build Express routes returning the same shape.
4. Build backend services producing that shape.
5. Replace mocks with live API calls.

Use realistic mock names from Brian's network (Vince Signori, Andrei, Paul Dornier, Noah Lovati, Aron Schwartz, George Gardner, Sean).

### 5.1 Phase 1: Foundation (COMPLETE)

Contacts table, interactions table, CRUD API, React UI. No changes.

### 5.2 Phase 2: Agent + Ingestion + Actions Page

| Field | Value |
|-------|-------|
| Target | 10-14 days |
| Builder: UI + Plumbing | Factory AI |
| Builder: MCP Wiring | Brian via Cursor / Claude Code |

**Objective:** Build Actions Page, `Sync Recent`, and action detection so Brian can identify follow-ups quickly.

#### Factory Builds: UI

- Full-screen Actions Page with `Sync Recent`, filters, and Actions/Rolodex tabs
- Action cards with contact identity, action badge, time, source icon, and reason
- Dismiss action and empty state
- Sync flow with loading state and success/error toast
- Rolodex tab extending Phase 1 contact list
- 8-10 realistic mock actions including follow-up, reconnect, and open-thread types

#### Factory Builds: Backend

- `POST /sync` returns new interactions/actions counts and errors
- `GET /actions` with status/type/pagination filters
- `PATCH /actions/:id` for complete, dismiss, snooze
- LangGraph ReAct agent skeleton in `src/agent/` with typed tool interfaces and TODO MCP adapters
- `interactionWriter` with `source_id` dedup
- `contactMatcher` (email exact/case-insensitive)
- `actionDetector` logic:
  - Follow-up: inbound interaction with no outbound follow-up
  - Reconnect: warm/vip stale >14 days
  - Open-thread: unresolved `open_threads`
  - Auto-complete when outbound interaction appears
- Types in `src/types/mcp.ts` and `src/types/actions.ts`
- Migration for `contacts.last_synced_at`, `actions`, `drafts_log`

#### Brian Wires

- MCP tool implementations
- MCP authentication
- Agent prompt tuning
- End-to-end testing on real data

#### Interaction Mapping

| Source | `channel` | `direction` | `source_id` | `summary` |
|--------|-----------|-------------|-------------|-----------|
| Superhuman | `email` | outbound if from Brian; inbound otherwise | `thread_id` | Subject + snippet (~200 chars) |
| Granola | `meeting` | `mutual` | meeting UUID | First 500 chars of AI summary |
| Calendar | `meeting` | `mutual` | event ID | Event title |

**DEDUP RULE:** Calendar events are only written if no Granola interaction exists for same contact on same date.

#### Acceptance Criteria

| Criteria | Metric |
|----------|--------|
| Actions Page renders with clickable cards and working filters | Visual verification |
| `Sync Recent` returns summary within 15 seconds | Verified with real MCP connections |
| Dedup works on repeated sync | Row count unchanged on second sync |
| Follow-up detection works on meeting ingestion | At least 3 real follow-up actions |
| Dismiss/snooze updates state correctly | DB verification for status changes |
| LangSmith traces full run | Tool calls visible with inputs/outputs |

**CONSTRAINT:** No context cards or draft composer in Phase 2. Action click opens basic detail only.

### 5.3 Phase 3: Context Engine + Draft Workspace

| Field | Value |
|-------|-------|
| Target | 10-14 days |
| Builder: UI + Plumbing | Factory AI |
| Builder: MCP Wiring + Prompt Tuning | Brian via Cursor / Claude Code |

**Objective:** Build full Draft Workspace and context card loop so Brian can draft and act from one screen.

#### Factory Builds: UI

- Full-screen Draft Workspace replacing Actions Page
- 3-column layout: AI Chat (~30%), Email Draft (~35%), Context Panel (~35%)
- Top bar with back arrow and contact metadata
- AI chat with preset buttons and iterative revisions
- Editable draft (`To`, `Subject`, `Body`) with send-to-Superhuman flow
- Context panel with trigger interaction, full brief, sources, regenerate

#### Factory Builds: Backend

- `GET /contacts/:id/brief` cached (<24h) or generate
- `POST /contacts/:id/brief/regenerate` force refresh
- `POST /compose` to create draft via Superhuman MCP `draft_email`
- `POST /compose/revise` to revise in place using `draft_id`/`draft_thread_id`
- `briefGenerator` service for context card generation
- `composeService` to enrich instructions with interaction + trigger context

#### Brian Wires

- Prompt tuning for brief quality
- Compose wiring to Superhuman MCP
- Revision-flow validation
- Granola trigger wiring in context panel
- Preset instruction tuning (warm/cold/intro)

#### Acceptance Criteria

| Criteria | Metric |
|----------|--------|
| Action card opens full Draft Workspace | Visual verification |
| AI Chat draft appears in center column | End-to-end mock flow works |
| Right panel shows Granola trigger context | Verified on 3 real contacts |
| Brief generation under 5 seconds p95 | Across 20 contacts |
| All 5 brief sections always present | 100% completeness checks |
| Send creates Superhuman draft and completes action | Draft visible + action complete |
| Revisions update same draft in place | `draft_id` persists through 3 cycles |
| Presets produce distinct styles | Warm/cold/intro outputs are visibly distinct |

**CONSTRAINT:** Claude model pinned to `claude-sonnet-4-20250514`. Log model version; model change invalidates cache.

### 5.4 Phase 4: Weekly Brief + ROI Dashboard

| Field | Value |
|-------|-------|
| Target | 5-7 days |
| Builder: UI + Plumbing | Factory AI |
| Builder: Prompt Tuning | Brian via Cursor / Claude Code |

**Objective:** Add weekly brief delivery and ROI dashboards.

#### Factory Builds

- Weekly brief view from Actions Page top bar
- On-demand brief generation with category sections
- Optional self-email delivery via Superhuman MCP
- ROI dashboard with:
  - contacts by tier
  - interactions (30/60/90) by channel
  - action completion rate
  - interview/referral conversion tags
- CSV export
- APIs:
  - `POST /briefs/weekly`
  - `GET /dashboard/roi`
  - `GET /dashboard/roi/export`

#### Acceptance Criteria

| Criteria | Metric |
|----------|--------|
| Weekly brief includes 3+ contacts per category | Verified across 4 weeks |
| ROI dashboard matches raw DB queries | Zero discrepancies |
| CSV export matches dashboard metrics | Verified across 5 exports |

---

## 6. Post-Phase 4: Style Feedback Loop

When Brian edits drafts before send, `drafts_log` stores `generated_body` and `final_body`. A nightly Claude job diffs edits, extracts style preferences, and writes `user_style_preferences` for future compose prompts.

Not in Phase 4 scope. `drafts_log` exists in earlier phases to enable this.

---

## 7. Error Handling

### 7.1 Sync Failures

- All agent runs traced in LangSmith
- Partial success allowed (e.g., Granola failure does not block email/calendar writes)
- Sync timeout: 30 seconds with partial results

### 7.2 MCP Failures

- 10-second timeout per MCP call
- On MCP error: skip source and continue
- Auth failures surfaced with re-auth guidance

### 7.3 Claude API Failures

- 30-second timeout
- 5xx: retry path, no failure caching
- 429: exponential backoff, max 3 retries
- Brief failure fallback: raw interactions + "Brief unavailable, retry."

### 7.4 Compose Failures

- Superhuman `draft_email` failure shown in AI Chat
- Preserve user instructions on error
- Fallback copy-to-clipboard for raw AI text
- Auto-save draft on navigate-away via `draft_id`

---

## 8. Testing

| Phase | Requirements |
|-------|--------------|
| Phase 1 | COMPLETE |
| Phase 2 | UI Actions Page behavior; dedup tests (50); matcher tests; action-detector scenarios; mocked agent tools |
| Phase 3 | 3-column Draft Workspace UI; AI Chat mock loop; editable/send flow; brief completeness; cache behavior; compose and revise behavior; presets |
| Phase 4 | Weekly brief generation; ROI accuracy; CSV export verification |

---

## 9. Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL (existing) |
| `ANTHROPIC_API_KEY` | Claude API |
| `LANGSMITH_API_KEY` | Agent tracing |
| `LANGSMITH_PROJECT` | LangSmith project name |
| `SUPERHUMAN_MCP_URL` | Superhuman Mail MCP endpoint |
| `GRANOLA_MCP_URL` | Granola MCP endpoint |
| `GCAL_MCP_URL` | Google Calendar MCP endpoint |
| `BRIAN_EMAIL` | `bjoseph2@nd.edu` |

---

## 10. Instructions for Factory AI

> **READ THIS FIRST.** Follow these instructions exactly.

### 10.1 Build Order: UI First

1. Build React components first with documented mock shapes.
2. Verify all interactions against mock data.
3. Build Express routes matching mock shapes.
4. Build backend services producing those shapes.
5. Replace mock imports with real API calls.

This order is non-negotiable.

### 10.2 Two-State UI Architecture

- Exactly two states:
  - `/actions` (Actions Page)
  - `/actions/:id/draft` (Draft Workspace)
- Do not build persistent multi-panel layout
- Back returns to Actions Page
- Send returns to Actions Page and marks action complete

### 10.3 General Rules

- Build in phase order (start with Phase 2; Phase 1 complete)
- Do **not** implement live MCP calls in Factory output; use TODO placeholders with full TypeScript interfaces
- Scope every query by `user_id`
- TypeScript strict mode with shared types
- Use migrations for schema changes
- LangChain.js stack: `@langchain/core`, `@langchain/anthropic`, `@langchain/langgraph`, `langsmith`, `createReactAgent`
- Agent tools via `DynamicStructuredTool` + Zod schemas
- Use env vars for all secrets/config
- Follow REST status code conventions
- Use existing OutboundOS component library
- End each phase with build summary, test results, and deviations

---

*OutboundOS RelationshipOS PRD v2.2 | Brian Joseph | Confidential*
