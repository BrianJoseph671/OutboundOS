import { describe, expect, it } from "vitest";
import {
  shouldAutoAcceptSignature,
  shouldPersistContactForSignatures,
} from "../services/indexReviewRules";

describe("index review rule filtering", () => {
  it("filters contacts whose only evidence is rejected signatures", () => {
    const rejected = new Set(["newsletter", "receipt"]);

    expect(shouldPersistContactForSignatures(new Set(["newsletter", "receipt"]), rejected)).toBe(false);
  });

  it("keeps contacts that have accepted evidence alongside rejected signatures", () => {
    const rejected = new Set(["newsletter"]);

    expect(shouldPersistContactForSignatures(new Set(["newsletter", "direct-thread"]), rejected)).toBe(true);
  });

  it("keeps contacts when there are no rejected signatures or no signature evidence", () => {
    expect(shouldPersistContactForSignatures(new Set(["direct-thread"]), new Set())).toBe(true);
    expect(shouldPersistContactForSignatures(undefined, new Set(["newsletter"]))).toBe(true);
  });

  it("does not auto-accept a signature the user already rejected", () => {
    expect(shouldAutoAcceptSignature("newsletter", new Set(["newsletter"]))).toBe(false);
    expect(shouldAutoAcceptSignature("direct-thread", new Set(["newsletter"]))).toBe(true);
  });
});
