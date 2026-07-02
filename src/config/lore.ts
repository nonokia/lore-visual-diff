import { resolve } from "node:path";
import type { LoreConfig } from "@/lib/lore/types";

let cached: LoreConfig | null = null;

/** Reads Lore connection settings from env. See README "セットアップ" for required vars. */
export function getLoreConfig(): LoreConfig {
  if (cached) return cached;

  const repoPath = process.env.LORE_REPO_PATH;
  if (!repoPath) {
    throw new Error(
      "LORE_REPO_PATH is not set. Point it at a `lore clone --bare` checkout (see README).",
    );
  }

  cached = {
    binPath: process.env.LORE_BIN_PATH ?? "lore",
    repoPath: resolve(repoPath),
  };
  return cached;
}

/** Test-only escape hatch to reset the memoized config between test cases. */
export function _resetLoreConfigCacheForTests(): void {
  cached = null;
}
