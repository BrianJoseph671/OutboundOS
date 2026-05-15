import { describe, expect, it } from "vitest";
import { buildGoogleAuthOptions } from "../services/googleAuthOptions";

describe("buildGoogleAuthOptions", () => {
  it("uses only Google-supported prompt values", () => {
    const options = buildGoogleAuthOptions();
    const supportedPrompts = new Set(["none", "consent", "select_account"]);

    expect(options.prompt.split(/\s+/).every((value) => supportedPrompts.has(value))).toBe(true);
    expect(options.prompt).not.toContain("login");
  });

  it("passes through a hosted-domain hint when provided", () => {
    expect(buildGoogleAuthOptions("nd.edu")).toMatchObject({
      hd: "nd.edu",
      prompt: "select_account",
    });
  });
});
