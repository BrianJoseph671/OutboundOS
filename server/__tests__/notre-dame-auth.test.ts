import { describe, expect, it } from "vitest";
import {
  isNotreDameEmail,
  shouldBlockLocalPasswordAuthForNotreDame,
} from "../utils/notreDameAuth";

describe("Notre Dame auth guards", () => {
  it("detects nd.edu emails with varied casing and spacing", () => {
    expect(isNotreDameEmail("user@nd.edu")).toBe(true);
    expect(isNotreDameEmail("USER@ND.EDU")).toBe(true);
    expect(isNotreDameEmail("  user@nd.edu  ")).toBe(true);
  });

  it("does not treat other domains or non-strings as Notre Dame emails", () => {
    expect(isNotreDameEmail("user@gmail.com")).toBe(false);
    expect(isNotreDameEmail("nd.edu")).toBe(false);
    expect(isNotreDameEmail(null)).toBe(false);
  });

  it("blocks local auth when the login identifier is an nd.edu email", () => {
    expect(shouldBlockLocalPasswordAuthForNotreDame("user@nd.edu")).toBe(true);
  });

  it("blocks local auth when the matched account email is nd.edu even if logging in by username", () => {
    expect(shouldBlockLocalPasswordAuthForNotreDame("irish_user", "user@nd.edu")).toBe(true);
  });

  it("allows local auth for non-Notre Dame accounts", () => {
    expect(shouldBlockLocalPasswordAuthForNotreDame("user@example.com", "user@example.com")).toBe(false);
  });
});
