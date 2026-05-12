import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

const { googleOAuthAuthenticateOptions } = await import("../auth");

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
