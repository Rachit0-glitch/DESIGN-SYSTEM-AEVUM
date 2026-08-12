import {
  DEFAULT_LIGHTING_LIMITS,
  LightingEstimateSchema,
  ReferenceLightingInputSchema,
  type LightingEstimate,
  type LightingResourceLimits,
  type ReferenceLightingInput,
} from "./schemas.js";
import { deepFreeze, lightingFingerprint } from "./stable.js";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function normalize(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const magnitude = Math.hypot(x, y, z) || 1;
  return { x: x / magnitude, y: y / magnitude, z: z / magnitude };
}

function correlatedColorTemperature(r: number, g: number, b: number): number {
  const linear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);
  const x = lr * 0.4124 + lg * 0.3576 + lb * 0.1805;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = lr * 0.0193 + lg * 0.1192 + lb * 0.9505;
  const sum = x + y + z;
  if (sum <= 1e-9) return 6_500;
  const chromaticX = x / sum;
  const chromaticY = y / sum;
  const n = (chromaticX - 0.332) / (0.1858 - chromaticY || 1e-9);
  return clamp(449 * n ** 3 + 3_525 * n ** 2 + 6_823.3 * n + 5_520.33, 1_000, 40_000);
}

export function analyzeReferenceLighting(
  raw: ReferenceLightingInput,
  limits: LightingResourceLimits = DEFAULT_LIGHTING_LIMITS,
): LightingEstimate {
  const input = ReferenceLightingInputSchema.parse(raw);
  if (input.samples.length > limits.maxSamples) {
    throw new Error(`Reference lighting analysis exceeds the ${limits.maxSamples} sample limit.`);
  }
  const samples = input.samples.map((sample) => ({
    ...sample,
    luminance: clamp((0.2126 * sample.r + 0.7152 * sample.g + 0.0722 * sample.b) * sample.a),
  }));
  const luminances = samples.map((sample) => sample.luminance).sort((a, b) => a - b);
  const quantile = (position: number) =>
    luminances[Math.min(luminances.length - 1, Math.floor(position * luminances.length))] ?? 0;
  const low = quantile(0.2);
  const high = quantile(0.8);
  const mean = samples.reduce((sum, sample) => sum + sample.luminance, 0) / samples.length;
  const highlights = samples.filter((sample) => sample.region === "HIGHLIGHT" || sample.luminance >= high);
  const shadows = samples.filter((sample) => sample.region === "SHADOW" || sample.luminance <= low);
  const highlightWeight = highlights.reduce((sum, sample) => sum + Math.max(sample.luminance, 1e-6), 0);
  const centroid = {
    x: clamp(
      highlights.reduce((sum, sample) => sum + (sample.x / Math.max(1, input.width - 1)) * sample.luminance, 0) /
        highlightWeight,
    ),
    y: clamp(
      highlights.reduce((sum, sample) => sum + (sample.y / Math.max(1, input.height - 1)) * sample.luminance, 0) /
        highlightWeight,
    ),
  };
  const keyDirection = normalize((centroid.x - 0.5) * 2, (0.5 - centroid.y) * 2, -1);
  const fillDirection = normalize(-keyDirection.x, -keyDirection.y * 0.35, -0.5);
  const rimDirection = normalize(-keyDirection.x, 0.35, 1);
  const highlightMean = highlights.reduce((sum, sample) => sum + sample.luminance, 0) / highlights.length;
  const shadowMean = shadows.reduce((sum, sample) => sum + sample.luminance, 0) / shadows.length;
  const colorWeight = highlights.reduce((sum, sample) => sum + sample.a, 0) || 1;
  const averageColor = {
    r: highlights.reduce((sum, sample) => sum + sample.r * sample.a, 0) / colorWeight,
    g: highlights.reduce((sum, sample) => sum + sample.g * sample.a, 0) / colorWeight,
    b: highlights.reduce((sum, sample) => sum + sample.b * sample.a, 0) / colorWeight,
  };
  const labelled = (region: string) => samples.filter((sample) => sample.region === region).length / samples.length;
  const shadowVariance =
    shadows.reduce((sum, sample) => sum + (sample.luminance - shadowMean) ** 2, 0) / shadows.length;
  const diagnostics = [];
  if (samples.length < 64) {
    diagnostics.push({
      code: "REFERENCE_INSUFFICIENT" as const,
      severity: "WARNING" as const,
      domain: "LIGHTING" as const,
      message: "Reference lighting confidence is reduced because fewer than 64 samples were supplied.",
      recoverable: true,
    });
  }
  const evidence = {
    sampleCount: samples.length,
    meanLuminance: mean,
    luminanceRange: (luminances.at(-1) ?? 0) - (luminances[0] ?? 0),
    highlightCentroid: centroid,
    shadowFraction: shadows.length / samples.length,
    highlightFraction: highlights.length / samples.length,
  };
  const body = {
    version: "1.0.0" as const,
    referenceId: input.referenceId,
    keyDirection,
    fillDirection,
    rimDirection,
    keyToFillRatio: clamp(highlightMean / Math.max(shadowMean, 0.001), 1, 1_000),
    temperatureKelvin: correlatedColorTemperature(averageColor.r, averageColor.g, averageColor.b),
    shadowSoftness: clamp(1 - Math.sqrt(shadowVariance) * 4),
    environmentContribution: clamp((mean - shadowMean) / Math.max(highlightMean, 0.001)),
    reflectionContribution: clamp(labelled("REFLECTION") * 4 + evidence.highlightFraction * 0.25),
    contactShadow: clamp(labelled("SHADOW") * 3 + evidence.shadowFraction * 0.25),
    volumetricContribution: clamp(labelled("VOLUME") * 4),
    confidence: clamp(Math.min(1, samples.length / 256) * 0.55 + evidence.luminanceRange * 0.45),
    evidence,
    diagnostics,
  };
  return deepFreeze(LightingEstimateSchema.parse({ ...body, fingerprint: lightingFingerprint(body) }));
}
