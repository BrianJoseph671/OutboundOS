import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock, updateMock, insertMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  updateMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    select: selectMock,
    update: updateMock,
    insert: insertMock,
  },
  pool: {
    query: vi.fn(),
  },
}));

const {
  findOrCreateGoogleUser,
  GoogleAccountLinkingError,
  googleOAuthAuthenticateOptions,
  passwordSignInFailureMessage,
} = await import("../auth");

function selectRows(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(async () => rows),
    })),
  };
}

describe("auth account policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses only Google-supported prompt values", () => {
    const options = googleOAuthAuthenticateOptions();

    expect(options.prompt).toBe("select_account");
    expect(options.prompt).not.toContain("login");
  });

  it("passes through a hosted-domain hint for Google OAuth", () => {
    expect(googleOAuthAuthenticateOptions("nd.edu")).toMatchObject({
      hd: "nd.edu",
      scope: ["profile", "email"],
    });
  });

  it("rejects password sign-in when the stored account must use Google", () => {
    expect(
      passwordSignInFailureMessage({
        email: "legacy@nd.edu",
        googleId: null,
        password: "stored-hash",
      }),
    ).toBe("Notre Dame accounts must sign in with Google.");

    expect(
      passwordSignInFailureMessage({
        email: "user@example.com",
        googleId: "google-123",
        password: "stored-hash",
      }),
    ).toBe("This account uses Google sign-in");
  });

  it("does not attach a Google identity to an existing password account with the same email", async () => {
    const existingPasswordUser = {
      id: "local-user",
      username: "victim",
      email: "victim@example.com",
      googleId: null,
      fullName: null,
      avatarUrl: null,
      password: "stored-password-hash",
      createdAt: new Date(),
    };
    selectMock
      .mockImplementationOnce(() => selectRows([]))
      .mockImplementationOnce(() => selectRows([existingPasswordUser]));

    await expect(
      findOrCreateGoogleUser({
        id: "google-victim",
        displayName: "Victim User",
        emails: [{ value: "victim@example.com" }],
      }),
    ).rejects.toBeInstanceOf(GoogleAccountLinkingError);

    expect(updateMock).not.toHaveBeenCalled();
  });
});
