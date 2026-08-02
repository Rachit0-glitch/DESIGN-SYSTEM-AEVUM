import { deepFreeze } from "./immutable.js";
import { MOTION_TASK_VERSION, MotionTaskSchema, type MotionTask, type MotionTaskInput } from "./schemas.js";
import { deterministicId } from "./stable.js";

export function createMotionTask(input: MotionTaskInput): MotionTask {
  const identity = {
    projectId: input.projectId,
    documentId: input.documentId,
    expectedDocumentVersion: input.expectedDocumentVersion,
    sourceAssetIds: [...input.sourceAssetIds].sort(),
    sourceFormat: input.sourceFormat,
    targets: input.targets,
    commandIntent: input.commandIntent,
    timelineName: input.timelineName,
    frameRate: input.frameRate,
    minimumConfidence: input.minimumConfidence,
    keyframeTolerance: input.keyframeTolerance,
    maximumDeltaPerSecond: input.maximumDeltaPerSecond,
    deterministicSeed: input.deterministicSeed,
    createdBy: input.createdBy,
  };
  return deepFreeze(
    MotionTaskSchema.parse({
      ...input,
      id: input.id ?? deterministicId("motion-task", identity),
      taskVersion: MOTION_TASK_VERSION,
    }),
  );
}

export function validateMotionTask(input: unknown) {
  return MotionTaskSchema.safeParse(input);
}
