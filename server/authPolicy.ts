/**
 * Pure auth decisions for Google sign-in and password login.
 * Kept separate from server/auth.ts so tests can run without a database.
 */

export type GoogleAccountCandidate = {
  id: string;
  email: string | null;
  googleId: string | null;
  password: string | null;
};

export type GoogleLinkPlan =
  | { action: "update"; userId: string; invalidatePassword: boolean }
  | { action: "create" }
  | { action: "reject"; message: string };

/**
 * Decide how a Google profile maps onto an existing user.
 *
 * Matching only by email and keeping the old password lets someone register
 * that email first, then keep logging in after the real owner uses Google.
 * A verified Google email may claim that row, but the password credential
 * must be replaced. Unverified emails must not claim a password account.
 */
export function planGoogleAccountLink(args: {
  googleId: string;
  email: string | null;
  emailVerified: boolean;
  byGoogleId: GoogleAccountCandidate | null;
  byEmail: GoogleAccountCandidate | null;
}): GoogleLinkPlan {
  const { googleId, email, emailVerified, byGoogleId, byEmail } = args;

  if (byGoogleId) {
    if (byEmail && byEmail.id !== byGoogleId.id) {
      return {
        action: "reject",
        message: "This email is already used by another account.",
      };
    }
    return { action: "update", userId: byGoogleId.id, invalidatePassword: false };
  }

  if (email && byEmail) {
    if (byEmail.googleId && byEmail.googleId !== googleId) {
      return {
        action: "reject",
        message: "This email is already linked to a different Google account.",
      };
    }
    if (!emailVerified) {
      return {
        action: "reject",
        message: "Google did not verify this email address.",
      };
    }
    return {
      action: "update",
      userId: byEmail.id,
      invalidatePassword: Boolean(byEmail.password),
    };
  }

  return { action: "create" };
}

export function readGoogleEmailVerified(profile: {
  emails?: Array<{ value?: string; verified?: boolean | string }>;
  _json?: { email_verified?: boolean | string };
}): boolean {
  const fromJson = profile._json?.email_verified;
  if (fromJson === true || fromJson === "true") return true;
  const fromEmail = profile.emails?.[0]?.verified;
  return fromEmail === true || fromEmail === "true";
}

/** Block password login once an account is bound to Google. */
export function localPasswordBlockReason(user: {
  googleId: string | null;
}): string | null {
  if (user.googleId) {
    return "This account uses Google sign-in";
  }
  return null;
}
