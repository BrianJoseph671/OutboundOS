import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  storage: {
    getIntegrationConnection: vi.fn(),
    upsertIntegrationConnection: vi.fn(),
  },
}));

vi.mock("../storage", () => storageMock);

vi.mock("../utils/encryption", () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value.replace(/^encrypted:/, ""),
}));

import { generateAuthorizationUrl, validateState } from "../services/oauth";

describe("OAuth state", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.APP_BASE_URL = "https://app.example.com";
  });

  it("binds generated integration state to the initiating user", () => {
    const authorizationUrl = new URL(generateAuthorizationUrl("google", "user-1"));
    const state = authorizationUrl.searchParams.get("state");

    expect(state).toBeTruthy();
    expect(validateState(state!)).toMatchObject({
      provider: "google",
      userId: "user-1",
    });
  });

  it("consumes OAuth state after validation", () => {
    const authorizationUrl = new URL(generateAuthorizationUrl("google", "user-2"));
    const state = authorizationUrl.searchParams.get("state");

    expect(validateState(state!)).not.toBeNull();
    expect(validateState(state!)).toBeNull();
  });
});
