import type { CameraEstimator } from "./camera-estimator.js";
import { createMultiViewAnalysisReport } from "./report.js";
import { createReconstructionProposal } from "./proposal.js";
import { buildMultiViewReferenceSet } from "./reference-set.js";
import type { MultiViewTask, TargetQualitySchema } from "./schemas.js";
import type { SilhouetteProvider } from "./silhouette.js";
import { validateMultiView } from "./validation.js";
import type { z } from "zod";

export interface AnalyzeMultiViewOptions {
  readonly cameraEstimator?: CameraEstimator;
  readonly silhouetteProvider?: SilhouetteProvider;
  readonly targetQuality?: z.infer<typeof TargetQualitySchema>;
  readonly createdAt: string;
}

/**
 * The full Phase 17 deterministic orchestration: reference-set construction (roles, cameras,
 * silhouettes, landmarks, parts, constraints, coverage, readiness) -> cross-view validation ->
 * provider-neutral reconstruction proposal -> immutable analysis report. No mesh or model
 * generation happens in this pipeline.
 */
export function analyzeMultiView(task: MultiViewTask, options: AnalyzeMultiViewOptions) {
  const { referenceSet, coverage, readiness } = buildMultiViewReferenceSet(task, {
    ...(options.cameraEstimator ? { cameraEstimator: options.cameraEstimator } : {}),
    ...(options.silhouetteProvider ? { silhouetteProvider: options.silhouetteProvider } : {}),
  });
  const validation = validateMultiView(referenceSet);
  const proposal = createReconstructionProposal({
    referenceSet,
    readiness,
    ...(options.targetQuality ? { targetQuality: options.targetQuality } : {}),
  });
  const report = createMultiViewAnalysisReport({
    referenceSet,
    coverage,
    readiness,
    validation,
    proposal,
    createdAt: options.createdAt,
  });
  return Object.freeze({ referenceSet, coverage, readiness, validation, proposal, report });
}
