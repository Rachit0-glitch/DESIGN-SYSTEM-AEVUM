import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { RenderGraph } from "@aevum/renderer-2d";
import type { SceneProjectionResult } from "@aevum/scene-runtime";
import {
  createDeterministicLocalRasterAdapter,
  notComparedRaster,
  type RasterComparisonAdapter,
  type RasterComparisonInput,
} from "./adapters.js";
import { compareRegions, compareStructure } from "./compare.js";
import { generateCorrectionPlan } from "./correction.js";
import { buildHeatmap } from "./heatmap.js";
import { deepFreeze } from "./immutable.js";
import { expectedNodeMap } from "./reference.js";
import { createValidationReport } from "./report.js";
import {
  ValidationDiagnosticSchema,
  ValidationReferenceSnapshotSchema,
  ValidationTaskSchema,
  type ValidationDiagnostic,
  type ValidationReferenceSnapshot,
  type ValidationReport,
  type ValidationTask,
} from "./schemas.js";
import { getThresholdProfile } from "./thresholds.js";

export interface ValidateDesignInput {
  readonly task: ValidationTask;
  readonly reference: ValidationReferenceSnapshot;
  readonly document: CanonicalDesignDocument;
  readonly projection: SceneProjectionResult;
  readonly renderGraph: RenderGraph;
  readonly raster?: RasterComparisonInput;
  readonly rasterAdapter?: RasterComparisonAdapter;
  readonly createdAt?: string;
}

export type ValidateDesignResult =
  | { readonly success: true; readonly report: ValidationReport }
  | { readonly success: false; readonly diagnostics: readonly ValidationDiagnostic[] };

function invalid(message: string): ValidateDesignResult {
  return deepFreeze({
    success: false as const,
    diagnostics: [
      ValidationDiagnosticSchema.parse({ code: "INVALID_INPUT", severity: "CRITICAL", message, recoverable: false }),
    ],
  });
}

export function validateDesign(input: ValidateDesignInput): ValidateDesignResult {
  const taskResult = ValidationTaskSchema.safeParse(input.task);
  if (!taskResult.success) return invalid("Validation task failed runtime validation.");
  const referenceResult = ValidationReferenceSnapshotSchema.safeParse(input.reference);
  if (!referenceResult.success) return invalid("Validation reference snapshot failed runtime validation.");
  const task = taskResult.data;
  const reference = referenceResult.data;
  if (input.document.metadata.id !== task.documentId || input.document.documentVersion !== task.documentVersion)
    return invalid("Canonical document identity or version does not match the validation task.");
  if (
    input.projection.documentId !== task.documentId ||
    input.projection.documentVersion !== task.documentVersion ||
    input.projection.fingerprint !== task.projectionFingerprint
  )
    return invalid("Scene Projection does not match the validation task.");
  if (
    input.renderGraph.fingerprint !== task.renderGraphFingerprint ||
    input.renderGraph.projectionFingerprint !== task.projectionFingerprint
  )
    return invalid("Render Graph does not match the validation task.");
  if (reference.referenceId !== task.referenceId || reference.sourceAssetId !== task.sourceAssetId)
    return invalid("Reference snapshot does not match the validation task.");
  const profile = getThresholdProfile(task.thresholdProfile);
  const regionComparison = compareRegions(
    reference,
    input.document,
    input.projection,
    input.renderGraph,
    profile,
    task.requestedMetrics,
  );
  const structuralComparison = compareStructure(
    reference,
    input.document,
    input.projection,
    input.renderGraph,
    task.requestedMetrics,
  );
  const rasterRequested = task.requestedMetrics.includes("RASTER");
  const diagnostics: ValidationDiagnostic[] = [];
  const raster = rasterRequested
    ? input.raster
      ? (input.rasterAdapter ?? createDeterministicLocalRasterAdapter()).compare(input.raster)
      : notComparedRaster("Raster comparison was requested but no raster surfaces were supplied.", 0)
    : notComparedRaster();
  if (rasterRequested && !input.raster)
    diagnostics.push(
      ValidationDiagnosticSchema.parse({
        code: "RASTER_UNAVAILABLE",
        severity: "ERROR",
        message: "Raster comparison was requested but no raster surfaces were supplied.",
        recoverable: true,
      }),
    );
  const differences = [...regionComparison.differences, ...structuralComparison.differences].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const heatmaps = (["RAW_DIFFERENCE", "LAYOUT", "TYPOGRAPHY", "COLOR", "ASSET"] as const).map((type) =>
    buildHeatmap(reference, differences, type),
  );
  const correctionPlan = generateCorrectionPlan(task, input.document, expectedNodeMap(reference), differences);
  const report = createValidationReport({
    task,
    reference,
    profile,
    regions: regionComparison.regions,
    structural: structuralComparison.summary,
    raster,
    differences,
    diagnostics,
    heatmaps,
    correctionPlan,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  return deepFreeze({ success: true, report });
}

export function createValidationEngine(options: { readonly rasterAdapter?: RasterComparisonAdapter } = {}) {
  return Object.freeze({
    validate(input: Omit<ValidateDesignInput, "rasterAdapter">) {
      return validateDesign({ ...input, ...(options.rasterAdapter ? { rasterAdapter: options.rasterAdapter } : {}) });
    },
    compareRegions,
    compareStructure,
    buildHeatmap,
    generateCorrectionPlan,
    createValidationReport,
  });
}

export type ValidationEngine = ReturnType<typeof createValidationEngine>;
