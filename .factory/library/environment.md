# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Required Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| DATABASE_URL | PostgreSQL connection string | Yes |
| SESSION_SECRET | Express session encryption | Yes (Phase 1) |
| GOOGLE_CLIENT_ID | Google OAuth 2.0 Client ID | Yes (Phase 1) |
| GOOGLE_CLIENT_SECRET | Google OAuth 2.0 Client Secret | Yes (Phase 1) |
| BRIAN_EMAIL | Seed user email for dev | Optional |
| OPENAI_API_KEY | Existing AI features | Optional |

## Platform Notes

- Development environment: Windows 10, Node v24.13.1
- PostgreSQL runs locally on port 5432
- Dev server: port 5000 (Express + Vite HMR)
- This is a PowerShell environment — use semicolons not && for command chaining
