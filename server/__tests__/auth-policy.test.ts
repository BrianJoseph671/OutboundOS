import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

const {
  googleOAuthAuthenticateOptions,
  passwordLoginRejectionMessage,
} = await import("../auth");

describe("passwordLoginRejectionMessage", () => {
  it("rejects Notre Dame accounts even when the login identifier was a username", () => {
    expect(
      passwordLoginRejectionMessage({
        email: "student@nd.edu",
        googleId: null,
        password: "stored-password-hash",
      }),
    ).toBe("Notre Dame accounts must sign in with Google.");
  });

  it("rejects local password login for Google-linked accounts", () => {
    expect(
      passwordLoginRejectionMessage({
        email: "user@example.com",
        googleId: "google-sub",
        password: "stored-password-hash",
      }),
    ).toBe("This account uses Google sign-in");
  });

  it("allows password login for non-Google, non-Notre-Dame password accounts", () => {
    expect(
      passwordLoginRejectionMessage({
        email: "user@example.com",
        googleId: null,
        password: "stored-password-hash",
      }),
    ).toBeNull();
  });
});

describe("googleOAuthAuthenticateOptions", () => {
  it("uses only Google-supported prompt values", () => {
    const options = googleOAuthAuthenticateOptions();

    expect(options.prompt).toBe("select_account");
    expect(options.prompt).not.toContain("login");
  });

  it("includes the hosted-domain hint when provided", () => {
    expect(googleOAuthAuthenticateOptions("nd.edu")).toMatchObject({
      hd: "nd.edu",
      scope: ["profile", "email"],
    });
  });
});
