import type { LoreFileInfo, LoreRevisionSummary } from "./types";

/**
 * !! UNVERIFIED OUTPUT FORMAT !!
 *
 * The Lore CLI has no documented `--json` (or equivalent) output mode, and
 * this codebase has not been run against a live `lore` binary (see the
 * "Spike" checklist in README.md). The grammars below are best-guess,
 * conservative assumptions based on conventions common to similar VCS CLIs
 * (git/jj `--oneline`, `key: value` info blocks).
 *
 * These parsers intentionally throw LoreParseError instead of guessing on
 * malformed input, so a real CLI run will fail loudly here (rather than
 * silently returning wrong data) and point straight at the fixture that
 * needs updating. See __fixtures__ for the assumed sample output.
 */
export class LoreParseError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: string,
  ) {
    super(message);
    this.name = "LoreParseError";
  }
}

/**
 * Assumed grammar for `lore file history <path> [length] --oneline`,
 * one revision per line: `<revision> <message...>` (first whitespace run
 * separates the revision id from a free-text message), mirroring
 * `git log --oneline`.
 */
export function parseFileHistoryOneline(stdout: string): LoreRevisionSummary[] {
  const lines = stdout.split("\n").filter((line) => line.trim().length > 0);

  return lines.map((line) => {
    const match = /^(\S+)\s+(.*)$/.exec(line.trim());
    if (!match) {
      throw new LoreParseError(
        `Could not parse history line: ${JSON.stringify(line)}`,
        stdout,
      );
    }
    const [, revision, message] = match;
    return { revision, message: message.trim() };
  });
}

const INFO_KEY_ALIASES: Record<string, keyof LoreFileInfo | "sizeBytes"> = {
  path: "path",
  revision: "revision",
  rev: "revision",
  address: "contentHash",
  hash: "contentHash",
  "content-hash": "contentHash",
  "content-address": "contentHash",
  size: "sizeBytes",
  "size-bytes": "sizeBytes",
  bytes: "sizeBytes",
};

/**
 * Assumed grammar for `lore file info --path <path> --revision <rev>`:
 * newline-separated `key: value` pairs, key casing/spacing tolerant,
 * e.g.:
 *   path: assets/hero.png
 *   revision: 3f9a2b1c
 *   address: blake3:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
 *   size: 128394
 */
export function parseFileInfo(stdout: string, fallback: { path: string; revision: string }): LoreFileInfo {
  const entries: Partial<Record<keyof LoreFileInfo, string>> = {};

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const match = /^([A-Za-z][\w-]*)\s*:\s*(.+)$/.exec(line);
    if (!match) {
      throw new LoreParseError(`Could not parse info line: ${JSON.stringify(rawLine)}`, stdout);
    }
    const [, rawKey, rawValue] = match;
    const key = INFO_KEY_ALIASES[rawKey.trim().toLowerCase()];
    if (key) {
      entries[key as keyof LoreFileInfo] = rawValue.trim();
    }
  }

  if (!entries.contentHash) {
    throw new LoreParseError(
      "file info output did not contain a content hash/address field",
      stdout,
    );
  }

  return {
    path: entries.path ?? fallback.path,
    revision: entries.revision ?? fallback.revision,
    contentHash: entries.contentHash,
    sizeBytes: entries.sizeBytes ? Number(entries.sizeBytes) : undefined,
  };
}
