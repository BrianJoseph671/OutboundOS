/**
 * Sync Recent persists one email row per Gmail message. The writer treats
 * (channel, sourceId) as an idempotency key and will not update an existing
 * row. A later reply on a thread that was already synced must therefore use
 * a new source id, or the reply is dropped and no follow-up is created.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  pool: { end: async () => {} },
  db: {},
}));

vi.mock("../storage", () => ({
  storage: {},
}));

import { mapEmailToInteraction } from "../agent/adapters/superhuman";
import type { SuperhumanEmail } from "@shared/types/mcp";

function email(overrides: Partial<SuperhumanEmail> = {}): SuperhumanEmail {
  return {
    messageId: "msg-outbound",
    threadId: "thread-1",
    from: "brian@nd.edu",
    to: ["alice@example.com"],
    cc: [],
    subject: "Hello",
    date: "2026-04-01T10:00:00Z",
    snippet: "Wanted to reconnect.",
    hasAttachments: false,
    ...overrides,
  };
}

describe("mapEmailToInteraction source id", () => {
  it("keys the interaction by message id so a later reply is a new row", () => {
    const outbound = mapEmailToInteraction(email(), "contact-1", "brian@nd.edu");
    const reply = mapEmailToInteraction(
      email({
        messageId: "msg-reply",
        from: "alice@example.com",
        to: ["brian@nd.edu"],
        subject: "Re: Hello",
        date: "2026-04-02T15:00:00Z",
        snippet: "Yes, let's talk.",
      }),
      "contact-1",
      "brian@nd.edu",
    );

    expect(outbound.sourceId).toBe("msg-outbound");
    expect(outbound.direction).toBe("outbound");
    expect(reply.sourceId).toBe("msg-reply");
    expect(reply.direction).toBe("inbound");
    expect(reply.sourceId).not.toBe(outbound.sourceId);
    expect(reply.contactId).toBe(outbound.contactId);
  });

  it("keeps the same source id when the same message is synced again", () => {
    const first = mapEmailToInteraction(email(), "contact-1", "brian@nd.edu");
    const second = mapEmailToInteraction(email(), "contact-1", "brian@nd.edu");
    expect(second.sourceId).toBe(first.sourceId);
  });

  it("falls back to the thread id when Gmail omits the message id", () => {
    const mapped = mapEmailToInteraction(
      email({ messageId: "  " }),
      "contact-1",
      "brian@nd.edu",
    );
    expect(mapped.sourceId).toBe("thread-1");
  });
});
