import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DiffCache, type CachedDiff } from "./cache";

const sampleEntry: CachedDiff = {
  png: Buffer.from("fake png bytes"),
  meta: {
    dimensionsA: { width: 10, height: 10 },
    dimensionsB: { width: 10, height: 10 },
    downscaled: false,
    diffPixelCount: 5,
    totalPixels: 100,
    diffRatio: 0.05,
  },
};

describe("DiffCache", () => {
  let dir: string;
  let cache: DiffCache;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "diff-cache-test-"));
    cache = new DiffCache(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null for a miss", async () => {
    expect(await cache.get("hashA", "hashB")).toBeNull();
  });

  it("round-trips a set/get pair including metadata", async () => {
    await cache.set("hashA", "hashB", sampleEntry);

    const result = await cache.get("hashA", "hashB");
    expect(result?.png).toEqual(sampleEntry.png);
    expect(result?.meta).toEqual(sampleEntry.meta);
  });

  it("treats (hashA, hashB) and (hashB, hashA) as distinct keys", async () => {
    await cache.set("hashA", "hashB", sampleEntry);

    expect(await cache.get("hashB", "hashA")).toBeNull();
  });

  it("creates the cache directory lazily on first set", async () => {
    const nested = new DiffCache(join(dir, "nested", "cache"));
    await nested.set("h1", "h2", sampleEntry);

    expect((await nested.get("h1", "h2"))?.png).toEqual(sampleEntry.png);
  });

  it("returns null when only the meta half exists (partial write)", async () => {
    await cache.set("h1", "h2", sampleEntry);
    const digest = createHash("sha256").update("h1:h2").digest("hex");
    await rm(join(dir, `${digest}.png`));

    expect(await cache.get("h1", "h2")).toBeNull();
  });
});
