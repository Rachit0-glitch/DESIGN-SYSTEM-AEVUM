import { deterministicScopedId } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import { MULTIVIEW_TASK_VERSION, MultiViewTaskSchema, type MultiViewTask, type MultiViewTaskInput } from "./schemas.js";

export function createMultiViewTask(input: MultiViewTaskInput): MultiViewTask {
  const identity = {
    projectId: input.projectId,
    subjectLabel: input.subjectLabel,
    subjectCategory: input.subjectCategory,
    views: [...input.views].sort((left, right) => left.assetId.localeCompare(right.assetId)),
    roleHints: input.roleHints,
    landmarkHints: input.landmarkHints,
    partHints: input.partHints,
    scaleHints: input.scaleHints,
    config: input.config,
    deterministicSeed: input.deterministicSeed,
    createdBy: input.createdBy,
  };
  return deepFreeze(
    MultiViewTaskSchema.parse({
      ...input,
      id: input.id ?? deterministicScopedId("multiview-task", identity),
      taskVersion: MULTIVIEW_TASK_VERSION,
    }),
  );
}

export function validateMultiViewTask(input: unknown) {
  return MultiViewTaskSchema.safeParse(input);
}
