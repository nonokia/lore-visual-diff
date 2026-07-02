import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ImageDimensions } from "./engine";

export interface CachedDiffMeta {
  dimensionsA: ImageDimensions;
  dimensionsB: ImageDimensions;
  downscaled: boolean;
  diffPixelCount: number;
  totalPixels: number;
  diffRatio: number;
}

export interface CachedDiff {
  png: Buffer;
  meta: CachedDiffMeta;
}

/**
 * Filesystem diff cache keyed by the pair of content hashes being compared
 * (design doc §3: "キャッシュに hashA:hashB があれば即返却"). The on-disk
 * filename is a sha256 digest of `hashA:hashB` rather than the raw hashes
 * themselves, since content addresses may contain characters (e.g. `:`)
 * that aren't safe/portable as filenames. Only entries where dimensions
 * matched (i.e. a pixelmatch actually ran) are cached — the mismatched-
 * dimensions path is cheap (metadata-only) and not worth caching.
 */
export class DiffCache {
  constructor(private readonly cacheDir: string) {}

  private digest(hashA: string, hashB: string): string {
    return createHash("sha256").update(`${hashA}:${hashB}`).digest("hex");
  }

  private paths(hashA: string, hashB: string) {
    const base = join(this.cacheDir, this.digest(hashA, hashB));
    return { png: `${base}.png`, meta: `${base}.json` };
  }

  async get(hashA: string, hashB: string): Promise<CachedDiff | null> {
    const { png, meta } = this.paths(hashA, hashB);
    try {
      const [pngData, metaData] = await Promise.all([readFile(png), readFile(meta, "utf-8")]);
      return { png: pngData, meta: JSON.parse(metaData) as CachedDiffMeta };
    } catch {
      return null;
    }
  }

  async set(hashA: string, hashB: string, entry: CachedDiff): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const { png, meta } = this.paths(hashA, hashB);
    await Promise.all([writeFile(png, entry.png), writeFile(meta, JSON.stringify(entry.meta))]);
  }
}
