import { diagnostic } from "./diagnostics.js";
import type {
  RigDiagnostic,
  VertexInfluence,
  WeightNormalizationResult,
  WeightValidationIssue,
  WeightValidationReport,
} from "./schemas.js";

const NORMALIZATION_TOLERANCE = 1e-4;

export interface ValidateWeightsInput {
  readonly influences: readonly (readonly VertexInfluence[])[];
  readonly jointCount: number;
  readonly maxInfluencesPerVertex: number;
}

/**
 * Real per-vertex weight validation (Phase 19B §10): sum-to-one, negative, NaN, missing/invalid
 * joint references, excessive influences, unweighted vertices, and orphan joint groups. Operates
 * on the compact in-memory influence table (never the canonical document — see schemas.ts).
 */
export function validateWeights(input: ValidateWeightsInput): WeightValidationReport {
  const issues: WeightValidationIssue[] = [];
  const diagnostics: RigDiagnostic[] = [];
  const referencedJoints = new Set<number>();
  let maxInfluencesObserved = 0;
  let unweightedVertexCount = 0;
  let invalidVertexCount = 0;
  let anyNotNormalized = false;

  input.influences.forEach((vertexInfluences, vertexIndex) => {
    if (vertexInfluences.length === 0) {
      unweightedVertexCount += 1;
      issues.push({ vertexIndex, code: "SKIN_VERTEX_UNWEIGHTED", detail: "Vertex has no joint influences." });
      return;
    }
    maxInfluencesObserved = Math.max(maxInfluencesObserved, vertexInfluences.length);
    if (vertexInfluences.length > input.maxInfluencesPerVertex) {
      invalidVertexCount += 1;
      issues.push({
        vertexIndex,
        code: "SKIN_INFLUENCE_LIMIT_EXCEEDED",
        detail: `Vertex has ${vertexInfluences.length} influences, exceeding the limit of ${input.maxInfluencesPerVertex}.`,
      });
    }

    let sum = 0;
    let vertexInvalid = false;
    for (const influence of vertexInfluences) {
      if (Number.isNaN(influence.weight)) {
        vertexInvalid = true;
        issues.push({
          vertexIndex,
          code: "SKIN_WEIGHT_NAN",
          detail: `Joint ${influence.jointIndex} has a NaN weight.`,
        });
        continue;
      }
      if (influence.weight < 0) {
        vertexInvalid = true;
        issues.push({
          vertexIndex,
          code: "SKIN_WEIGHT_NEGATIVE",
          detail: `Joint ${influence.jointIndex} has a negative weight (${influence.weight}).`,
        });
        continue;
      }
      if (influence.jointIndex < 0 || influence.jointIndex >= input.jointCount) {
        vertexInvalid = true;
        issues.push({
          vertexIndex,
          code: "SKIN_BONE_REFERENCE_INVALID",
          detail: `Joint index ${influence.jointIndex} is out of range for ${input.jointCount} joints.`,
        });
        continue;
      }
      referencedJoints.add(influence.jointIndex);
      sum += influence.weight;
    }
    if (vertexInvalid) invalidVertexCount += 1;
    if (!vertexInvalid && Math.abs(sum - 1) > NORMALIZATION_TOLERANCE) {
      anyNotNormalized = true;
      issues.push({
        vertexIndex,
        code: "SKIN_WEIGHT_NOT_NORMALIZED",
        detail: `Vertex weights sum to ${sum.toFixed(6)}, not 1.`,
      });
    }
  });

  const orphanJoints = Array.from({ length: input.jointCount }, (_, index) => index).filter(
    (index) => !referencedJoints.has(index),
  );
  if (orphanJoints.length > 0) {
    diagnostics.push(
      diagnostic({
        code: "SKIN_ORPHAN_GROUP",
        severity: "WARNING",
        message: `${orphanJoints.length} joint(s) have no vertex influences: ${orphanJoints.join(", ")}.`,
        stage: "WEIGHT_VALIDATION",
        recoverable: true,
        details: { orphanJoints },
      }),
    );
  }
  if (unweightedVertexCount > 0) {
    diagnostics.push(
      diagnostic({
        code: "SKIN_VERTEX_UNWEIGHTED",
        severity: "ERROR",
        message: `${unweightedVertexCount} vertex(es) have no joint influences.`,
        stage: "WEIGHT_VALIDATION",
        recoverable: true,
      }),
    );
  }
  if (invalidVertexCount > 0) {
    diagnostics.push(
      diagnostic({
        code: "SKIN_WEIGHT_INVALID",
        severity: "ERROR",
        message: `${invalidVertexCount} vertex(es) have invalid weight data.`,
        stage: "WEIGHT_VALIDATION",
        recoverable: true,
      }),
    );
  }
  if (anyNotNormalized) {
    diagnostics.push(
      diagnostic({
        code: "SKIN_WEIGHT_NOT_NORMALIZED",
        severity: "WARNING",
        message: "One or more vertices have weights that do not sum to one.",
        stage: "WEIGHT_VALIDATION",
        recoverable: true,
      }),
    );
  }

  return {
    vertexCount: input.influences.length,
    jointCount: input.jointCount,
    maxInfluencesObserved,
    unweightedVertexCount,
    invalidVertexCount,
    normalized: !anyNotNormalized && invalidVertexCount === 0,
    issues,
    diagnostics,
  };
}

export interface NormalizeWeightsInput {
  readonly influences: readonly (readonly VertexInfluence[])[];
  readonly maxInfluencesPerVertex: number;
}

/**
 * Deterministic weight normalization and repair (Phase 19B §20): drops non-finite/negative
 * influences, keeps the N highest-weight influences up to `maxInfluencesPerVertex`, and rescales
 * the remainder to sum to exactly 1. Never fabricates an influence for an unweighted vertex —
 * that is reported, not silently invented (Phase 19B §54's weight-repair acceptance gate).
 */
export function normalizeWeights(input: NormalizeWeightsInput): WeightNormalizationResult {
  const diagnostics: RigDiagnostic[] = [];
  let verticesModified = 0;
  let influencesRemoved = 0;

  const influences = input.influences.map((vertexInfluences) => {
    const valid = vertexInfluences.filter(
      (influence) => Number.isFinite(influence.weight) && influence.weight > 0 && influence.jointIndex >= 0,
    );
    influencesRemoved += vertexInfluences.length - valid.length;
    const sorted = [...valid].sort((left, right) => right.weight - left.weight);
    const kept = sorted.slice(0, input.maxInfluencesPerVertex);
    influencesRemoved += sorted.length - kept.length;
    const sum = kept.reduce((total, influence) => total + influence.weight, 0);
    const changed = kept.length !== vertexInfluences.length || Math.abs(sum - 1) > NORMALIZATION_TOLERANCE;
    if (changed) verticesModified += 1;
    if (sum <= 0) return kept;
    return kept.map((influence) => ({ jointIndex: influence.jointIndex, weight: influence.weight / sum }));
  });

  if (verticesModified > 0) {
    diagnostics.push(
      diagnostic({
        code: "SKIN_WEIGHT_NOT_NORMALIZED",
        severity: "INFO",
        message: `Normalized ${verticesModified} vertex(es); removed ${influencesRemoved} invalid or excess influence(s).`,
        stage: "WEIGHT_NORMALIZATION",
        recoverable: true,
        details: { verticesModified, influencesRemoved },
      }),
    );
  }

  return { influences, verticesModified, influencesRemoved, diagnostics };
}
