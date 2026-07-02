export interface LoreRevisionSummary {
  /** Revision identifier as printed by `lore file history --oneline`. */
  revision: string;
  /** Free-text message/summary for the revision. */
  message: string;
}

export interface LoreFileInfo {
  path: string;
  revision: string;
  /** Content-address (e.g. a BLAKE3 hash) usable as a diff cache key. */
  contentHash: string;
  sizeBytes?: number;
}

export interface LoreConfig {
  /** Path to the `lore` executable, or a bare name resolved via PATH. */
  binPath: string;
  /** Absolute path to the bare-cloned Lore repository (cwd for CLI calls). */
  repoPath: string;
}
