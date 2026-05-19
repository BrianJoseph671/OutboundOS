import { describe, expect, it } from "vitest";
import {
  selectIndexReviewCandidates,
  shouldPersistAutoAcceptedCandidate,
} from "../services/indexReviewSelection";

function candidate(signatureHash: string, source: "label" | "subject") {
  return { signatureHash, source };
}

describe("index review selection", () => {
  it("keeps every Gmail label candidate in review even beyond the visible subject cap", () => {
    const ranked = [
      ...Array.from({ length: 22 }, (_, i) => candidate(`label-${i}`, "label")),
      ...Array.from({ length: 5 }, (_, i) => candidate(`subject-${i}`, "subject")),
    ];

    const { reviewItems, autoAcceptedItems } = selectIndexReviewCandidates(ranked);

    expect(reviewItems.filter((item) => item.source === "label")).toHaveLength(22);
    expect(autoAcceptedItems.some((item) => item.source === "label")).toBe(false);
  });

  it("does not persist auto-accept rules over prior rejections", () => {
    const rejectedSignatures = new Set(["subject-rejected"]);

    expect(
      shouldPersistAutoAcceptedCandidate(candidate("subject-rejected", "subject"), rejectedSignatures),
    ).toBe(false);
    expect(
      shouldPersistAutoAcceptedCandidate(candidate("subject-new", "subject"), rejectedSignatures),
    ).toBe(true);
  });
});
