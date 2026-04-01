/**
 * Phase 3 Compose Service Tests.
 *
 * Tests:
 * 1. POST /compose returns ComposeResponse shape
 * 2. POST /compose/revise preserves draft_id
 * 3. Compose logs to drafts_log table
 * 4. Different presets produce different instruction enrichments
 * 5. Missing required fields → 400
 * 6. enrichInstructions unit tests
 * 7. briefToContext unit tests
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { users, contacts, actions, interactions, draftsLog, contactBriefs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import {
  createDraft,
  reviseDraft,
  enrichInstructions,
  briefToContext,
  PRESET_ENRICHMENTS,
  type ComposeServiceDeps,
} from "../services/composeService";
import type { ComposeRequest, ReviseRequest, ContactBrief } from "@shared/types/draft";

const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  actionIds: [] as string[],
  interactionIds: [] as string[],
  draftLogIds: [] as string[],
};

afterAll(async () => {
  for (const id of testIds.draftLogIds) {
    await db.delete(draftsLog).where(eq(draftsLog.id, id)).catch(() => {});
  }
  for (const id of testIds.actionIds) {
    await db.delete(actions).where(eq(actions.id, id)).catch(() => {});
  }
  for (const cid of testIds.contactIds) {
    for (const uid of testIds.userIds) {
      await db.delete(contactBriefs)
        .where(and(eq(contactBriefs.contactId, cid), eq(contactBriefs.userId, uid)))
        .catch(() => {});
    }
  }
  for (const id of testIds.interactionIds) {
    await db.delete(interactions).where(eq(interactions.id, id)).catch(() => {});
  }
  for (const id of testIds.contactIds) {
    await db.delete(contacts).where(eq(contacts.id, id)).catch(() => {});
  }
  for (const id of testIds.userIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
});

let testUserId: string;
let testContactId: string;
let testActionId: string;
let testTriggerId: string;

beforeAll(async () => {
  const user = await storage.createUser({
    username: `compose-test-${Date.now()}`,
    password: "test123",
  });
  testUserId = user.id;
  testIds.userIds.push(user.id);

  const contact = await storage.createContact({
    userId: testUserId,
    name: "Compose Test Contact",
    company: "ComposeCorp",
    email: "compose@test.com",
  });
  testContactId = contact.id;
  testIds.contactIds.push(contact.id);

  const interaction = await storage.createInteraction({
    userId: testUserId,
    contactId: testContactId,
    channel: "email",
    direction: "inbound",
    occurredAt: new Date(),
    sourceId: `compose-src-${Date.now()}`,
    summary: "Discussed pricing proposal",
  });
  testTriggerId = interaction.id;
  testIds.interactionIds.push(interaction.id);

  const action = await storage.createAction({
    userId: testUserId,
    contactId: testContactId,
    actionType: "follow_up",
    triggerInteractionId: testTriggerId,
    priority: 2,
    reason: "Meeting ended — no follow-up sent",
  });
  testActionId = action.id;
  testIds.actionIds.push(action.id);
});

// =============================================================================
// 1. createDraft returns ComposeResponse shape
// =============================================================================
describe("createDraft — ComposeResponse shape", () => {
  it("returns draftId, draftThreadId, to, subject, body", async () => {
    const req: ComposeRequest = {
      actionId: testActionId,
      contactId: testContactId,
      instructions: "Write a follow-up about pricing",
      playType: "warm",
      to: "compose@test.com",
      subject: "Re: Pricing",
    };
    const result = await createDraft(req, testUserId);
    expect(result.draftId).toBeTruthy();
    expect(result.draftThreadId).toBeTruthy();
    expect(typeof result.to).toBe("string");
    expect(typeof result.subject).toBe("string");
    expect(typeof result.body).toBe("string");
    expect(result.body.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 2. reviseDraft preserves draftId
// =============================================================================
describe("reviseDraft — preserves draft identity", () => {
  it("returns same draftId and draftThreadId", async () => {
    const composeReq: ComposeRequest = {
      actionId: testActionId,
      contactId: testContactId,
      instructions: "Draft initial message",
      to: "compose@test.com",
    };
    const initial = await createDraft(composeReq, testUserId);

    const reviseReq: ReviseRequest = {
      draftId: initial.draftId,
      draftThreadId: initial.draftThreadId,
      instructions: "Make it shorter and more direct",
      actionId: testActionId,
      contactId: testContactId,
    };
    const revised = await reviseDraft(reviseReq, testUserId);
    expect(revised.draftId).toBe(initial.draftId);
    expect(revised.draftThreadId).toBe(initial.draftThreadId);
  });
});

// =============================================================================
// 3. Compose logs to drafts_log
// =============================================================================
describe("Compose — drafts_log logging", () => {
  it("creates a drafts_log entry on compose", async () => {
    const beforeLogs = await storage.getDraftsLogs(testUserId, testContactId);
    const beforeCount = beforeLogs.length;

    await createDraft({
      actionId: testActionId,
      contactId: testContactId,
      instructions: "Test logging",
    }, testUserId);

    const afterLogs = await storage.getDraftsLogs(testUserId, testContactId);
    expect(afterLogs.length).toBe(beforeCount + 1);

    const latest = afterLogs[0];
    expect(latest.actionId).toBe(testActionId);
    expect(latest.instructions).toBe("Test logging");
    expect(latest.generatedBody).toBeTruthy();
    testIds.draftLogIds.push(latest.id);
  });

  it("creates a drafts_log entry on revise", async () => {
    const initial = await createDraft({
      actionId: testActionId,
      contactId: testContactId,
      instructions: "Initial for revise test",
    }, testUserId);

    const beforeLogs = await storage.getDraftsLogs(testUserId, testContactId);
    const beforeCount = beforeLogs.length;

    await reviseDraft({
      draftId: initial.draftId,
      draftThreadId: initial.draftThreadId,
      instructions: "Revise test",
      actionId: testActionId,
      contactId: testContactId,
    }, testUserId);

    const afterLogs = await storage.getDraftsLogs(testUserId, testContactId);
    expect(afterLogs.length).toBe(beforeCount + 1);
    testIds.draftLogIds.push(afterLogs[0].id);
  });
});

// =============================================================================
// 4. Different presets produce different enrichments
// =============================================================================
describe("Presets — distinct enrichments", () => {
  it("warm preset includes warm-specific enrichment", async () => {
    const req: ComposeRequest = {
      actionId: testActionId,
      contactId: testContactId,
      instructions: "Follow up",
      playType: "warm",
    };
    const result = await createDraft(req, testUserId);
    // The mock body includes enriched instructions which contain preset text
    expect(result.body).toContain("warm follow-up");
  });

  it("cold preset includes cold-specific enrichment", async () => {
    const req: ComposeRequest = {
      actionId: testActionId,
      contactId: testContactId,
      instructions: "Reach out",
      playType: "cold",
    };
    const result = await createDraft(req, testUserId);
    expect(result.body).toContain("cold/professional");
  });

  it("intro preset includes intro-specific enrichment", async () => {
    const req: ComposeRequest = {
      actionId: testActionId,
      contactId: testContactId,
      instructions: "Request intro",
      playType: "intro",
    };
    const result = await createDraft(req, testUserId);
    expect(result.body).toContain("introduction");
  });
});

// =============================================================================
// 5. enrichInstructions unit tests
// =============================================================================
describe("enrichInstructions", () => {
  it("includes user instructions", () => {
    const result = enrichInstructions("my instructions", "brief context", null, null);
    expect(result).toContain("my instructions");
    expect(result).toContain("brief context");
  });

  it("includes trigger context when provided", () => {
    const result = enrichInstructions("instruct", "brief", "trigger info", null);
    expect(result).toContain("trigger info");
  });

  it("includes preset enrichment for warm", () => {
    const result = enrichInstructions("instruct", "brief", null, "warm");
    expect(result).toContain(PRESET_ENRICHMENTS.warm);
  });

  it("includes preset enrichment for cold", () => {
    const result = enrichInstructions("instruct", "brief", null, "cold");
    expect(result).toContain(PRESET_ENRICHMENTS.cold);
  });

  it("includes preset enrichment for intro", () => {
    const result = enrichInstructions("instruct", "brief", null, "intro");
    expect(result).toContain(PRESET_ENRICHMENTS.intro);
  });
});

// =============================================================================
// 6. briefToContext unit tests
// =============================================================================
describe("briefToContext", () => {
  it("formats all 5 sections as key: value lines", () => {
    const brief: ContactBrief = {
      contactId: "c-1",
      sections: {
        relationshipSummary: "Summary text",
        recentInteractions: "Recent text",
        openThreads: "Threads text",
        relationshipHealth: "Health text",
        suggestedApproach: "Approach text",
      },
      sources: [],
      generatedAt: new Date().toISOString(),
      modelVersion: "test",
    };
    const context = briefToContext(brief);
    expect(context).toContain("relationshipSummary: Summary text");
    expect(context).toContain("recentInteractions: Recent text");
    expect(context).toContain("openThreads: Threads text");
    expect(context).toContain("relationshipHealth: Health text");
    expect(context).toContain("suggestedApproach: Approach text");
  });
});
