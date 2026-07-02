import { describe, expect, it } from "vitest";

import {
  assertSafeAddress,
  assertSafeRepoRelativePath,
  assertSafeRevision,
  UnsafeInputError,
} from "./safety";

describe("assertSafeRepoRelativePath", () => {
  it("accepts a plain relative path", () => {
    expect(assertSafeRepoRelativePath("assets/hero.png")).toBe("assets/hero.png");
  });

  it("normalizes backslashes and drops redundant './' segments", () => {
    expect(assertSafeRepoRelativePath("./assets\\hero.png")).toBe("assets/hero.png");
  });

  it.each([
    ["", "empty"],
    ["../secrets.env", "parent traversal"],
    ["assets/../../secrets.env", "embedded parent traversal"],
    ["/etc/passwd", "absolute unix path"],
    ["C:\\secrets.env", "absolute windows path"],
    ["-rf", "flag-like value"],
    ["a\0b", "null byte"],
  ])("rejects %j (%s)", (input) => {
    expect(() => assertSafeRepoRelativePath(input)).toThrow(UnsafeInputError);
  });
});

describe("assertSafeRevision", () => {
  it("accepts alphanumeric revision ids", () => {
    expect(assertSafeRevision("3f9a2b1")).toBe("3f9a2b1");
  });

  it("accepts relative-ref style suffixes", () => {
    expect(assertSafeRevision("HEAD~1")).toBe("HEAD~1");
  });

  it.each([["", "empty"], ["-rf", "flag-like"], ["rm; rm -rf /", "shell metacharacters"]])(
    "rejects %j (%s)",
    (input) => {
      expect(() => assertSafeRevision(input)).toThrow(UnsafeInputError);
    },
  );
});

describe("assertSafeAddress", () => {
  it("accepts a hash-like address", () => {
    expect(assertSafeAddress("blake3-9f86d081")).toBe("blake3-9f86d081");
  });

  it("rejects flag-like values", () => {
    expect(() => assertSafeAddress("--help")).toThrow(UnsafeInputError);
  });
});
