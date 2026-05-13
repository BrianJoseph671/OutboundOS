export type ReviewDecision = "accept" | "reject";

export function shouldPersistContactForSignatures(
  signatures: Iterable<string> | undefined,
  rejected: ReadonlySet<string>,
): boolean {
  if (rejected.size === 0) return true;

  const contactSignatures = Array.from(signatures ?? []);
  if (contactSignatures.length === 0) return true;

  return contactSignatures.some((signature) => !rejected.has(signature));
}

export function shouldAutoAcceptSignature(
  signatureHash: string,
  rejected: ReadonlySet<string>,
): boolean {
  return !rejected.has(signatureHash);
}

export function assertReviewItemsDecided<T extends { decision: unknown }>(
  items: T[],
): asserts items is Array<T & { decision: ReviewDecision }> {
  const hasUndecidedItem = items.some((item) => item.decision !== "accept" && item.decision !== "reject");
  if (hasUndecidedItem) {
    throw new Error("All review items must be decided before completion");
  }
}
