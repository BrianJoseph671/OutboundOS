/**
 * Agent entry point — sync orchestration for RelationshipOS.
 *
 * Architecture:
 * - Adapter layer: Superhuman, Granola, Calendar adapters in ./adapters/
 *   Each adapter has a fetchAndMap*() function that returns RawInteraction[].
 *   Adapter bodies are TODO placeholders until Brian wires live MCP connections.
 * - interactionWriter: deduplicates and writes to DB
 * - actionDetector: creates pending actions from new interactions
 * - LangGraph agent (in ./tools/) is preserved for future use but NOT used for sync.
 *
 * runSync(userId) orchestrates:
 *   1. Compute sync window (90-day first sync, incremental thereafter)
 *   2. Call adapters to fetch raw MCP data and map to RawInteraction[]
 *   3. Write interactions via interactionWriter (with dedup)
 *   4. Detect new actions via actionDetector
 *   5. Update lastSyncedAt only on contacts that had newly written interactions
 *   6. Return SyncResponse with counts
 */
import type { SyncResponse } from "@shared/types/actions";
import type { RawInteraction } from "./services/interactionWriter";
import { writeInteractions } from "./services/interactionWriter";
import { detectActions } from "./services/actionDetector";
import {
  fetchAndMapEmails as defaultFetchAndMapEmails,
} from "./adapters/superhuman";
import {
  fetchAndMapMeetings as defaultFetchAndMapMeetings,
} from "./adapters/granola";
import {
  fetchAndMapEvents as defaultFetchAndMapEvents,
} from "./adapters/calendar";
import { storage } from "../storage";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// ── Adapter result shape ──────────────────────────────────────────────────────

interface AdapterResult {
  interactions: RawInteraction[];
  errors: string[];
}

// ── Dependency injection interface ────────────────────────────────────────────

export interface RunSyncDeps {
  fetchAndMapEmails: (
    startDate: string,
    endDate: string,
    userId: string,
    userEmail: string,
  ) => Promise<AdapterResult>;
  fetchAndMapMeetings: (
    startDate: Date,
    userId: string,
  ) => Promise<AdapterResult>;
  fetchAndMapEvents: (
    startDate: string,
    endDate: string,
    userId: string,
    userEmail: string,
  ) => Promise<AdapterResult>;
}

const defaultDeps: RunSyncDeps = {
  fetchAndMapEmails: defaultFetchAndMapEmails,
  fetchAndMapMeetings: defaultFetchAndMapMeetings,
  fetchAndMapEvents: defaultFetchAndMapEvents,
};

/**
 * Compute the sync start date for a user.
 * First sync (all contacts have lastSyncedAt = null): 90-day lookback.
 * Subsequent: earliest lastSyncedAt across the user's contacts (fallback 90 days).
 */
export async function computeSyncWindow(userId: string): Promise<{ startDate: Date; endDate: Date }> {
  const endDate = new Date();
  const contacts = await storage.getContacts(userId);

  if (contacts.length === 0) {
    return { startDate: new Date(endDate.getTime() - NINETY_DAYS_MS), endDate };
  }

  const syncedDates = contacts
    .map((c) => c.lastSyncedAt)
    .filter((d): d is Date => d !== null && d !== undefined);

  if (syncedDates.length === 0) {
    return { startDate: new Date(endDate.getTime() - NINETY_DAYS_MS), endDate };
  }

  const earliest = syncedDates.reduce((min, d) => (d.getTime() < min.getTime() ? d : min));
  return { startDate: earliest, endDate };
}

// ── runSync (production entry point — uses default adapters) ─────────────────

export async function runSync(userId: string): Promise<SyncResponse> {
  return runSyncWithDeps(userId, defaultDeps);
}

// ── runSyncWithDeps (testable — accepts injected adapters) ───────────────────

export async function runSyncWithDeps(
  userId: string,
  deps: RunSyncDeps,
): Promise<SyncResponse> {
  const syncStartedAt = Date.now();
  const errors: string[] = [];
  let newInteractions = 0;
  let newActions = 0;

  const userEmail = process.env.BRIAN_EMAIL ?? "";

  // ── Step 1: Compute sync window ──────────────────────────────────────────
  const { startDate, endDate } = await computeSyncWindow(userId);
  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();
  console.info("[Sync] run started", {
    userId,
    startISO,
    endISO,
  });

  // ── Step 2: Call adapters (partial failure — each wrapped independently) ──
  const rawInteractions: RawInteraction[] = [];

  try {
    const t0 = Date.now();
    const emailResult = await deps.fetchAndMapEmails(startISO, endISO, userId, userEmail);
    rawInteractions.push(...emailResult.interactions);
    errors.push(...emailResult.errors);
    console.info("[Sync] adapter completed", {
      userId,
      adapter: "superhuman",
      interactions: emailResult.interactions.length,
      errors: emailResult.errors.length,
      elapsedMs: Date.now() - t0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Superhuman adapter failed: ${msg}`);
    console.error("[Sync] adapter failed", {
      userId,
      adapter: "superhuman",
      errorType: "adapter_failure",
      message: msg,
    });
  }

  try {
    const t0 = Date.now();
    const meetingResult = await deps.fetchAndMapMeetings(startDate, userId);
    rawInteractions.push(...meetingResult.interactions);
    errors.push(...meetingResult.errors);
    console.info("[Sync] adapter completed", {
      userId,
      adapter: "granola",
      interactions: meetingResult.interactions.length,
      errors: meetingResult.errors.length,
      elapsedMs: Date.now() - t0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Granola adapter failed: ${msg}`);
    console.error("[Sync] adapter failed", {
      userId,
      adapter: "granola",
      errorType: "adapter_failure",
      message: msg,
    });
  }

  try {
    const t0 = Date.now();
    const calendarResult = await deps.fetchAndMapEvents(startISO, endISO, userId, userEmail);
    rawInteractions.push(...calendarResult.interactions);
    errors.push(...calendarResult.errors);
    console.info("[Sync] adapter completed", {
      userId,
      adapter: "calendar",
      interactions: calendarResult.interactions.length,
      errors: calendarResult.errors.length,
      elapsedMs: Date.now() - t0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Calendar adapter failed: ${msg}`);
    console.error("[Sync] adapter failed", {
      userId,
      adapter: "calendar",
      errorType: "adapter_failure",
      message: msg,
    });
  }

  // ── Step 3: Write interactions with dedup ────────────────────────────────
  let writtenContactIds: string[] = [];
  let writtenInteractionIds: string[] = [];
  try {
    const writeResult = await writeInteractions(userId, rawInteractions);
    newInteractions = writeResult.written;
    writtenContactIds = writeResult.writtenContactIds;
    writtenInteractionIds = writeResult.writtenInteractionIds;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Sync] Error writing interactions:", msg);
    errors.push(`Interaction write failed: ${msg}`);
  }

  // ── Step 4: Detect and create actions ────────────────────────────────────
  try {
    // Use the exact IDs of interactions written in this sync batch
    // (avoids fragile time-window filtering that can break with DB/Node clock skew)
    const writtenIdSet = new Set(writtenInteractionIds);
    const recentInteractions = await storage.getInteractions(userId);
    const newlySyncedInteractions = recentInteractions.filter(
      (i) => writtenIdSet.has(i.id),
    );

    const actionsToCreate = await detectActions(userId, newlySyncedInteractions);
    for (const action of actionsToCreate) {
      try {
        await storage.createAction(action);
        newActions++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Sync] Error creating action:", msg);
        errors.push(`Action creation failed: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Sync] Error in action detection:", msg);
    errors.push(`Action detection failed: ${msg}`);
  }

  // ── Step 5: Update lastSyncedAt only on contacts with newly written interactions
  if (writtenContactIds.length > 0) {
    try {
      const now = new Date();
      for (const contactId of writtenContactIds) {
        await storage.updateContact(contactId, userId, { lastSyncedAt: now });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Sync] Error updating lastSyncedAt:", msg);
      errors.push(`lastSyncedAt update failed: ${msg}`);
    }
  }

  console.info("[Sync] run completed", {
    userId,
    startISO,
    endISO,
    rawInteractions: rawInteractions.length,
    newInteractions,
    newActions,
    errorCount: errors.length,
    elapsedMs: Date.now() - syncStartedAt,
  });
  return { newInteractions, newActions, errors };
}
