import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  db: {},
  pool: { query: () => Promise.resolve() },
}));

import { shouldBlockLocalPasswordAuth } from "../auth";

describe("Notre Dame local password policy", () => {
  it("blocks password auth when the resolved user has an nd.edu email", () => {
    expect(
      shouldBlockLocalPasswordAuth("alice", { email: "alice@nd.edu" }),
    ).toBe(true);
  });

  it("does not block non-Notre-Dame users logging in by username", () => {
    expect(
      shouldBlockLocalPasswordAuth("alice", { email: "alice@example.com" }),
    ).toBe(false);
  });
});
