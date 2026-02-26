/**
 * Appends the "researched" tag to a contact's tags string if not already present.
 * Case-insensitive, trims existing tags.
 */
export function appendResearchedTag(tags: string | null | undefined): string {
  const parts = (tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (parts.some((t) => t.toLowerCase() === "researched")) {
    return parts.join(", ");
  }
  parts.push("researched");
  return parts.join(", ");
}
