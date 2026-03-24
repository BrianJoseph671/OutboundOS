# User Testing

Testing surface, tools, and resource cost classification.

**What belongs here:** Validation surface findings, testing approach, resource constraints.

---

## Validation Surface

- **Primary surface:** Web browser (React SPA at http://localhost:5000)
- **Testing tool:** agent-browser for UI validation
- **API testing:** curl / Invoke-RestMethod for endpoint verification
- **Dev server:** npm run dev (Express + Vite HMR on port 5000)
- **Database:** PostgreSQL on localhost:5432

## Validation Concurrency

- **Machine:** 32GB RAM, 8 cores (Windows 10)
- **Dev server:** ~200MB RAM
- **agent-browser:** ~300MB per instance
- **Max concurrent validators:** 5 (well within 70% of ~26GB usable headroom)

## Testing Notes

- Windows environment: use PowerShell syntax (semicolons, Invoke-RestMethod)
- The dev server takes ~10-15 seconds to start
- WebSocket available at /ws for real-time features
- Auth testing requires Google OAuth credentials configured in .env
- For auth flow testing: can test redirect URL and session behavior but cannot complete real Google OAuth flow in automated testing — test the redirect URL structure and session handling with mock/seed data
