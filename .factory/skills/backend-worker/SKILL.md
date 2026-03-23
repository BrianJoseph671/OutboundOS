---
name: backend-worker
description: Implements backend features — schema, storage, auth, API routes, and server-side logic with TDD
---

# Backend Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features involving:
- Database schema changes (shared/schema.ts, Drizzle ORM)
- Storage layer methods (server/storage.ts IStorage + DatabaseStorage)
- Express API routes (server/routes.ts or server/routes/*.ts)
- Authentication setup (Passport.js, session management)
- Server-side middleware (auth, validation)
- Application logic (triggers, computed fields)

## Work Procedure

### 1. Understand the Feature

Read the feature description, preconditions, expectedBehavior, and verificationSteps carefully. Read the referenced source files to understand existing patterns.

Key files to check before starting:
- `shared/schema.ts` — current table definitions
- `server/storage.ts` — IStorage interface and DatabaseStorage patterns
- `server/routes.ts` — existing route patterns, error handling
- `server/index.ts` — middleware chain, app setup
- `.factory/library/architecture.md` — architectural decisions

### 2. Write Tests First (RED)

Before writing any implementation code:
- Create test file(s) in the appropriate location (e.g., `server/__tests__/` or alongside the module)
- Write failing tests that verify the expected behavior from the feature description
- For storage methods: test CRUD operations, user scoping, edge cases
- For API routes: test HTTP status codes, response bodies, auth enforcement, validation
- For schema: test column existence, constraints, defaults via the storage layer
- Run tests to confirm they FAIL (red phase)

### 3. Implement (GREEN)

Implement the minimum code to make tests pass:
- Schema changes: modify `shared/schema.ts`, export types and schemas
- Storage: add interface methods, implement in DatabaseStorage
- Routes: create modular route file or add to routes.ts, register in registerRoutes()
- Auth: create auth.ts, middleware, wire into index.ts
- Push schema: run `npm run db:push` to apply schema changes
- Run tests to confirm they PASS (green phase)

### 4. Verify Manually

After tests pass:
- Run `npm run check` (TypeScript type check) — must pass
- Start the dev server: `npm run dev`
- Use `Invoke-RestMethod` or `curl.exe` to test API endpoints manually
- Verify at least 2 happy-path scenarios and 1 error scenario per endpoint
- Check database state with raw queries if needed

### 5. Run Full Test Suite

Run all tests to check for regressions: `npx vitest run`

## Example Handoff

```json
{
  "salientSummary": "Implemented interactions CRUD in IStorage and DatabaseStorage with 6 methods. Added /api/interactions routes with requireAuth middleware. All 12 tests pass (4 storage unit, 8 API integration). Manual verification: POST returns 201 with generated ID, GET filters by contactId, DELETE cascades correctly.",
  "whatWasImplemented": "Added getInteractions, getInteraction, createInteraction, updateInteraction, deleteInteraction, getInteractionBySourceId to IStorage and DatabaseStorage. Created server/routes/relationships.ts with GET/POST/PATCH/DELETE /api/interactions endpoints, all protected by requireAuth. Zod validation on POST/PATCH bodies. Contact's last_interaction_at updated on interaction creation.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx vitest run", "exitCode": 0, "observation": "12 tests passing, 0 failing" },
      { "command": "npm run check", "exitCode": 0, "observation": "No TypeScript errors" },
      { "command": "Invoke-RestMethod -Uri http://localhost:5000/api/interactions -Method POST -Body '{...}' -ContentType 'application/json'", "exitCode": 0, "observation": "201 Created with generated UUID, ingested_at set" },
      { "command": "Invoke-RestMethod -Uri http://localhost:5000/api/interactions?contactId=abc -Method GET", "exitCode": 0, "observation": "200 OK, array of 2 interactions filtered correctly" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "server/__tests__/interactions.test.ts",
        "cases": [
          { "name": "createInteraction inserts row and returns it", "verifies": "Storage layer creates interaction with all fields" },
          { "name": "getInteractions filters by userId and contactId", "verifies": "Multi-user isolation" },
          { "name": "POST /api/interactions returns 201 with valid body", "verifies": "API endpoint success case" },
          { "name": "POST /api/interactions returns 401 without auth", "verifies": "Auth middleware enforcement" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Schema change would break an existing table or column
- An existing endpoint's behavior needs to change in a way not described in the feature
- Database migration produces unexpected errors
- A dependency (e.g., passport-google-oauth20) needs to be installed and isn't available
- Test infrastructure (vitest) is not set up and the feature requires tests
