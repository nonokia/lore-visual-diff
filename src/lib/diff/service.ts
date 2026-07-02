import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import { getLoreConfig } from "@/config/lore";
import { getCacheDir, getExtractDir } from "@/config/app";
import { LoreAdapter } from "@/lib/lore/adapter";
import type { LoreFileInfo, LoreRevisionSummary } from "@/lib/lore/types";
import { computeDiff, type ImageDimensions } from "./engine";
import { DiffCache } from "./cache";

/** The subset of LoreAdapter this service depends on, for test doubles. */
export interface LoreSource {
  fileHistory(path: string, length?: number): Promise<LoreRevisionSummary[]>;
  fileInfo(path: string, revision: string): Promise<LoreFileInfo>;
  fileWriteByAddress(address: string, outputPath: string): Promise<void>;
}

export interface DiffServiceDeps {
  lore: LoreSource;
  extractDir: string;
  cache: DiffCache;
}

let defaultDeps: DiffServiceDeps | null = null;

function deps(): DiffServiceDeps {
  if (!defaultDeps) {
    defaultDeps = {
      lore: new LoreAdapter(getLoreConfig()),
      extractDir: getExtractDir(),
      cache: new DiffCache(getCacheDir()),
    };
  }
  return defaultDeps;
}

/** Test-only escape hatch; production code should never call this. */
export function _setDiffServiceDepsForTests(next: DiffServiceDeps | null): void {
  defaultDeps = next;
}

function extractedFilename(hash: string): string {
  return createHash("sha256").update(hash).digest("hex");
}

async function extractByHash(
  d: DiffServiceDeps,
  path: string,
  revision: string,
): Promise<{ hash: string; data: Buffer }> {
  const info = await d.lore.fileInfo(path, revision);
  const outputPath = join(d.extractDir, extractedFilename(info.contentHash));

  try {
    return { hash: info.contentHash, data: await readFile(outputPath) };
  } catch {
    // not extracted yet
  }

  // Write to a unique temp path then rename into place, so concurrent extractions of the
  // same content (e.g. two revisions sharing a hash) never leave a partially-written file
  // visible at outputPath.
  await mkdir(d.extractDir, { recursive: true });
  const tempPath = `${outputPath}.tmp-${randomUUID()}`;
  await d.lore.fileWriteByAddress(info.contentHash, tempPath);
  await rename(tempPath, outputPath);
  return { hash: info.contentHash, data: await readFile(outputPath) };
}

export async function getHistory(
  path: string,
  length?: number,
): Promise<LoreRevisionSummary[]> {
  return deps().lore.fileHistory(path, length);
}

export interface ResolvedFile {
  hash: string;
  data: Buffer;
  contentType: string;
}

export async function getFileAt(path: string, revision: string): Promise<ResolvedFile> {
  const d = deps();
  const { hash, data } = await extractByHash(d, path, revision);
  const meta = await sharp(data).metadata();
  return { hash, data, contentType: meta.format ? `image/${meta.format}` : "application/octet-stream" };
}

export interface DiffSummary {
  path: string;
  revisionA: string;
  revisionB: string;
  hashA: string;
  hashB: string;
  cacheHit: boolean;
  dimensionsMatch: boolean;
  dimensionsA: ImageDimensions;
  dimensionsB: ImageDimensions;
  downscaled: boolean;
  pixelDiff?: {
    diffPixelCount: number;
    totalPixels: number;
    diffRatio: number;
  };
}

export interface DiffOutcome {
  summary: DiffSummary;
  diffPng: Buffer | null;
}

export async function getDiff(
  path: string,
  revisionA: string,
  revisionB: string,
): Promise<DiffOutcome> {
  const d = deps();
  const [a, b] = await Promise.all([
    extractByHash(d, path, revisionA),
    extractByHash(d, path, revisionB),
  ]);

  const base = { path, revisionA, revisionB, hashA: a.hash, hashB: b.hash };

  if (a.hash === b.hash) {
    const meta = await sharp(a.data).metadata();
    const dims = { width: meta.width ?? 0, height: meta.height ?? 0 };
    return {
      summary: {
        ...base,
        cacheHit: true,
        dimensionsMatch: true,
        dimensionsA: dims,
        dimensionsB: dims,
        downscaled: false,
        pixelDiff: { diffPixelCount: 0, totalPixels: dims.width * dims.height, diffRatio: 0 },
      },
      diffPng: null,
    };
  }

  const cached = await d.cache.get(a.hash, b.hash);
  if (cached) {
    return {
      summary: {
        ...base,
        cacheHit: true,
        dimensionsMatch: true,
        dimensionsA: cached.meta.dimensionsA,
        dimensionsB: cached.meta.dimensionsB,
        downscaled: cached.meta.downscaled,
        pixelDiff: {
          diffPixelCount: cached.meta.diffPixelCount,
          totalPixels: cached.meta.totalPixels,
          diffRatio: cached.meta.diffRatio,
        },
      },
      diffPng: cached.png,
    };
  }

  const result = await computeDiff(a.data, b.data);

  if (result.pixelDiff) {
    await d.cache.set(a.hash, b.hash, {
      png: result.pixelDiff.diffPng,
      meta: {
        dimensionsA: result.dimensionsA,
        dimensionsB: result.dimensionsB,
        downscaled: result.downscaled,
        diffPixelCount: result.pixelDiff.diffPixelCount,
        totalPixels: result.pixelDiff.totalPixels,
        diffRatio: result.pixelDiff.diffRatio,
      },
    });
  }

  return {
    summary: {
      ...base,
      cacheHit: false,
      dimensionsMatch: result.dimensionsMatch,
      dimensionsA: result.dimensionsA,
      dimensionsB: result.dimensionsB,
      downscaled: result.downscaled,
      pixelDiff: result.pixelDiff
        ? {
            diffPixelCount: result.pixelDiff.diffPixelCount,
            totalPixels: result.pixelDiff.totalPixels,
            diffRatio: result.pixelDiff.diffRatio,
          }
        : undefined,
    },
    diffPng: result.pixelDiff?.diffPng ?? null,
  };
}
