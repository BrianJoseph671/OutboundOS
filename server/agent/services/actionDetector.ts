/**
 * actionDetector — detects pending actions from newly ingested interactions.
 *
 * Action detection rules:
 *
 * 1. follow_up: inbound interaction with no outbound interaction for the same contact
 *    within 7 days → create a follow_up action.
 *
 * 2. open_thread: interaction has openThreads set → create an open_thread action.
 *
 * 3. reconnect: scan all contacts — if tier='warm' or tier='vip' AND
 *    lastInteractionAt is >14 days ago (or null) → create a reconnect action.
 *
 * 4. Auto-complete: for each new outbound interaction, check if a pending follow_up
 *    action exists for that contact. If yes, mark it completed.
 *
 * Dedup: before creating any action, check if a pending action already exists for
 * the same (contactId, actionType). If yes, skip.
 */
import { storage } from "../../storage";
import type { Interaction, InsertAction } from "@shared/schema";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * detectActions — Analyze new interactions and generate action items.
 *
 * @param userId          - The user whose actions to detect
 * @param newInteractions - Newly written interactions (from this sync)
 * @returns Array of InsertAction objects to be created
 */
export async function detectActions(
  userId: string,
  newInteractions: Interaction[]
): Promise<InsertAction[]> {
  const actionsToCreate: InsertAction[] = [];

  // ── Step 1: Handle each new interaction ────────────────────────────────────

  for (const interaction of newInteractions) {
    // ── Auto-complete: outbound interaction closes a pending follow_up ──────
    if (interaction.direction === "outbound") {
      await autoCompleteFollowUp(userId, interaction.contactId);
    }

    // ── follow_up: inbound with no outbound in 7 days ────────────────────────
    if (interaction.direction === "inbound") {
      const shouldCreate = await shouldCreateFollowUp(userId, interaction.contactId, interaction.occurredAt);
      if (shouldCreate) {
        const isDuplicate = await pendingActionExists(userId, interaction.contactId, "follow_up");
        if (!isDuplicate) {
          actionsToCreate.push({
            userId,
            contactId: interaction.contactId,
            actionType: "follow_up",
            triggerInteractionId: interaction.id,
            priority: 1,
            status: "pending",
            reason: `Inbound message received — no reply sent within 7 days`,
            snoozedUntil: null,
          });
        }
      }
    }

    // ── open_thread: interaction has openThreads set ─────────────────────────
    if (interaction.openThreads && interaction.openThreads.trim().length > 0) {
      const isDuplicate = await pendingActionExists(userId, interaction.contactId, "open_thread");
      if (!isDuplicate) {
        actionsToCreate.push({
          userId,
          contactId: interaction.contactId,
          actionType: "open_thread",
          triggerInteractionId: interaction.id,
          priority: 2,
          status: "pending",
          reason: `Open thread: ${interaction.openThreads.trim()}`,
          snoozedUntil: null,
        });
      }
    }
  }

  // ── Step 2: Scan all contacts for reconnect actions ───────────────────────

  const allContacts = await storage.getContacts(userId);
  const now = new Date();

  for (const contact of allContacts) {
    if (contact.tier === "warm" || contact.tier === "vip") {
      const isStale =
        contact.lastInteractionAt === null ||
        contact.lastInteractionAt === undefined ||
        now.getTime() - contact.lastInteractionAt.getTime() > FOURTEEN_DAYS_MS;

      if (isStale) {
        const isDuplicate = await pendingActionExists(userId, contact.id, "reconnect");
        if (!isDuplicate) {
          const reason =
            contact.lastInteractionAt
              ? `No interaction with ${contact.name} for over 14 days`
              : `No interaction on record with ${contact.name}`;
          actionsToCreate.push({
            userId,
            contactId: contact.id,
            actionType: "reconnect",
            triggerInteractionId: null,
            priority: 1,
            status: "pending",
            reason,
            snoozedUntil: null,
          });
        }
      }
    }
  }

  return actionsToCreate;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check whether a pending action already exists for (userId, contactId, actionType).
 * Used to prevent duplicate action creation.
 */
async function pendingActionExists(
  userId: string,
  contactId: string,
  actionType: string
): Promise<boolean> {
  const pendingActions = await storage.getActions(userId, { status: "pending" });
  return pendingActions.some(
    (a) => a.contactId === contactId && a.actionType === actionType
  );
}

/**
 * Check if a follow_up action should be created for an inbound interaction.
 * Returns true if there's no outbound interaction for the same contact within 7 days.
 */
async function shouldCreateFollowUp(
  userId: string,
  contactId: string,
  occurredAt: Date
): Promise<boolean> {
  const allInteractions = await storage.getInteractions(userId, contactId);
  const windowStart = occurredAt.getTime();
  const windowEnd = windowStart + SEVEN_DAYS_MS;

  const hasOutbound = allInteractions.some(
    (i) =>
      i.direction === "outbound" &&
      i.occurredAt.getTime() >= windowStart &&
      i.occurredAt.getTime() <= windowEnd
  );

  return !hasOutbound;
}

/**
 * Auto-complete any pending follow_up actions for a contact when an outbound
 * interaction is detected. Sets status to 'completed' with completedAt timestamp.
 */
async function autoCompleteFollowUp(userId: string, contactId: string): Promise<void> {
  const pendingActions = await storage.getActions(userId, { status: "pending" });
  const pendingFollowUps = pendingActions.filter(
    (a) => a.contactId === contactId && a.actionType === "follow_up"
  );

  for (const action of pendingFollowUps) {
    await storage.updateAction(action.id, userId, { status: "completed" });
  }
}
