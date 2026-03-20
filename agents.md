# OutboundOS — Agent Context

This is the primary context document for all AI coding agents working in this repository. Read this before making any changes.

> **Claude Code users:** See `CLAUDE.md` for Claude-specific tooling on top of this document.

---

## Project Overview

**OutboundOS** is a full-stack outbound sales automation platform that replaces manual prospect research with AI-powered workflows. The core value prop: reduce prospect research from 20+ minutes to ~30 seconds, with a demonstrated 44.6% meeting booking rate.

**Core workflow:**
1. Import contacts (CSV, LinkedIn PDF, Google Sheets, or Airtable)
2. Trigger AI research via n8n (LinkedIn profile, company signals, hooks)
3. Review research packets and personalized message drafts
4. Log outreach attempts and track outcomes
5. Run A/B experiments on message variants

**Hosting:** Replit (runtime). **GitHub is the single source of truth** for all code.

---

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS v4, shadcn/ui, Radix UI |
| Routing | Wouter |
| State / Data fetching | TanStack Query (React Query) |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Passport.js (local strategy), session stored in PostgreSQL |
| Real-time | WebSockets (`ws` library) |
| AI | OpenAI API |
| Automation | n8n (self-hosted, external) |
| File uploads | Multer (50MB limit, PDF + CSV) |
| Icons | Lucide React |

### Monorepo Structure

```
OutboundOS/
├── client/          # React SPA (Vite root)
├── server/          # Express API
├── shared/          # Types, schemas (imported by both sides)
├── migrations/      # Drizzle SQL migrations (never edit existing)
├── n8n-workflow/    # n8n workflow JSON exports
├── script/          # Build scripts
├── CLAUDE.md        # Claude Code-specific instructions
├── agents.md        # This file — primary agent context
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Directory Map

### `client/src/`

```
client/src/
├── pages/
│   ├── dashboard.tsx          # Metrics, funnel, experiment performance
│   ├── contacts.tsx           # Contact list, bulk research, PDF import
│   ├── prospect-research.tsx  # Single prospect research UI
│   ├── research-queue.tsx     # Review researched prospects
│   ├── research-setup.tsx     # Onboarding wizard
│   ├── outreach-log.tsx       # Outreach history, outcome tracking
│   ├── decisions.tsx          # A/B experiment board
│   ├── settings.tsx           # App configuration
│   └── not-found.tsx
├── components/
│   ├── ui/                    # 45+ shadcn/ui components (do not modify)
│   ├── app-sidebar.tsx        # Navigation sidebar
│   ├── profile-setup.tsx      # Onboarding modal (stores to localStorage)
│   ├── import-modal.tsx       # PDF/CSV upload + preview
│   └── theme-toggle.tsx       # Light/dark mode
├── hooks/
│   ├── useContacts.ts         # TanStack Query hook for contacts CRUD
│   ├── useAirtableConfig.ts   # Airtable settings query
│   ├── useBatchProgress.ts    # WebSocket/polling for bulk research progress
│   └── use-toast.ts
├── lib/                       # Shared utilities
├── App.tsx                    # Router (Wouter) — all routes defined here
├── main.tsx
└── index.css                  # TailwindCSS v4 entry
```

### `server/`

```
server/
├── routes/
│   └── batch.ts               # Bulk research endpoint
├── services/
│   ├── n8nClient.ts           # n8n webhook HTTP client
│   ├── batchProcessor.ts      # Async batch operation tracking
│   └── airtableSync.ts        # Airtable bidirectional sync
├── utils/
│   └── contactTags.ts         # Tag helper utilities
├── index.ts                   # Express app entry point
├── db.ts                      # Drizzle ORM + PostgreSQL connection
├── routes.ts                  # Route registration (imports all routers)
├── storage.ts                 # IStorage interface + DatabaseStorage class
├── openai.ts                  # OpenAI API wrapper
├── websocket.ts               # WebSocket server setup
├── static.ts                  # Static file serving
└── vite.ts                    # Vite dev server integration
```

### `shared/`

```
shared/
└── schema.ts    # Drizzle table definitions + Zod insert schemas
                 # SOURCE OF TRUTH for all types — import from here
```

### `migrations/`

```
migrations/
├── 0000_wise_kate_bishop.sql   # Initial schema (all core tables)
├── 0001_research_packets.sql   # research_packets table + data migration
└── meta/
    └── _journal.json           # Drizzle migration tracking
```

**Never edit existing migration files.** Always create a new one.

### `n8n-workflow/`

```
n8n-workflow/
├── google-sheets-→-replit-contact-import.json      # Google Sheets → contacts
├── networking-user-profile-research.json            # User background profiling
├── networking-replit-+-n8n-research-workflow.json   # Main prospect research (152KB)
└── variants-drafter.json                            # A/B variant generation
```

---

## Key Files

Read these before modifying anything in their respective domains:

| File | Purpose |
|---|---|
| `shared/schema.ts` | All table definitions, insert schemas, enums — source of truth |
| `server/storage.ts` | `IStorage` interface + `DatabaseStorage` — all DB operations go through here |
| `server/routes.ts` | Route registration — see what endpoints exist |
| `server/routes/batch.ts` | Bulk research route |
| `server/services/n8nClient.ts` | n8n webhook client — research/draft/qa/sequence methods |
| `server/index.ts` | Express app setup, middleware, session config |
| `server/websocket.ts` | WebSocket setup and event handling |
| `client/src/App.tsx` | All client routes (Wouter) |
| `client/src/hooks/useContacts.ts` | Contact queries and mutations pattern |
| `drizzle.config.ts` | Migration config — schema source, output path |

---

## Data Model

All tables defined in `shared/schema.ts`. Drizzle ORM is used exclusively — no raw SQL.

### Tables

**`contacts`** — Core prospect records
- `id, name, company, role, linkedinUrl, email`
- `headline, about, location, experience, education, skills, keywords`
- `notes, tags` (text arrays)
- `researchStatus` — enum: `not_started | queued | researching | complete | failed`
- `researchData` — legacy JSON string (migrated to `researchPackets`)
- `createdAt`

**`research_packets`** — Normalized AI research output (FK → contacts, cascade delete)
- `contactId` (PK)
- `status` — `not_started | queued | researching | complete | failed`
- `prospectSnapshot` — text summary of the prospect
- `companySnapshot` — text summary of the company
- `signalsHooks` — JSON array of conversation hooks/angles
- `personalizedMessage` — primary drafted message
- `variants` — JSON array of A/B variant objects
- `createdAt, updatedAt`

**`outreach_attempts`** — Sent message history and outcomes
- `contactId, dateSent, outreachType, campaign`
- `messageBody, subject, messageVariantLabel`
- `experimentId` — links to experiments table
- `responded, positiveResponse, meetingBooked, converted` (booleans)
- `responseDate, daysToResponse, followUpSent, respondedAfterFollowup`
- `companyTier, relationshipType`

**`experiments`** — A/B test configurations
- `id, name, outreachType, hypothesis, variableTested`
- `variantAText, variantBText`
- `startDate, endDate, active`

**`settings`** — User preferences (single row)
- `defaultTone, defaultCtaOptions, emailSignature`
- `emailSubjectPatterns, includeProofLine, includeLogisticsLine`
- `connectionRequestCharLimit`

**`users`** — Authentication (single user system)
- `id, username, password`

**`airtable_config`** — Airtable sync settings
- `baseId, tableName, personalAccessToken`
- `fieldMapping` (JSON), `viewName`
- `lastSyncAt, isConnected`

### Key Enums (defined in `shared/schema.ts`)

```typescript
outreachTypes:    linkedin_connected | linkedin_connect_request | linkedin_inmail | email | whatsapp
outreachGoals:    intro_chat | partnership | recruiting | advice
toneOptions:      professional | friendly | direct
lengthOptions:    short | medium | long
variableOptions:  hook | cta | length | tone
researchStatuses: not_started | queued | researching | complete | failed
```

### Zod Schemas

Generated via `drizzle-zod`. Use `insertContactSchema`, `insertOutreachAttemptSchema`, etc. for runtime validation. Never define duplicate validation logic.

---

## Dev Commands

```bash
npm run dev        # Start dev server (Express + Vite HMR, port 5000)
npm run build      # Production build → dist/
npm run start      # Run production build
npm run check      # TypeScript type check (tsc)
npm run db:push    # Push schema changes directly (dev only, no migration file)
npm run db:migrate # Run pending migration files (use in production)
```

**Migration workflow:**
1. Modify `shared/schema.ts`
2. Run `drizzle-kit generate` to create a new SQL migration file
3. Review the generated SQL
4. Run `npm run db:migrate` to apply

**Never run `db:push` against production.**

---

## Code Conventions

### Boundary Rules (strict)
- Frontend logic lives in `client/` only
- Backend logic lives in `server/` only
- Shared types and schemas live in `shared/` only
- Never import server code from client or vice versa

### Path Aliases (tsconfig)
```typescript
"@/*"       → "./client/src/*"
"@shared/*" → "./shared/*"
```

### TypeScript
- Strict mode throughout — no `any` without justification
- Prefer explicit types over inference in function signatures and public APIs
- Use existing Drizzle-generated types (`InferSelectModel`, `InferInsertModel`) for DB entities
- Use Zod schemas from `shared/schema.ts` for all validation

### Storage Pattern
All database operations go through the `IStorage` interface in `server/storage.ts`. Never query the database directly from route handlers — call `storage.method()` instead. This keeps DB logic centralized and testable.

### Frontend Data Fetching
Use TanStack Query (`useQuery`, `useMutation`) for all server state. See `client/src/hooks/useContacts.ts` for the established pattern. Invalidate related queries after mutations.

### Style
- Follow existing formatting — no style rewrites unless fixing bugs
- Use Lucide React for all icons
- Use existing shadcn/ui components from `client/src/components/ui/` — do not add alternatives
- TailwindCSS v4 utility classes only — no inline styles, no CSS modules

---

## n8n Integration Pattern

### How It Works

```
Frontend → POST /api/... → server/services/n8nClient.ts → n8n webhook
                                                               ↓
Frontend ← WebSocket/poll ← server resolves promise ← n8n POSTs result back
                                                       to /api/webhooks/prospect-research-result
```

The server keeps a `pendingProspectResearch` Map of open Promises keyed by contact ID. When n8n finishes, it POSTs to the result webhook, the server resolves the promise, and the client receives the data.

### Critical: Webhook Data Location

```javascript
// CORRECT — data is nested under body
$json.body.linkedinUrl
$json.body.companyName

// WRONG — data is NOT at root level
$json.linkedinUrl
```

This is the most common n8n expression error. Always access webhook payload at `$json.body`.

### n8n Expression Syntax
- Variables: `$json`, `$node`, `$now`, `$env`, `$workflow`
- Code node return values must be arrays of objects
- Prefer JavaScript over Python in Code nodes (Python cannot use `requests`, `pandas`, etc.)

### Workflow Files
See `n8n-workflow/` — these are exportable/importable JSON files for the n8n instance. Do not modify JSON directly; use the n8n UI or API with proper validation.

### n8n Safety Rules
- Never directly edit production workflows via API without user confirmation
- Always back up a workflow before modifying it
- Test in development environment before deploying to production
- When validation tools are available, use them — never bypass validation failures
- Do not change webhook URLs or credentials without understanding the impact

---

## Security & Absolute Rules

### Secrets and Environment
- **NEVER** read, write, modify, or commit `.env` files
- **NEVER** hardcode API keys, tokens, or credentials anywhere in code
- **NEVER** commit environment variables — use `process.env.VAR_NAME` references only
- Database URL comes from `DATABASE_URL` env var

### Database
- **NEVER** modify the database directly with raw SQL that changes data
- **NEVER** edit or delete existing migration files
- **ALWAYS** use Drizzle ORM via the `IStorage` interface
- All schema changes require a new migration file
- Consider backwards compatibility and data migration paths for every schema change

### Version Control
- **NEVER** commit build artifacts (`dist/`, `node_modules/`)
- **NEVER** commit `package-lock.json` changes unless dependencies were intentionally modified
- **NEVER** force push or rewrite public history

### Destructive Actions — Require Explicit User Confirmation

**Code:**
- Deleting or renaming files
- Modifying authentication or authorization logic
- Changing build or deployment configuration
- Removing error handling or validation

**Database:**
- Dropping tables or columns
- Changing primary keys or foreign key relationships

**Workflows:**
- Deleting or disabling production n8n workflows
- Modifying webhook URLs or credentials
- Changing workflow triggers

**Deployment:**
- Deploying to production
- Modifying CI/CD pipelines
- Changing environment-specific configurations

---

## Multi-Agent Coordination

This repo is worked on by multiple AI coding agents (Claude Code, Factory, Cursor, etc.) as well as human developers. Follow these rules to avoid conflicts:

- **Always read files before modifying them** — never assume content based on prior sessions
- **Check `git status` before starting work** — other agents may have made recent changes
- **Make incremental changes** — prefer small, focused diffs over large rewrites
- **One logical change at a time** — don't bundle unrelated changes
- **Coordinate major refactors** with the user before starting
- **Document significant architectural decisions** in commit messages or comments

---

## Design System

OutboundOS follows a modern SaaS productivity aesthetic inspired by Linear, Notion, and Attio — **professional, dense, and efficient**.

### Typography
- **Primary:** Inter (all UI text)
- **Monospace:** JetBrains Mono (code, IDs, data values)

### Layout
- Fixed 240px sidebar, flexible main content area
- Data-dense tables and lists (not card-heavy)
- Spacing units: 2, 4, 6, 8, 12, 16 (Tailwind scale)

### Components
- Use shadcn/ui components from `client/src/components/ui/`
- Do not introduce alternative component libraries
- Prefer Sheet/Dialog for overlays, not custom modals

### Color Semantics
- Positive outcomes (responded, booked): green tones
- Negative/failed: red/destructive
- Neutral/pending: muted/secondary
- Use semantic Tailwind classes (`text-muted-foreground`, `bg-secondary`, etc.)

### Icons
- Lucide React exclusively — consistent stroke weight and sizing
- Standard size: `h-4 w-4` inline, `h-5 w-5` for buttons

### Animation
- Minimal and purposeful — no decorative animations
- Use Tailwind `transition-*` utilities for state changes
- Avoid layout shifts

---

*This document is the single source of truth for agent context in this repository. Keep it updated when architecture changes.*
