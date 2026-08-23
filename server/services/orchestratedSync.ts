/**
 * Orchestrated sync — runs network incremental index, agent adapters,
 * sequence due/reply processing, and action detection in one flow.
 */
import { runSync } from "../agent/index";
import { runIncrementalSync } from "./networkIndexer";
import { processDueSteps, checkReplyAndAutoComplete } from "./sequenceManager";
import { storage } from "../storage";
import type { SyncResponse } from "@shared/types/actions";

export interface OrchestratedSyncResponse extends SyncResponse {
  networkJobId: string | null;
  threadsScanned: number;
  contactsUpdated: number;
  dueStepsProcessed: number;
  sequencesAutoCompleted: number;
}

export async function runOrchestratedSync(userId: string): Promise<OrchestratedSyncResponse> {
  const errors: string[] = [];
  let networkJobId: string | null = null;
  let threadsScanned = 0;
  let contactsUpdated = 0;
  let newInteractions = 0;
  let newActions = 0;
  let dueStepsProcessed = 0;
  let sequencesAutoCompleted = 0;

  const user = await storage.getUser(userId);
  const userEmail = user?.email;
  if (!userEmail) {
    return {
      newInteractions: 0,
      newActions: 0,
      errors: ["User email not found. Connect your Google account first."],
      networkJobId: null,
      threadsScanned: 0,
      contactsUpdated: 0,
      dueStepsProcessed: 0,
      sequencesAutoCompleted: 0,
    };
  }

  // 1. Network incremental sync (Gmail scan, warmth, interactions, actions)
  try {
    const networkResult = await runIncrementalSync(userId, userEmail);
    networkJobId = networkResult.jobId;
    threadsScanned = networkResult.threadsScanned;
    contactsUpdated = networkResult.contactsUpdated;
    errors.push(...networkResult.errors);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Network sync failed: ${msg}`);
  }

  // 2. Agent sync (Superhuman/Gmail live, Granola, Calendar adapters)
  try {
    const agentResult = await runSync(userId, userEmail);
    newInteractions += agentResult.newInteractions;
    newActions += agentResult.newActions;
    errors.push(...agentResult.errors);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Agent sync failed: ${msg}`);
  }

  // 3. Sequence due steps + reply auto-complete
  try {
    dueStepsProcessed = await processDueSteps(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Sequence due processing failed: ${msg}`);
  }

  try {
    sequencesAutoCompleted = await checkReplyAndAutoComplete(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Sequence reply detection failed: ${msg}`);
  }

  return {
    newInteractions,
    newActions,
    errors,
    networkJobId,
    threadsScanned,
    contactsUpdated,
    dueStepsProcessed,
    sequencesAutoCompleted,
  };
}
