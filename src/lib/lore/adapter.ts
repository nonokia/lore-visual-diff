import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";

import type { LoreConfig, LoreFileInfo, LoreRevisionSummary } from "./types";
import { parseFileHistoryOneline, parseFileInfo } from "./parsers";
import {
  assertSafeAddress,
  assertSafeRepoRelativePath,
  assertSafeRevision,
} from "./safety";

const execFile = promisify(execFileCb);

export class LoreCliError extends Error {
  constructor(
    message: string,
    public readonly command: string[],
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "LoreCliError";
  }
}

/**
 * Thin wrapper around the `lore` CLI. All CLI invocation and output parsing
 * for the app is intended to live behind this class (see design doc §4:
 * "Lore Adapter層の設計原則") so that a pre-1.0 CLI/output-format change is a
 * one-file fix.
 */
export class LoreAdapter {
  constructor(private readonly config: LoreConfig) {}

  private async run(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFile(this.config.binPath, args, {
        cwd: this.config.repoPath,
        maxBuffer: 64 * 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      const stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
      throw new LoreCliError(
        `lore ${args.join(" ")} failed: ${err instanceof Error ? err.message : String(err)}`,
        args,
        stderr,
      );
    }
  }

  async fileHistory(path: string, length?: number): Promise<LoreRevisionSummary[]> {
    const safePath = assertSafeRepoRelativePath(path);
    const args = ["file", "history", safePath];
    if (length !== undefined) {
      if (!Number.isInteger(length) || length <= 0) {
        throw new RangeError(`length must be a positive integer, got ${length}`);
      }
      args.push(String(length));
    }
    args.push("--oneline");

    const stdout = await this.run(args);
    return parseFileHistoryOneline(stdout);
  }

  async fileInfo(path: string, revision: string): Promise<LoreFileInfo> {
    const safePath = assertSafeRepoRelativePath(path);
    const safeRevision = assertSafeRevision(revision);
    const stdout = await this.run([
      "file",
      "info",
      "--path",
      safePath,
      "--revision",
      safeRevision,
    ]);
    return parseFileInfo(stdout, { path: safePath, revision: safeRevision });
  }

  /** Extracts `path`@`revision` to `outputPath`. `outputPath` must already be a safe, absolute path. */
  async fileWrite(path: string, revision: string, outputPath: string): Promise<void> {
    const safePath = assertSafeRepoRelativePath(path);
    const safeRevision = assertSafeRevision(revision);
    await this.run([
      "file",
      "write",
      "--path",
      safePath,
      "--revision",
      safeRevision,
      "--output",
      outputPath,
    ]);
    await assertFileWasWritten(outputPath);
  }

  /** Extracts by content address (e.g. a cache-hit shortcut) to `outputPath`. */
  async fileWriteByAddress(address: string, outputPath: string): Promise<void> {
    const safeAddress = assertSafeAddress(address);
    await this.run(["file", "write", "--address", safeAddress, "--output", outputPath]);
    await assertFileWasWritten(outputPath);
  }
}

async function assertFileWasWritten(outputPath: string): Promise<void> {
  try {
    await access(outputPath);
  } catch {
    throw new Error(`lore file write reported success but did not create ${outputPath}`);
  }
}
