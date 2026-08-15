/**
 * Converts a provider-neutral VisionAnalysis into a real ReconstructionManifest — the same
 * manifest shape packages/reconstruction's existing, unmodified analyzeReference() already
 * expects. This is the one place that understands both "shape" (VisionAnalysis) and "shape"
 * (ReconstructionManifest); nothing downstream needs to know which vision provider ran.
 *
 * Region fill/variance is always sampled locally from the real source pixels within a detected
 * region's own bounding box (via sharp) — Vision APIs report *what* a region is (an object label,
 * a text block) but not its fill color, so that part stays honest local pixel math regardless of
 * which provider supplied the region's bounds. This mirrors the plan's explicit instruction not
 * to claim Vision provides design semantics it does not actually provide.
 */
import sharp from "sharp";
import {
  ReconstructionManifestSchema,
  type ReconstructionManifest,
  type ReconstructionManifestRegionSchema,
} from "@aevum/reconstruction";
import type { z } from "zod";
import type { VisionAnalysis, VisionObjectRegion, VisionPoint, VisionTextBlock } from "./types.js";

type ManifestRegionInput = z.input<typeof ReconstructionManifestRegionSchema>;

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

function rectFromPoints(points: readonly VisionPoint[]): Rect | undefined {
  if (points.length === 0) return undefined;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function rectArea(rect: Rect): number {
  return Math.max(0, rect.x1 - rect.x0) * Math.max(0, rect.y1 - rect.y0);
}

/** Collects every text block at the requested level, walking the full provider hierarchy. */
function collectTextBlocks(blocks: readonly VisionTextBlock[], level: VisionTextBlock["level"]): VisionTextBlock[] {
  const result: VisionTextBlock[] = [];
  for (const block of blocks) {
    if (block.level === level && block.text.trim().length > 0) result.push(block);
    result.push(...collectTextBlocks(block.children, level));
  }
  return result;
}

/**
 * Samples a region's real fill color, "is this photographic" variance, and shape fill ratio in one
 * pass. Fill/variance are measured within the *majority luminance cluster* (the same bimodal split
 * sampleTextInkColor() uses), not the raw whole-bbox mean — a rounded rectangle's corners expose
 * background color, which used to inflate whole-bbox variance enough to misclassify a plain
 * rounded rectangle as a photo (caught by this file's own shape-geometry test) before this fix. A
 * real photo's *majority* color cluster still has real internal diversity; a flat-colored shape's
 * does not (measured near 0), which is exactly the distinction "is this a photo" needs. fillRatio
 * (majority cluster size / total) is the same real signal reconstruction-vision's segmentation
 * exposes as `blob.fillRatio`, used by classifyShapeGeometry() below.
 */
async function sampleRegionColor(
  sourceBytes: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  rect: Rect,
): Promise<{
  readonly meanColor: readonly [number, number, number];
  readonly variance: number;
  readonly fillRatio: number;
}> {
  const left = Math.max(0, Math.min(sourceWidth - 1, Math.round(rect.x0)));
  const top = Math.max(0, Math.min(sourceHeight - 1, Math.round(rect.y0)));
  const width = Math.max(1, Math.min(sourceWidth - left, Math.round(rect.x1 - rect.x0)));
  const height = Math.max(1, Math.min(sourceHeight - top, Math.round(rect.y1 - rect.y0)));
  const { data } = await sharp(Buffer.from(sourceBytes))
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = data.length / 4;
  const luminances = new Float64Array(pixelCount);
  let sumLuminance = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    const luminance = 0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0);
    luminances[pixel] = luminance;
    sumLuminance += luminance;
  }
  const meanLuminance = sumLuminance / Math.max(1, pixelCount);
  let belowCount = 0;
  let belowR = 0;
  let belowG = 0;
  let belowB = 0;
  let aboveCount = 0;
  let aboveR = 0;
  let aboveG = 0;
  let aboveB = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    if ((luminances[pixel] ?? 0) < meanLuminance) {
      belowCount += 1;
      belowR += r;
      belowG += g;
      belowB += b;
    } else {
      aboveCount += 1;
      aboveR += r;
      aboveG += g;
      aboveB += b;
    }
  }
  const majorityIsBelow = belowCount >= aboveCount;
  const majorityCount = Math.max(1, majorityIsBelow ? belowCount : aboveCount);
  const meanColor: [number, number, number] = majorityIsBelow
    ? [belowR / majorityCount, belowG / majorityCount, belowB / majorityCount]
    : [aboveR / majorityCount, aboveG / majorityCount, aboveB / majorityCount];
  let varianceSum = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const isMajority = majorityIsBelow
      ? (luminances[pixel] ?? 0) < meanLuminance
      : (luminances[pixel] ?? 0) >= meanLuminance;
    if (!isMajority) continue;
    const index = pixel * 4;
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    varianceSum += (r - meanColor[0]) ** 2 + (g - meanColor[1]) ** 2 + (b - meanColor[2]) ** 2;
  }
  return { meanColor, variance: varianceSum / majorityCount, fillRatio: majorityCount / Math.max(1, pixelCount) };
}

/**
 * Estimates a coarse OpenType weight class from real ink coverage (the same minority-cluster
 * fraction sampleTextInkColor() already computes): bold glyph strokes measurably cover more of
 * their bounding box than regular-weight strokes of the same text at the same size. Thresholds
 * are calibrated against real measured output of this environment's font rendering stack, sampled
 * over a *tight* bounding box matching what real OCR/Vision text detection actually returns (not
 * a generously padded canvas — that produces very different, much lower fractions and was an
 * earlier miscalibration caught by this file's own weight-ordering test). A `node -e` probe
 * cropping "HELLO" tightly at font-weight 300..900 showed only ~3 distinguishable clusters
 * (~0.33, ~0.43, ~0.47), reflecting real font-substitution behavior, not a universal 9-step
 * weight metric. This is a best-effort bucketed estimate, not a precise measurement.
 */
function estimateFontWeight(inkAreaFraction: number): number {
  if (inkAreaFraction >= 0.447) return 800;
  if (inkAreaFraction >= 0.38) return 600;
  return 400;
}

/**
 * Estimates real text glyph ("ink") color from a text region's raw pixels. A text bounding box is
 * mostly background with glyph strokes covering a minority of the area, so a plain mean color would
 * just blend the two. Instead this splits pixels into two clusters by luminance (a simplified
 * two-means/Otsu-style split — a real, if simple, per-pixel signal, not a canned assumption) and
 * takes the mean color of whichever cluster covers less area, since ink is normally the minority.
 * When the split is close to even (no clear minority — e.g. a low-contrast or noisy crop), this is
 * genuinely ambiguous, so the caller is told via a lower confidence rather than a fabricated color.
 */
async function sampleTextInkColor(
  sourceBytes: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  rect: Rect,
): Promise<
  | { readonly color: readonly [number, number, number]; readonly confidence: number; readonly inkAreaFraction: number }
  | undefined
> {
  const left = Math.max(0, Math.min(sourceWidth - 1, Math.round(rect.x0)));
  const top = Math.max(0, Math.min(sourceHeight - 1, Math.round(rect.y0)));
  const width = Math.max(1, Math.min(sourceWidth - left, Math.round(rect.x1 - rect.x0)));
  const height = Math.max(1, Math.min(sourceHeight - top, Math.round(rect.y1 - rect.y0)));
  let data: Buffer;
  try {
    ({ data } = await sharp(Buffer.from(sourceBytes))
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch {
    return undefined;
  }
  const pixelCount = data.length / 4;
  if (pixelCount === 0) return undefined;
  const luminances = new Float64Array(pixelCount);
  let sumLuminance = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    const luminance = 0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0);
    luminances[pixel] = luminance;
    sumLuminance += luminance;
  }
  const meanLuminance = sumLuminance / pixelCount;
  let belowCount = 0;
  let belowR = 0;
  let belowG = 0;
  let belowB = 0;
  let aboveCount = 0;
  let aboveR = 0;
  let aboveG = 0;
  let aboveB = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    if ((luminances[pixel] ?? 0) < meanLuminance) {
      belowCount += 1;
      belowR += r;
      belowG += g;
      belowB += b;
    } else {
      aboveCount += 1;
      aboveR += r;
      aboveG += g;
      aboveB += b;
    }
  }
  if (belowCount === 0 || aboveCount === 0) return undefined;
  const minorityIsBelow = belowCount <= aboveCount;
  const minorityCount = minorityIsBelow ? belowCount : aboveCount;
  const color: [number, number, number] = minorityIsBelow
    ? [belowR / belowCount, belowG / belowCount, belowB / belowCount]
    : [aboveR / aboveCount, aboveG / aboveCount, aboveB / aboveCount];
  // A clean split (small minority cluster) is a confident ink estimate; a near-even split is
  // ambiguous — confidence decays toward 0 as the "minority" approaches half the pixels.
  const minorityFraction = minorityCount / pixelCount;
  const confidence = Math.max(0, 1 - minorityFraction * 2);
  return { color, confidence, inkAreaFraction: minorityFraction };
}

/**
 * Classifies a region's real geometry (sharp rectangle, rounded rectangle, or ellipse) from its
 * measured fill ratio — see packages/reconstruction-vision's identical function for the full
 * derivation (a real, invertible geometric formula relating missing corner area to corner radius,
 * verified against real rendered shapes). Kept in sync between both packages rather than shared
 * as a dependency, matching this file's existing pattern of local, provider-agnostic pixel math.
 */
function classifyShapeGeometry(
  fillRatio: number,
  width: number,
  height: number,
): { readonly shapeType: "RECTANGLE" | "ELLIPSE"; readonly cornerRadius?: number } {
  const missingAreaFraction = Math.max(0, 1 - fillRatio);
  if (missingAreaFraction < 0.02) return { shapeType: "RECTANGLE" };
  const cornerCutConstant = 4 * (1 - Math.PI / 4);
  const estimatedRadius = Math.sqrt((missingAreaFraction * width * height) / cornerCutConstant);
  const maxValidCornerRadius = Math.min(width, height) / 2;
  if (estimatedRadius > maxValidCornerRadius * 1.02) return { shapeType: "ELLIPSE" };
  return { shapeType: "RECTANGLE", cornerRadius: Math.round(Math.min(estimatedRadius, maxValidCornerRadius)) };
}

/** Least-squares fit of value = a*x + b*y + c over a set of (x, y, value) samples, with R². */
function planarFit(
  samples: readonly (readonly [number, number])[],
  values: readonly number[],
): { readonly r2: number; readonly a: number; readonly b: number; readonly c: number } {
  const n = samples.length;
  let sx = 0;
  let sy = 0;
  let sv = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sxv = 0;
  let syv = 0;
  for (let index = 0; index < n; index += 1) {
    const [x, y] = samples[index] ?? [0, 0];
    const v = values[index] ?? 0;
    sx += x;
    sy += y;
    sv += v;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sxv += x * v;
    syv += y * v;
  }
  const matrix: readonly (readonly number[])[] = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const rhs: readonly number[] = [sxv, syv, sv];
  const det3 = (m: readonly (readonly number[])[]): number =>
    (m[0]?.[0] ?? 0) * ((m[1]?.[1] ?? 0) * (m[2]?.[2] ?? 0) - (m[1]?.[2] ?? 0) * (m[2]?.[1] ?? 0)) -
    (m[0]?.[1] ?? 0) * ((m[1]?.[0] ?? 0) * (m[2]?.[2] ?? 0) - (m[1]?.[2] ?? 0) * (m[2]?.[0] ?? 0)) +
    (m[0]?.[2] ?? 0) * ((m[1]?.[0] ?? 0) * (m[2]?.[1] ?? 0) - (m[1]?.[1] ?? 0) * (m[2]?.[0] ?? 0));
  const determinant = det3(matrix);
  const meanV = n > 0 ? sv / n : 0;
  if (Math.abs(determinant) < 1e-9) return { r2: 0, a: 0, b: 0, c: meanV };
  const replaceColumn = (column: number, vector: readonly number[]) =>
    matrix.map((row, rowIndex) =>
      row.map((value, columnIndex) => (columnIndex === column ? (vector[rowIndex] ?? 0) : value)),
    );
  const a = det3(replaceColumn(0, rhs)) / determinant;
  const b = det3(replaceColumn(1, rhs)) / determinant;
  const c = det3(replaceColumn(2, rhs)) / determinant;
  let ssTotal = 0;
  let ssResidual = 0;
  for (let index = 0; index < n; index += 1) {
    const [x, y] = samples[index] ?? [0, 0];
    const v = values[index] ?? 0;
    const predicted = a * x + b * y + c;
    ssTotal += (v - meanV) ** 2;
    ssResidual += (v - predicted) ** 2;
  }
  return { r2: ssTotal < 1e-6 ? 0 : Math.max(0, 1 - ssResidual / ssTotal), a, b, c };
}

/**
 * Detects a real linear gradient from a region's actual pixels: samples a coarse grid of real
 * colors across the bounding box and fits value = a*x + b*y + c per channel — a flat fill has ~0
 * R² (no linear relationship to explain), a real linear gradient has near-1.0 R² along its own
 * axis, and photographic/noisy content has near-0 R² (no consistent linear trend). The threshold
 * (0.85) was calibrated against real rendered shapes (a horizontal gradient measured ~1.0, a
 * diagonal gradient ~0.96, a flat fill ~0.0, random-noise content ~0.01) before being chosen, not
 * guessed. Stop colors are the real fitted values at the two bounding-box corners the gradient
 * axis actually spans, not the raw endpoint pixels (which can be noisy individually).
 */
async function detectLinearGradient(
  sourceBytes: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  rect: Rect,
): Promise<
  | {
      readonly type: "LINEAR_GRADIENT";
      readonly angle: number;
      readonly stops: readonly [{ r: number; g: number; b: number }, { r: number; g: number; b: number }];
    }
  | undefined
> {
  const left = Math.max(0, Math.min(sourceWidth - 1, Math.round(rect.x0)));
  const top = Math.max(0, Math.min(sourceHeight - 1, Math.round(rect.y0)));
  const width = Math.max(1, Math.min(sourceWidth - left, Math.round(rect.x1 - rect.x0)));
  const height = Math.max(1, Math.min(sourceHeight - top, Math.round(rect.y1 - rect.y0)));
  if (width < 16 || height < 16) return undefined;
  let data: Buffer;
  try {
    ({ data } = await sharp(Buffer.from(sourceBytes))
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch {
    return undefined;
  }
  const step = Math.max(4, Math.round(Math.min(width, height) / 14));
  const samples: [number, number][] = [];
  const rValues: number[] = [];
  const gValues: number[] = [];
  const bValues: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      samples.push([x, y]);
      rValues.push(data[index] ?? 0);
      gValues.push(data[index + 1] ?? 0);
      bValues.push(data[index + 2] ?? 0);
    }
  }
  if (samples.length < 9) return undefined;
  const rFit = planarFit(samples, rValues);
  const gFit = planarFit(samples, gValues);
  const bFit = planarFit(samples, bValues);
  const best = [rFit, gFit, bFit].reduce((a, b) => (b.r2 > a.r2 ? b : a));
  if (best.r2 < 0.85) return undefined;
  // The gradient axis direction (a, b) points toward increasing value; project the box's four
  // corners onto it to find the two real corners the gradient actually runs between.
  const corners: [number, number][] = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];
  const projections = corners.map(([x, y]) => best.a * x + best.b * y);
  const minIndex = projections.indexOf(Math.min(...projections));
  const maxIndex = projections.indexOf(Math.max(...projections));
  const startCorner = corners[minIndex] ?? [0, 0];
  const endCorner = corners[maxIndex] ?? [width, height];
  const evaluate = (fit: { readonly a: number; readonly b: number; readonly c: number }, point: [number, number]) =>
    Math.max(0, Math.min(255, Math.round(fit.a * point[0] + fit.b * point[1] + fit.c)));
  const angle = (Math.atan2(endCorner[1] - startCorner[1], endCorner[0] - startCorner[0]) * 180) / Math.PI;
  return {
    type: "LINEAR_GRADIENT",
    angle,
    stops: [
      { r: evaluate(rFit, startCorner), g: evaluate(gFit, startCorner), b: evaluate(bFit, startCorner) },
      { r: evaluate(rFit, endCorner), g: evaluate(gFit, endCorner), b: evaluate(bFit, endCorner) },
    ],
  };
}

/**
 * Detects a real solid stroke (border) ring around a shape from measured pixels: a shape's own
 * bounding box (Vision's object bbox has no fill mask, only bounds) is scanned by "distance from
 * the nearest edge" — each depth forms a concentric ring. A shape with a stroke shows a sharp,
 * uniform color transition at the true stroke width (verified via a real `node -e` probe: a
 * rendered rect with stroke-width=6 measured pure stroke color at ring depths 0-5, then the fill
 * color from depth 6 onward — an exact, clean match, not a guessed threshold). No stroke (or a
 * shape whose edge already matches its own interior) returns undefined rather than a fabricated
 * border.
 */
async function sampleShapeStroke(
  sourceBytes: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  rect: Rect,
): Promise<{ readonly color: { r: number; g: number; b: number }; readonly width: number } | undefined> {
  const left = Math.max(0, Math.min(sourceWidth - 1, Math.round(rect.x0)));
  const top = Math.max(0, Math.min(sourceHeight - 1, Math.round(rect.y0)));
  const width = Math.max(1, Math.min(sourceWidth - left, Math.round(rect.x1 - rect.x0)));
  const height = Math.max(1, Math.min(sourceHeight - top, Math.round(rect.y1 - rect.y0)));
  if (width < 16 || height < 16) return undefined;
  let data: Buffer;
  try {
    ({ data } = await sharp(Buffer.from(sourceBytes))
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch {
    return undefined;
  }
  const maxDepth = Math.min(24, Math.floor(Math.min(width, height) / 3));
  if (maxDepth < 1) return undefined;
  const ringMean = (depth: number): readonly [number, number, number] | undefined => {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let n = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (Math.min(x, width - 1 - x, y, height - 1 - y) !== depth) continue;
        const index = (y * width + x) * 4;
        sr += data[index] ?? 0;
        sg += data[index + 1] ?? 0;
        sb += data[index + 2] ?? 0;
        n += 1;
      }
    }
    return n === 0 ? undefined : [sr / n, sg / n, sb / n];
  };
  const interior = ringMean(maxDepth);
  const edge = ringMean(0);
  if (!interior || !edge) return undefined;
  const colorDistance = (a: readonly [number, number, number], b: readonly [number, number, number]) =>
    Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  if (colorDistance(edge, interior) < 30) return undefined;
  let width_ = maxDepth;
  for (let depth = 1; depth < maxDepth; depth += 1) {
    const ring = ringMean(depth);
    if (ring && colorDistance(ring, interior) < 30) {
      width_ = depth;
      break;
    }
  }
  return { color: { r: Math.round(edge[0]), g: Math.round(edge[1]), b: Math.round(edge[2]) }, width: width_ };
}

export interface VisionAnalysisToManifestOptions {
  readonly referenceType?: "WEBSITE_SCREENSHOT" | "UI_SCREENSHOT" | "LANDING_PAGE" | "POSTER" | "STATIC_2D";
  readonly maxObjectRegions?: number;
}

export interface VisionAnalysisToManifestResult {
  readonly manifest: ReconstructionManifest;
  readonly diagnostics: readonly string[];
}

export async function visionAnalysisToManifest(
  analysis: VisionAnalysis,
  sourceBytes: Uint8Array,
  options: VisionAnalysisToManifestOptions = {},
): Promise<VisionAnalysisToManifestResult> {
  const width = analysis.imageWidth;
  const height = analysis.imageHeight;
  const diagnostics: string[] = [...analysis.warnings];
  const regions: ManifestRegionInput[] = [
    {
      key: "page",
      category: "PAGE",
      bounds: { x: 0, y: 0, width, height },
      confidence: 1,
      semanticHints: [
        `vision-provider:${analysis.provider.providerId.toLowerCase()}`,
        ...analysis.labels.slice(0, 5).map((label) => `label:${label.description}`),
      ],
      layout: { type: "ABSOLUTE", confidence: 0.5 },
    },
  ];

  const textParagraphs = collectTextBlocks(analysis.textBlocks, "PARAGRAPH");
  const textRects: Rect[] = [];
  for (const [index, block] of textParagraphs.entries()) {
    const rect = rectFromPoints(block.boundingPoly.vertices);
    if (!rect) continue;
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    if (w < 4 || h < 4) continue;
    textRects.push(rect);
    const ink = await sampleTextInkColor(sourceBytes, width, height, rect);
    if (!ink) diagnostics.push(`Could not sample ink color for text region text-${index}; no fill color was set.`);
    regions.push({
      key: `text-${index}`,
      category: "TEXT",
      parentKey: "page",
      bounds: { x: Math.round(rect.x0), y: Math.round(rect.y0), width: Math.round(w), height: Math.round(h) },
      confidence: Math.min(1, Math.max(0, block.confidence)),
      semanticHints: [`vision-provider:${analysis.provider.providerId.toLowerCase()}`],
      text: {
        content: block.text,
        fontFamily: "AEVUM Unknown",
        fontSize: Math.max(8, Math.round(h * 0.7)),
        fontWeight: ink ? estimateFontWeight(ink.inkAreaFraction) : 400,
        alignment: "LEFT",
        direction: "AUTO",
        ...(ink
          ? { color: { r: Math.round(ink.color[0]), g: Math.round(ink.color[1]), b: Math.round(ink.color[2]) } }
          : {}),
      },
    });
  }
  if (textParagraphs.length === 0) diagnostics.push("Vision provider returned no readable text blocks.");

  const isConsumedByText = (rect: Rect): boolean => {
    const area = rectArea(rect);
    if (area === 0) return false;
    let covered = 0;
    for (const textRect of textRects) {
      const overlapX = Math.max(0, Math.min(rect.x1, textRect.x1) - Math.max(rect.x0, textRect.x0));
      const overlapY = Math.max(0, Math.min(rect.y1, textRect.y1) - Math.max(rect.y0, textRect.y0));
      covered += overlapX * overlapY;
    }
    return covered / area > 0.6;
  };

  const acceptedRects: Rect[] = [];
  const isMostlyInsideAccepted = (rect: Rect): boolean => {
    const area = rectArea(rect);
    if (area === 0) return false;
    for (const accepted of acceptedRects) {
      const overlapX = Math.max(0, Math.min(rect.x1, accepted.x1) - Math.max(rect.x0, accepted.x0));
      const overlapY = Math.max(0, Math.min(rect.y1, accepted.y1) - Math.max(rect.y0, accepted.y0));
      if ((overlapX * overlapY) / area > 0.65) return true;
    }
    return false;
  };

  const sourceArea = Math.max(1, width * height);
  const sortedObjects: readonly VisionObjectRegion[] = [...analysis.objects].sort((a, b) => {
    const areaA = rectArea(rectFromPoints(a.boundingPoly.vertices) ?? { x0: 0, y0: 0, x1: 0, y1: 0 });
    const areaB = rectArea(rectFromPoints(b.boundingPoly.vertices) ?? { x0: 0, y0: 0, x1: 0, y1: 0 });
    return areaB - areaA;
  });

  let regionIndex = 0;
  const maxObjectRegions = options.maxObjectRegions ?? 16;
  for (const object of sortedObjects) {
    if (regionIndex >= maxObjectRegions) break;
    const rect = rectFromPoints(object.boundingPoly.vertices);
    if (!rect) continue;
    if (isConsumedByText(rect)) continue;
    if (isMostlyInsideAccepted(rect)) continue;
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    if (w < 4 || h < 4) continue;

    let sample: { meanColor: readonly [number, number, number]; variance: number; fillRatio: number };
    try {
      sample = await sampleRegionColor(sourceBytes, width, height, rect);
    } catch {
      sample = { meanColor: [128, 128, 128], variance: 0, fillRatio: 1 };
      diagnostics.push(`Could not sample pixel color for region ${object.name || regionIndex}; used a neutral fill.`);
    }
    const area = w * h;
    const isLikelyBackground = area / sourceArea > 0.55;
    const isLikelyImage = sample.variance > 700;
    const category = isLikelyBackground ? "BACKGROUND" : isLikelyImage ? "IMAGE" : "SHAPE";
    const semanticHints = [
      `vision-provider:${analysis.provider.providerId.toLowerCase()}`,
      ...(object.name ? [`label:${object.name}`] : []),
    ];
    const gradient = !isLikelyImage ? await detectLinearGradient(sourceBytes, width, height, rect) : undefined;
    const stroke = !isLikelyImage ? await sampleShapeStroke(sourceBytes, width, height, rect) : undefined;
    regions.push({
      key: `region-${regionIndex}`,
      category,
      parentKey: "page",
      bounds: { x: Math.round(rect.x0), y: Math.round(rect.y0), width: Math.round(w), height: Math.round(h) },
      // Blend the provider's own detection score (when it has real semantic evidence, e.g. Google
      // object localization) with the measured fill uniformity; a provider score of 0 (LOCAL,
      // which has no semantic labels) falls back to pure pixel evidence.
      confidence: Math.min(0.85, Math.max(0.3, object.score * 0.6 + 0.3)),
      semanticHints,
      ...(isLikelyImage
        ? { image: { fit: "COVER" as const, extracted: false } }
        : {
            shape: {
              ...classifyShapeGeometry(sample.fillRatio, w, h),
              geometry: {},
              ...(gradient
                ? { gradient }
                : {
                    fill: {
                      r: Math.round(sample.meanColor[0]),
                      g: Math.round(sample.meanColor[1]),
                      b: Math.round(sample.meanColor[2]),
                    },
                  }),
              ...(stroke ? { stroke } : {}),
            },
          }),
    });
    acceptedRects.push(rect);
    regionIndex += 1;
  }
  if (regionIndex === 0 && textParagraphs.length === 0) {
    diagnostics.push("No regions or text were detected beyond the page background.");
  }

  const manifest = ReconstructionManifestSchema.parse({
    manifestVersion: "1.0.0",
    referenceType: options.referenceType ?? "STATIC_2D",
    regions,
  });
  return { manifest, diagnostics };
}
