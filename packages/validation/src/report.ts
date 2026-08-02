import { deepFreeze } from "./immutable.js";
import {
  VALIDATION_REPORT_VERSION,
  ValidationDiagnosticSchema,
  ValidationReportSchema,
  type RasterComparisonResult,
  type StructuralValidationResult,
  type ValidationCorrectionPlan,
  type ValidationDiagnostic,
  type ValidationDifference,
  type ValidationHeatmap,
  type ValidationReferenceSnapshot,
  type ValidationRegionResult,
  type ValidationReport,
  type ValidationScoreSummary,
  type ValidationTask,
  type ValidationThresholdProfile,
} from "./schemas.js";
import { deterministicId, fingerprint } from "./stable.js";

export interface CreateValidationReportInput {
  readonly task: ValidationTask;
  readonly reference: ValidationReferenceSnapshot;
  readonly profile: ValidationThresholdProfile;
  readonly regions: readonly ValidationRegionResult[];
  readonly structural: StructuralValidationResult;
  readonly raster: RasterComparisonResult;
  readonly differences: readonly ValidationDifference[];
  readonly diagnostics?: readonly ValidationDiagnostic[];
  readonly heatmaps: readonly ValidationHeatmap[];
  readonly correctionPlan: ValidationCorrectionPlan;
  readonly createdAt?: string;
}

function metricAverage(regions: readonly ValidationRegionResult[], metrics: readonly string[]): number {
  const values = regions.flatMap((region) =>
    region.metrics.filter((entry) => metrics.includes(entry.metric) && entry.applicable).map((entry) => entry.score),
  );
  return values.length === 0 ? 1 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scores(input: CreateValidationReportInput): ValidationScoreSummary {
  const layout = metricAverage(input.regions, ["LAYOUT", "POSITION", "SIZE", "CONSTRAINT"]);
  const typography = metricAverage(input.regions, ["TYPOGRAPHY"]);
  const asset = metricAverage(input.regions, ["ASSET", "IMAGE"]);
  const component = input.structural.componentScore;
  const structure = input.structural.score;
  const raster = input.raster.score;
  const worstRegion = input.regions.length === 0 ? 0 : Math.min(...input.regions.map((region) => region.score));
  const overall = layout * 0.25 + typography * 0.2 + asset * 0.15 + component * 0.1 + structure * 0.2 + raster * 0.1;
  return { overall, layout, typography, asset, component, structure, raster, worstRegion };
}

function reportStatus(summary: ValidationScoreSummary, input: CreateValidationReportInput): "PASS" | "WARN" | "FAIL" {
  const minimum = input.profile.minimumScores;
  const failed =
    summary.overall < minimum.overall ||
    summary.layout < minimum.layout ||
    summary.typography < minimum.typography ||
    summary.asset < minimum.asset ||
    summary.component < minimum.component ||
    summary.structure < minimum.structure ||
    summary.raster < minimum.raster ||
    input.raster.meanAbsoluteError > input.profile.tolerances.rasterMeanAbsoluteError ||
    summary.worstRegion < minimum.worstRegion ||
    input.regions.some((region) => region.status === "FAIL") ||
    input.differences.some((entry) => entry.severity === "CRITICAL") ||
    (!input.profile.warningsAllowed && input.differences.length > 0);
  if (failed) return "FAIL";
  if (input.differences.length > 0 || (input.diagnostics?.length ?? 0) > 0) return "WARN";
  return "PASS";
}

export function createValidationReport(input: CreateValidationReportInput): ValidationReport {
  const summary = scores(input);
  const status = reportStatus(summary, input);
  const diagnostics = [...(input.diagnostics ?? [])];
  if (status === "FAIL")
    diagnostics.push(
      ValidationDiagnosticSchema.parse({
        code: "THRESHOLD_FAILED",
        severity: "ERROR",
        message: "One or more mandatory profile or worst-region thresholds failed.",
        recoverable: true,
      }),
    );
  const reportInputFingerprint = fingerprint({
    taskId: input.task.id,
    referenceFingerprint: input.reference.snapshotFingerprint,
    profile: input.profile,
    scores: summary,
    regionResults: input.regions,
    structural: input.structural,
    raster: input.raster,
    differences: input.differences,
    heatmapFingerprints: input.heatmaps.map((entry) => entry.fingerprint),
    correctionPlanFingerprint: input.correctionPlan.fingerprint,
    status,
  });
  return deepFreeze(
    ValidationReportSchema.parse({
      id: deterministicId("validation-report", { reportInputFingerprint }),
      reportVersion: VALIDATION_REPORT_VERSION,
      reportInputFingerprint,
      taskId: input.task.id,
      projectId: input.task.projectId,
      documentId: input.task.documentId,
      documentVersion: input.task.documentVersion,
      referenceId: input.task.referenceId,
      sourceAssetId: input.task.sourceAssetId,
      viewport: input.task.viewport,
      rendererVersion: input.task.rendererVersion,
      projectionFingerprint: input.task.projectionFingerprint,
      renderGraphFingerprint: input.task.renderGraphFingerprint,
      thresholdProfile: input.profile,
      scores: summary,
      regions: input.regions,
      structural: input.structural,
      raster: input.raster,
      differences: input.differences,
      diagnostics,
      heatmaps: input.heatmaps,
      correctionPlan: input.correctionPlan,
      status,
      createdAt: input.createdAt ?? new Date().toISOString(),
    }),
  );
}
