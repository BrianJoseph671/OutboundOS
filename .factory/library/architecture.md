# Architecture

Architectural decisions and patterns discovered during the mission.

**What belongs here:** Decisions made, patterns established, technical rationale.

---

## Auth Architecture

- Google OAuth via passport-google-oauth20
- Sessions stored in PostgreSQL via connect-pg-simple
- Catch-all isAuthenticated middleware on ALL /api/* routes
- Whitelisted: /api/auth/*, /api/cert/*, /api/webhooks/*, /api/integrations/callback/*
- getSeedUserId() was removed — no seed user fallback
- Every route handler uses req.user!.id (non-optional)
- getContact and updateContact require userId (no optional overloads)

## Storage Layer Pattern

All DB operations go through IStorage interface in server/storage.ts:
1. Define table in shared/schema.ts
2. Export insert schema and types
3. Add methods to IStorage interface
4. Implement in DatabaseStorage class
5. Use storage singleton in route handlers

## Frontend Data Pattern

- TanStack Query v5 for all server state
- apiRequest() helper for HTTP calls
- useContacts hook migrated from localStorage-primary to API-first
- localStorage serves as write-through cache for offline resilience

## Phase 2: LangChain Agent Architecture

- LangGraph ReAct agent via createReactAgent from @langchain/langgraph/prebuilt
- ChatAnthropic model: claude-sonnet-4-20250514
- Tools defined via tool() from @langchain/core/tools with Zod schemas
- Agent entry point: server/agent/index.ts
- MCP tool adapters: server/agent/tools/ (superhuman.ts, granola.ts, calendar.ts) — TODO placeholders
- Service modules: server/agent/services/ (interactionWriter.ts, contactMatcher.ts, actionDetector.ts)
- LangSmith tracing: automatic via env vars (LANGCHAIN_TRACING_V2=true, LANGCHAIN_API_KEY, LANGCHAIN_PROJECT)
- Sync flow: POST /api/sync → runSync(userId) → agent pulls MCP → interactionWriter dedup+write → actionDetector detect → return counts

## Phase 2: Actions Architecture

- Actions table stores pending follow-ups, reconnects, open threads
- Action detection runs after sync: follow_up (inbound with no outbound), reconnect (warm/vip stale >14d), open_thread
- Auto-complete: outbound interaction synced → pending follow_up auto-completed
- GET /api/actions with filters (status, type, limit, offset)
- PATCH /api/actions/:id for status transitions (pending↔snoozed, pending→completed/dismissed)
- Snoozed actions resurface when snoozed_until passes (included in pending query)

## Phase 2: Interaction Dedup Rules

- source_id dedup: interactions unique by (channel, sourceId) per user (application-level check)
- Calendar/Granola dedup: calendar events skipped if Granola interaction exists for same contact on same date
- Interaction mapping: Superhuman→email, Granola→meeting, Calendar→meeting
- Direction: Superhuman outbound if from Brian, inbound otherwise; Granola/Calendar→mutual
