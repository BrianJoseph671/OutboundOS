/**
 * Dev-only seed: pending actions + interactions for RelationshipOS UI testing.
 * Used by `npm run dev:seed-actions` and POST /api/dev/seed-relationship-actions (development).
 */
import { storage } from "../storage";

export const RELATIONSHIP_DEV_SEED_VERSION = "relationshipos-dev-seed-v1";

const SOURCE = {
  followupEmail: `${RELATIONSHIP_DEV_SEED_VERSION}-email-followup`,
  meeting: `${RELATIONSHIP_DEV_SEED_VERSION}-meeting`,
  openThread: `${RELATIONSHIP_DEV_SEED_VERSION}-open-thread`,
} as const;

export const RELATIONSHIP_DEV_CONTACT_EMAIL = "dev-seed-contact@local.test";

export type SeedRelationshipActionsResult = {
  userId: string;
  skipped: boolean;
  message: string;
  contactId?: string;
  actionsCreated?: number;
};

export async function seedRelationshipActionsForUser(userId: string): Promise<SeedRelationshipActionsResult> {
  const existing = await storage.getInteractionBySourceId("email", SOURCE.followupEmail, userId);
  if (existing) {
    return {
      userId,
      skipped: true,
      message:
        "Dev seed already present. Delete seed interactions/actions or bump RELATIONSHIP_DEV_SEED_VERSION in server/services/seedRelationshipActions.ts to re-seed.",
    };
  }

  let contact = (await storage.getContacts(userId)).find(
    (c) => c.email?.toLowerCase() === RELATIONSHIP_DEV_CONTACT_EMAIL,
  );

  if (!contact) {
    contact = await storage.createContact({
      userId,
      name: "Vince Signori",
      company: "LangChain",
      email: RELATIONSHIP_DEV_CONTACT_EMAIL,
      tier: "warm",
      tags: "dev-seed",
    });
  }

  const iFollowup = await storage.createInteraction({
    userId,
    contactId: contact.id,
    channel: "email",
    direction: "inbound",
    occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    sourceId: SOURCE.followupEmail,
    summary: "Re: quarterly roadmap — asked for a follow-up on integration timeline",
  });

  await storage.createAction({
    userId,
    contactId: contact.id,
    actionType: "follow_up",
    triggerInteractionId: iFollowup.id,
    priority: 3,
    reason: "Inbound thread: they asked for a concrete timeline; no reply sent yet. [dev-seed]",
  });

  const iMeeting = await storage.createInteraction({
    userId,
    contactId: contact.id,
    channel: "meeting",
    direction: "mutual",
    occurredAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    sourceId: SOURCE.meeting,
    summary: "Zoom intro — discussed partnership; agreed to check in later",
  });

  await storage.createAction({
    userId,
    contactId: contact.id,
    actionType: "reconnect",
    triggerInteractionId: iMeeting.id,
    priority: 1,
    reason: "Warm contact; last touch stale — time to reconnect. [dev-seed]",
  });

  const iThread = await storage.createInteraction({
    userId,
    contactId: contact.id,
    channel: "email",
    direction: "inbound",
    occurredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    sourceId: SOURCE.openThread,
    summary: "RE: contract — waiting on your answer on the redlines",
    openThreads: "Contract redlines (v2 PDF); they asked for a decision by Friday",
  });

  await storage.createAction({
    userId,
    contactId: contact.id,
    actionType: "open_thread",
    triggerInteractionId: iThread.id,
    priority: 2,
    reason: "Open email thread pending your response. [dev-seed]",
  });

  return {
    userId,
    skipped: false,
    message: "Seeded 3 pending actions. Open /actions and refresh.",
    contactId: contact.id,
    actionsCreated: 3,
  };
}
