# OUTBOUNDOS — RelationshipOS Module

## Product Requirements Document v1.2

| Field | Value |
|-------|-------|
| Author | Brian Joseph |
| Status | Draft - Ready for Factory AI |
| Stack | TypeScript / Node / Express / PostgreSQL / React / n8n / Drizzle ORM |
| Created | March 21, 2026 |
| Revised | March 23, 2026 |
| Revision Notes | v1.2 cross-referenced against actual OutboundOS codebase. Schema conventions, tech stack, and phase scopes updated. |
| Phases | 4 (Foundation + Auth, Ingestion, Context Engine, Action Engine) |

---

## 0. Codebase Context

This section exists so that Factory AI understands the existing OutboundOS system before writing any code. Read this section first. Do not deviate from these conventions.

### 0.1 Directory Structure

```
OutboundOS/
├── client/src/               # React 18 frontend
│   ├── components/           # Reusable UI components
│   │   └── ui/              # shadcn/ui components (50+ already installed)
│   ├── pages/                # Route pages (contacts, dashboard, etc.)
│   ├── hooks/                # Custom React hooks (useContacts, etc.)
│   └── lib/                  # Utilities (queryClient, contactsStorage)
├── server/                   # Express backend
│   ├── index.ts              # Server entry point (Express + Vite setup)
│   ├── routes.ts             # Main API routes (~2,000 lines)
│   ├── routes/batch.ts       # Batch processing routes (modular)
│   ├── db.ts                 # Drizzle ORM + pg Pool setup
│   ├── storage.ts            # IStorage interface + DatabaseStorage class
│   ├── openai.ts             # OpenAI API integration (keep for existing features)
│   ├── websocket.ts          # WebSocket server on /ws path
│   └── services/
│       ├── n8nClient.ts      # n8n webhook client (typed interfaces)
│       ├── batchProcessor.ts # Batch job processing with EventEmitter
│       └── airtableSync.ts   # Airtable integration
├── shared/
│   └── schema.ts             # ALL Drizzle ORM table definitions + Zod schemas
├── migrations/               # Drizzle-kit generated SQL migrations
│   ├── 0000_wise_kate_bishop.sql
│   └── 0001_research_packets.sql
├── n8n-workflow/             # Exported n8n workflow JSON files
├── drizzle.config.ts         # Drizzle-kit config (schema → migrations)
├── vite.config.ts            # Vite config (client build, path aliases)
├── tailwind.config.ts        # TailwindCSS v4 config
└── package.json              # All dependencies (single package.json)
```

### 0.2 Existing Database Tables (DO NOT DROP OR RENAME)

These 7 tables already exist in production. RelationshipOS extends the database; it does not replace it.

| Table | Purpose | Notes |
|-------|---------|-------|
| `contacts` | Core contact records | 18 columns. Will be ALTERed to add RelationshipOS columns. |
| `users` | Authentication | Has username/password. Will be ALTERed to add Google OAuth fields. |
| `outreach_attempts` | Outbound message tracking | 18 columns with conversion tracking. NOT the same as RelationshipOS interactions. |
| `experiments` | A/B testing for outreach | Variants, hypothesis tracking. |
| `settings` | App-wide configuration | Tone, CTA options, signatures. |
| `airtable_config` | Airtable connection settings | Base ID, PAT, field mapping. |
| `research_packets` | AI prospect research results | FK cascade to contacts. |

### 0.3 Column Conventions (MANDATORY)

Every new table and column must follow these patterns exactly. Drizzle-kit generates migrations from the schema file, so consistency here prevents migration conflicts.

| Convention | Pattern | Example |
|-----------|---------|---------|
| Primary key | `varchar("id").primaryKey().default(sql\`gen_random_uuid()\`)` | All tables |
| Foreign key | `varchar("col_name").references(() => table.id)` | contact_id, user_id |
| Timestamps | `timestamp("col_name")` | NOT `timestamptz`. No timezone. |
| Default now | `.notNull().defaultNow()` or `.default(sql\`now()\`)` | created_at |
| Boolean | `boolean("col_name").default(false)` | delivered |
| TS naming | camelCase | `contactId`, `briefText` |
| SQL naming | snake_case | `contact_id`, `brief_text` |
| Tags/lists | `text` (comma-delimited string) | NOT `TEXT[]` array |
| JSON data | `jsonb("col_name")` or `text` (JSON string) | Depends on query needs |
| ID generation | `gen_random_uuid()` at DB level | NOT application-level UUID |

### 0.4 API Conventions

All API routes live in `server/routes.ts` (monolithic) or modular files in `server/routes/`.

| Convention | Pattern |
|-----------|---------|
| Create | `POST /api/{resource}` returns 201 |
| Read one | `GET /api/{resource}/:id` returns 200 |
| Read list | `GET /api/{resource}` returns 200 |
| Update | `PATCH /api/{resource}/:id` returns 200 |
| Delete | `DELETE /api/{resource}/:id` returns 200 |
| Conflict | Return 409 with `{ error: "message" }` |
| Not found | Return 404 with `{ error: "message" }` |
| Validation | Zod via `createInsertSchema()` from `drizzle-zod` |
| Response format | Direct JSON (no envelope/wrapper) |
| Error format | `{ error: "message" }` or `{ message: "..." }` |
| File upload | Multer with memory storage |
| Webhooks | `POST /api/webhooks/{source}` pattern |

### 0.5 Frontend Conventions

| Convention | Library/Pattern |
|-----------|----------------|
| Routing | `wouter` (NOT react-router). Lightweight, path-based. |
| Data fetching | TanStack Query v5 (`useQuery`, `useMutation`) |
| API calls | `apiRequest()` helper from `client/src/lib/queryClient.ts` |
| UI components | shadcn/ui (Radix primitives). 50+ components already installed. DO NOT add a new component library. |
| Icons | Lucide React |
| Styling | TailwindCSS v4 with custom theme (dark mode: class-based) |
| Forms | react-hook-form + @hookform/resolvers (Zod bridge) |
| State | TanStack Query for server state. localStorage for client-only state. |
| Page layout | Pages in `client/src/pages/`. Sidebar + header shell in `App.tsx`. |
| Navigation | Sidebar items defined in `client/src/components/app-sidebar.tsx` |

### 0.6 Storage Layer Pattern

All database operations go through the storage layer, not raw Drizzle queries in routes.

1. Define table in `shared/schema.ts`
2. Export insert schema: `createInsertSchema(tableName).omit({ id: true })`
3. Export types: `InsertX = z.infer<typeof insertXSchema>`, `X = typeof tableName.$inferSelect`
4. Add methods to `IStorage` interface in `server/storage.ts`
5. Implement methods in `DatabaseStorage` class using Drizzle query builders
6. Import and use `storage` singleton in route handlers

### 0.7 Migration Workflow

```bash
# After modifying shared/schema.ts:
npm run db:push    # Push schema changes directly (dev)
npm run db:migrate # Run generated migrations (production)
```

Drizzle-kit reads `shared/schema.ts` via `drizzle.config.ts` and outputs SQL to `./migrations/`. Migration files are sequentially numbered: `0000_`, `0001_`, `0002_`, etc.

### 0.8 Existing Auth Infrastructure

Packages installed but NOT wired up:
- `passport@^0.7.0`, `passport-local@^1.0.0`
- `express-session@^1.18.1`, `connect-pg-simple@^10.0.0`
- Corresponding `@types/*` packages

The `users` table exists with `id`, `username`, `password` columns. No routes use authentication. No session middleware is initialized. Google Cloud OAuth credentials (Client ID, Client Secret) are configured externally and available as environment variables in the Replit deployment.

### 0.9 Existing AI Integration

`server/openai.ts` exports functions for LinkedIn PDF parsing (`parseLinkedInTextToJson`) and draft generation (`generateDraft`). Uses GPT-4 Turbo and GPT-4o-mini. This file and its functionality must be preserved. RelationshipOS AI features (context cards, briefs, play engines) will use a NEW Anthropic SDK integration in a separate file (`server/anthropic.ts`).

### 0.10 localStorage Contact Storage (Migration Required)

The current contacts page uses `client/src/lib/contactsStorage.ts` to read/write contacts to localStorage as the primary data source. The `useContacts` hook in `client/src/hooks/useContacts.ts` reads from localStorage and syncs to the server best-effort. RelationshipOS requires the database as the source of truth. Phase 1 must migrate `useContacts` to API-first reads with localStorage as a write-through cache.

---

## 1. Vision and Scope

### 1.1 Problem Statement

Professional relationship management today is broken for individual operators. Contacts live across Gmail, LinkedIn, Granola meeting notes, Google Calendar, and memory. There is no single source of truth. Follow-ups fall through the cracks. It is impossible to evaluate ROI on networking effort, and long-term relationship health degrades to a series of one-off calls with no continuity.

This is the exact problem LangChain solved internally for a 33-person sales team. OutboundOS RelationshipOS solves it for a single operator, Brian Joseph, pursuing SDR and GTM roles at Series B/C AI startups in San Francisco.

### 1.2 Vision

A personal CRM with a real intelligence layer. The system knows your relationships better than you do. It aggregates every touchpoint automatically, surfaces context instantly, and tells you who to contact and why, rather than just storing data and waiting for you to remember to use it.

### 1.3 Scope

**In Scope:**

- Contact unification across Gmail, Granola, and Google Calendar
- Interaction history tracking per contact (email, call, meeting, LinkedIn)
- AI-generated context cards per contact
- Weekly prioritization brief
- Play-specific outreach engines (warm, cold, intro request)
- ROI tracking on networking activity
- React frontend integrated into existing OutboundOS UI
- Google OAuth authentication with session management

**Out of Scope:**

- LinkedIn API integration (no official API access, use manual entry)
- Mobile app
- Multi-user UI (user management, onboarding flow, billing) — architecture supports multiple users from day one but admin UI is out of scope
- CRM sync (Salesforce, HubSpot) in Phase 1-2
- Email sending directly from RelationshipOS (handled by OutboundOS core)

**BOUNDARY:** RelationshipOS is a read-and-intelligence layer on top of existing communication tools. It does not replace Gmail, Granola, or Calendar. It aggregates and reasons on top of them.

### 1.4 Non-Negotiables

- No data is sent, drafted, or acted on without explicit user approval
- Every AI-generated output must show its sources and reasoning
- Contact deduplication must be deterministic, not probabilistic, to avoid silent data corruption
- All ingestion pipelines must be idempotent: running twice produces the same result
- TypeScript throughout: strict mode, no `any` types in core data models

---

## 2. Architecture Overview

### 2.1 Three-Layer Model

| Layer | Name | Description |
|-------|------|-------------|
| 1 | Rolodex (Data Unification) | One contacts table. Every interaction from every channel attaches to one canonical person record. |
| 2 | Context Engine (Intelligence) | Pull up any contact and get an instant AI-generated brief: history, open threads, relationship health, recent company signals. |
| 3 | Action Engine (Prioritization) | Weekly brief. Who fell through the cracks. Who to contact now based on current targets, location, and relationship tier. |

### 2.2 Tech Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Backend | TypeScript / Node.js / Express | Existing OutboundOS server |
| Database | PostgreSQL (existing instance) | Extended with new tables via Drizzle ORM |
| ORM / Migrations | Drizzle ORM + Drizzle-kit | Schema in `shared/schema.ts`, migrations in `./migrations/` |
| Frontend | React 18 + wouter + TanStack Query | Existing OutboundOS frontend |
| UI Components | shadcn/ui (Radix) + TailwindCSS v4 | Already installed. DO NOT add new libraries. |
| Automation | n8n | Ingestion workflows, scheduled briefs |
| AI (new features) | Anthropic SDK (`@anthropic-ai/sdk`) — claude-sonnet-4-20250514 | New `server/anthropic.ts` for context cards, briefs, plays |
| AI (existing) | OpenAI SDK — GPT-4 Turbo / GPT-4o-mini | Keep `server/openai.ts` for prospect research, LinkedIn parsing |
| Auth | Passport.js + passport-google-oauth20 + express-session + connect-pg-simple | Google OAuth. Credentials configured externally. |
| Data Sources | Gmail MCP, Granola MCP, Google Calendar MCP | Already connected to n8n instance |
| Real-time | WebSocket (`ws`) on `/ws` path | Existing infrastructure, available for ingestion progress |
| Hosting | Replit (existing deployment) | GitHub is source of truth |

### 2.3 Data Flow

Nightly n8n workflows pull new interactions from Gmail, Granola, and Google Calendar. Each interaction is matched against the contacts table by email address or name. Matched interactions are written to the interactions table attached to the canonical contact ID. New unmatched contacts are flagged for review in the `interaction_staging` table rather than auto-created, preventing ghost records. On Sunday night a separate workflow runs the weekly brief and delivers it to a configured Slack channel or email.

---

## 3. Database Schema

> **NOTE:** All tables use PostgreSQL. Timestamps are stored without timezone (`timestamp`, not `timestamptz`) to match existing conventions. IDs use `varchar` with `gen_random_uuid()` default (not UUID type). The schema extends the existing OutboundOS database — do not create a new database instance. All new tables are defined in `shared/schema.ts` using Drizzle ORM.

### 3.1 users (ALTER EXISTING TABLE)

The existing `users` table has `id`, `username`, `password`. Add columns for Google OAuth identity. Do NOT remove existing columns — Passport.js local strategy depends on them.

This table supports multi-user architecture from day one. Brian Joseph is the initial and only user. Do not build single-user shortcuts. Every contact, interaction, and brief is owned by a `user_id`.

**Existing columns (DO NOT REMOVE):**

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | Referenced as user_id in all other tables |
| username | text | NOT NULL, UNIQUE | Passport.js local strategy |
| password | text | NOT NULL | Passport.js local strategy |

**New columns to ADD:**

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| email | text | UNIQUE, nullable | Google OAuth email. Login identifier for OAuth users. |
| full_name | text | nullable | Display name from Google profile |
| google_id | text | UNIQUE, nullable | Google OAuth subject ID. Primary OAuth lookup key. |
| avatar_url | text | nullable | Google profile picture URL |
| created_at | timestamp | NOT NULL, DEFAULT now() | |

**Seed migration:** Insert Brian's user record with Google OAuth identity. All dev/test data must reference this seed `user_id`.

### 3.2 contacts (ALTER EXISTING TABLE)

The existing contacts table has 18 columns used by prospect research, LinkedIn import, Airtable sync, and the outreach pipeline. ALL existing columns must be preserved. New RelationshipOS columns are additive.

**Existing columns (DO NOT REMOVE OR RENAME):**

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | Canonical identifier |
| name | text | NOT NULL | Display name. Stays as `name`, NOT `full_name`. |
| company | text | nullable | |
| role | text | nullable | |
| linkedin_url | text | nullable | |
| email | text | nullable | NO UNIQUE constraint (existing data may have duplicates) |
| headline | text | nullable | From LinkedIn PDF import |
| about | text | nullable | From LinkedIn PDF import |
| location | text | nullable | |
| experience | text | nullable | From LinkedIn PDF import |
| education | text | nullable | From LinkedIn PDF import |
| skills | text | nullable | From LinkedIn PDF import |
| keywords | text | nullable | Used by research pipeline |
| notes | text | nullable | Free-form |
| tags | text | nullable | Comma-delimited string. NOT TEXT[] array. |
| research_status | text | nullable | Used by batch processor |
| research_data | text | nullable | Used by batch processor |
| created_at | timestamp | NOT NULL, DEFAULT now() | |

**New columns to ADD:**

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| user_id | varchar | NOT NULL, FK users(id) | Owner of this contact. All queries must be scoped by user_id. Index required. |
| source | text | nullable | Where first encountered: `gmail`, `granola`, `calendar`, `manual`, `linkedin_import`, `airtable`, `csv_import` |
| tier | text | NOT NULL, DEFAULT 'cool' | Relationship tier: `warm`, `cool`, `cold`, `vip` |
| last_interaction_at | timestamp | nullable | Denormalized for fast sorting. Updated by trigger or application logic. |
| last_interaction_channel | text | nullable | `email`, `call`, `meeting`, `linkedin`, `text` |
| updated_at | timestamp | DEFAULT now() | Updated on any row change |

**Migration note:** Existing contacts must be backfilled with the seed user's `user_id` so the NOT NULL constraint can be applied. Run: `UPDATE contacts SET user_id = '<seed_user_id>' WHERE user_id IS NULL;` before adding the NOT NULL constraint.

### 3.3 interactions (NEW TABLE)

This table is distinct from `outreach_attempts`. `outreach_attempts` tracks outbound sales messages with conversion metrics. `interactions` tracks all relationship touchpoints from any direction and any channel.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| user_id | varchar | NOT NULL, FK users(id) | Must match contact.user_id. All queries scoped by user_id. |
| contact_id | varchar | NOT NULL, FK contacts(id) ON DELETE CASCADE | References canonical contact |
| channel | text | NOT NULL | `email`, `call`, `meeting`, `linkedin`, `text` |
| direction | text | NOT NULL | `outbound`, `inbound`, `mutual` |
| occurred_at | timestamp | NOT NULL | Actual time of interaction, not ingestion time |
| source_id | text | nullable | Gmail thread ID, Granola doc ID, Calendar event ID. Prevents duplicates. |
| summary | text | nullable | Claude-generated 1-3 sentence summary |
| raw_content | text | nullable | Original content. Truncated to 10k chars if over limit. |
| open_threads | text | nullable | Comma-delimited extracted commitments or open questions |
| ingested_at | timestamp | NOT NULL, DEFAULT now() | When this record was created |

**Indexes:**
- Composite unique index on `(channel, source_id)` WHERE `source_id IS NOT NULL` — enforces idempotency per channel
- Index on `(user_id, contact_id)` — fast lookup for contact detail view
- Index on `(user_id, occurred_at)` — fast chronological queries

### 3.4 interaction_staging (NEW TABLE — Phase 2)

Staging table for unmatched interactions from ingestion pipelines. No interaction is written to the main `interactions` table without a valid `contact_id`. This table holds records that could not be matched.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| user_id | varchar | NOT NULL, FK users(id) | |
| channel | text | NOT NULL | `email`, `calendar`, `meeting` |
| raw_payload | text | nullable | JSON-stringified original data from MCP |
| sender_email | text | nullable | For matching attempts |
| sender_name | text | nullable | For matching attempts |
| occurred_at | timestamp | nullable | |
| source_id | text | nullable | Same as interactions.source_id — for dedup |
| matched_contact_id | varchar | nullable | Set when user matches to a contact |
| status | text | NOT NULL, DEFAULT 'pending' | `pending`, `matched`, `dismissed` |
| dismissed | boolean | NOT NULL, DEFAULT false | Soft delete. Dismissed records are hidden, not deleted. |
| created_at | timestamp | NOT NULL, DEFAULT now() | |

### 3.5 contact_briefs (NEW TABLE — Phase 3)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| user_id | varchar | NOT NULL, FK users(id) | Scopes brief to its owner. Enables per-user cache invalidation. |
| contact_id | varchar | NOT NULL, FK contacts(id) ON DELETE CASCADE | |
| brief_text | text | NOT NULL | Full Claude-generated context card in markdown |
| sources_used | text | NOT NULL | Comma-delimited list of interaction source_ids used to generate this brief |
| generated_at | timestamp | NOT NULL, DEFAULT now() | |
| model_version | text | NOT NULL | Claude model string used. For regression tracking. |

### 3.6 weekly_briefs (NEW TABLE — Phase 4)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| user_id | varchar | NOT NULL, FK users(id) | One brief per user per week. |
| week_start | timestamp | NOT NULL | Monday of the week this brief covers |
| brief_text | text | NOT NULL | Full brief in markdown |
| contacts_flagged | text | NOT NULL | Comma-delimited contact IDs surfaced in this brief |
| generated_at | timestamp | NOT NULL, DEFAULT now() | |
| delivered | boolean | NOT NULL, DEFAULT false | |

**Constraint:** UNIQUE on `(user_id, week_start)` — one brief per user per week.

### 3.7 workflow_runs (NEW TABLE — Phase 2)

Tracks n8n ingestion workflow execution status for observability.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| workflow_name | text | NOT NULL | e.g. `gmail_ingestion`, `granola_ingestion`, `calendar_ingestion` |
| started_at | timestamp | NOT NULL, DEFAULT now() | |
| completed_at | timestamp | nullable | |
| status | text | NOT NULL | `running`, `success`, `partial`, `failed` |
| error_message | text | nullable | |
| records_processed | integer | DEFAULT 0 | |
| records_failed | integer | DEFAULT 0 | |

---

## 4. Build Phases

### PHASE 1 — Foundation: Rolodex + Auth

**Target:** 7-10 days

**Objective:** Establish Google OAuth authentication, extend the contacts table with RelationshipOS columns, create the interactions table, and build the interaction timeline UI. This is the data and auth foundation every other phase builds on.

#### 1A. Authentication (Google OAuth)

**Functional Requirements:**

- Install `passport-google-oauth20` package
- Create `server/auth.ts`:
  - Configure Google OAuth 2.0 strategy using `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables
  - Serialize/deserialize user by `id` from the `users` table
  - On first OAuth login, create a new user record (upsert by `google_id`)
  - On subsequent logins, update `email`, `full_name`, `avatar_url` from Google profile
- Wire up in `server/index.ts`:
  - Initialize `express-session` with `connect-pg-simple` session store
  - Initialize `passport.initialize()` and `passport.session()` middleware
  - `SESSION_SECRET` from environment variable (required)
- Create auth routes:
  - `GET /auth/google` — redirects to Google consent screen
  - `GET /auth/google/callback` — handles OAuth callback, creates session, redirects to frontend
  - `GET /auth/me` — returns current user profile or 401
  - `POST /auth/logout` — destroys session
- Create `server/middleware/auth.ts`:
  - `requireAuth` middleware: checks `req.isAuthenticated()`, returns 401 if not
  - Apply to all `/api/relationships/*` routes and all new RelationshipOS endpoints
  - Existing OutboundOS routes (`/api/contacts`, `/api/outreach-attempts`, etc.) remain unprotected for backward compatibility unless explicitly specified otherwise
- Seed migration: create Brian's user record with known Google ID

#### 1B. Schema Changes

**Functional Requirements:**

- ALTER `users` table per Section 3.1
- ALTER `contacts` table per Section 3.2
- CREATE `interactions` table per Section 3.3
- All changes defined in `shared/schema.ts` using Drizzle ORM
- Generate migration via Drizzle-kit: `migrations/0002_relationship_os_foundation.sql`
- Backfill existing contacts with seed user's `user_id`

#### 1C. Storage Layer

**Functional Requirements:**

- Add to `IStorage` interface in `server/storage.ts`:
  - `getInteractions(userId: string, contactId?: string): Promise<Interaction[]>`
  - `getInteraction(id: string): Promise<Interaction | undefined>`
  - `createInteraction(interaction: InsertInteraction): Promise<Interaction>`
  - `updateInteraction(id: string, interaction: Partial<InsertInteraction>): Promise<Interaction | undefined>`
  - `deleteInteraction(id: string): Promise<boolean>`
  - `getInteractionBySourceId(channel: string, sourceId: string): Promise<Interaction | undefined>`
- Implement all methods in `DatabaseStorage` class
- All interaction queries must include `WHERE user_id = ?` filter

#### 1D. API Routes

**Functional Requirements:**

- **ALREADY BUILT** (mark, do not rebuild):
  - `GET /api/contacts` — list contacts *(exists in `server/routes.ts`)*
  - `GET /api/contacts/:id` — get contact *(exists)*
  - `POST /api/contacts` — create contact *(exists)*
  - `PATCH /api/contacts/:id` — update contact *(exists)*
  - `DELETE /api/contacts/:id` — delete contact *(exists)*
  - `POST /api/contacts/bulk-delete` — bulk delete *(exists)*
  - `POST /api/contacts/bulk-import` — bulk import *(exists)*

- **NEW endpoints** (add to `server/routes.ts` or a new modular file `server/routes/relationships.ts`):
  - `GET /api/interactions?contactId=X` — list interactions for a contact, scoped by authenticated user
  - `GET /api/interactions/:id` — get single interaction
  - `POST /api/interactions` — create interaction (manual entry)
  - `PATCH /api/interactions/:id` — update interaction
  - `DELETE /api/interactions/:id` — delete interaction

- **MODIFY existing endpoints** to support RelationshipOS:
  - `POST /api/contacts` — add deduplication check: before creating, query by `email` AND `linkedin_url` scoped to the authenticated user's `user_id`. Return 409 with existing record if match found.
  - `GET /api/contacts` — support sorting by `last_interaction_at`
  - `PATCH /api/contacts/:id` — support updating new RelationshipOS fields (tier, source, etc.)

#### 1E. Frontend

**Functional Requirements:**

- **ALREADY BUILT** (mark, do not rebuild):
  - Contacts list page with search/filter *(at `client/src/pages/contacts.tsx`)*
  - Contact detail view *(sidebar panel in contacts page)*
  - Contact creation form *(dialog in contacts page)*
  - Sidebar navigation *(at `client/src/components/app-sidebar.tsx`)*

- **MODIFY existing:**
  - Migrate `useContacts` hook (`client/src/hooks/useContacts.ts`) to API-first reads. TanStack Query fetches from `GET /api/contacts`. localStorage becomes a write-through cache for offline resilience.
  - Add auth check: if `GET /auth/me` returns 401, redirect to `/auth/google`

- **NEW components/pages:**
  - Interaction timeline component (`client/src/components/interaction-timeline.tsx`): chronological list of interactions for a contact, displayed in the contact detail view
  - Contact detail enrichment: show tier badge, source tag, last_interaction_at, and interaction timeline in the existing contact detail panel
  - Add "Relationships" section to sidebar navigation

#### 1F. Database Triggers / Application Logic

- `updated_at` on contacts: auto-update on any row change (either via DB trigger or application-level logic in the storage layer)
- `last_interaction_at` on contacts: update when a new interaction is inserted for that `contact_id` (application logic in `createInteraction` storage method)

#### Acceptance Criteria and Success Metrics

| Acceptance Criteria | Success Metric |
|-------------------|----------------|
| Google OAuth login redirects to Google, returns to app with valid session | User session persists across page reloads. `GET /auth/me` returns user profile. |
| All new API endpoints require authentication | Unauthenticated requests to `/api/interactions/*` return 401 |
| Creating a contact with a duplicate email (within same user) returns HTTP 409 | 0 duplicate contacts per user after running dedup test suite of 50 cases |
| All API endpoints return responses within 200ms for up to 1000 records | p95 response time under 200ms measured via local load test |
| Contact list renders with search filtering and last_interaction_at sort | Search returns results within 300ms of keystroke on 500-contact dataset |
| Manual contact creation form validates required fields client-side | Form submission blocked if name is empty. No invalid records reach the database. |
| Deleting a contact cascades to delete all linked interactions | Zero orphaned interaction records after delete confirmed via DB query |
| Interaction timeline shows all interactions for a contact in chronological order | Verified on 5 test contacts with 10+ interactions each |

**CONSTRAINT:** No AI calls in Phase 1. No ingestion pipelines. This phase is pure data model, auth, and CRUD. If it is tempting to add more, write it in a TODO comment and stay in scope.

---

### PHASE 2 — Ingestion Pipelines

**Target:** 7-10 days

**Objective:** Build three n8n workflows that pull interactions from Gmail, Granola, and Google Calendar nightly and write them to the interactions table, attached to the correct contact. This is where fragmentation dies.

#### Gmail Ingestion Workflow

- Trigger: n8n cron, runs nightly at 1:00 AM
- Pulls all Gmail threads with activity in the last 24 hours via Gmail MCP
- For each thread: extract sender/recipient email addresses, thread ID, subject, timestamp, and first 2000 characters of body
- Match email address against `contacts.email` scoped by `user_id`. If match found, POST to `/api/webhooks/gmail-interactions` which writes to `interactions` with `source_id` = Gmail thread ID
- If no match found, write to `interaction_staging` table for manual review. Do not auto-create contacts from Gmail.
- Idempotency: check `source_id` via composite unique index `(channel, source_id)` before inserting. Skip if already exists.
- Direction: `outbound` if sender matches Brian's email, `inbound` if recipient, `mutual` if both

#### Granola Ingestion Workflow

- Trigger: n8n cron, runs nightly at 1:30 AM
- Pulls new Granola meeting notes created in the last 24 hours via Granola MCP
- For each note: extract attendee names and emails, meeting title, date, and full note text
- Match each attendee against contacts table by email (primary) or name (secondary, only if email unavailable)
- Write interaction per attendee with `channel = 'meeting'`, `source_id` = Granola doc ID
- Generate a 2-3 sentence summary using Claude API of what was discussed (truncate raw content to 4000 chars for prompt)
- Extract `open_threads`: any commitments, follow-ups, or open questions mentioned in the notes

#### Google Calendar Ingestion Workflow

- Trigger: n8n cron, runs nightly at 2:00 AM
- Pulls calendar events from the last 24 hours that have at least one external attendee via Google Calendar MCP
- For each external attendee: match by email against contacts table
- Write interaction with `channel = 'meeting'`, `source_id` = Calendar event ID
- Only write if no Granola interaction already exists for the same date and contact (prevents double-counting meetings)

#### Webhook Endpoints

Add to `server/routes.ts` following the existing webhook pattern (see `POST /api/webhooks/outreach-logs` at lines 615-742 for reference):

- `POST /api/webhooks/gmail-interactions` — receives Gmail interaction data from n8n
- `POST /api/webhooks/granola-interactions` — receives Granola data from n8n
- `POST /api/webhooks/calendar-interactions` — receives Calendar data from n8n

Each webhook endpoint validates the payload, attempts contact matching, writes to `interactions` or `interaction_staging`, and logs to `workflow_runs`.

#### n8n Client Extensions

Add new methods to `server/services/n8nClient.ts` following the existing `handleRequest<T, D>()` pattern for triggering ingestion workflows and checking status.

#### Unmatched Interactions Review UI

- New React page or component showing `interaction_staging` records with `status = 'pending'`
- User can: (a) match to existing contact, (b) create new contact from the record, or (c) dismiss
- Dismissed records set `dismissed = true`, not hard deleted
- Add to sidebar navigation

#### Workflow Observability

- Create `workflow_runs` table per Section 3.7
- System health component in React UI showing recent workflow run status
- Brian should know within 24 hours if a pipeline broke

#### n8n Workflow Export

All three ingestion workflows must be exported as JSON to the `/n8n-workflow/` directory after testing.

#### Acceptance Criteria and Success Metrics

| Acceptance Criteria | Success Metric |
|-------------------|----------------|
| All three ingestion workflows run without error on a 24-hour pull | Zero failed n8n executions in first 7 consecutive days |
| Running any workflow twice for the same time window produces identical DB state | Idempotency verified: row count unchanged after second run |
| Gmail interactions matched at 70%+ rate for contacts already in rolodex | Match rate measured on first full run |
| Granola summaries generated for 100% of meetings ingested | Zero interactions from Granola with null summary |
| Unmatched interactions surface in review UI within 24 hours | All unmatched records visible by 9:00 AM next day |

**CONSTRAINT:** No interaction is written to the main `interactions` table without a valid `contact_id`. The staging table exists precisely to enforce this.

---

### PHASE 3 — Context Engine

**Target:** 5-7 days

**Objective:** When you open a contact, you get a Claude-generated context card in under 5 seconds: who they are, full interaction history summarized, open threads, relationship health score, and recent signals about their company.

#### Anthropic SDK Setup

- Create `server/anthropic.ts`:
  - Initialize Anthropic client with `ANTHROPIC_API_KEY` environment variable
  - Export `generateContactBrief(contact, interactions): Promise<string>` function
  - Export `generateWeeklyBrief(contacts, interactions): Promise<string>` function (for Phase 4)
  - Model pinned to `claude-sonnet-4-20250514` in all calls
  - 30-second timeout on all API calls
  - Exponential backoff with max 3 retries on 429/5xx

#### Context Card Structure

Each context card must include the following sections in order:

1. **Relationship Summary:** 2-3 sentences on who this person is, how you know them, and the current state of the relationship
2. **Interaction History:** Bulleted list of all interactions, most recent first, each with date, channel, and 1-sentence summary
3. **Open Threads:** Any commitments or follow-ups from past interactions not yet resolved
4. **Relationship Health:** Simple signal (`Active` / `Cooling` / `Cold` / `New`) with a one-line rationale
5. **Suggested Next Action:** One concrete, specific action with reasoning

#### Functional Requirements

- `GET /api/contacts/:id/brief` triggers Claude API call using all interactions for that contact
- Brief is cached in `contact_briefs` table. Cache is valid for 24 hours. Stale cache triggers regeneration.
- Brief generation prompt includes: all interaction summaries, `open_threads` fields, contact metadata (company, role, tier), and a system prompt defining the output format
- Sources used are logged to `contact_briefs.sources_used`
- React UI: Context card displayed on contact detail view, with `generated_at` timestamp visible
- React UI: "Regenerate" button to force refresh outside of cache window
- React UI: Sources panel showing which interactions were used to generate the brief
- Brief generation failure must not break the contact detail view. Render the contact data and show a "Brief unavailable — retry" message.

#### Acceptance Criteria and Success Metrics

| Acceptance Criteria | Success Metric |
|-------------------|----------------|
| Context card generates in under 5 seconds for up to 50 interactions | p95 generation time under 5 seconds across 20 test contacts |
| Context card includes all 5 required sections with non-empty content | 100% pass section completeness check |
| Cached brief served instantly when cache is valid | p95 cache hit response time under 100ms |
| Regenerate produces different content if new interactions exist | Verified across 5 test cases |
| Sources panel correctly lists interaction IDs used | Zero discrepancies across 10 audit cases |

**CONSTRAINT:** Claude model must be pinned to `claude-sonnet-4-20250514`. Model version is logged to `contact_briefs.model_version`. If model is swapped, all cached briefs are invalidated.

---

### PHASE 4 — Action Engine

**Target:** 7-10 days

**Objective:** The system stops being passive and starts telling you what to do. A weekly brief surfaces who needs attention, where your networking ROI is concentrated, and which contacts are newly relevant.

#### Weekly Brief

- n8n cron: runs Sunday at 8:00 PM, delivers Monday morning
- Pulls all contacts with `last_interaction_at` more than 14 days ago and `tier` = `warm` or `vip` (fallen through cracks)
- Pulls all contacts with `open_threads` not yet resolved across recent interactions
- Surfaces contacts at companies currently in Brian's target list (configurable tag: `tier_1_target`, `tier_2_target`, `sf_contact`)
- Calculates and displays a simple ROI signal per contact tier: how many warm contacts converted to interviews or referrals in the past 30 days
- Output format: markdown, delivered to Slack via n8n HTTP node or emailed to Brian's Gmail
- Stored in `weekly_briefs` table with `delivered` flag set on successful delivery

#### Play-Specific Outreach Engines

Three distinct engines, each exposed as an API endpoint and accessible via React UI:

1. **Warm Reactivation Play:** `POST /api/plays/warm` — Takes `contact_id`, generates a short reactivation message referencing the most recent meaningful interaction and a genuine reason to reconnect. No hollow compliments.

2. **Cold Outreach Play:** `POST /api/plays/cold` — Takes `contact_id`, generates a brief first-touch message that leads with a specific company signal or shared context, not Brian's resume.

3. **Intro Request Play:** `POST /api/plays/intro` — Takes `contact_id` and `target_contact_name`, generates a message to the contact requesting an introduction. References why the intro is relevant and makes it easy to forward.

Each play returns: the drafted message, the signals/sources used, and a confidence level (`High` / `Medium` / `Low`) based on how much context exists for that contact.

No play sends anything. All output is draft only. User copies or approves and sends manually or via OutboundOS core.

#### ROI Dashboard

- React component (extend existing dashboard page or new page) showing:
  - Total contacts by tier
  - Total interactions in last 30/60/90 days by channel
  - Warm contacts converted to interviews or referrals (manually logged)
  - Response rate by outreach type
- No AI in the ROI dashboard. Pure aggregation from the `interactions` and `outreach_attempts` tables.
- Export to CSV using existing export pattern (see `GET /api/export/contacts` in `server/routes.ts`)

#### Acceptance Criteria and Success Metrics

| Acceptance Criteria | Success Metric |
|-------------------|----------------|
| Weekly brief delivered every Monday before 9:00 AM with 3+ contacts per category | Verified across 4 consecutive weeks. Zero missed deliveries. |
| All three play engines generate output in under 8 seconds | p95 generation time under 8 seconds across 10 test runs per play |
| Warm reactivation play references a specific prior interaction | 100% of outputs contain date/content-specific reference. Validated across 20 outputs. |
| Intro request play generates a forwardable message | Validated by Brian across 10 real intros |
| ROI dashboard CSV export matches DB query counts | Zero discrepancies across 5 export tests |

**CONSTRAINT:** Play engines must never fabricate context. If insufficient history exists, return low confidence and an honest generic message, not an invented reference.

---

## 5. Style Feedback Loop (Post-Phase 4)

After Phase 4 is stable, implement the memory system inspired by LangChain's GTM agent. When Brian edits a play engine draft before sending, the system logs the original and edited versions. A nightly Claude job compares diffs across recent edits, extracts style preferences (tone, brevity, structure, phrasing patterns), and writes a `user_style_preferences` record to the DB. This record is injected into every future play engine system prompt.

This is NOT in Phase 4 scope. It is listed here to inform schema decisions: do not design the plays API in a way that makes edit-logging impossible to add later.

---

## 6. Error Handling and Reliability

### 6.1 Ingestion Failures

- All n8n workflows log execution status to the `workflow_runs` table: `workflow_name`, `started_at`, `completed_at`, `status` (`success` / `partial` / `failed`), `error_message`
- Partial success is valid: if 8 of 10 interactions ingest successfully, write 8 and log 2 errors. Do not rollback the full run.
- Failures surface in a system health component in the React UI. Brian should know within 24 hours if a pipeline broke.

### 6.2 Claude API Failures

- All Claude API calls must have a 30-second timeout
- On timeout or 5xx: return a user-visible error with a retry button. Do not cache a failed state.
- On 429 rate limit: implement exponential backoff with max 3 retries before surfacing error to user
- Brief generation failure must not break the contact detail view. Render the contact data and show a "Brief unavailable — retry" message in the brief panel.

---

## 7. Testing Requirements

Factory should generate tests alongside implementation, not after. These are minimum requirements per phase.

| Phase | Test Requirements |
|-------|------------------|
| Phase 1 | Unit tests for dedup logic (50 cases: exact match, case-insensitive, partial match, no match). Integration tests for all CRUD endpoints. Auth flow tests (OAuth redirect, callback, session persistence, 401 on unauthenticated requests). |
| Phase 2 | Idempotency tests for each ingestion workflow. Mock MCP responses for Gmail, Granola, Calendar. Staging table routing tests (matched vs unmatched). |
| Phase 3 | Brief section completeness assertion. Cache hit/miss behavior tests. Source logging accuracy tests. Anthropic API timeout/retry tests. |
| Phase 4 | Weekly brief delivery test (mock Sunday cron). Play output validation: no fabricated context. ROI export count accuracy. |

---

## 8. Instructions for Factory AI

> **READ THIS FIRST.** These instructions are specifically for Factory AI agents executing this PRD. Follow them exactly.

1. **Read Section 0 (Codebase Context) before writing any code.** Understand the existing conventions, file locations, and patterns.

2. **Build in phase order.** Do not begin Phase 2 implementation until Phase 1 acceptance criteria are verified.

3. **Multi-user architecture is non-negotiable from Phase 1.** Every DB query must be scoped by `user_id`. Every API endpoint must resolve the calling user from the session (`req.user.id`) and apply `user_id` as a filter. Never query contacts, interactions, or briefs without a `user_id` WHERE clause. A future user must never be able to see another user's data.

4. **Google OAuth must be wired up in Phase 1** using `passport-google-oauth20`. The Google Client ID and Secret are available as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables. Session storage uses `connect-pg-simple` backed by the existing PostgreSQL instance.

5. **The users table must be seeded** with Brian's record in the Phase 1 migration. All dev/test data must reference this seed `user_id`.

6. **TypeScript strict mode throughout.** No implicit `any`. Define types using Drizzle's `$inferSelect` and `z.infer<>` patterns from `drizzle-zod`, consistent with existing code in `shared/schema.ts`.

7. **Database migrations using Drizzle-kit exclusively.** Define tables in `shared/schema.ts`, run `npm run db:push` (dev) or `npm run db:migrate` (production). Never run raw ALTER TABLE in ad-hoc scripts. Never use Knex, node-pg-migrate, or any other migration tool.

8. **Environment variables** for all secrets and config: `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `N8N_WEBHOOK_URL`, `BRIAN_EMAIL`. No hardcoded values.

9. **n8n workflows** exported as JSON to `/n8n-workflow/` directory after each workflow is built and tested.

10. **API follows REST conventions** per Section 0.4. Use HTTP status codes correctly: 200 OK, 201 Created, 400 Bad Request, 404 Not Found, 409 Conflict, 500 Server Error.

11. **React components use the existing shadcn/ui component library** and TailwindCSS v4 styling. Do NOT install a new component library. Use existing components from `client/src/components/ui/`. Use `wouter` for routing, NOT `react-router`.

12. **Storage layer pattern is mandatory.** All database operations go through `server/storage.ts` (IStorage interface + DatabaseStorage class). Do not write raw Drizzle queries in route handlers.

13. **Preserve existing functionality.** Do not remove, rename, or break existing tables, columns, API endpoints, or React components. RelationshipOS is additive. The existing outreach pipeline (outreach_attempts, experiments, research_packets, batch processor) must continue working.

14. **Each phase ends with a summary** of what was built, what tests pass, and any deviations from this PRD with reasoning.

15. **If a requirement is ambiguous,** implement the more conservative interpretation and flag the ambiguity in a comment. Do not guess.

16. **Split each phase into verifiable sub-tasks** to prevent context loss across long runs.

17. **AI provider for new features:** Use Anthropic SDK (`@anthropic-ai/sdk`) with model `claude-sonnet-4-20250514` for all RelationshipOS AI features (context cards, weekly briefs, play engines). Create `server/anthropic.ts` following the same export pattern as `server/openai.ts`. Do NOT modify `server/openai.ts`.

18. **Work on the current working branch.** Never commit directly to `main`.

---

*OutboundOS RelationshipOS PRD v1.2 | Brian Joseph | Confidential*
