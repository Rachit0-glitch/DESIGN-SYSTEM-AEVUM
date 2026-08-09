import { averageConfidence } from "./confidence.js";
import { deterministicScopedId } from "./deterministic.js";
import { hasBlockingDiagnostics, hasErrorDiagnostics } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import {
  ReadinessAssessmentSchema,
  type CoverageReport,
  type CrossViewCorrespondence,
  type Landmark,
  type MultiViewDiagnostic,
  type Part,
  type ReadinessAssessment,
  type ViewRecord,
} from "./schemas.js";

type ReadinessClassification = ReadinessAssessment["classification"];

const WEIGHTS = {
  viewCount: 0.2,
  viewDiversity: 0.2,
  cameraConfidence: 0.15,
  landmarkCoverage: 0.15,
  silhouetteCoverage: 0.1,
  partCorrespondence: 0.05,
  scaleEvidence: 0.05,
  crossViewConsistency: 0.1,
} as const;

const RANK: Record<ReadinessClassification, number> = {
  INSUFFICIENT: 0,
  WEAK: 1,
  USABLE: 2,
  STRONG: 3,
  EXCELLENT: 4,
};

function classify(score: number): ReadinessClassification {
  if (score >= 0.75) return "EXCELLENT";
  if (score >= 0.6) return "STRONG";
  if (score >= 0.4) return "USABLE";
  if (score >= 0.2) return "WEAK";
  return "INSUFFICIENT";
}

export interface AssessReadinessInput {
  readonly views: readonly ViewRecord[];
  readonly landmarks: readonly Landmark[];
  readonly parts: readonly Part[];
  readonly coverage: CoverageReport;
  readonly correspondences: readonly CrossViewCorrespondence[];
  readonly scaleResolved: boolean;
  readonly allDiagnostics: readonly MultiViewDiagnostic[];
}

const FULL_VIEW_COUNT_TARGET = 5;

/** Scores reconstruction readiness from real evidence signals rather than treating image count
 * alone as a proxy for quality, and honestly downgrades classification (never the underlying
 * score) when unresolved conflicts exist, so contradictions cannot be silently averaged away. */
export function assessReadiness(input: AssessReadinessInput): ReadinessAssessment {
  const viewCount = Math.min(1, input.views.length / FULL_VIEW_COUNT_TARGET);
  const viewDiversity = input.coverage.diversityScore;
  const cameraConfidences = input.views
    .map((view) => view.cameraEstimate?.confidence)
    .filter((value): value is number => value !== undefined);
  const cameraConfidence = averageConfidence(cameraConfidences);
  // A landmark with no successful triangulation contributes zero 3D evidence, not partial
  // credit — a single observation cannot constrain depth at all.
  const landmarkCoverage =
    input.landmarks.length === 0
      ? 0
      : averageConfidence(input.landmarks.map((landmark) => (landmark.estimated3D ? 1 : 0)));
  const silhouetteCoverage =
    input.views.length === 0
      ? 0
      : input.views.filter((view) => view.silhouette !== undefined).length / input.views.length;
  const partCorrespondence =
    input.parts.length === 0 ? 0.5 : averageConfidence(input.parts.map((part) => part.correspondenceConfidence));
  const scaleEvidence = input.scaleResolved ? 1 : 0.5;
  // Only correspondences spanning 2+ views were actually checkable; a single-observation
  // landmark is vacuously "consistent" (nothing to contradict it) and must not count as evidence
  // of cross-view agreement, or a single image could inflate this factor to a perfect score.
  const checkableCorrespondences = input.correspondences.filter((entry) => entry.viewIds.length >= 2);
  const crossViewConsistency =
    checkableCorrespondences.length === 0
      ? 0.5
      : checkableCorrespondences.filter((entry) => entry.consistent).length / checkableCorrespondences.length;

  const factors = {
    viewCount,
    viewDiversity,
    cameraConfidence,
    landmarkCoverage,
    silhouetteCoverage,
    partCorrespondence,
    scaleEvidence,
    crossViewConsistency,
  };

  const score =
    factors.viewCount * WEIGHTS.viewCount +
    factors.viewDiversity * WEIGHTS.viewDiversity +
    factors.cameraConfidence * WEIGHTS.cameraConfidence +
    factors.landmarkCoverage * WEIGHTS.landmarkCoverage +
    factors.silhouetteCoverage * WEIGHTS.silhouetteCoverage +
    factors.partCorrespondence * WEIGHTS.partCorrespondence +
    factors.scaleEvidence * WEIGHTS.scaleEvidence +
    factors.crossViewConsistency * WEIGHTS.crossViewConsistency;

  let classification = classify(score);
  if (hasBlockingDiagnostics(input.allDiagnostics) && RANK[classification] > RANK.WEAK) {
    classification = "WEAK";
  } else if (hasErrorDiagnostics(input.allDiagnostics) && RANK[classification] > RANK.USABLE) {
    classification = "USABLE";
  }

  return deepFreeze(
    ReadinessAssessmentSchema.parse({
      id: deterministicScopedId("readiness", { factors, score, classification }),
      classification,
      score,
      factors,
      diagnostics: [],
    }),
  );
}
