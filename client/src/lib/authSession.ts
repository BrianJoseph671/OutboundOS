import { queryClient } from "@/lib/queryClient";

export const AUTH_LOCAL_STORAGE_KEYS = [
  "userProfile",
  "outbound-airtable-config",
  "outbound-user-profile",
  "outbound-contacts",
];

export function clearAuthClientState() {
  AUTH_LOCAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  queryClient.setQueryData(["/auth/me"], null);
  queryClient.clear();
}

export function finishLogoutRedirect() {
  clearAuthClientState();
  window.location.href = "/login";
}
