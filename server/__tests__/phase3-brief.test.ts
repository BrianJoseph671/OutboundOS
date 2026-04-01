/**
 * Phase 3 Brief Generator Tests.
 *
 * Tests:
 * 1. Brief generation returns all 5 sections populated
 * 2. Brief caching: second call <24h returns cached brief without regeneration
 * 3. Regenerate (force=true) bypasses cache
 * 4. Brief fallback text on Claude API failure
 * 5. Model version logged in brief
 * 6. Contact not found → throws
 * 7. Zero interactions → still produces valid brief
 * 8. Claude response parsing (valid and invalid JSON)
 * 9. BriefSource mapping from interactions
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { users, contacts, interactions, contactBriefs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import {
  generateBrief,
  buildFallbackBrief,
  buildClaudePrompt,
  parseClaudeResponse,
  BRIEF_CACHE_HOURS,
} from "../services/briefGenerator";
import type { BriefGeneratorDeps } from "../services/briefGenerator";

const testIds = {
  userIds: [] as string[],
  contactIds: [] as string[],
  interactionIds: [] as string[],
  briefIds: [] as string[],
};

afterAll(async () => {
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

beforeAll(async () => {
  const user = await storage.createUser({
    username: `brief-test-${Date.now()}`,
    password: "test123",
  });
  testUserId = user.id;
  testIds.userIds.push(user.id);

  const contact = await storage.createContact({
    userId: testUserId,
    name: "Brief Test Contact",
    company: "BriefCorp",
    email: "brief@test.com",
  });
  testContactId = contact.id;
  testIds.contactIds.push(contact.id);

  // Add some interactions
  for (let i = 0; i < 5; i++) {
    const interaction = await storage.createInteraction({
      userId: testUserId,
      contactId: testContactId,
      channel: i % 2 === 0 ? "email" : "meeting",
      direction: "inbound",
      occurredAt: new Date(Date.now() - i * 86400000),
      sourceId: `brief-src-${Date.now()}-${i}`,
      summary: `Interaction ${i}: discussed Q${i + 1} plans`,
      openThreads: i === 0 ? "Follow up on pricing" : null,
    });
    testIds.interactionIds.push(interaction.id);
  }
});

// =============================================================================
// 1. Brief generation returns all 5 sections populated
// =============================================================================
describe("Brief generation — section completeness", () => {
  it("returns all 5 sections populated for a contact with interactions", async () => {
    const brief = await generateBrief(testContactId, testUserId, { force: true });
    expect(brief.contactId).toBe(testContactId);
    expect(brief.sections).toBeDefined();
    expect(brief.sections.relationshipSummary).toBeTruthy();
    expect(brief.sections.recentInteractions).toBeTruthy();
    expect(brief.sections.openThreads).toBeTruthy();
    expect(brief.sections.relationshipHealth).toBeTruthy();
    expect(brief.sections.suggestedApproach).toBeTruthy();
    expect(brief.generatedAt).toBeTruthy();
    expect(brief.modelVersion).toBeTruthy();
  });

  it("includes sources from interactions", async () => {
    const brief = await generateBrief(testContactId, testUserId, { force: true });
    expect(brief.sources.length).toBeGreaterThan(0);
    expect(brief.sources.length).toBeLessThanOrEqual(5);
    for (const source of brief.sources) {
      expect(["email", "meeting", "calendar"]).toContain(source.type);
      expect(source.summary).toBeTruthy();
      expect(source.date).toBeTruthy();
    }
  });
});

// =============================================================================
// 2. Brief caching — second call <24h returns cached
// =============================================================================
describe("Brief caching", () => {
  it("returns cached brief on second call within 24h", async () => {
    const first = await generateBrief(testContactId, testUserId, { force: true });
    const second = await generateBrief(testContactId, testUserId);
    expect(second.generatedAt).toBe(first.generatedAt);
    expect(second.sections.relationshipSummary).toBe(first.sections.relationshipSummary);
  });
});

// =============================================================================
// 3. Force regeneration bypasses cache
// =============================================================================
describe("Brief regeneration", () => {
  it("force=true regenerates even when cache is fresh", async () => {
    const first = await generateBrief(testContactId, testUserId, { force: true });
    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 50));
    const second = await generateBrief(testContactId, testUserId, { force: true });
    expect(second.generatedAt).not.toBe(first.generatedAt);
  });
});

// =============================================================================
// 4. Fallback brief on Claude API failure
// =============================================================================
describe("Brief fallback on Claude failure", () => {
  it("returns fallback brief when callClaude throws", async () => {
    const deps: BriefGeneratorDeps = {
      getInteractions: storage.getInteractions.bind(storage),
      getContact: storage.getContact.bind(storage),
      getContactBrief: storage.getContactBrief.bind(storage),
      upsertContactBrief: storage.upsertContactBrief.bind(storage),
      callClaude: async () => { throw new Error("Claude API unavailable"); },
    };
    const brief = await generateBrief(testContactId, testUserId, { force: true, deps });
    expect(brief.modelVersion).toBe("fallback");
    expect(brief.sections.relationshipSummary).toContain("Brief Test Contact");
  });

  it("returns fallback when Claude returns invalid JSON", async () => {
    const deps: BriefGeneratorDeps = {
      getInteractions: storage.getInteractions.bind(storage),
      getContact: storage.getContact.bind(storage),
      getContactBrief: storage.getContactBrief.bind(storage),
      upsertContactBrief: storage.upsertContactBrief.bind(storage),
      callClaude: async () => "This is not JSON at all",
    };
    const brief = await generateBrief(testContactId, testUserId, { force: true, deps });
    expect(brief.modelVersion).toBe("fallback");
  });
});

// =============================================================================
// 5. Model version logged in brief
// =============================================================================
describe("Brief model version", () => {
  it("logs model version in the brief (fallback when no Claude key)", async () => {
    const brief = await generateBrief(testContactId, testUserId, { force: true });
    expect(brief.modelVersion).toBeTruthy();
    // Without ANTHROPIC_API_KEY and no callClaude, should be "fallback"
    expect(brief.modelVersion).toBe("fallback");
  });

  it("uses real model version when Claude succeeds", async () => {
    const validSections = JSON.stringify({
      relationshipSummary: "Test relationship",
      recentInteractions: "Recent test interactions",
      openThreads: "No open threads",
      relationshipHealth: "Healthy",
      suggestedApproach: "Follow up next week",
    });
    const deps: BriefGeneratorDeps = {
      getInteractions: storage.getInteractions.bind(storage),
      getContact: storage.getContact.bind(storage),
      getContactBrief: storage.getContactBrief.bind(storage),
      upsertContactBrief: storage.upsertContactBrief.bind(storage),
      callClaude: async () => validSections,
    };
    const brief = await generateBrief(testContactId, testUserId, { force: true, deps });
    expect(brief.modelVersion).toBe("claude-sonnet-4-20250514");
    expect(brief.sections.relationshipSummary).toBe("Test relationship");
  });
});

// =============================================================================
// 6. Contact not found → throws
// =============================================================================
describe("Brief — contact not found", () => {
  it("throws when contact does not exist", async () => {
    await expect(
      generateBrief("nonexistent-contact-id", testUserId, { force: true })
    ).rejects.toThrow("not found");
  });
});

// =============================================================================
// 7. Zero interactions → still produces valid brief
// =============================================================================
describe("Brief — zero interactions", () => {
  it("produces valid brief with empty interactions", async () => {
    const contact = await storage.createContact({
      userId: testUserId,
      name: "Empty Contact",
      company: "NoCorp",
    });
    testIds.contactIds.push(contact.id);

    const brief = await generateBrief(contact.id, testUserId, { force: true });
    expect(brief.contactId).toBe(contact.id);
    expect(brief.sections.relationshipSummary).toContain("Empty Contact");
    expect(brief.sections.recentInteractions).toBeTruthy();
    expect(brief.sources).toHaveLength(0);
  });
});

// =============================================================================
// 8. Claude response parsing
// =============================================================================
describe("parseClaudeResponse", () => {
  it("parses valid JSON with all 5 keys", () => {
    const raw = JSON.stringify({
      relationshipSummary: "A",
      recentInteractions: "B",
      openThreads: "C",
      relationshipHealth: "D",
      suggestedApproach: "E",
    });
    const result = parseClaudeResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.relationshipSummary).toBe("A");
  });

  it("handles markdown-wrapped JSON", () => {
    const raw = "```json\n" + JSON.stringify({
      relationshipSummary: "A",
      recentInteractions: "B",
      openThreads: "C",
      relationshipHealth: "D",
      suggestedApproach: "E",
    }) + "\n```";
    const result = parseClaudeResponse(raw);
    expect(result).not.toBeNull();
  });

  it("returns null for missing keys", () => {
    const raw = JSON.stringify({ relationshipSummary: "A" });
    const result = parseClaudeResponse(raw);
    expect(result).toBeNull();
  });

  it("returns null for non-JSON", () => {
    const result = parseClaudeResponse("not json");
    expect(result).toBeNull();
  });
});

// =============================================================================
// 9. buildFallbackBrief unit test
// =============================================================================
describe("buildFallbackBrief", () => {
  it("builds correct sections from interactions", () => {
    const interactions = [
      {
        channel: "email",
        summary: "Discussed Q1",
        occurredAt: new Date("2026-03-20"),
        sourceId: "src-1",
        direction: "inbound",
        openThreads: "Pricing follow-up",
      },
      {
        channel: "meeting",
        summary: "Quarterly review",
        occurredAt: new Date("2026-03-15"),
        sourceId: "src-2",
        direction: "outbound",
        openThreads: null,
      },
    ];
    const brief = buildFallbackBrief("c-1", "Test User", interactions);
    expect(brief.sections.relationshipSummary).toContain("Test User");
    expect(brief.sections.relationshipSummary).toContain("2 total interactions");
    expect(brief.sections.recentInteractions).toContain("Discussed Q1");
    expect(brief.sections.openThreads).toContain("Pricing follow-up");
    expect(brief.modelVersion).toBe("fallback");
  });
});

// =============================================================================
// 10. buildClaudePrompt
// =============================================================================
describe("buildClaudePrompt", () => {
  it("includes contact name and interaction data", () => {
    const prompt = buildClaudePrompt("Alice", [
      {
        channel: "email",
        summary: "Intro email",
        occurredAt: new Date("2026-03-20"),
        direction: "outbound",
        openThreads: null,
      },
    ]);
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Intro email");
    expect(prompt).toContain("relationshipSummary");
  });
});

// =============================================================================
// 11. Storage layer — upsert contact brief
// =============================================================================
describe("Storage — contactBriefs", () => {
  it("upserts and retrieves a contact brief", async () => {
    const briefData = {
      contactId: testContactId,
      sections: {
        relationshipSummary: "Test",
        recentInteractions: "Test",
        openThreads: "Test",
        relationshipHealth: "Test",
        suggestedApproach: "Test",
      },
      sources: [],
      generatedAt: new Date().toISOString(),
      modelVersion: "test",
    };

    const upserted = await storage.upsertContactBrief(testContactId, testUserId, {
      briefData: briefData as unknown as Record<string, unknown>,
      modelVersion: "test",
      generatedAt: new Date(),
    });
    expect(upserted.contactId).toBe(testContactId);

    const retrieved = await storage.getContactBrief(testContactId, testUserId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.contactId).toBe(testContactId);
  });

  it("upsert overwrites existing brief for same contact+user", async () => {
    const first = await storage.upsertContactBrief(testContactId, testUserId, {
      briefData: { version: 1 } as Record<string, unknown>,
      modelVersion: "v1",
      generatedAt: new Date(),
    });

    const second = await storage.upsertContactBrief(testContactId, testUserId, {
      briefData: { version: 2 } as Record<string, unknown>,
      modelVersion: "v2",
      generatedAt: new Date(),
    });

    expect(second.id).toBe(first.id);
    expect(second.modelVersion).toBe("v2");
  });
});
