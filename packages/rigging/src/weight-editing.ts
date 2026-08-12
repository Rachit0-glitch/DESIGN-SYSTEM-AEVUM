import { deepFreeze } from "./immutable.js";
import {
  DEFAULT_RIG_RESOURCE_LIMITS,
  WeightEditOperationSchema,
  WeightInspectionSchema,
  type RigResourceLimits,
  type VertexInfluence,
  type WeightEditOperation,
  type WeightInspection,
} from "./schemas.js";
import { normalizeWeights, validateWeights } from "./weights.js";

export interface EditWeightsInput {
  readonly influences: readonly (readonly VertexInfluence[])[];
  readonly operations: readonly WeightEditOperation[];
  readonly jointCount: number;
  readonly maxInfluencesPerVertex?: number;
  readonly normalize?: boolean;
  readonly limits?: RigResourceLimits;
}

export interface EditWeightsResult {
  readonly influences: readonly (readonly VertexInfluence[])[];
  readonly verticesModified: number;
  readonly inspection: WeightInspection;
}

export function inspectWeights(
  influences: readonly (readonly VertexInfluence[])[],
  jointCount: number,
  maxInfluencesPerVertex = 4,
): WeightInspection {
  const validation = validateWeights({ influences, jointCount, maxInfluencesPerVertex });
  const positive = influences.flat().filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
  const counts = Array.from({ length: jointCount }, () => 0);
  for (const vertex of influences)
    for (const entry of vertex) {
      const current = counts[entry.jointIndex];
      if (entry.weight > 0 && current !== undefined) counts[entry.jointIndex] = current + 1;
    }
  return deepFreeze(
    WeightInspectionSchema.parse({
      vertexCount: influences.length,
      weightedVertexCount: influences.filter((entry) => entry.some((value) => value.weight > 0)).length,
      unweightedVertexCount: validation.unweightedVertexCount,
      minWeight: positive.length ? Math.min(...positive.map((entry) => entry.weight)) : 0,
      maxWeight: positive.length ? Math.max(...positive.map((entry) => entry.weight)) : 0,
      averageInfluences: influences.length ? positive.length / influences.length : 0,
      perJointVertexCounts: counts,
      validation,
    }),
  );
}

export function editWeights(input: EditWeightsInput): EditWeightsResult {
  const limits = input.limits ?? DEFAULT_RIG_RESOURCE_LIMITS;
  const operations = input.operations.map((entry) => WeightEditOperationSchema.parse(entry));
  const affected = new Set(operations.flatMap((entry) => entry.vertexIndices));
  if (affected.size > limits.maxManualWeightEdits)
    throw new Error(`Weight edit exceeds the ${limits.maxManualWeightEdits} selected-vertex limit.`);
  if ([...affected].some((index) => index >= input.influences.length))
    throw new Error("Weight edit references a missing vertex.");
  const result = input.influences.map((entries) => entries.map((entry) => ({ ...entry })));
  for (const operation of operations) {
    if (operation.mode !== "NORMALIZE" && operation.mode !== "CLEAR" && operation.jointIndex === undefined)
      throw new Error(`${operation.mode} requires jointIndex.`);
    if (operation.jointIndex !== undefined && operation.jointIndex >= input.jointCount)
      throw new Error("Weight edit references a missing joint.");
    if (["SET", "ADD", "SUBTRACT"].includes(operation.mode) && operation.value === undefined)
      throw new Error(`${operation.mode} requires value.`);
    for (const vertexIndex of [...operation.vertexIndices].sort((a, b) => a - b)) {
      const vertex = result[vertexIndex];
      if (!vertex) continue;
      if (operation.mode === "CLEAR") vertex.splice(0, vertex.length);
      else if (operation.mode !== "NORMALIZE") {
        const existing = vertex.find((entry) => entry.jointIndex === operation.jointIndex);
        const current = existing?.weight ?? 0;
        const next =
          operation.mode === "SET"
            ? (operation.value ?? 0)
            : operation.mode === "ADD"
              ? current + (operation.value ?? 0)
              : current - (operation.value ?? 0);
        const bounded = Math.min(1, Math.max(0, next));
        if (existing) existing.weight = bounded;
        else if (bounded > 0 && operation.jointIndex !== undefined)
          vertex.push({ jointIndex: operation.jointIndex, weight: bounded });
        for (let index = vertex.length - 1; index >= 0; index -= 1)
          if ((vertex[index]?.weight ?? 0) <= 0) vertex.splice(index, 1);
      }
    }
  }
  const maxInfluencesPerVertex = input.maxInfluencesPerVertex ?? limits.maxSkinInfluencesPerVertex;
  const shouldNormalize = input.normalize !== false || operations.some((entry) => entry.mode === "NORMALIZE");
  const normalized = shouldNormalize
    ? normalizeWeights({ influences: result, maxInfluencesPerVertex }).influences
    : result;
  const finalInspection = inspectWeights(normalized, input.jointCount, maxInfluencesPerVertex);
  if (!finalInspection.validation.normalized && shouldNormalize)
    throw new Error("Weight edit could not produce normalized professional skin data.");
  return deepFreeze({ influences: normalized, verticesModified: affected.size, inspection: finalInspection });
}
