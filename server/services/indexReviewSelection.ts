export const MAX_REVIEW_ITEMS = 20;

type ReviewCandidate = {
  signatureHash: string;
  source?: string;
};

export function selectIndexReviewCandidates<T extends ReviewCandidate>(
  ranked: T[],
  maxReviewItems = MAX_REVIEW_ITEMS,
): { reviewItems: T[]; autoAcceptedItems: T[] } {
  const reviewItems = ranked.filter((item, index) => (
    item.source === "label" || index < maxReviewItems
  ));
  const autoAcceptedItems = ranked.filter((item, index) => (
    item.source !== "label" && index >= maxReviewItems
  ));

  return { reviewItems, autoAcceptedItems };
}

export function shouldPersistAutoAcceptedCandidate<T extends ReviewCandidate>(
  item: T,
  rejectedSignatures: Set<string>,
): boolean {
  return !rejectedSignatures.has(item.signatureHash);
}
