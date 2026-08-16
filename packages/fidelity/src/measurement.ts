import type { RenderGraph } from "@aevum/renderer-2d";
import { averageColor, comparePixels, cropRaster, type RasterPixels } from "./pixels.js";
import { type FidelityDomain, FidelityDomainSchema, type FidelityProfile } from "./profiles.js";
import type { RasterOutput } from "./raster.js";
import {
  type FidelityDomainEvidence,
  FidelityDomainEvidenceSchema,
  type FidelityDomainScore,
  type FidelityIssue,
  type FidelityMeasurement,
  FidelityMeasurementSchema,
} from "./schemas.js";
import { fidelityFingerprint, fidelityId } from "./stable.js";
import { compareStructuralFidelity, type StructuralExpectation } from "./structure.js";

export interface RegionExpectation {
  readonly id: string;
  readonly nodeId?: string;
  readonly region: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly domain: FidelityDomain;
  readonly property: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly confidence: number;
}

const severity = (score: number): FidelityIssue["severity"] =>
  score < 0.5 ? "BLOCKING" : score < 0.8 ? "ERROR" : score < 0.95 ? "WARNING" : "INFO";

function domainScores(
  issues: readonly FidelityIssue[],
  measured: ReadonlyMap<FidelityDomain, number>,
  total: ReadonlyMap<FidelityDomain, number>,
): FidelityDomainScore[] {
  return FidelityDomainSchema.options.map((domain) => {
    const domainIssues = issues.filter((issue) => issue.domain === domain);
    const measuredRegions = measured.get(domain) ?? 0;
    const totalRegions = total.get(domain) ?? 0;
    const coverage = totalRegions === 0 ? 0 : measuredRegions / totalRegions;
    const penalty =
      domainIssues.reduce((sum, issue) => sum + (issue.measurement ?? 0) * issue.confidence, 0) /
      Math.max(1, measuredRegions);
    return {
      domain,
      score: Math.max(0, Math.min(1, 1 - penalty)) * coverage,
      coverage,
      confidence:
        domainIssues.length === 0
          ? coverage
          : domainIssues.reduce((sum, issue) => sum + issue.confidence, 0) / domainIssues.length,
      measuredRegions,
      totalRegions,
      issueIds: domainIssues.map((issue) => issue.id).sort(),
      unsupportedFeatures: [
        ...new Set(domainIssues.filter((issue) => !issue.supported).map((issue) => issue.code)),
      ].sort(),
    };
  });
}

export function measureFidelity(input: {
  readonly referenceHash: `sha256:${string}`;
  readonly reference: RasterPixels;
  readonly target: RasterOutput;
  readonly graph: RenderGraph;
  readonly profile: FidelityProfile;
  readonly regions: readonly RegionExpectation[];
  readonly structuralExpectations?: readonly StructuralExpectation[];
  readonly domainEvidence?: readonly FidelityDomainEvidence[];
  readonly viewport: {
    id: string;
    width: number;
    height: number;
    devicePixelRatio: number;
    orientation: "PORTRAIT" | "LANDSCAPE";
    reducedMotion: boolean;
    time: number;
  };
}): FidelityMeasurement {
  const pixel = comparePixels(input.reference, input.target, {
    channelTolerance: input.profile.channelTolerance,
    maxPixels: input.target.width * input.target.height,
  });
  const issues: FidelityIssue[] = [];
  const measured = new Map<FidelityDomain, number>();
  const totals = new Map<FidelityDomain, number>();
  const addIssue = (draft: Omit<FidelityIssue, "id">) =>
    issues.push({ ...draft, id: fidelityId("fidelity-issue", draft) });
  const fullScore = Math.max(0, Math.min(1, 0.4 * (1 - pixel.mae) + 0.25 * (1 - pixel.rmse) + 0.35 * pixel.ssim));
  measured.set("RASTER", 1);
  totals.set("RASTER", 1);
  if (fullScore < input.profile.domainThresholds.RASTER)
    addIssue({
      domain: "RASTER",
      code: "PIXEL_MISMATCH",
      severity: severity(fullScore),
      property: "pixels",
      expected: input.referenceHash,
      actual: input.target.fingerprint,
      measurement: 1 - fullScore,
      confidence: 1,
      supported: true,
      message: "Real RGBA comparison is below the raster threshold.",
    });
  for (const region of input.regions) {
    totals.set(region.domain, (totals.get(region.domain) ?? 0) + 1);
    try {
      const local = comparePixels(cropRaster(input.reference, region.region), cropRaster(input.target, region.region), {
        channelTolerance: input.profile.channelTolerance,
        maxPixels: Math.ceil(region.region.width * region.region.height),
      });
      measured.set(region.domain, (measured.get(region.domain) ?? 0) + 1);
      const score = Math.max(0, Math.min(1, 0.5 * (1 - local.mae) + 0.5 * local.ssim));
      if (score < input.profile.domainThresholds[region.domain]) {
        // A real, usable correction target — not a content hash — for a plain COLOR region whose
        // caller didn't already supply one: the actual mean RGB the reference image shows in this
        // exact region, sampled from the real decoded reference pixels. Without this, "the color is
        // wrong" was measurable but never told anyone WHAT color it should become.
        const sampledExpected =
          region.domain === "COLOR" && region.expected === undefined
            ? averageColor(cropRaster(input.reference, region.region))
            : undefined;
        const sampledActual = sampledExpected ? averageColor(cropRaster(input.target, region.region)) : undefined;
        addIssue({
          domain: region.domain,
          code: `${region.domain}_REGION_MISMATCH`,
          severity: severity(score),
          ...(region.nodeId ? { nodeId: region.nodeId } : {}),
          region: region.region,
          property: region.property,
          expected: region.expected ?? sampledExpected ?? input.referenceHash,
          actual: region.actual ?? sampledActual ?? input.target.fingerprint,
          measurement: 1 - score,
          confidence: region.confidence,
          supported: true,
          message: `${region.domain} evidence differs in region ${region.id}.`,
        });
      }
    } catch {
      addIssue({
        domain: region.domain,
        code: "REGION_OUT_OF_BOUNDS",
        severity: "BLOCKING",
        ...(region.nodeId ? { nodeId: region.nodeId } : {}),
        region: region.region,
        property: region.property,
        expected: region.expected,
        actual: region.actual,
        confidence: region.confidence,
        supported: true,
        message: `Region ${region.id} cannot be compared safely.`,
      });
    }
  }
  for (const observation of input.target.typography.filter((entry) => entry.fallbackDetected))
    addIssue({
      domain: "TYPOGRAPHY",
      code: "FONT_FALLBACK",
      severity: "BLOCKING",
      nodeId: observation.nodeId,
      region: observation.bounds,
      property: "fontFamily",
      expected: observation.requestedFamilies,
      actual: "fallback",
      measurement: 1,
      confidence: 1,
      supported: true,
      message: "Requested custom font was not loaded; typography cannot receive a high score.",
    });
  for (const diagnostic of input.target.diagnostics.filter((entry) => !entry.supported))
    addIssue({
      domain: "EFFECTS",
      code: diagnostic.code,
      severity: "WARNING",
      ...(diagnostic.nodeId ? { nodeId: diagnostic.nodeId } : {}),
      property: "rasterSupport",
      expected: "supported",
      actual: diagnostic.message,
      measurement: 1,
      confidence: 1,
      supported: false,
      message: diagnostic.message,
    });
  const structuralIssues = compareStructuralFidelity({
    graph: input.graph,
    expectations: input.structuralExpectations ?? [],
    profile: input.profile,
    typography: input.target.typography,
  });
  for (const expectation of input.structuralExpectations ?? []) {
    const domain =
      expectation.property === "CROP"
        ? "CROP"
        : expectation.property === "LINE_BREAKS"
          ? "TYPOGRAPHY"
          : expectation.property === "GRADIENT"
            ? "COLOR"
            : "LAYOUT";
    totals.set(domain, (totals.get(domain) ?? 0) + 1);
    measured.set(domain, (measured.get(domain) ?? 0) + 1);
  }
  issues.push(...structuralIssues);
  const evidenceByDomain = new Map<FidelityDomain, FidelityDomainEvidence[]>();
  for (const rawEvidence of input.domainEvidence ?? []) {
    const evidence = FidelityDomainEvidenceSchema.parse(rawEvidence);
    const values = evidenceByDomain.get(evidence.domain) ?? [];
    values.push(evidence);
    evidenceByDomain.set(evidence.domain, values);
    totals.set(evidence.domain, (totals.get(evidence.domain) ?? 0) + 1);
    if (evidence.coverage > 0) measured.set(evidence.domain, (measured.get(evidence.domain) ?? 0) + 1);
    issues.push(...evidence.issues);
  }
  const scores = domainScores(issues, measured, totals).map((entry) => {
    if (entry.domain === "RASTER") return { ...entry, score: fullScore, coverage: 1, confidence: 1 };
    const evidence = evidenceByDomain.get(entry.domain);
    if (!evidence?.length) return entry;
    return {
      ...entry,
      score: evidence.reduce((sum, value) => sum + value.score, 0) / evidence.length,
      coverage: evidence.reduce((sum, value) => sum + value.coverage, 0) / evidence.length,
      confidence: evidence.reduce((sum, value) => sum + value.confidence, 0) / evidence.length,
      unsupportedFeatures: [
        ...new Set([...entry.unsupportedFeatures, ...evidence.flatMap((value) => value.unsupportedFeatures)]),
      ].sort(),
    };
  });
  const covered = scores.filter((entry) => entry.totalRegions > 0 || entry.domain === "RASTER");
  const coverage = covered.reduce((sum, entry) => sum + entry.coverage, 0) / Math.max(1, covered.length);
  const confidence = covered.reduce((sum, entry) => sum + entry.confidence, 0) / Math.max(1, covered.length);
  const overallScore = (covered.reduce((sum, entry) => sum + entry.score, 0) / Math.max(1, covered.length)) * coverage;
  const body = {
    referenceHash: input.referenceHash,
    targetHash: input.target.fingerprint,
    viewport: input.viewport,
    pixel,
    domainScores: scores,
    issues: issues.sort((a, b) => a.id.localeCompare(b.id)),
    overallScore,
    coverage,
    confidence,
    rendererVersion: `${input.graph.version}+${input.target.backendVersion}`,
  };
  const fingerprint = fidelityFingerprint(body);
  return FidelityMeasurementSchema.parse({ ...body, id: fidelityId("fidelity-measurement", fingerprint), fingerprint });
}
