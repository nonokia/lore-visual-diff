/**
 * Guards for values that end up as `execFile` arguments to the `lore` CLI or
 * as filesystem paths. `execFile` (array-args, no shell) already rules out
 * shell metacharacter injection; what remains is (1) values that look like
 * CLI flags to `lore` itself and (2) repo-relative paths that try to escape
 * the repository root.
 */

const REVISION_PATTERN = /^[A-Za-z0-9._~^-]+$/;

export class UnsafeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeInputError";
  }
}

/** Rejects empty paths, absolute paths, `..` segments, and flag-like values. */
export function assertSafeRepoRelativePath(rawPath: string): string {
  if (!rawPath || rawPath.trim().length === 0) {
    throw new UnsafeInputError("Path must not be empty");
  }
  if (rawPath.includes("\0")) {
    throw new UnsafeInputError("Path must not contain null bytes");
  }
  if (rawPath.startsWith("-")) {
    throw new UnsafeInputError("Path must not start with '-'");
  }

  const normalized = rawPath.split("\\").join("/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new UnsafeInputError("Path must be repo-relative, not absolute");
  }

  const segments = normalized.split("/");
  for (const segment of segments) {
    if (segment === "..") {
      throw new UnsafeInputError("Path must not contain '..' segments");
    }
  }

  return segments.filter((s) => s.length > 0 && s !== ".").join("/");
}

/** Rejects revision identifiers that aren't a conservative safe charset. */
export function assertSafeRevision(revision: string): string {
  if (!revision || revision.startsWith("-") || !REVISION_PATTERN.test(revision)) {
    throw new UnsafeInputError(
      `Revision must match ${REVISION_PATTERN} and not start with '-' (got: ${JSON.stringify(revision)})`,
    );
  }
  return revision;
}

/** Rejects content addresses (hashes) that aren't a conservative safe charset. */
export function assertSafeAddress(address: string): string {
  if (!address || address.startsWith("-") || !REVISION_PATTERN.test(address)) {
    throw new UnsafeInputError(
      `Address must match ${REVISION_PATTERN} and not start with '-' (got: ${JSON.stringify(address)})`,
    );
  }
  return address;
}
