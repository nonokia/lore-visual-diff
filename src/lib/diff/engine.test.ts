import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { computeDiff } from "./engine";

async function solidPng(width: number, height: number, rgb: [number, number, number]): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .png()
    .toBuffer();
}

/** A square split vertically into two solid colors, so pixelmatch has something to find. */
async function splitPng(
  width: number,
  height: number,
  left: [number, number, number],
  right: [number, number, number],
): Promise<Buffer> {
  const leftHalf = await sharp({
    create: { width: Math.floor(width / 2), height, channels: 3, background: { r: left[0], g: left[1], b: left[2] } },
  })
    .png()
    .toBuffer();
  const rightHalf = await sharp({
    create: {
      width: width - Math.floor(width / 2),
      height,
      channels: 3,
      background: { r: right[0], g: right[1], b: right[2] },
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: leftHalf, left: 0, top: 0 },
      { input: rightHalf, left: Math.floor(width / 2), top: 0 },
    ])
    .png()
    .toBuffer();
}

describe("computeDiff", () => {
  it("reports zero diff for identical images", async () => {
    const a = await solidPng(16, 16, [255, 0, 0]);
    const b = await solidPng(16, 16, [255, 0, 0]);

    const result = await computeDiff(a, b);

    expect(result.dimensionsMatch).toBe(true);
    expect(result.downscaled).toBe(false);
    expect(result.pixelDiff?.diffPixelCount).toBe(0);
    expect(result.pixelDiff?.diffRatio).toBe(0);
  });

  it("detects a partial diff between two half-different images", async () => {
    const a = await splitPng(16, 16, [255, 0, 0], [0, 255, 0]);
    const b = await splitPng(16, 16, [255, 0, 0], [0, 0, 255]);

    const result = await computeDiff(a, b);

    expect(result.dimensionsMatch).toBe(true);
    expect(result.pixelDiff).toBeDefined();
    expect(result.pixelDiff!.diffPixelCount).toBeGreaterThan(0);
    expect(result.pixelDiff!.diffPixelCount).toBeLessThan(result.pixelDiff!.totalPixels);
    expect(result.pixelDiff!.diffRatio).toBeCloseTo(0.5, 1);
  });

  it("skips pixel diff when dimensions differ", async () => {
    const a = await solidPng(16, 16, [255, 0, 0]);
    const b = await solidPng(32, 24, [255, 0, 0]);

    const result = await computeDiff(a, b);

    expect(result.dimensionsMatch).toBe(false);
    expect(result.pixelDiff).toBeUndefined();
    expect(result.dimensionsA).toEqual({ width: 16, height: 16 });
    expect(result.dimensionsB).toEqual({ width: 32, height: 24 });
  });

  it("downscales when the long edge exceeds maxLongEdge, keeping matched dimensions", async () => {
    const a = await solidPng(32, 16, [10, 20, 30]);
    const b = await solidPng(32, 16, [10, 20, 30]);

    const result = await computeDiff(a, b, { maxLongEdge: 8 });

    expect(result.downscaled).toBe(true);
    expect(result.pixelDiff).toBeDefined();
    expect(result.pixelDiff!.totalPixels).toBeLessThan(32 * 16);
  });

  it("does not downscale when within thresholds", async () => {
    const a = await solidPng(16, 16, [1, 2, 3]);
    const b = await solidPng(16, 16, [1, 2, 3]);

    const result = await computeDiff(a, b, { maxLongEdge: 4096, maxBytes: 20 * 1024 * 1024 });

    expect(result.downscaled).toBe(false);
    expect(result.pixelDiff!.totalPixels).toBe(16 * 16);
  });

  it("produces a decodable diffPng", async () => {
    const a = await splitPng(10, 10, [255, 255, 255], [0, 0, 0]);
    const b = await solidPng(10, 10, [255, 255, 255]);

    const result = await computeDiff(a, b);
    const diffMeta = await sharp(result.pixelDiff!.diffPng).metadata();

    expect(diffMeta.width).toBe(10);
    expect(diffMeta.height).toBe(10);
  });
});
