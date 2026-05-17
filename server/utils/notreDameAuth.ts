export const NOTRE_DAME_GOOGLE_AUTH_MESSAGE = "Notre Dame accounts must sign in with Google.";

export function isNotreDameEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase().endsWith("@nd.edu");
}

export function shouldBlockLocalPasswordAuthForNotreDame(
  loginIdentifier: unknown,
  accountEmail?: unknown,
): boolean {
  return isNotreDameEmail(loginIdentifier) || isNotreDameEmail(accountEmail);
}
