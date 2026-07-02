import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LoreParseError, parseFileHistoryOneline, parseFileInfo } from "./parsers";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf-8");

describe("parseFileHistoryOneline", () => {
  it("parses one revision per line into revision + message", () => {
    const result = parseFileHistoryOneline(fixture("file-history-oneline.txt"));

    expect(result).toEqual([
      { revision: "3f9a2b1", message: "Update hero banner for summer campaign" },
      { revision: "9c7d0e4", message: "Resize hero banner to 1280x720" },
      { revision: "1a2b3c4", message: "Initial import of hero banner" },
    ]);
  });

  it("ignores blank lines", () => {
    const result = parseFileHistoryOneline("3f9a2b1 msg one\n\n\n9c7d0e4 msg two\n");
    expect(result).toHaveLength(2);
  });

  it("returns an empty list for empty output", () => {
    expect(parseFileHistoryOneline("")).toEqual([]);
    expect(parseFileHistoryOneline("\n\n")).toEqual([]);
  });

  it("throws LoreParseError on a line with no separating whitespace", () => {
    expect(() => parseFileHistoryOneline("onlyrevision")).toThrow(LoreParseError);
  });
});

describe("parseFileInfo", () => {
  const fallback = { path: "assets/hero.png", revision: "3f9a2b1" };

  it("parses key: value pairs, mapping known aliases", () => {
    const result = parseFileInfo(fixture("file-info.txt"), fallback);

    expect(result).toEqual({
      path: "assets/hero.png",
      revision: "3f9a2b1",
      contentHash: "blake3:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      sizeBytes: 128394,
    });
  });

  it("falls back to the requested path/revision when absent from output", () => {
    const result = parseFileInfo("address: blake3:deadbeef\n", fallback);
    expect(result.path).toBe(fallback.path);
    expect(result.revision).toBe(fallback.revision);
  });

  it("accepts 'hash' as an alias for the content address", () => {
    const result = parseFileInfo("hash: blake3:cafef00d\n", fallback);
    expect(result.contentHash).toBe("blake3:cafef00d");
  });

  it("throws LoreParseError when no content hash/address is present", () => {
    expect(() => parseFileInfo("path: assets/hero.png\n", fallback)).toThrow(LoreParseError);
  });

  it("throws LoreParseError on an unparsable line", () => {
    expect(() => parseFileInfo("not a key value line", fallback)).toThrow(LoreParseError);
  });
});
