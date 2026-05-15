export function buildGoogleAuthOptions(hd?: string) {
  return {
    scope: ["profile", "email"],
    // Google OAuth supports none, consent, and select_account. "login" is rejected.
    prompt: "select_account",
    ...(hd ? { hd } : {}),
  };
}
