import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { RenderGraph } from "@aevum/renderer-2d";
import { FidelityCache } from "./cache.js";
import { measureFidelity, type RegionExpectation } from "./measurement.js";
import type { RasterPixels } from "./pixels.js";
import {
  FidelityDomainSchema,
  resolveFidelityProfile,
  type FidelityDomain,
  type FidelityProfileName,
} from "./profiles.js";
import type { RasterBackend, RasterRequest } from "./raster.js";
import {
  FidelityReportSchema,
  FidelityTaskSchema,
  type FidelityDomainEvidence,
  type FidelityDomainScore,
  type FidelityIssue,
  type FidelityMeasurement,
  type FidelityPass,
  type FidelityReference,
  type FidelityReport,
  type FidelityTask,
} from "./schemas.js";
import { deepFreeze, fidelityFingerprint, fidelityId } from "./stable.js";
import type { StructuralExpectation } from "./structure.js";

export interface FidelityView {
  readonly reference: FidelityReference;
  readonly referenceRaster: RasterPixels;
  readonly graph: RenderGraph;
  readonly regions: readonly RegionExpectation[];
  readonly structuralExpectations?: readonly StructuralExpectation[];
  readonly domainEvidence?: readonly FidelityDomainEvidence[];
}

export interface FidelityCorrectionProposal {
  readonly fingerprint: `sha256:${string}`;
  readonly issueIds: readonly string[];
  readonly affectedNodeIds: readonly string[];
  readonly affectedProperties: readonly string[];
  readonly expectedDocumentVersion: number;
  readonly priority: number;
}

export interface FidelityCorrectionResult {
  readonly status: "APPLIED" | "REJECTED" | "VERSION_CONFLICT" | "NO_CORRECTION";
  readonly document: CanonicalDesignDocument;
  readonly views?: readonly FidelityView[];
  readonly correctionFingerprint?: `sha256:${string}`;
  readonly message: string;
}

export interface FidelityCorrectionAdapter {
  readonly id: string;
  readonly version: string;
  propose(input: {
    readonly document: CanonicalDesignDocument;
    readonly measurements: readonly FidelityMeasurement[];
    readonly protectedNodeIds: readonly string[];
  }): Promise<readonly FidelityCorrectionProposal[]>;
  dryRun(input: {
    readonly document: CanonicalDesignDocument;
    readonly proposal: FidelityCorrectionProposal;
  }): Promise<{ readonly valid: boolean; readonly message: string }>;
  apply(input: {
    readonly document: CanonicalDesignDocument;
    readonly proposal: FidelityCorrectionProposal;
  }): Promise<FidelityCorrectionResult>;
}

const priority: Readonly<Record<FidelityDomain, number>> = {
  ASSET: 10,
  GEOMETRY_3D: 15,
  LAYOUT: 20,
  RESPONSIVE: 25,
  TYPOGRAPHY: 30,
  CROP: 40,
  COLOR: 50,
  MATERIAL_3D: 55,
  VECTOR: 60,
  EFFECTS: 70,
  ANIMATION: 75,
  LIGHTING: 80,
  CAMERA: 85,
  RASTER: 90,
};

export function prioritizeFidelityIssues(issues: readonly FidelityIssue[]): readonly FidelityIssue[] {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const depth = (issue: FidelityIssue, seen = new Set<string>()): number => {
    if (!issue.causalParentId || seen.has(issue.id)) return 0;
    const parent = byId.get(issue.causalParentId);
    if (!parent) return 0;
    seen.add(issue.id);
    return 1 + depth(parent, seen);
  };
  return [...issues].sort(
    (left, right) =>
      depth(left) - depth(right) ||
      priority[left.domain] - priority[right.domain] ||
      right.confidence - left.confidence ||
      left.id.localeCompare(right.id),
  );
}

export function createFidelityTask(input: {
  readonly projectId: string;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly profile: FidelityProfileName;
  readonly references: readonly FidelityReference[];
  readonly protectedNodeIds?: readonly string[];
  readonly createdAt: string;
  readonly createdBy: FidelityTask["createdBy"];
  readonly correlationId: string;
}): FidelityTask {
  const profile = resolveFidelityProfile(input.profile);
  const body = {
    version: "1.0.0" as const,
    ...input,
    references: [...input.references],
    protectedNodeIds: [...(input.protectedNodeIds ?? [])].sort(),
    maxPasses: profile.maxPasses,
  };
  const fingerprint = fidelityFingerprint(body);
  return deepFreeze(FidelityTaskSchema.parse({ ...body, id: fidelityId("fidelity-task", fingerprint), fingerprint }));
}

function aggregate(measurements: readonly FidelityMeasurement[]): {
  scores: FidelityDomainScore[];
  issues: FidelityIssue[];
  score: number;
  coverage: number;
  confidence: number;
} {
  if (measurements.length === 0)
    return {
      scores: FidelityDomainSchema.options.map((domain) => ({
        domain,
        score: 0,
        coverage: 0,
        confidence: 0,
        measuredRegions: 0,
        totalRegions: 0,
        issueIds: [],
        unsupportedFeatures: [],
      })),
      issues: [],
      score: 0,
      coverage: 0,
      confidence: 0,
    };
  const issues = [...prioritizeFidelityIssues(measurements.flatMap((entry) => entry.issues))];
  const scores =
    measurements[0]?.domainScores.map((entry) => {
      const values = measurements
        .map((measurement) => measurement.domainScores.find((candidate) => candidate.domain === entry.domain))
        .filter((value): value is FidelityDomainScore => Boolean(value));
      return {
        domain: entry.domain,
        score: values.reduce((sum, value) => sum + value.score, 0) / values.length,
        coverage: values.reduce((sum, value) => sum + value.coverage, 0) / values.length,
        confidence: values.reduce((sum, value) => sum + value.confidence, 0) / values.length,
        measuredRegions: values.reduce((sum, value) => sum + value.measuredRegions, 0),
        totalRegions: values.reduce((sum, value) => sum + value.totalRegions, 0),
        issueIds: [...new Set(values.flatMap((value) => value.issueIds))].sort(),
        unsupportedFeatures: [...new Set(values.flatMap((value) => value.unsupportedFeatures))].sort(),
      };
    }) ?? [];
  return {
    scores,
    issues,
    score: measurements.reduce((sum, value) => sum + value.overallScore, 0) / measurements.length,
    coverage: measurements.reduce((sum, value) => sum + value.coverage, 0) / measurements.length,
    confidence: measurements.reduce((sum, value) => sum + value.confidence, 0) / measurements.length,
  };
}

export function createFidelityEngine(options: {
  readonly rasterBackend: RasterBackend;
  readonly correctionAdapter?: FidelityCorrectionAdapter;
  readonly cacheSize?: number;
}) {
  const cache = new FidelityCache<Awaited<ReturnType<RasterBackend["render"]>>>(options.cacheSize ?? 32);
  const renderViews = async (task: FidelityTask, views: readonly FidelityView[]): Promise<FidelityMeasurement[]> => {
    const profile = resolveFidelityProfile(task.profile);
    return Promise.all(
      views.map(async (view) => {
        if (
          view.reference.viewport.width !== view.graph.viewport.width ||
          view.reference.viewport.height !== view.graph.viewport.height
        )
          throw new Error("FIDELITY_VIEWPORT_DIMENSION_MISMATCH");
        const request: RasterRequest = {
          width: view.reference.viewport.width,
          height: view.reference.viewport.height,
          devicePixelRatio: view.reference.viewport.devicePixelRatio,
          background: { r: 255, g: 255, b: 255, a: 1 },
          qualityProfile: task.profile,
          time: view.reference.viewport.time,
          reducedMotion: view.reference.viewport.reducedMotion,
          format: "RGBA8",
          maxNodes: 20_000,
          maxPixels: 16_777_216,
          timeoutMs: 30_000,
        };
        const key = `${task.documentId}:${view.graph.fingerprint}:${fidelityFingerprint(request)}`;
        let raster = cache.get(key);
        if (!raster) {
          raster = await options.rasterBackend.render(view.graph, request);
          cache.set(key, raster);
        }
        return measureFidelity({
          referenceHash: view.reference.hash as `sha256:${string}`,
          reference: view.referenceRaster,
          target: raster,
          graph: view.graph,
          profile,
          regions: view.regions,
          ...(view.structuralExpectations ? { structuralExpectations: view.structuralExpectations } : {}),
          ...(view.domainEvidence ? { domainEvidence: view.domainEvidence } : {}),
          viewport: view.reference.viewport,
        });
      }),
    );
  };
  return Object.freeze({
    createTask: createFidelityTask,
    measure: renderViews,
    cacheStatistics: () => cache.statistics(),
    invalidateDocument(documentId: string) {
      return cache.invalidate(documentId);
    },
    async run(input: {
      readonly task: FidelityTask;
      readonly document: CanonicalDesignDocument;
      readonly views: readonly FidelityView[];
      readonly timestamp: string;
      readonly cancelled?: () => boolean;
    }): Promise<{ readonly document: CanonicalDesignDocument; readonly report: FidelityReport }> {
      const task = FidelityTaskSchema.parse(input.task);
      const profile = resolveFidelityProfile(task.profile);
      let document = input.document;
      let views = input.views;
      const passes: FidelityPass[] = [];
      const executionFailures: FidelityIssue[] = [];
      const fail = (message: string) => {
        const draft = {
          domain: "RASTER" as const,
          code: "FIDELITY_EXECUTION_FAILED",
          severity: "BLOCKING" as const,
          property: "execution",
          expected: "successful bounded execution",
          actual: message,
          measurement: 1,
          confidence: 1,
          supported: true,
          message,
        };
        executionFailures.push({ ...draft, id: fidelityId("fidelity-issue", draft) });
        stopReason = "FAILED";
      };
      const stateFingerprints = new Set<string>();
      let stopReason: FidelityReport["stopReason"] = "MAX_PASSES";
      for (let passNumber = 1; passNumber <= task.maxPasses; passNumber += 1) {
        if (input.cancelled?.()) {
          stopReason = "CANCELLED";
          break;
        }
        let measurements: FidelityMeasurement[];
        try {
          measurements = await renderViews(task, views);
        } catch (error) {
          fail(error instanceof Error ? error.message : "Fidelity rasterization failed.");
          break;
        }
        const summary = aggregate(measurements);
        const state = fidelityFingerprint({ measurements: measurements.map((entry) => entry.fingerprint) });
        if (stateFingerprints.has(state)) {
          stopReason = "OSCILLATION";
          break;
        }
        stateFingerprints.add(state);
        const accepted = passes.length === 0 || summary.score >= (passes.at(-1)?.score ?? 0);
        const pass: FidelityPass = {
          passNumber,
          documentVersion: document.documentVersion,
          documentFingerprint: fidelityFingerprint(document),
          measurements,
          score: summary.score,
          accepted,
          createdAt: input.timestamp,
        };
        passes.push(pass);
        const domainsPass = summary.scores
          .filter((entry) => entry.totalRegions > 0 || entry.domain === "RASTER")
          .every((entry) => entry.score >= profile.domainThresholds[entry.domain]);
        if (
          summary.score >= profile.targetScore &&
          summary.coverage >= profile.minimumCoverage &&
          summary.confidence >= profile.minimumConfidence &&
          domainsPass
        ) {
          stopReason = "TARGET_REACHED";
          break;
        }
        if (!options.correctionAdapter) {
          stopReason = "NO_CORRECTIONS";
          break;
        }
        let proposals: readonly FidelityCorrectionProposal[];
        try {
          proposals = await options.correctionAdapter.propose({
            document,
            measurements,
            protectedNodeIds: task.protectedNodeIds,
          });
        } catch (error) {
          fail(error instanceof Error ? error.message : "Correction proposal generation failed.");
          break;
        }
        const proposal = [...proposals].sort(
          (left, right) => left.priority - right.priority || left.fingerprint.localeCompare(right.fingerprint),
        )[0];
        if (!proposal) {
          stopReason = "NO_CORRECTIONS";
          break;
        }
        if (proposal.expectedDocumentVersion !== document.documentVersion) {
          stopReason = "FAILED";
          break;
        }
        let dryRun: { readonly valid: boolean; readonly message: string };
        try {
          dryRun = await options.correctionAdapter.dryRun({ document, proposal });
        } catch (error) {
          fail(error instanceof Error ? error.message : "Correction dry run failed.");
          break;
        }
        if (!dryRun.valid) {
          stopReason = "FAILED";
          break;
        }
        let correction: FidelityCorrectionResult;
        try {
          correction = await options.correctionAdapter.apply({ document, proposal });
        } catch (error) {
          fail(error instanceof Error ? error.message : "Correction application failed.");
          break;
        }
        if (correction.status !== "APPLIED" || !correction.views) {
          stopReason = correction.status === "VERSION_CONFLICT" ? "FAILED" : "REGRESSION";
          break;
        }
        let candidateMeasurements: FidelityMeasurement[];
        try {
          candidateMeasurements = await renderViews(task, correction.views);
        } catch (error) {
          fail(error instanceof Error ? error.message : "Candidate rerender failed.");
          break;
        }
        const candidate = aggregate(candidateMeasurements);
        const previous = summary;
        const protectedRegression = candidateMeasurements.some((measurement) =>
          measurement.issues.some(
            (issue) => issue.nodeId && task.protectedNodeIds.includes(issue.nodeId) && issue.severity !== "INFO",
          ),
        );
        const domainRegression = candidate.scores.some(
          (score) =>
            score.score + profile.minimumImprovement <
            (previous.scores.find((entry) => entry.domain === score.domain)?.score ?? 0),
        );
        if (candidate.score < previous.score + profile.minimumImprovement || protectedRegression || domainRegression) {
          stopReason = "REGRESSION";
          break;
        }
        passes[passes.length - 1] = {
          ...pass,
          documentVersion: correction.document.documentVersion,
          documentFingerprint: fidelityFingerprint(correction.document),
          measurements: candidateMeasurements,
          score: candidate.score,
          accepted: true,
          correctionFingerprint: correction.correctionFingerprint ?? proposal.fingerprint,
        };
        document = correction.document;
        views = correction.views;
        if (passNumber === task.maxPasses) stopReason = "MAX_PASSES";
      }
      const finalMeasurements = passes.at(-1)?.measurements ?? [];
      const summary = aggregate(finalMeasurements);
      const reportIssues = [...summary.issues, ...executionFailures].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      const body = {
        version: "1.0.0" as const,
        taskId: task.id,
        status:
          stopReason === "TARGET_REACHED"
            ? ("PASS" as const)
            : executionFailures.length > 0
              ? ("FAIL" as const)
              : summary.coverage < profile.minimumCoverage
                ? ("BLOCKED" as const)
                : reportIssues.some((issue) => issue.severity === "BLOCKING")
                  ? ("FAIL" as const)
                  : ("WARNING" as const),
        overallScore: summary.score,
        coverage: summary.coverage,
        confidence: summary.confidence,
        domainScores: summary.scores,
        issues: reportIssues,
        passes,
        stopReason,
        unsupportedFeatures: [...new Set(summary.scores.flatMap((entry) => entry.unsupportedFeatures))].sort(),
        provenance: {
          referenceHashes: task.references.map((entry) => entry.hash).sort(),
          documentFingerprint: fidelityFingerprint(document),
          rendererVersion: finalMeasurements[0]?.rendererVersion ?? "not-rendered",
          providerIds: task.references
            .map((entry) => `${entry.provenance.providerId}@${entry.provenance.providerVersion}`)
            .sort(),
          fontAssetIds: Object.values(document.assets)
            .filter((asset) => asset.type === "FONT")
            .map((asset) => asset.id)
            .sort(),
          imageAssetIds: Object.values(document.assets)
            .filter((asset) => asset.type === "IMAGE")
            .map((asset) => asset.id)
            .sort(),
        },
      };
      const fingerprint = fidelityFingerprint(body);
      const report = FidelityReportSchema.parse({
        ...body,
        id: fidelityId("fidelity-report", fingerprint),
        fingerprint,
      });
      return deepFreeze({ document, report });
    },
  });
}

export type FidelityEngine = ReturnType<typeof createFidelityEngine>;
