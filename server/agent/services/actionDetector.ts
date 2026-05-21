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
 * 4. new_reply: inbound email received in last 48 hours with no outbound reply.
 *
 * 5. Auto-complete: for each new outbound interaction, check if a pending follow_up
 *    or new_reply action exists for that contact. If yes, mark it completed.
 *
 * Dedup: before creating any action, check if a pending action already exists for
 * the same (contactId, actionType). If yes, skip.
 */
import { storage } from "../../storage";
import type { Interaction, InsertAction } from "@shared/schema";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
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

  // In-memory dedup set for this batch: keys are "contactId:actionType"
  // Prevents proposing the same (contactId, actionType) pair more than once
  // within a single detectActions() call even if the DB hasn't been updated yet.
  const proposedThisBatch = new Set<string>();

  /**
   * Check both the DB (for pre-existing pending actions) and the in-memory
   * batch set (for actions already proposed in this same call).
   */
  async function isDuplicate(contactId: string, actionType: string): Promise<boolean> {
    const batchKey = `${contactId}:${actionType}`;
    if (proposedThisBatch.has(batchKey)) return true;
    return pendingActionExists(userId, contactId, actionType);
  }

  /**
   * Mark a (contactId, actionType) pair as proposed for this batch.
   */
  function markProposed(contactId: string, actionType: string): void {
    proposedThisBatch.add(`${contactId}:${actionType}`);
  }

  // ── Step 1: Handle each new interaction ────────────────────────────────────

  for (const interaction of newInteractions) {
    // ── Auto-complete: outbound interaction closes a pending follow_up ──────
    if (interaction.direction === "outbound") {
      await autoCompleteFollowUp(userId, interaction.contactId);
    }

    // ── follow_up: inbound or meeting with no outbound after (VIP/warm only) ─
    const isFollowUpTrigger =
      interaction.direction === "inbound" || interaction.channel === "meeting";
    if (isFollowUpTrigger) {
      const contact = await storage.getContact(interaction.contactId, userId);
      const tier = contact?.tier;
      if (tier === "vip" || tier === "warm") {
        const shouldCreate = await shouldCreateFollowUp(
          userId,
          interaction.contactId,
          interaction.occurredAt,
        );
        if (shouldCreate) {
          if (!(await isDuplicate(interaction.contactId, "follow_up"))) {
            markProposed(interaction.contactId, "follow_up");
            const daysSince = Math.max(
              1,
              Math.floor(
                (Date.now() - interaction.occurredAt.getTime()) / (1000 * 60 * 60 * 24),
              ),
            );
            const dateStr = interaction.occurredAt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            const reason =
              interaction.channel === "meeting"
                ? `Meeting on ${dateStr} — no follow-up sent`
                : `Received email ${dateStr} — no reply sent`;
            actionsToCreate.push({
              userId,
              contactId: interaction.contactId,
              actionType: "follow_up",
              triggerInteractionId: interaction.id,
              priority: daysSince,
              status: "pending",
              reason,
              snoozedUntil: null,
            });
          }
        }
      }
    }

    // ── open_thread: interaction has openThreads set ─────────────────────────
    if (interaction.openThreads && interaction.openThreads.trim().length > 0) {
      if (!(await isDuplicate(interaction.contactId, "open_thread"))) {
        markProposed(interaction.contactId, "open_thread");
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

    // ── new_reply: inbound email within 48 hours, no outbound reply yet ─────
    if (interaction.direction === "inbound" && interaction.channel === "email") {
      const ageMs = Date.now() - interaction.occurredAt.getTime();
      if (ageMs <= FORTY_EIGHT_HOURS_MS) {
        const allInteractions = await storage.getInteractions(userId, interaction.contactId);
        const hasOutboundAfter = allInteractions.some(
          (i) => i.direction === "outbound" && i.occurredAt.getTime() > interaction.occurredAt.getTime()
        );
        if (!hasOutboundAfter) {
          if (!(await isDuplicate(interaction.contactId, "new_reply"))) {
            markProposed(interaction.contactId, "new_reply");
            const hoursSince = Math.round(ageMs / (1000 * 60 * 60));
            actionsToCreate.push({
              userId,
              contactId: interaction.contactId,
              actionType: "new_reply",
              triggerInteractionId: interaction.id,
              priority: Math.max(1, hoursSince),
              status: "pending",
              reason: `Replied to your email ${hoursSince}h ago — no response sent yet`,
              snoozedUntil: null,
            });
          }
        }
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
        if (!(await isDuplicate(contact.id, "reconnect"))) {
          markProposed(contact.id, "reconnect");
          const daysSince = contact.lastInteractionAt
            ? Math.floor(
                (now.getTime() - contact.lastInteractionAt.getTime()) / (1000 * 60 * 60 * 24),
              )
            : 999;
          const reason = contact.lastInteractionAt
            ? `Last contact ${daysSince} days ago — relationship cooling`
            : `No interaction on record with ${contact.name}`;
          actionsToCreate.push({
            userId,
            contactId: contact.id,
            actionType: "reconnect",
            triggerInteractionId: null,
            priority: Math.max(1, daysSince - 14),
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
 * Check if a follow_up action should be created for an inbound/meeting interaction.
 * Returns true if there is no outbound interaction after the trigger occurredAt.
 */
async function shouldCreateFollowUp(
  userId: string,
  contactId: string,
  occurredAt: Date
): Promise<boolean> {
  const allInteractions = await storage.getInteractions(userId, contactId);
  const hasOutboundAfter = allInteractions.some(
    (i) =>
      i.direction === "outbound" &&
      i.occurredAt.getTime() > occurredAt.getTime(),
  );
  return !hasOutboundAfter;
}

/**
 * Auto-complete any pending follow_up actions for a contact when an outbound
 * interaction is detected. Sets status to 'completed' with completedAt timestamp.
 */
export async function autoCompleteFollowUp(userId: string, contactId: string): Promise<void> {
  const pendingActions = await storage.getActions(userId, { status: "pending" });
  const autoCompletable = pendingActions.filter(
    (a) => a.contactId === contactId && (a.actionType === "follow_up" || a.actionType === "new_reply")
  );

  for (const action of autoCompletable) {
    await storage.updateAction(action.id, userId, { status: "completed" });
  }
}
