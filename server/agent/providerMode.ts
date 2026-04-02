export type RelationshipProviderMode = "mock" | "live";

/**
 * Defaults to mock mode so Sync Recent works in local/dev without MCP setup.
 */
export function getRelationshipProviderMode(): RelationshipProviderMode {
  return process.env.RELATIONSHIP_PROVIDER_MODE === "live" ? "live" : "mock";
}
