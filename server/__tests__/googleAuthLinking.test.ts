import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    updateResult: [] as unknown[],
    insertResult: [] as unknown[],
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(state.selectResults.shift() ?? [])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(state.updateResult)),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(state.insertResult)),
      })),
    })),
  };

  return { db, state };
});

vi.mock("../db", () => ({
  db: dbMocks.db,
  pool: {
    query: vi.fn(),
  },
}));

import { findOrCreateGoogleUser } from "../auth";

const googleProfile = {
  id: "google-victim",
  displayName: "Victim User",
  emails: [{ value: "victim@example.com" }],
  photos: [{ value: "https://example.com/avatar.png" }],
};

describe("findOrCreateGoogleUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.state.selectResults = [];
    dbMocks.state.updateResult = [];
    dbMocks.state.insertResult = [];
  });

  it("does not attach a Google identity to a password account with the same email", async () => {
    dbMocks.state.selectResults = [
      [],
      [{
        id: "password-user",
        email: "victim@example.com",
        googleId: null,
        password: "hashed-password",
      }],
    ];

    await expect(findOrCreateGoogleUser(googleProfile)).rejects.toThrow("Email already registered");

    expect(dbMocks.db.update).not.toHaveBeenCalled();
    expect(dbMocks.db.insert).not.toHaveBeenCalled();
  });

  it("does not move an existing Google login onto another user's email", async () => {
    dbMocks.state.selectResults = [
      [{
        id: "google-user",
        email: "old@example.com",
        googleId: "google-victim",
        password: "generated-password",
      }],
      [{
        id: "password-user",
        email: "victim@example.com",
        googleId: null,
        password: "hashed-password",
      }],
    ];

    await expect(findOrCreateGoogleUser(googleProfile)).rejects.toThrow(
      "Google account email is already registered",
    );

    expect(dbMocks.db.update).not.toHaveBeenCalled();
    expect(dbMocks.db.insert).not.toHaveBeenCalled();
  });
});
