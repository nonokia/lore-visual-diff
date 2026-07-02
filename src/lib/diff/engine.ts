import sharp from "sharp";
import pixelmatch from "pixelmatch";

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface PixelDiffResult {
  diffPng: Buffer;
  diffPixelCount: number;
  totalPixels: number;
  diffRatio: number;
}

export interface DiffResult {
  dimensionsMatch: boolean;
  dimensionsA: ImageDimensions;
  dimensionsB: ImageDimensions;
  /** True if either image was resized before diffing (see design doc §5 "大容量画像の扱い"). */
  downscaled: boolean;
  /** Present only when dimensionsMatch is true — pixelmatch needs equal-sized buffers. */
  pixelDiff?: PixelDiffResult;
}

export interface DiffOptions {
  /** Images with a longer edge above this are downscaled before diffing. */
  maxLongEdge?: number;
  /** Images whose encoded byte size exceeds this are downscaled before diffing. */
  maxBytes?: number;
  /** Forwarded to pixelmatch; 0-1, lower = more sensitive. */
  pixelmatchThreshold?: number;
}

const DEFAULT_MAX_LONG_EDGE = 4096;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_PIXELMATCH_THRESHOLD = 0.1;

async function decodeRaw(
  buffer: Buffer,
  downscale: boolean,
  maxLongEdge: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  let pipeline = sharp(buffer).ensureAlpha();
  if (downscale) {
    pipeline = pipeline.resize(maxLongEdge, maxLongEdge, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Decodes two images, compares dimensions, and (when dimensions match)
 * produces a pixelmatch heatmap. Mirrors the "寸法が異なる場合の仕様" and
 * "大容量画像の扱い" decisions in the design doc: mismatched dimensions
 * skip pixel diff entirely rather than padding, and oversized images are
 * downscaled with the caller expected to surface a "reduced" notice.
 */
export async function computeDiff(
  bufferA: Buffer,
  bufferB: Buffer,
  options: DiffOptions = {},
): Promise<DiffResult> {
  const maxLongEdge = options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const threshold = options.pixelmatchThreshold ?? DEFAULT_PIXELMATCH_THRESHOLD;

  const [metaA, metaB] = await Promise.all([
    sharp(bufferA).metadata(),
    sharp(bufferB).metadata(),
  ]);
  if (!metaA.width || !metaA.height || !metaB.width || !metaB.height) {
    throw new Error("Could not read image dimensions");
  }

  const dimensionsA = { width: metaA.width, height: metaA.height };
  const dimensionsB = { width: metaB.width, height: metaB.height };
  const dimensionsMatch =
    dimensionsA.width === dimensionsB.width && dimensionsA.height === dimensionsB.height;

  if (!dimensionsMatch) {
    return { dimensionsMatch, dimensionsA, dimensionsB, downscaled: false };
  }

  const longEdge = Math.max(dimensionsA.width, dimensionsA.height);
  const downscaled =
    longEdge > maxLongEdge || bufferA.length > maxBytes || bufferB.length > maxBytes;

  const [rawA, rawB] = await Promise.all([
    decodeRaw(bufferA, downscaled, maxLongEdge),
    decodeRaw(bufferB, downscaled, maxLongEdge),
  ]);

  if (rawA.width !== rawB.width || rawA.height !== rawB.height) {
    throw new Error(
      `Post-resize dimension mismatch (${rawA.width}x${rawA.height} vs ${rawB.width}x${rawB.height}); expected equal-dimension inputs to stay equal after an identical resize`,
    );
  }

  const { width, height } = rawA;
  const diffData = Buffer.alloc(width * height * 4);
  const diffPixelCount = pixelmatch(rawA.data, rawB.data, diffData, width, height, {
    threshold,
  });

  const diffPng = await sharp(diffData, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();

  const totalPixels = width * height;

  return {
    dimensionsMatch,
    dimensionsA,
    dimensionsB,
    downscaled,
    pixelDiff: {
      diffPng,
      diffPixelCount,
      totalPixels,
      diffRatio: totalPixels === 0 ? 0 : diffPixelCount / totalPixels,
    },
  };
}
