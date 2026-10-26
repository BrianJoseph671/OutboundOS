import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeOAuthState,
  createOAuthState,
  decideOAuthCallback,
} from "../services/oauthState";

describe("integration OAuth state", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("binds a connect state to the user who started it", () => {
    const token = createOAuthState("google", "user-a");
    expect(consumeOAuthState(token)).toMatchObject({
      provider: "google",
      userId: "user-a",
    });
  });

  it("rejects a state token after it is consumed", () => {
    const token = createOAuthState("google", "user-a");
    expect(consumeOAuthState(token)).not.toBeNull();
    expect(consumeOAuthState(token)).toBeNull();
  });

  it("rejects a state token after it expires", () => {
    const issuedAt = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(issuedAt);
    const token = createOAuthState("google", "user-a");
    vi.spyOn(Date, "now").mockReturnValue(issuedAt + 10 * 60 * 1000 + 1);
    expect(consumeOAuthState(token)).toBeNull();
  });

  it("stores tokens for the initiating session", () => {
    const state = consumeOAuthState(createOAuthState("google", "user-a"));
    expect(
      decideOAuthCallback({
        state,
        sessionUserId: "user-a",
        requestedProvider: "google",
      }),
    ).toEqual({ ok: true, provider: "google", userId: "user-a" });
  });

  it("does not attach another user's Google account on callback", () => {
    const state = consumeOAuthState(createOAuthState("google", "attacker"));
    expect(
      decideOAuthCallback({
        state,
        sessionUserId: "victim",
        requestedProvider: "google",
      }),
    ).toEqual({ ok: false, error: "session_mismatch" });
  });

  it("rejects a callback when the browser session is missing", () => {
    const state = consumeOAuthState(createOAuthState("google", "user-a"));
    expect(
      decideOAuthCallback({
        state,
        sessionUserId: undefined,
        requestedProvider: "google",
      }),
    ).toEqual({ ok: false, error: "not_authenticated" });
  });

  it("rejects a state minted for a different provider", () => {
    const state = consumeOAuthState(createOAuthState("google", "user-a"));
    expect(
      decideOAuthCallback({
        state,
        sessionUserId: "user-a",
        requestedProvider: "other",
      }),
    ).toEqual({ ok: false, error: "invalid_state" });
  });
});
