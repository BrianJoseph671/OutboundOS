# Superhuman Sync Rollout Checklist

## Configuration
- Set `RELATIONSHIP_PROVIDER_MODE=live` in the target environment.
- Set `SUPERHUMAN_MCP_URL` (or rely on default hosted endpoint).
- Confirm Superhuman OAuth connection is active from `Settings -> Integrations`.
- Optionally tune guardrails:
  - `SUPERHUMAN_MAX_PAGES_PER_SYNC`
  - `SUPERHUMAN_MAX_THREADS_PER_SYNC`
  - `SUPERHUMAN_MCP_MAX_RETRIES`
  - `SUPERHUMAN_MCP_RETRY_BASE_MS`

## Staging Validation
- Run first sync and confirm logs include:
  - pages fetched
  - threads fetched
  - emails mapped
  - new interactions/actions
  - elapsed time
- Verify checkpoint behavior:
  - first sync backfills expected window
  - second sync starts from newer checkpoint and writes near-zero duplicates
- Validate partial-failure behavior:
  - Superhuman failures are surfaced in `errors[]`
  - sync process remains alive and completes response shape

## Production Cutover
- Enable live mode for a single internal user first.
- Monitor first three sync runs:
  - error count trend
  - retries triggered
  - interaction write volume
- Confirm action queue quality for newly synced interactions.
- Expand rollout to all users after successful canary runs.

## Rollback
- Set `RELATIONSHIP_PROVIDER_MODE=mock`.
- Keep OAuth connected, but suspend live ingestion until issue is resolved.
- Re-enable with reduced limits if needed (smaller page/thread caps).
