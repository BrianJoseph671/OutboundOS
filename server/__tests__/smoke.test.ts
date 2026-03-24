import { describe, it, expect } from "vitest";

describe("smoke test", () => {
  it("vitest framework is working", () => {
    expect(1 + 1).toBe(2);
  });

  it("string operations work", () => {
    expect("hello world".toUpperCase()).toBe("HELLO WORLD");
  });
});
