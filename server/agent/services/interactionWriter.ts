/**
 * interactionWriter — writes new interactions to the database with deduplication.
 *
 * Dedup rules:
 * 1. Source ID dedup: if an interaction already exists for (channel, sourceId, userId), skip.
 * 2. Calendar/Granola date dedup: before writing a calendar meeting interaction,
 *    check if a Granola interaction exists for the same contactId on the same date.
 *    If yes, skip the calendar entry (Granola has richer data).
 */
import { storage } from "../../storage";
import type { Interaction } from "@shared/schema";

/**
 * RawInteraction — the input shape for interactions being written.
 * Passed in from the agent after processing MCP data.
 *
 * The `source` field distinguishes which MCP adapter produced this interaction.
 * It is used for calendar/granola dedup: only 'calendar' sourced interactions are
 * subject to the "skip if granola meeting exists on same date" rule.
 */
export interface RawInteraction {
  contactId: string;
  channel: string;
  direction: string;
  occurredAt: Date;
  sourceId: string;
  summary: string;
  rawContent?: string;
  openThreads?: string;
  /** MCP source that produced this interaction. Used to apply calendar/granola dedup. */
  source?: "superhuman" | "granola" | "calendar";
}

/**
 * writeInteractions — Write a batch of raw interactions to the database.
 *
 * Applies deduplication before writing:
 * - Skips interactions whose (channel, sourceId) already exist for this user
 * - Skips calendar interactions when a Granola interaction exists for same contact+date
 *
 * @param userId          - The user whose interactions to write
 * @param rawInteractions - Array of raw interaction data to write
 * @returns { written: number, skipped: number }
 */
export async function writeInteractions(
  userId: string,
  rawInteractions: RawInteraction[]
): Promise<{ written: number; skipped: number }> {
  let written = 0;
  let skipped = 0;

  // Pre-fetch Granola interactions for Calendar dedup check
  // (lazily built on first calendar interaction)
  let granolaInteractions: Interaction[] | null = null;

  for (const raw of rawInteractions) {
    // ── Dedup rule 1: source_id exact match ───────────────────────────────
    const existing = await storage.getInteractionBySourceId(raw.channel, raw.sourceId, userId);
    if (existing) {
      skipped++;
      continue;
    }

    // ── Dedup rule 2: Calendar/Granola date dedup ─────────────────────────
    // Only applies to interactions explicitly sourced from Google Calendar.
    // Granola meetings are richer and take precedence — skip calendar if
    // a meeting interaction already exists for same contactId on same date.
    if (raw.channel === "meeting" && raw.source === "calendar") {
      // Lazily load existing meeting interactions for this user
      if (granolaInteractions === null) {
        const allInteractions = await storage.getInteractions(userId);
        granolaInteractions = allInteractions.filter(
          (i) => i.channel === "meeting" && i.sourceId != null
        );
      }

      // Check if a meeting interaction (Granola-sourced) already exists
      // for same contactId on same date (compare YYYY-MM-DD)
      const calendarDate = raw.occurredAt.toISOString().split("T")[0]; // YYYY-MM-DD
      const hasMeetingOnSameDate = granolaInteractions.some((gi) => {
        if (gi.contactId !== raw.contactId) return false;
        const giDate = gi.occurredAt.toISOString().split("T")[0];
        return giDate === calendarDate;
      });

      if (hasMeetingOnSameDate) {
        skipped++;
        continue;
      }
    }

    // ── Write the interaction ─────────────────────────────────────────────
    await storage.createInteraction({
      userId,
      contactId: raw.contactId,
      channel: raw.channel,
      direction: raw.direction,
      occurredAt: raw.occurredAt,
      sourceId: raw.sourceId,
      summary: raw.summary,
      rawContent: raw.rawContent,
      openThreads: raw.openThreads,
    });
    written++;
  }

  return { written, skipped };
}
