import crypto from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  provider: string;
  userId: string;
  createdAt: number;
}

const stateStore = new Map<string, OAuthState>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of Array.from(stateStore.entries())) {
    if (now - val.createdAt > STATE_TTL_MS) stateStore.delete(key);
  }
}, 60_000);
cleanupTimer.unref?.();

export function createOAuthState(provider: string, userId: string): string {
  if (!provider || !userId) {
    throw new Error("OAuth state requires a provider and user");
  }
  const state = crypto.randomBytes(32).toString("hex");
  stateStore.set(state, { provider, userId, createdAt: Date.now() });
  return state;
}

/** Read and delete a state token. Expired tokens are rejected. */
export function consumeOAuthState(state: string): OAuthState | null {
  const entry = stateStore.get(state);
  if (!entry) return null;
  stateStore.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return entry;
}

export type OAuthCallbackDecision =
  | { ok: true; provider: string; userId: string }
  | { ok: false; error: "invalid_state" | "not_authenticated" | "session_mismatch" };

/**
 * The integration callback must store tokens on the user who started connect.
 * A state minted for a different session is a cross-account linking attempt.
 */
export function decideOAuthCallback(input: {
  state: OAuthState | null;
  sessionUserId: string | undefined;
  requestedProvider: string;
}): OAuthCallbackDecision {
  if (!input.state || input.state.provider !== input.requestedProvider) {
    return { ok: false, error: "invalid_state" };
  }
  if (!input.sessionUserId) {
    return { ok: false, error: "not_authenticated" };
  }
  if (input.sessionUserId !== input.state.userId) {
    return { ok: false, error: "session_mismatch" };
  }
  return { ok: true, provider: input.state.provider, userId: input.sessionUserId };
}
