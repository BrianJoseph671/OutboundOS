# Architecture

Architectural decisions and patterns discovered during the mission.

**What belongs here:** Decisions made, patterns established, technical rationale.

---

## Auth Architecture

- Google OAuth via passport-google-oauth20
- Sessions stored in PostgreSQL via connect-pg-simple
- requireAuth middleware only on new /api/interactions/* endpoints
- Existing endpoints remain unprotected for backward compatibility
- Contact dedup only applies when authenticated (req.user present)

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
