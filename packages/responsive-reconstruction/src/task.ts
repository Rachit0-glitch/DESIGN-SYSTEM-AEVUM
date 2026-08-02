import { deepFreeze } from "./immutable.js";
import {
  RESPONSIVE_TASK_VERSION,
  ResponsiveReconstructionTaskSchema,
  type ResponsiveReconstructionTask,
  type ResponsiveTaskInput,
} from "./schemas.js";
import { deterministicId } from "./stable.js";

export function createResponsiveReconstructionTask(input: ResponsiveTaskInput): ResponsiveReconstructionTask {
  const identity = {
    projectId: input.projectId,
    documentId: input.documentId,
    expectedDocumentVersion: input.expectedDocumentVersion,
    sourceViewportId: input.sourceViewportId,
    variants: input.variants,
    referenceEvidence: input.referenceEvidence,
    protectedProperties: input.protectedProperties,
    minimumTextSizePx: input.minimumTextSizePx,
    minimumConfidence: input.minimumConfidence,
    deterministicSeed: input.deterministicSeed,
    createdBy: input.createdBy,
  };
  return deepFreeze(
    ResponsiveReconstructionTaskSchema.parse({
      ...input,
      id: input.id ?? deterministicId("responsive-task", identity),
      taskVersion: RESPONSIVE_TASK_VERSION,
    }),
  );
}

export function validateResponsiveReconstructionTask(input: unknown) {
  return ResponsiveReconstructionTaskSchema.safeParse(input);
}
