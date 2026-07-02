import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LoreFileInfo, LoreRevisionSummary } from "@/lib/lore/types";
import { DiffCache } from "./cache";
import { _setDiffServiceDepsForTests, getDiff, getFileAt, getHistory } from "./service";
import type { LoreSource } from "./service";

async function solidPng(width: number, height: number, r: number, g: number, b: number) {
  return sharp({ create: { width, height, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

class FakeLoreSource implements LoreSource {
  revisions = new Map<string, { hash: string; data: Buffer }>();
  history: LoreRevisionSummary[] = [];
  fileInfoCalls = 0;
  writeCalls: string[] = [];

  register(revision: string, hash: string, data: Buffer) {
    this.revisions.set(revision, { hash, data });
  }

  async fileHistory(): Promise<LoreRevisionSummary[]> {
    return this.history;
  }

  async fileInfo(path: string, revision: string): Promise<LoreFileInfo> {
    this.fileInfoCalls++;
    const entry = this.revisions.get(revision);
    if (!entry) throw new Error(`no such revision: ${revision}`);
    return { path, revision, contentHash: entry.hash };
  }

  async fileWriteByAddress(address: string, outputPath: string): Promise<void> {
    this.writeCalls.push(address);
    const entry = [...this.revisions.values()].find((v) => v.hash === address);
    if (!entry) throw new Error(`no content for address: ${address}`);
    await writeFile(outputPath, entry.data);
  }
}

describe("diff service", () => {
  let extractDir: string;
  let cacheDir: string;
  let lore: FakeLoreSource;

  beforeEach(async () => {
    extractDir = await mkdtemp(join(tmpdir(), "extract-"));
    cacheDir = await mkdtemp(join(tmpdir(), "cache-"));
    lore = new FakeLoreSource();
    _setDiffServiceDepsForTests({
      lore,
      extractDir,
      cache: new DiffCache(cacheDir),
    });
  });

  afterEach(async () => {
    _setDiffServiceDepsForTests(null);
    await rm(extractDir, { recursive: true, force: true });
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("getHistory delegates to the Lore source", async () => {
    lore.history = [{ revision: "abc", message: "hi" }];
    expect(await getHistory("assets/hero.png")).toEqual(lore.history);
  });

  it("getFileAt extracts once and reuses the extracted file on a second call", async () => {
    const png = await solidPng(4, 4, 1, 2, 3);
    lore.register("rev1", "hashA", png);

    const first = await getFileAt("assets/hero.png", "rev1");
    expect(first.data).toEqual(png);
    expect(first.contentType).toBe("image/png");
    expect(lore.writeCalls).toEqual(["hashA"]);

    const second = await getFileAt("assets/hero.png", "rev1");
    expect(second.data).toEqual(png);
    // Second call must hit the extraction cache, not call fileWriteByAddress again.
    expect(lore.writeCalls).toEqual(["hashA"]);
  });

  it("getDiff short-circuits when both revisions resolve to the same content hash", async () => {
    const png = await solidPng(4, 4, 10, 10, 10);
    lore.register("rev1", "sameHash", png);
    lore.register("rev2", "sameHash", png);

    const outcome = await getDiff("assets/hero.png", "rev1", "rev2");

    expect(outcome.summary.dimensionsMatch).toBe(true);
    expect(outcome.summary.pixelDiff).toEqual({ diffPixelCount: 0, totalPixels: 16, diffRatio: 0 });
    expect(outcome.diffPng).toBeNull();
    // Both revisions still resolve/extract independently and concurrently (Promise.all), so the
    // same hash may be written twice; the point under test is that no pixel diff is computed.
    expect(lore.writeCalls.every((c) => c === "sameHash")).toBe(true);
  });

  it("getDiff computes and caches a pixel diff, then serves the cached result on a repeat call", async () => {
    const a = await solidPng(4, 4, 255, 0, 0);
    const b = await solidPng(4, 4, 0, 255, 0);
    lore.register("rev1", "hashA", a);
    lore.register("rev2", "hashB", b);

    const first = await getDiff("assets/hero.png", "rev1", "rev2");
    expect(first.summary.cacheHit).toBe(false);
    expect(first.summary.dimensionsMatch).toBe(true);
    expect(first.summary.pixelDiff!.diffPixelCount).toBeGreaterThan(0);
    expect(first.diffPng).not.toBeNull();

    const second = await getDiff("assets/hero.png", "rev1", "rev2");
    expect(second.summary.cacheHit).toBe(true);
    expect(second.summary.pixelDiff).toEqual(first.summary.pixelDiff);
    expect(second.diffPng).toEqual(first.diffPng);
  });

  it("getDiff skips the cache and reports no pixelDiff when dimensions differ", async () => {
    const a = await solidPng(4, 4, 255, 0, 0);
    const b = await solidPng(8, 8, 255, 0, 0);
    lore.register("rev1", "hashA", a);
    lore.register("rev2", "hashB", b);

    const outcome = await getDiff("assets/hero.png", "rev1", "rev2");

    expect(outcome.summary.dimensionsMatch).toBe(false);
    expect(outcome.summary.pixelDiff).toBeUndefined();
    expect(outcome.diffPng).toBeNull();
  });
});
