import { describe, expect, it } from "vitest";
import { isNotreDameEmail } from "../utils/emailDomains";

describe("isNotreDameEmail", () => {
  it("recognizes nd.edu addresses after case, whitespace, and zero-width normalization", () => {
    expect(isNotreDameEmail("user@nd.edu")).toBe(true);
    expect(isNotreDameEmail("USER@ND.EDU")).toBe(true);
    expect(isNotreDameEmail("  user@nd.edu  ")).toBe(true);
    expect(isNotreDameEmail("user@nd.edu\u200b")).toBe(true);
  });

  it("rejects non-Notre Dame values", () => {
    expect(isNotreDameEmail("user@gmail.com")).toBe(false);
    expect(isNotreDameEmail("nd.edu")).toBe(false);
    expect(isNotreDameEmail(null)).toBe(false);
    expect(isNotreDameEmail(undefined)).toBe(false);
  });
});
