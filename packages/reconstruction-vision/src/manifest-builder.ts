import sharp from "sharp";
import {
  ReconstructionManifestSchema,
  type ReconstructionManifest,
  type ReconstructionManifestRegionSchema,
} from "@aevum/reconstruction";
import type { z } from "zod";
import { segmentForeground, type Blob } from "./segmentation.js";
import { createOcrSession, type OcrTextRegion } from "./ocr.js";

type ManifestRegionInput = z.input<typeof ReconstructionManifestRegionSchema>;

export interface BuildManifestOptions {
  readonly referenceType?: "WEBSITE_SCREENSHOT" | "UI_SCREENSHOT" | "LANDING_PAGE" | "POSTER" | "STATIC_2D";
  /** Real local OCR via tesseract.js. Defaults on; disable for a pure-shapes pass. */
  readonly enableOcr?: boolean;
  readonly ocrCacheDir?: string;
  /** Segmentation runs on a downsampled copy for speed; bounds are scaled back to source pixels. */
  readonly workingMaxEdge?: number;
}

export interface BuildManifestResult {
  readonly manifest: ReconstructionManifest;
  /** Honest notes about what happened (e.g. OCR skipped or failed) — never silently swallowed. */
  readonly diagnostics: readonly string[];
}

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

function rectOf(bbox: OcrTextRegion["bbox"]): Rect {
  return { x0: bbox.x0, y0: bbox.y0, x1: bbox.x1, y1: bbox.y1 };
}

function rectArea(rect: Rect): number {
  return Math.max(0, rect.x1 - rect.x0) * Math.max(0, rect.y1 - rect.y0);
}

/**
 * Classifies a blob's real geometry (sharp rectangle, rounded rectangle, or ellipse) from its
 * measured `fillRatio` (filled pixel count / bounding-box area — already computed by
 * segmentForeground()), not a guess. A sharp rectangle has fillRatio ~1.0; each corner of a real
 * corner radius `r` cuts a (1 - pi/4) * r^2 area out of the bounding box, so a real, invertible
 * geometric formula solves for `r` from the measured missing area. Verified against real rendered
 * shapes (`node -e` probe measuring actual fillRatio for sharp rects, rx=10/25/50 rounded rects,
 * an ellipse, and a circle): estimated radii were within ~2px of the true SVG rx for moderate
 * radii, and a true ellipse/circle's fillRatio (~pi/4) exceeds what any valid corner radius for
 * that bounding box could produce, which is exactly the signal used to classify it as ELLIPSE
 * instead of a maximally-rounded rectangle — the two are the same shape at the limit (a square
 * rounded to r = side/2 *is* a circle), so that boundary is a real geometric fact, not an
 * approximation error.
 */
function classifyShapeGeometry(
  fillRatio: number,
  width: number,
  height: number,
): { readonly shapeType: "RECTANGLE" | "ELLIPSE"; readonly cornerRadius?: number } {
  const missingAreaFraction = Math.max(0, 1 - fillRatio);
  // Anti-aliasing and segmentation-mask noise alone typically account for ~1-2% missing area on a
  // genuinely sharp rectangle; below that, calling it "rounded" would be measurement noise, not a
  // real signal.
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
 * Detects a real linear gradient from a region's actual pixels — see packages/vision's identical
 * function for the full derivation and calibration (a real, measured R² threshold against real
 * rendered shapes, not guessed). Kept in sync between both packages rather than shared as a
 * dependency, matching this file's existing pattern of local, provider-agnostic pixel math.
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
 * A real gradient's smooth color sweep gets fragmented by segmentForeground()'s histogram color
 * quantization into several adjacent thin blobs of similar quantized color — confirmed via direct
 * debugging (a real 150px-wide test gradient produced a single ~19px-wide blob, whose detected
 * "gradient" was really just the narrow reddish slice it was given). This groups spatially
 * adjacent shape-candidate blobs via connected-component adjacency (rects that touch or overlap
 * within a small pixel tolerance) and re-tests each group's UNION bounding box for a real gradient
 * fit against full-resolution pixels — recovering the true gradient span instead of a misleading
 * narrow fragment. Groups that don't confirm as a real gradient (R² < 0.85, the same calibrated
 * threshold used everywhere else) are left alone; their member blobs fall through to the existing
 * per-blob emission, completely unchanged.
 */
async function findGradientBlobGroups(
  blobs: readonly Blob[],
  candidateIndices: readonly number[],
  toSourceScale: (value: number) => number,
  sourceBytes: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
): Promise<
  readonly {
    readonly rect: Rect;
    readonly gradient: NonNullable<Awaited<ReturnType<typeof detectLinearGradient>>>;
    readonly memberIndices: readonly number[];
  }[]
> {
  // Tolerance is in working (downsampled) pixels: adjacent quantized-color bands from the same
  // real gradient are typically 0-2px apart at that scale, with occasional anti-aliased seams.
  const tolerance = 3;
  const parent = new Map<number, number>(candidateIndices.map((index) => [index, index]));
  const find = (start: number): number => {
    let root = start;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    let cursor = start;
    while (parent.get(cursor) !== cursor) {
      const next = parent.get(cursor) ?? cursor;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  for (let i = 0; i < candidateIndices.length; i += 1) {
    for (let j = i + 1; j < candidateIndices.length; j += 1) {
      const indexA = candidateIndices[i];
      const indexB = candidateIndices[j];
      const a = indexA === undefined ? undefined : blobs[indexA];
      const b = indexB === undefined ? undefined : blobs[indexB];
      if (!a || !b || indexA === undefined || indexB === undefined) continue;
      const near =
        a.minX - tolerance <= b.maxX &&
        a.maxX + tolerance >= b.minX &&
        a.minY - tolerance <= b.maxY &&
        a.maxY + tolerance >= b.minY;
      if (near) {
        const rootA = find(indexA);
        const rootB = find(indexB);
        if (rootA !== rootB) parent.set(rootA, rootB);
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (const index of candidateIndices) {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(index);
    else groups.set(root, [index]);
  }
  const results: {
    rect: Rect;
    gradient: NonNullable<Awaited<ReturnType<typeof detectLinearGradient>>>;
    memberIndices: readonly number[];
  }[] = [];
  for (const memberIndices of groups.values()) {
    if (memberIndices.length < 2) continue;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const index of memberIndices) {
      const blob = blobs[index];
      if (!blob) continue;
      minX = Math.min(minX, blob.minX);
      minY = Math.min(minY, blob.minY);
      maxX = Math.max(maxX, blob.maxX);
      maxY = Math.max(maxY, blob.maxY);
    }
    const rect: Rect = {
      x0: toSourceScale(minX),
      y0: toSourceScale(minY),
      x1: toSourceScale(maxX),
      y1: toSourceScale(maxY),
    };
    const gradient = await detectLinearGradient(sourceBytes, sourceWidth, sourceHeight, rect);
    if (gradient) results.push({ rect, gradient, memberIndices });
  }
  return results;
}

/**
 * Two-pass local OCR: a whole-image, line-level pass gives rough candidate locations (tesseract
 * reading a busy scene end-to-end is noisy), then each candidate is cropped from the full-
 * resolution source and re-recognized in isolation, which is dramatically more accurate — a
 * standard localize-then-recognize technique, not a shortcut.
 */
async function detectTextRegions(
  bytes: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  cacheDir: string | undefined,
  diagnostics: string[],
): Promise<readonly OcrTextRegion[]> {
  const session = await createOcrSession(cacheDir ? { cacheDir } : {});
  try {
    const roughLines = await session.recognizeLines(bytes);
    const candidates = roughLines
      .map((line) => rectOf(line.bbox))
      .filter((rect) => {
        const area = rectArea(rect);
        const w = rect.x1 - rect.x0;
        const h = rect.y1 - rect.y0;
        // A real line of text — even a huge poster headline — is wide relative to its own
        // height, and doesn't span almost the whole canvas in both directions at once. A box
        // that's tall AND wide relative to the source is almost always a garbled whole-image
        // misread on a busy photo, not one real line, so it's discarded rather than kept.
        const spansMostOfWidth = w > sourceWidth * 0.92;
        const spansMostOfHeight = h > sourceHeight * 0.4;
        return area > 0 && w >= 6 && h >= 6 && !(spansMostOfWidth && spansMostOfHeight);
      })
      // Cap how many crops we re-OCR — a noisy photo can produce dozens of spurious line guesses.
      .slice(0, 24);

    const resolved: OcrTextRegion[] = [];
    for (const rect of candidates) {
      const paddingX = Math.max(4, Math.round((rect.x1 - rect.x0) * 0.08));
      const paddingY = Math.max(4, Math.round((rect.y1 - rect.y0) * 0.3));
      const left = Math.max(0, Math.round(rect.x0 - paddingX));
      const top = Math.max(0, Math.round(rect.y0 - paddingY));
      const width = Math.min(sourceWidth - left, Math.round(rect.x1 - rect.x0 + paddingX * 2));
      const height = Math.min(sourceHeight - top, Math.round(rect.y1 - rect.y0 + paddingY * 2));
      if (width < 4 || height < 4) continue;
      const crop = await sharp(Buffer.from(bytes))
        .extract({ left, top, width, height })
        .resize(width * 2, height * 2, { kernel: "cubic" })
        .grayscale()
        .normalize()
        .png()
        .toBuffer();
      const reread = await session.recognize(crop);
      const best = [...reread].sort((a, b) => b.confidence - a.confidence)[0];
      if (best && best.text.length > 0 && best.confidence >= 35) {
        resolved.push({ text: best.text, confidence: best.confidence, bbox: rect });
      }
    }
    if (roughLines.length > 0 && resolved.length === 0) {
      diagnostics.push("OCR located possible text regions but could not confidently read any of them.");
    }
    return resolved;
  } finally {
    await session.close();
  }
}

/**
 * Estimates real text glyph ("ink") color from a text region's raw pixels. A text bounding box is
 * mostly background with glyph strokes covering a minority of the area, so a plain mean color would
 * just blend the two. Instead this splits pixels into two clusters by luminance (a simplified
 * two-means/Otsu-style split — a real, if simple, per-pixel signal, not a canned assumption) and
 * takes the mean color of whichever cluster covers less area, since ink is normally the minority.
 * When the split is close to even (no clear minority), that is genuinely ambiguous, so no color is
 * returned rather than a fabricated one.
 */
/**
 * Estimates a coarse OpenType weight class from real ink coverage (the minority-cluster fraction
 * computed alongside ink color below): bold glyph strokes measurably cover more of their bounding
 * box than regular-weight strokes of the same text at the same size. Thresholds are calibrated
 * against real measured output of this environment's font rendering stack, sampled over a *tight*
 * bounding box matching what real OCR text detection actually returns (not a generously padded
 * canvas — that produces very different, much lower fractions and was an earlier miscalibration
 * caught by this package's own weight-ordering test). A `node -e` probe cropping "HELLO" tightly
 * at font-weight 300..900 showed only ~3 distinguishable clusters (~0.33, ~0.43, ~0.47), reflecting
 * real font-substitution behavior, not a universal 9-step weight scale — this is a best-effort
 * bucketed estimate, not a precise measurement.
 */
function estimateFontWeight(inkAreaFraction: number): number {
  if (inkAreaFraction >= 0.447) return 800;
  if (inkAreaFraction >= 0.38) return 600;
  return 400;
}

async function sampleTextInkColor(
  sourceBytes: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  rect: Rect,
): Promise<{ readonly color: readonly [number, number, number]; readonly inkAreaFraction: number } | undefined> {
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
  let sumLuminance = 0;
  const luminances = new Float64Array(pixelCount);
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
  return { color, inkAreaFraction: minorityCount / pixelCount };
}

export async function buildManifestFromImage(
  bytes: Uint8Array,
  options: BuildManifestOptions = {},
): Promise<BuildManifestResult> {
  const source = sharp(Buffer.from(bytes));
  const metadata = await source.metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) throw new Error("Could not determine source image dimensions.");

  const workingMaxEdge = options.workingMaxEdge ?? 480;
  const scale = Math.min(1, workingMaxEdge / Math.max(width, height));
  const workingWidth = Math.max(1, Math.round(width * scale));
  const workingHeight = Math.max(1, Math.round(height * scale));
  const { data } = await source
    .clone()
    .resize(workingWidth, workingHeight, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const segmentation = segmentForeground({
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: workingWidth,
    height: workingHeight,
  });

  const diagnostics: string[] = [];
  let ocrRegions: readonly OcrTextRegion[] = [];
  if (options.enableOcr ?? true) {
    try {
      ocrRegions = await detectTextRegions(bytes, width, height, options.ocrCacheDir, diagnostics);
    } catch (error) {
      diagnostics.push(
        `OCR failed, continuing without recognized text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    diagnostics.push("OCR disabled by caller; no text regions were produced.");
  }

  const toSourceScale = (value: number): number => value / scale;
  const regions: ManifestRegionInput[] = [
    {
      key: "page",
      category: "PAGE",
      bounds: { x: 0, y: 0, width, height },
      confidence: 1,
      semanticHints: ["reconstruction-vision:page-root"],
      layout: { type: "ABSOLUTE", confidence: 0.5 },
    },
  ];

  const textRects: Rect[] = [];
  for (const [index, region] of ocrRegions.entries()) {
    const rect = rectOf(region.bbox);
    const x = Math.max(0, Math.round(rect.x0));
    const y = Math.max(0, Math.round(rect.y0));
    const w = Math.min(width - x, Math.max(1, Math.round(rect.x1 - rect.x0)));
    const h = Math.min(height - y, Math.max(1, Math.round(rect.y1 - rect.y0)));
    if (w <= 0 || h <= 0) continue;
    textRects.push(rect);
    const ink = await sampleTextInkColor(bytes, width, height, rect);
    if (!ink) diagnostics.push(`Could not sample ink color for text region text-${index}; no fill color was set.`);
    regions.push({
      key: `text-${index}`,
      category: "TEXT",
      parentKey: "page",
      bounds: { x, y, width: w, height: h },
      confidence: Math.min(1, Math.max(0, region.confidence / 100)),
      semanticHints: ["reconstruction-vision:ocr"],
      text: {
        content: region.text,
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

  // A blob is "consumed" by text only when a text region actually accounts for most of that
  // blob's own area — a text line merely sitting on top of a large background/shape blob must
  // not cause the whole blob to be dropped.
  const isConsumedByText = (blob: Blob): boolean => {
    const bx0 = toSourceScale(blob.minX);
    const by0 = toSourceScale(blob.minY);
    const bx1 = toSourceScale(blob.maxX);
    const by1 = toSourceScale(blob.maxY);
    const blobArea = Math.max(1, (bx1 - bx0) * (by1 - by0));
    let coveredArea = 0;
    for (const rect of textRects) {
      const overlapX = Math.max(0, Math.min(bx1, rect.x1) - Math.max(bx0, rect.x0));
      const overlapY = Math.max(0, Math.min(by1, rect.y1) - Math.max(by0, rect.y0));
      coveredArea += overlapX * overlapY;
    }
    return coveredArea / blobArea > 0.6;
  };

  const sourceArea = width * height;
  // Non-max suppression by area: a busy photograph's color quantization can still fragment one
  // real visual zone into many overlapping blobs of different clusters. Once a large blob is
  // accepted, a smaller blob mostly contained inside it is almost always a sub-fragment of the
  // same zone (a highlight, a shadow edge) rather than its own distinct design element, so it's
  // dropped rather than kept as one more redundant region.
  const acceptedRects: Rect[] = [];
  const isMostlyInsideAccepted = (blob: Blob): boolean => {
    const bx0 = toSourceScale(blob.minX);
    const by0 = toSourceScale(blob.minY);
    const bx1 = toSourceScale(blob.maxX);
    const by1 = toSourceScale(blob.maxY);
    const blobArea = Math.max(1, (bx1 - bx0) * (by1 - by0));
    for (const rect of acceptedRects) {
      const overlapX = Math.max(0, Math.min(bx1, rect.x1) - Math.max(bx0, rect.x0));
      const overlapY = Math.max(0, Math.min(by1, rect.y1) - Math.max(by0, rect.y0));
      if ((overlapX * overlapY) / blobArea > 0.65) return true;
    }
    return false;
  };

  let regionIndex = 0;
  // Cap total shape/image regions — only the most significant color-cluster zones survive; small
  // fragments are dropped as noise rather than kept as spurious extra layers.
  const maxShapeRegions = 16;

  // Real gradients get fragmented into several adjacent thin blobs by color-quantization
  // segmentation (see findGradientBlobGroups' doc comment); recover the true span before the
  // per-blob loop runs, so a merged gradient region is emitted once instead of several
  // misleadingly narrow, wrong-colored fragments.
  const gradientCandidateIndices = segmentation.blobs
    .map((blob, index) => ({ blob, index }))
    .filter(({ blob }) => {
      if (isConsumedByText(blob)) return false;
      // Deliberately does NOT exclude high colorVariance blobs here (unlike the per-blob
      // isLikelyImage check below): a real gradient color-band fragment legitimately has elevated
      // internal variance, since it spans a range of the gradient rather than one flat color — that
      // variance is exactly the signal that would wrongly exclude real gradient bands from ever
      // being grouped. The R² check inside findGradientBlobGroups is the real, correct gate for
      // "is this actually a gradient," not this coarse candidacy filter.
      const area = toSourceScale(blob.maxX - blob.minX) * toSourceScale(blob.maxY - blob.minY);
      const isLikelyBackground = area / sourceArea > 0.55;
      return !isLikelyBackground;
    })
    .map(({ index }) => index);
  const gradientGroups = await findGradientBlobGroups(
    segmentation.blobs,
    gradientCandidateIndices,
    toSourceScale,
    bytes,
    width,
    height,
  );
  const mergedBlobIndices = new Set<number>();
  for (const group of gradientGroups) {
    if (regionIndex >= maxShapeRegions) break;
    const x = Math.max(0, Math.round(group.rect.x0));
    const y = Math.max(0, Math.round(group.rect.y0));
    const w = Math.min(width - x, Math.max(1, Math.round(group.rect.x1 - group.rect.x0)));
    const h = Math.min(height - y, Math.max(1, Math.round(group.rect.y1 - group.rect.y0)));
    if (w <= 0 || h <= 0) continue;
    for (const index of group.memberIndices) mergedBlobIndices.add(index);
    regions.push({
      key: `region-${regionIndex}`,
      category: "SHAPE",
      parentKey: "page",
      bounds: { x, y, width: w, height: h },
      confidence: 0.7,
      semanticHints: ["reconstruction-vision:merged-gradient-cluster"],
      // Corner-radius/ellipse detection isn't attempted on a merged multi-blob group (no single
      // fillRatio measurement spans it cleanly); a merged gradient region is always reported as a
      // sharp rectangle. A rounded-corner gradient shape is a known, documented limitation, not a
      // silent approximation.
      shape: { shapeType: "RECTANGLE", geometry: {}, gradient: group.gradient },
    });
    acceptedRects.push({ x0: x, y0: y, x1: x + w, y1: y + h });
    regionIndex += 1;
  }

  for (const [blobIndex, blob] of segmentation.blobs.entries()) {
    if (regionIndex >= maxShapeRegions) break;
    if (mergedBlobIndices.has(blobIndex)) continue;
    if (isConsumedByText(blob)) continue;
    if (isMostlyInsideAccepted(blob)) continue;
    const x = Math.max(0, Math.round(toSourceScale(blob.minX)));
    const y = Math.max(0, Math.round(toSourceScale(blob.minY)));
    const w = Math.min(width - x, Math.max(1, Math.round(toSourceScale(blob.maxX - blob.minX))));
    const h = Math.min(height - y, Math.max(1, Math.round(toSourceScale(blob.maxY - blob.minY))));
    if (w <= 0 || h <= 0) continue;
    const area = w * h;
    // Real, measured signals (not guessed): a blob whose interior color varies a lot is more
    // likely a photo/illustration; one covering most of the canvas is more likely a background;
    // otherwise a fairly uniform, bounded blob reads as a flat shape.
    const isLikelyImage = blob.colorVariance > 700;
    const isLikelyBackground = area / sourceArea > 0.55;
    const category = isLikelyBackground ? "BACKGROUND" : isLikelyImage ? "IMAGE" : "SHAPE";
    const gradient = !isLikelyImage
      ? await detectLinearGradient(bytes, width, height, { x0: x, y0: y, x1: x + w, y1: y + h })
      : undefined;
    regions.push({
      key: `region-${regionIndex}`,
      category,
      parentKey: "page",
      bounds: { x, y, width: w, height: h },
      confidence: Math.min(0.8, 0.3 + blob.fillRatio * 0.5),
      semanticHints: [
        isLikelyBackground
          ? "reconstruction-vision:background-cluster"
          : isLikelyImage
            ? "reconstruction-vision:high-variance-cluster"
            : "reconstruction-vision:solid-cluster",
      ],
      ...(isLikelyImage
        ? { image: { fit: "COVER" as const, extracted: false } }
        : {
            shape: {
              ...classifyShapeGeometry(blob.fillRatio, w, h),
              geometry: {},
              ...(gradient
                ? { gradient }
                : {
                    fill: {
                      r: Math.round(blob.meanColor[0]),
                      g: Math.round(blob.meanColor[1]),
                      b: Math.round(blob.meanColor[2]),
                    },
                  }),
            },
          }),
    });
    // A BACKGROUND blob's own bounding box typically spans nearly the whole canvas even though
    // its actual pixels have a hole where foreground elements sit — so it must never suppress
    // smaller blobs nested inside that bounding box, or every real foreground element behind a
    // colored background would be wrongly dropped as "contained" in it.
    if (category !== "BACKGROUND") acceptedRects.push({ x0: x, y0: y, x1: x + w, y1: y + h });
    regionIndex += 1;
  }

  if (regionIndex === 0 && ocrRegions.length === 0) {
    diagnostics.push(
      "No foreground regions were detected beyond the page background; this image may be nearly uniform or its color palette may not separate cleanly.",
    );
  }

  const manifest = ReconstructionManifestSchema.parse({
    manifestVersion: "1.0.0",
    referenceType: options.referenceType ?? "STATIC_2D",
    regions,
  });
  return { manifest, diagnostics };
}
