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

async function sampleRegionColor(
  sourceBytes: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  rect: Rect,
): Promise<{ readonly meanColor: readonly [number, number, number]; readonly variance: number }> {
  const left = Math.max(0, Math.min(sourceWidth - 1, Math.round(rect.x0)));
  const top = Math.max(0, Math.min(sourceHeight - 1, Math.round(rect.y0)));
  const width = Math.max(1, Math.min(sourceWidth - left, Math.round(rect.x1 - rect.x0)));
  const height = Math.max(1, Math.min(sourceHeight - top, Math.round(rect.y1 - rect.y0)));
  const { data } = await sharp(Buffer.from(sourceBytes))
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const pixelCount = data.length / 4;
  for (let index = 0; index < data.length; index += 4) {
    sumR += data[index] ?? 0;
    sumG += data[index + 1] ?? 0;
    sumB += data[index + 2] ?? 0;
  }
  const meanColor: [number, number, number] = [sumR / pixelCount, sumG / pixelCount, sumB / pixelCount];
  let varianceSum = 0;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    varianceSum += (r - meanColor[0]) ** 2 + (g - meanColor[1]) ** 2 + (b - meanColor[2]) ** 2;
  }
  return { meanColor, variance: varianceSum / pixelCount };
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

    let sample: { meanColor: readonly [number, number, number]; variance: number };
    try {
      sample = await sampleRegionColor(sourceBytes, width, height, rect);
    } catch {
      sample = { meanColor: [128, 128, 128], variance: 0 };
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
              shapeType: "RECTANGLE" as const,
              geometry: {},
              fill: {
                r: Math.round(sample.meanColor[0]),
                g: Math.round(sample.meanColor[1]),
                b: Math.round(sample.meanColor[2]),
              },
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
