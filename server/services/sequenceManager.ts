/**
 * Sequence Manager — lifecycle management for multi-step email sequences.
 *
 * Responsibilities:
 *   - Create a sequence from a template or custom steps
 *   - Mark steps as due when scheduledFor <= now
 *   - Mark steps as sent and compute next step's scheduledFor
 *   - Auto-complete sequences when a reply is detected
 *   - Pause/cancel sequences
 *   - Surface due steps as actions in the action queue
 */
import { storage } from "../storage";
import { getGmailThread, listGmailThreads } from "./gmailClient";
import {
  actionMatchesSequence,
  gmailThreadIds,
  replyLookupWindow,
  threadHasContactReplyAfter,
} from "./sequenceReply";
import type { Sequence, SequenceStep, InsertSequenceStep } from "@shared/schema";

/** Placeholder until previous step is sent and real scheduledFor is computed */
const UNSCHEDULED_STEP_DATE = new Date("2099-01-01T00:00:00.000Z");

// ─── Create Sequence ──────────────────────────────────────────────────────────

interface CreateSequenceInput {
  userId: string;
  contactId: string;
  name: string;
  templateId?: string;
  customSteps?: Array<{ stepNumber: number; delayDays: number; instructions: string; subject?: string }>;
}

export async function createSequence(input: CreateSequenceInput): Promise<{
  sequence: Sequence;
  steps: SequenceStep[];
}> {
  // Enforce one active sequence per contact
  const existing = await storage.getSequences(input.userId, {
    contactId: input.contactId,
    status: "active",
  });
  if (existing.length > 0) {
    // Cancel existing active sequence
    for (const seq of existing) {
      await cancelSequence(seq.id, input.userId);
    }
  }

  let stepDefs: Array<{ stepNumber: number; delayDays: number; instructions: string; subject?: string }>;

  if (input.templateId) {
    const template = await storage.getSequenceTemplate(input.templateId, input.userId);
    if (!template) throw new Error("Template not found");
    stepDefs = template.steps as Array<{ stepNumber: number; delayDays: number; instructions: string }>;
  } else if (input.customSteps) {
    stepDefs = input.customSteps;
  } else {
    throw new Error("Either templateId or customSteps is required");
  }

  const sequence = await storage.createSequence({
    userId: input.userId,
    contactId: input.contactId,
    name: input.name,
    status: "active",
    templateId: input.templateId || null,
  });

  const now = new Date();
  const steps: SequenceStep[] = [];

  for (const def of stepDefs) {
    const scheduledFor =
      def.stepNumber === 1
        ? new Date(now.getTime() + def.delayDays * 24 * 60 * 60 * 1000)
        : UNSCHEDULED_STEP_DATE;

    const step = await storage.createSequenceStep({
      sequenceId: sequence.id,
      stepNumber: def.stepNumber,
      delayDays: def.delayDays,
      subject: def.subject || null,
      instructions: def.instructions,
      status: "pending",
      scheduledFor,
    });
    steps.push(step);
  }

  return { sequence, steps };
}

// ─── Mark Step Due ────────────────────────────────────────────────────────────

/**
 * Check all active sequences for pending steps whose scheduledFor <= now.
 * Mark them as 'due' and create sequence_step actions in the action queue.
 */
export async function processDueSteps(userId: string): Promise<number> {
  const dueSteps = await storage.getDueSequenceSteps(userId);
  let count = 0;

  for (const step of dueSteps) {
    await storage.updateSequenceStep(step.id, { status: "due" });

    // Create an action for the due step
    try {
      await storage.createAction({
        userId,
        contactId: step.contactId,
        actionType: "sequence_step",
        triggerInteractionId: null,
        priority: step.stepNumber,
        status: "pending",
        reason: `Step ${step.stepNumber} of "${step.sequenceName}" is due`,
        snoozedUntil: null,
      });
    } catch { /* dedup — action may already exist */ }

    count++;
  }

  return count;
}

// ─── Mark Step Sent ───────────────────────────────────────────────────────────

export async function markStepSent(
  stepId: string,
  userId: string,
  draftId?: string,
  threadId?: string,
): Promise<SequenceStep | undefined> {
  const step = await storage.getSequenceStep(stepId);
  if (!step) return undefined;

  const seq = await storage.getSequence(step.sequenceId, userId);
  if (!seq) return undefined;

  const now = new Date();
  const updated = await storage.updateSequenceStep(stepId, {
    status: "sent",
    sentAt: now,
    draftId: draftId || null,
    threadId: threadId || null,
  });

  // Compute next step's scheduledFor based on sent_at + delayDays
  const allSteps = await storage.getSequenceSteps(step.sequenceId);
  const nextStep = allSteps.find((s) => s.stepNumber === step.stepNumber + 1 && s.status === "pending");
  if (nextStep) {
    const nextScheduled = new Date(now.getTime() + nextStep.delayDays * 24 * 60 * 60 * 1000);
    await storage.updateSequenceStep(nextStep.id, { scheduledFor: nextScheduled });
  } else {
    // No more steps — check if all steps are sent/skipped
    const remaining = allSteps.filter((s) => s.status === "pending" || s.status === "due");
    if (remaining.length === 0) {
      await storage.updateSequence(seq.id, userId, { status: "completed" });
    }
  }

  await completeOpenSequenceActions(userId, seq.contactId, seq.name);

  return updated;
}

// ─── Reply Detection (Auto-Complete) ──────────────────────────────────────────

/**
 * Check active sequences for reply detection.
 * If an inbound email from the sequence contact is found, auto-complete the sequence.
 */
export async function checkReplyAndAutoComplete(userId: string): Promise<number> {
  const activeSequences = await storage.getSequences(userId, { status: "active" });
  let completed = 0;

  for (const seq of activeSequences) {
    const contact = await storage.getContact(seq.contactId, userId);
    if (!contact?.email) continue;

    const steps = await storage.getSequenceSteps(seq.id);
    const sentSteps = steps.filter((s) => s.status === "sent");
    if (sentSteps.length === 0) continue;

    const lastSentAt = sentSteps
      .map((s) => s.sentAt)
      .filter(Boolean)
      .sort((a, b) => b!.getTime() - a!.getTime())[0] as Date;

    const sequenceThreadIds = gmailThreadIds(sentSteps.map((s) => s.threadId));

    let replyDetected = false;

    try {
      replyDetected = await detectSequenceReply(userId, contact.email, lastSentAt, sequenceThreadIds);
    } catch (err) {
      console.warn("[SequenceManager] Gmail reply check failed, falling back to interactions:", err);
      const interactions = await storage.getInteractions(userId, seq.contactId);
      replyDetected = interactions.some(
        (i) =>
          i.direction === "inbound" &&
          i.channel === "email" &&
          i.occurredAt.getTime() > lastSentAt.getTime(),
      );
    }

    if (replyDetected) {
      await completeSequence(seq.id, userId, "They replied!");
      completed++;
    }
  }

  return completed;
}

// ─── Pause / Resume / Cancel ──────────────────────────────────────────────────

export async function pauseSequence(sequenceId: string, userId: string): Promise<Sequence | undefined> {
  return storage.updateSequence(sequenceId, userId, { status: "paused" });
}

export async function resumeSequence(sequenceId: string, userId: string): Promise<Sequence | undefined> {
  return storage.updateSequence(sequenceId, userId, { status: "active" });
}

export async function cancelSequence(sequenceId: string, userId: string): Promise<Sequence | undefined> {
  const steps = await storage.getSequenceSteps(sequenceId);
  for (const step of steps) {
    if (step.status === "pending" || step.status === "due") {
      await storage.updateSequenceStep(step.id, { status: "skipped" });
    }
  }
  return storage.updateSequence(sequenceId, userId, { status: "cancelled" });
}

async function detectSequenceReply(
  userId: string,
  contactEmail: string,
  lastSentAt: Date,
  sequenceThreadIds: string[],
): Promise<boolean> {
  if (sequenceThreadIds.length > 0) {
    let loadedAny = false;
    for (const threadId of sequenceThreadIds) {
      try {
        const thread = await getGmailThread(userId, threadId);
        loadedAny = true;
        if (threadHasContactReplyAfter(thread, contactEmail, lastSentAt)) return true;
      } catch (err) {
        console.warn("[SequenceManager] Failed to load sequence thread", threadId, err);
      }
    }
    if (loadedAny) return false;
    throw new Error("Failed to load sequence threads");
  }

  const window = replyLookupWindow(lastSentAt);
  const gmailResult = await listGmailThreads(userId, {
    ...window,
    from: [contactEmail],
    limit: 30,
  });
  return (gmailResult.threads || []).some((thread) =>
    threadHasContactReplyAfter(thread, contactEmail, lastSentAt),
  );
}

async function completeOpenSequenceActions(
  userId: string,
  contactId: string,
  sequenceName: string,
): Promise<void> {
  const actions = await storage.getActions(userId, { type: "sequence_step" });
  for (const action of actions) {
    if (action.status !== "pending" && action.status !== "snoozed") continue;
    if (action.contactId === contactId && actionMatchesSequence(action.reason, sequenceName)) {
      await storage.updateAction(action.id, userId, { status: "completed" });
    }
  }
}

async function completeSequence(sequenceId: string, userId: string, _reason: string): Promise<void> {
  const seq = await storage.getSequence(sequenceId, userId);
  if (!seq) return;

  const steps = await storage.getSequenceSteps(sequenceId);
  for (const step of steps) {
    if (step.status === "pending" || step.status === "due") {
      await storage.updateSequenceStep(step.id, { status: "skipped" });
    }
  }
  await storage.updateSequence(sequenceId, userId, { status: "completed" });
  await completeOpenSequenceActions(userId, seq.contactId, seq.name);
}

// ─── Default Templates ────────────────────────────────────────────────────────

export const DEFAULT_TEMPLATES = [
  {
    name: "Networking 3-Touch",
    steps: [
      { stepNumber: 1, delayDays: 0, instructions: "Send initial networking outreach. Reference shared context (ND connection, mutual contact, company interest). Ask for a 15-min chat." },
      { stepNumber: 2, delayDays: 3, instructions: "Brief follow-up bump. Reference the initial email. Keep it to 2-3 sentences. Add one new piece of value or context." },
      { stepNumber: 3, delayDays: 5, instructions: "Final touch. Acknowledge they're busy. Leave the door open. Make it easy to say yes or no." },
    ],
  },
  {
    name: "Post-Meeting Follow-Up",
    steps: [
      { stepNumber: 1, delayDays: 0, instructions: "Thank you email referencing specific topics discussed in the meeting. Mention any commitments made. Ask one follow-up question." },
      { stepNumber: 2, delayDays: 7, instructions: "Check-in if they mentioned doing something for you (intro, resource, etc). Keep it brief and easy to respond to." },
    ],
  },
  {
    name: "Warm Reconnect",
    steps: [
      { stepNumber: 1, delayDays: 0, instructions: "Reconnect message. Reference the last meaningful interaction. Share something relevant (article, company news, personal update). Suggest catching up." },
      { stepNumber: 2, delayDays: 5, instructions: "Light follow-up if no response. Even shorter. Just nudge with availability." },
    ],
  },
];

export async function seedDefaultTemplates(userId: string): Promise<void> {
  const existing = await storage.getSequenceTemplates(userId);
  if (existing.length > 0) return;

  for (const template of DEFAULT_TEMPLATES) {
    await storage.createSequenceTemplate({
      userId,
      name: template.name,
      steps: template.steps,
    });
  }
}
