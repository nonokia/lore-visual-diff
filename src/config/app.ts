import { resolve } from "node:path";

export function getCacheDir(): string {
  // turbopackIgnore: env-driven path, not a bundler-resolvable import target.
  return resolve(/* turbopackIgnore: true */ process.env.LORE_DIFF_CACHE_DIR ?? ".cache/diffs");
}

export function getExtractDir(): string {
  return resolve(/* turbopackIgnore: true */ process.env.LORE_EXTRACT_DIR ?? ".cache/extracted");
}

/**
 * MVP file browser scope: Lore has no documented "list files in repo"
 * primitive (design doc §2 only verifies file write/info/history), so the
 * browsable set is a configured allowlist of repo-relative image paths
 * rather than a live directory listing. Revisit once that CLI surface is
 * verified against a real `lore` binary.
 */
export function getWatchedPaths(): string[] {
  const raw = process.env.LORE_WATCHED_PATHS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
