import { describe, expect, it } from "vitest";
import {
  localPasswordBlockReason,
  planGoogleAccountLink,
  readGoogleEmailVerified,
  type GoogleAccountCandidate,
} from "../authPolicy";

const passwordAccount: GoogleAccountCandidate = {
  id: "user-password",
  email: "victim@gmail.com",
  googleId: null,
  password: "bcrypt-hash",
};

describe("planGoogleAccountLink", () => {
  it("claims a password account for a verified Google email and invalidates that password", () => {
    const plan = planGoogleAccountLink({
      googleId: "google-victim",
      email: "victim@gmail.com",
      emailVerified: true,
      byGoogleId: null,
      byEmail: passwordAccount,
    });

    expect(plan).toEqual({
      action: "update",
      userId: "user-password",
      invalidatePassword: true,
    });
  });

  it("does not claim a password account when Google has not verified the email", () => {
    const plan = planGoogleAccountLink({
      googleId: "google-victim",
      email: "victim@gmail.com",
      emailVerified: false,
      byGoogleId: null,
      byEmail: passwordAccount,
    });

    expect(plan).toEqual({
      action: "reject",
      message: "Google did not verify this email address.",
    });
  });

  it("links a passwordless email row without rotating a credential", () => {
    const plan = planGoogleAccountLink({
      googleId: "google-legacy",
      email: "legacy@gmail.com",
      emailVerified: true,
      byGoogleId: null,
      byEmail: {
        id: "user-legacy",
        email: "legacy@gmail.com",
        googleId: null,
        password: null,
      },
    });

    expect(plan).toEqual({
      action: "update",
      userId: "user-legacy",
      invalidatePassword: false,
    });
  });

  it("does not rotate the password on a returning Google user", () => {
    const plan = planGoogleAccountLink({
      googleId: "google-victim",
      email: "victim@gmail.com",
      emailVerified: true,
      byGoogleId: {
        id: "user-google",
        email: "victim@gmail.com",
        googleId: "google-victim",
        password: "random-hash",
      },
      byEmail: {
        id: "user-google",
        email: "victim@gmail.com",
        googleId: "google-victim",
        password: "random-hash",
      },
    });

    expect(plan).toEqual({
      action: "update",
      userId: "user-google",
      invalidatePassword: false,
    });
  });

  it("refuses to attach a Google identity when the email is linked to a different Google account", () => {
    const plan = planGoogleAccountLink({
      googleId: "google-attacker",
      email: "victim@gmail.com",
      emailVerified: true,
      byGoogleId: null,
      byEmail: {
        id: "user-victim",
        email: "victim@gmail.com",
        googleId: "google-victim",
        password: "random-hash",
      },
    });

    expect(plan.action).toBe("reject");
  });

  it("refuses to move a returning Google user onto an email owned by someone else", () => {
    const plan = planGoogleAccountLink({
      googleId: "google-a",
      email: "shared@gmail.com",
      emailVerified: true,
      byGoogleId: {
        id: "user-a",
        email: "old@gmail.com",
        googleId: "google-a",
        password: "random-hash",
      },
      byEmail: passwordAccount,
    });

    expect(plan).toEqual({
      action: "reject",
      message: "This email is already used by another account.",
    });
  });

  it("creates a user when neither google id nor email matches", () => {
    const plan = planGoogleAccountLink({
      googleId: "google-new",
      email: "new@gmail.com",
      emailVerified: true,
      byGoogleId: null,
      byEmail: null,
    });

    expect(plan).toEqual({ action: "create" });
  });
});

describe("readGoogleEmailVerified", () => {
  it("accepts boolean and string true from the Google profile", () => {
    expect(readGoogleEmailVerified({ _json: { email_verified: true } })).toBe(true);
    expect(readGoogleEmailVerified({ emails: [{ verified: "true" }] })).toBe(true);
  });

  it("rejects missing or false verification", () => {
    expect(readGoogleEmailVerified({})).toBe(false);
    expect(readGoogleEmailVerified({ _json: { email_verified: false } })).toBe(false);
    expect(readGoogleEmailVerified({ emails: [{ verified: false }] })).toBe(false);
  });
});

describe("localPasswordBlockReason", () => {
  it("blocks password login after an account is linked to Google", () => {
    expect(localPasswordBlockReason({ googleId: "google-victim" })).toBe(
      "This account uses Google sign-in",
    );
  });

  it("allows password login for accounts with no Google identity", () => {
    expect(localPasswordBlockReason({ googleId: null })).toBeNull();
  });
});
