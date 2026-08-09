import { deepFreeze, fingerprint } from "@aevum/agent-core";
import { AgentWorkingMemorySchema, type AgentWorkingMemory } from "./schemas.js";

type WorkingMemoryContent = Omit<AgentWorkingMemory, "fingerprint">;

export function createWorkingMemory(
  input: Pick<WorkingMemoryContent, "runId"> & Partial<Omit<WorkingMemoryContent, "runId">>,
): AgentWorkingMemory {
  const body: WorkingMemoryContent = {
    runId: input.runId,
    ...(input.hypothesis ? { hypothesis: input.hypothesis } : {}),
    locatedTargetIds: [...(input.locatedTargetIds ?? [])],
    relevantNodeIds: [...(input.relevantNodeIds ?? [])],
    failedApproaches: [...(input.failedApproaches ?? [])],
    ...(input.currentValidationScore !== undefined ? { currentValidationScore: input.currentValidationScore } : {}),
    ...(input.currentDocumentVersion !== undefined ? { currentDocumentVersion: input.currentDocumentVersion } : {}),
    lastObservationIds: [...(input.lastObservationIds ?? [])],
  };
  return deepFreeze(AgentWorkingMemorySchema.parse({ ...body, fingerprint: fingerprint(body) }));
}

export function updateWorkingMemory(
  memory: AgentWorkingMemory,
  changes: Partial<WorkingMemoryContent>,
): AgentWorkingMemory {
  return createWorkingMemory({
    ...memory,
    ...changes,
    locatedTargetIds: changes.locatedTargetIds ?? memory.locatedTargetIds,
    relevantNodeIds: changes.relevantNodeIds ?? memory.relevantNodeIds,
    failedApproaches: changes.failedApproaches ?? memory.failedApproaches,
    lastObservationIds: changes.lastObservationIds ?? memory.lastObservationIds,
  });
}
