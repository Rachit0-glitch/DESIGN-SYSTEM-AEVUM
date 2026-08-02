import { deepFreeze } from "./immutable.js";
import { deterministicId } from "./stable.js";
import {
  VALIDATION_TASK_VERSION,
  ValidationTaskSchema,
  type ValidationTask,
  type ValidationTaskInput,
} from "./schemas.js";

export function createValidationTask(input: ValidationTaskInput): ValidationTask {
  const identity = {
    projectId: input.projectId,
    documentId: input.documentId,
    documentVersion: input.documentVersion,
    referenceId: input.referenceId,
    sourceAssetId: input.sourceAssetId,
    referenceAnalysisId: input.referenceAnalysisId,
    viewport: input.viewport,
    rendererVersion: input.rendererVersion,
    projectionFingerprint: input.projectionFingerprint,
    renderGraphFingerprint: input.renderGraphFingerprint,
    qualityMode: input.qualityMode,
    thresholdProfile: input.thresholdProfile,
    requestedMetrics: [...input.requestedMetrics].sort(),
    deterministicSeed: input.deterministicSeed,
    createdBy: input.createdBy,
  };
  return deepFreeze(
    ValidationTaskSchema.parse({
      ...input,
      id: input.id ?? deterministicId("validation-task", identity),
      taskVersion: VALIDATION_TASK_VERSION,
    }),
  );
}

export function validateValidationTask(input: unknown): ReturnType<typeof ValidationTaskSchema.safeParse> {
  return ValidationTaskSchema.safeParse(input);
}
