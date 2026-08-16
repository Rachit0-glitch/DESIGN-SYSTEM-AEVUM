import { type PixelMetrics, PixelMetricsSchema } from "./schemas.js";

export interface RasterPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly colorSpace: "SRGB";
}

export interface PixelComparisonOptions {
  readonly channelTolerance: number;
  readonly maxPixels: number;
}

function assertRaster(raster: RasterPixels): void {
  if (!Number.isInteger(raster.width) || !Number.isInteger(raster.height) || raster.width <= 0 || raster.height <= 0)
    throw new Error("FIDELITY_RASTER_DIMENSIONS_INVALID");
  if (raster.data.length !== raster.width * raster.height * 4) throw new Error("FIDELITY_RASTER_LENGTH_INVALID");
}

function luminance(data: Uint8ClampedArray, offset: number): number {
  const linear = (channel: number) => {
    const encoded = channel / 255;
    return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linear(data[offset] ?? 0) + 0.7152 * linear(data[offset + 1] ?? 0) + 0.0722 * linear(data[offset + 2] ?? 0)
  );
}

export function comparePixels(
  reference: RasterPixels,
  target: RasterPixels,
  options: PixelComparisonOptions,
): PixelMetrics {
  assertRaster(reference);
  assertRaster(target);
  if (reference.width !== target.width || reference.height !== target.height)
    throw new Error("FIDELITY_RASTER_DIMENSION_MISMATCH");
  const pixels = reference.width * reference.height;
  if (pixels > options.maxPixels) throw new Error("FIDELITY_COMPARISON_BUDGET_EXCEEDED");
  const channelSums = [0, 0, 0, 0];
  let squared = 0;
  let mismatches = 0;
  let meanReference = 0;
  let meanTarget = 0;
  const referenceLuminance = new Float64Array(pixels);
  const targetLuminance = new Float64Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    let mismatch = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs((reference.data[offset + channel] ?? 0) - (target.data[offset + channel] ?? 0));
      channelSums[channel] = (channelSums[channel] ?? 0) + delta;
      squared += delta * delta;
      if (delta > options.channelTolerance) mismatch = true;
    }
    if (mismatch) mismatches += 1;
    const left = luminance(reference.data, offset);
    const right = luminance(target.data, offset);
    referenceLuminance[pixel] = left;
    targetLuminance[pixel] = right;
    meanReference += left;
    meanTarget += right;
  }
  meanReference /= pixels;
  meanTarget /= pixels;
  let varianceReference = 0;
  let varianceTarget = 0;
  let covariance = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const left = (referenceLuminance[pixel] ?? 0) - meanReference;
    const right = (targetLuminance[pixel] ?? 0) - meanTarget;
    varianceReference += left * left;
    varianceTarget += right * right;
    covariance += left * right;
  }
  const divisor = Math.max(1, pixels - 1);
  varianceReference /= divisor;
  varianceTarget /= divisor;
  covariance /= divisor;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  const ssim = Math.max(
    0,
    Math.min(
      1,
      ((2 * meanReference * meanTarget + c1) * (2 * covariance + c2)) /
        ((meanReference ** 2 + meanTarget ** 2 + c1) * (varianceReference + varianceTarget + c2)),
    ),
  );
  const normalized = channelSums.map((sum) => sum / (pixels * 255)) as [number, number, number, number];
  return PixelMetricsSchema.parse({
    mae: channelSums.reduce((sum, value) => sum + value, 0) / (pixels * 4 * 255),
    rmse: Math.sqrt(squared / (pixels * 4)) / 255,
    mismatchPercentage: mismatches / pixels,
    alphaMae: normalized[3],
    channelMae: normalized,
    ssim,
    comparedPixels: pixels,
  });
}

export type HeatmapDomain = "RAW" | "LAYOUT" | "TYPOGRAPHY" | "COLOR" | "ASSET" | "EFFECTS";

export function buildPixelHeatmap(
  reference: RasterPixels,
  target: RasterPixels,
  domain: HeatmapDomain = "RAW",
): RasterPixels {
  assertRaster(reference);
  assertRaster(target);
  if (reference.width !== target.width || reference.height !== target.height)
    throw new Error("FIDELITY_RASTER_DIMENSION_MISMATCH");
  const result = new Uint8ClampedArray(reference.data.length);
  const tint: Record<HeatmapDomain, readonly [number, number, number]> = {
    RAW: [255, 32, 32],
    LAYOUT: [255, 128, 0],
    TYPOGRAPHY: [180, 32, 255],
    COLOR: [0, 180, 255],
    ASSET: [255, 210, 0],
    EFFECTS: [32, 230, 150],
  };
  for (let offset = 0; offset < result.length; offset += 4) {
    const delta = Math.max(
      Math.abs((reference.data[offset] ?? 0) - (target.data[offset] ?? 0)),
      Math.abs((reference.data[offset + 1] ?? 0) - (target.data[offset + 1] ?? 0)),
      Math.abs((reference.data[offset + 2] ?? 0) - (target.data[offset + 2] ?? 0)),
      Math.abs((reference.data[offset + 3] ?? 0) - (target.data[offset + 3] ?? 0)),
    );
    const color = tint[domain];
    result[offset] = color[0];
    result[offset + 1] = color[1];
    result[offset + 2] = color[2];
    result[offset + 3] = delta;
  }
  return { width: reference.width, height: reference.height, data: result, colorSpace: "SRGB" };
}

export function cropRaster(
  source: RasterPixels,
  region: { x: number; y: number; width: number; height: number },
): RasterPixels {
  assertRaster(source);
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const width = Math.max(1, Math.min(source.width - x, Math.ceil(region.width)));
  const height = Math.max(1, Math.min(source.height - y, Math.ceil(region.height)));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + width * 4), row * width * 4);
  }
  return { width, height, data, colorSpace: "SRGB" };
}

/**
 * The real mean RGB color of a raster region — the actual missing piece a correction needs to
 * know WHAT color a mismatched region should become. Nothing in this package previously extracted
 * a concrete color value from pixels; comparisons only ever produced distance metrics (comparePixels)
 * or content hashes, neither of which is a usable correction target.
 */
export function averageColor(raster: RasterPixels): { readonly r: number; readonly g: number; readonly b: number } {
  assertRaster(raster);
  const pixels = raster.width * raster.height;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    r += raster.data[offset] ?? 0;
    g += raster.data[offset + 1] ?? 0;
    b += raster.data[offset + 2] ?? 0;
  }
  return { r: r / pixels, g: g / pixels, b: b / pixels };
}

export function compareVisibleCrop(
  expected: { x: number; y: number; width: number; height: number },
  actual: { x: number; y: number; width: number; height: number },
): number {
  return (
    (Math.abs(expected.x - actual.x) +
      Math.abs(expected.y - actual.y) +
      Math.abs(expected.width - actual.width) +
      Math.abs(expected.height - actual.height)) /
    4
  );
}
