import { storage } from "../../storage";

const SYNC_STATE_KEY = "superhumanSyncState";

interface SuperhumanSyncState {
  lastProcessedSentAt?: string;
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export async function getSuperhumanCheckpoint(userId: string): Promise<string | null> {
  const connection = await storage.getIntegrationConnection("superhuman", userId);
  const metadata = connection?.metadata || {};
  const candidate = (metadata[SYNC_STATE_KEY] as SuperhumanSyncState | undefined)?.lastProcessedSentAt;
  return parseIsoDate(candidate);
}

export async function saveSuperhumanCheckpoint(
  userId: string,
  checkpointIso: string,
): Promise<void> {
  const connection = await storage.getIntegrationConnection("superhuman", userId);
  if (!connection) return;
  const parsed = parseIsoDate(checkpointIso);
  if (!parsed) return;

  const metadata = connection.metadata || {};
  await storage.upsertIntegrationConnection("superhuman", userId, {
    metadata: {
      ...metadata,
      [SYNC_STATE_KEY]: {
        lastProcessedSentAt: parsed,
      } satisfies SuperhumanSyncState,
    },
  });
}
