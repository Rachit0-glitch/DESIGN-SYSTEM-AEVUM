import { deterministicScopedId } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import {
  RECONSTRUCTION_TASK_VERSION,
  ReconstructionTaskSchema,
  type ReconstructionTask,
  type ReconstructionTaskInput,
} from "./schemas.js";

export function createReconstructionTask(input: ReconstructionTaskInput): ReconstructionTask {
  const semanticIdentity = {
    projectId: input.projectId,
    sourceAssetId: input.sourceAssetId,
    sourceReferenceId: input.sourceReferenceId,
    requestedPageName: input.requestedPageName,
    targetPageId: input.targetPageId,
    qualityMode: input.qualityMode,
    targetViewport: input.targetViewport,
    targetDocumentId: input.targetDocumentId,
    expectedDocumentVersion: input.expectedDocumentVersion,
    preserveEditability: input.preserveEditability,
    allowRasterFallbacks: input.allowRasterFallbacks,
    requestedCapabilities: [...input.requestedCapabilities].sort(),
    providerPolicy: input.providerPolicy,
    constraints: input.constraints,
    deterministicSeed: input.deterministicSeed,
    createdBy: input.createdBy,
  };
  return deepFreeze(
    ReconstructionTaskSchema.parse({
      ...input,
      id: input.id ?? deterministicScopedId("reconstruction-task", semanticIdentity),
      taskVersion: RECONSTRUCTION_TASK_VERSION,
    }),
  );
}

export function validateReconstructionTask(input: unknown): ReturnType<typeof ReconstructionTaskSchema.safeParse> {
  return ReconstructionTaskSchema.safeParse(input);
}
