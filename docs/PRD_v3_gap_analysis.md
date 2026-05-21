# PRD v3 Gap Analysis

This document aligns [OutboundOS_Cursor_PRD_v3.md](https://github.com/BrianJoseph671/OutboundOS) with the current codebase so implementers do not rebuild existing modules.

## Already implemented (~70%)

| PRD area | Location |
|----------|----------|
| Network indexer (Gmail API, warmth, tiers) | `server/services/networkIndexer.ts`, `warmthClassifier.ts` |
| Network API | `POST/GET /api/network/*` |
| Email type review gate (not in PRD) | `POST /api/network/index` → `/network-review/:sessionId` |
| Action queue + detector | `server/agent/services/actionDetector.ts`, `GET/PATCH /api/actions` |
| Sequences + templates | `server/services/sequenceManager.ts`, `/api/sequences`, `/sequences` UI |
| Compose (Claude + Gmail drafts) | `server/services/composeService.ts` |

## Architectural differences

1. **Gmail REST API vs Gmail MCP** — Indexer uses `gmailClient.ts`, not in-process `Gmail:search_threads` MCP. Behavior matches PRD; no rewrite required unless MCP must run inside Cursor.

2. **Dual sync paths** (being unified):
   - Actions **Sync Recent** → `POST /api/sync` (agent adapters)
   - Settings **Incremental sync** → `POST /api/network/sync` (network indexer)
   - Target: orchestrated `POST /api/sync` runs network + agent + sequence processing.

3. **Review gate** — Contacts are persisted after user approves email-type classifications, not immediately after scan.

4. **Default `RELATIONSHIP_PROVIDER_MODE=mock`** — Agent sync uses synthetic data until `live` + Google OAuth.

## Open items (this implementation plan)

- Unified sync orchestration
- Action detector scoped to new interactions only
- Contacts warmth sort/display, first-run index CTA
- PRD noise filter patterns + mass-subject heuristic
- Action priority/reconnect rules per PRD SQL
- Sequence scheduling from `sent_at`, thread-based reply detection
- Contact-detail sequence UI + draft workspace sequence context
- Live Granola/Calendar MCP adapters + meeting notes in draft panel

## Env vars for live rollout

See `.env.example` and `SUPERHUMAN_SYNC_ROLLOUT.md`.
