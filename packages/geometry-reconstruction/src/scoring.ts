import {
  averageConfidence,
  projectPoint,
  resolveCameraGeometry,
  type MultiViewReferenceSet,
  type ViewRecord,
} from "@aevum/multiview-reconstruction";
import {
  centroidOf,
  chamferBoundaryDistance,
  compareRasterGrids,
  convexHull,
  rasterizePolygon,
  type Point2D,
} from "./geometry-2d.js";
import { distanceToMeshSurface } from "./mesh-utils.js";
import type { CrossViewFitScore, DifferenceEvidence, LandmarkFitMetric, RawMesh, ViewFitMetric } from "./schemas.js";

const RASTER_SIZE = 48;
const LANDMARK_FIT_TOLERANCE = 0.2;

const WEIGHTS = {
  silhouette: 0.35,
  landmark: 0.15,
  cameraConsistency: 0.1,
  scale: 0.05,
  constraintSatisfaction: 0.15,
  coverage: 0.1,
  topologyViability: 0.1,
} as const;

function projectMeshFootprint(mesh: RawMesh, camera: ReturnType<typeof resolveCameraGeometry>): Point2D[] | undefined {
  if (!camera) return undefined;
  const projected: Point2D[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const point = projectPoint(camera, {
      x: mesh.positions[i] ?? 0,
      y: mesh.positions[i + 1] ?? 0,
      z: mesh.positions[i + 2] ?? 0,
    });
    if (point) projected.push(point);
  }
  if (projected.length < 3) return undefined;
  const hull = convexHull(projected);
  return hull.length >= 3 ? hull : undefined;
}

export function scoreView(view: ViewRecord, mesh: RawMesh): ViewFitMetric | undefined {
  if (!view.silhouette) return undefined;
  const geometry = resolveCameraGeometry(view.cameraEstimate);
  const candidatePolygon = projectMeshFootprint(mesh, geometry);
  if (!candidatePolygon) return undefined;

  const candidateRaster = rasterizePolygon(candidatePolygon, RASTER_SIZE);
  const sourceRaster = rasterizePolygon(view.silhouette.contour, RASTER_SIZE);
  const overlap = compareRasterGrids(candidateRaster, sourceRaster);
  const boundaryDistance = chamferBoundaryDistance(candidatePolygon, view.silhouette.contour);
  const candidateCentroid = centroidOf(candidatePolygon);
  const centroidDistance = Math.hypot(
    candidateCentroid.x - view.silhouette.centroid.x,
    candidateCentroid.y - view.silhouette.centroid.y,
  );
  const candidateAreaRatio = overlap.aCount / (RASTER_SIZE * RASTER_SIZE);
  const areaDifference = Math.abs(candidateAreaRatio - view.silhouette.areaRatio);

  return {
    viewId: view.id,
    role: view.role.role,
    silhouetteIoU: overlap.iou,
    silhouettePrecision: overlap.precision,
    silhouetteRecall: overlap.recall,
    boundaryDistance: Number.isFinite(boundaryDistance) ? boundaryDistance : 1,
    centroidDistance,
    areaDifference,
    weight: view.role.confidence,
  };
}

/** Per-view false-positive/false-negative silhouette area (candidate present but source absent,
 * and vice versa), plus per-landmark mismatch magnitude for landmarks observed in that view — the
 * structured evidence a future correction pass reasons from, not just a single similarity number. */
export function computeDifferenceEvidence(referenceSet: MultiViewReferenceSet, mesh: RawMesh): DifferenceEvidence[] {
  const evidence: DifferenceEvidence[] = [];
  for (const view of referenceSet.views) {
    if (!view.silhouette) continue;
    const geometry = resolveCameraGeometry(view.cameraEstimate);
    const candidatePolygon = projectMeshFootprint(mesh, geometry);
    if (!candidatePolygon) continue;
    const candidateRaster = rasterizePolygon(candidatePolygon, RASTER_SIZE);
    const sourceRaster = rasterizePolygon(view.silhouette.contour, RASTER_SIZE);
    const overlap = compareRasterGrids(candidateRaster, sourceRaster);
    const totalCells = RASTER_SIZE * RASTER_SIZE;

    const landmarkMismatches = referenceSet.landmarks
      .filter((landmark) => landmark.observations.some((observation) => observation.viewId === view.id))
      .map((landmark) => {
        if (!landmark.estimated3D) return { landmarkId: landmark.id, errorMagnitude: 1 };
        const distance = distanceToMeshSurface(landmark.estimated3D, mesh);
        return { landmarkId: landmark.id, errorMagnitude: Math.min(1, distance / LANDMARK_FIT_TOLERANCE) };
      });

    evidence.push({
      viewId: view.id,
      falsePositiveAreaRatio: (overlap.aCount - overlap.intersectionCount) / totalCells,
      falseNegativeAreaRatio: (overlap.bCount - overlap.intersectionCount) / totalCells,
      landmarkMismatches,
    });
  }
  return evidence;
}

export function scoreLandmarks(referenceSet: MultiViewReferenceSet, mesh: RawMesh): LandmarkFitMetric[] {
  return referenceSet.landmarks.map((landmark) => {
    if (!landmark.estimated3D) {
      return { landmarkId: landmark.id, fitted: false, confidence: landmark.confidence };
    }
    const distance = distanceToMeshSurface(landmark.estimated3D, mesh);
    return {
      landmarkId: landmark.id,
      distanceToSurface: distance,
      fitted: distance <= LANDMARK_FIT_TOLERANCE,
      confidence: landmark.confidence,
    };
  });
}

export interface ConstraintSatisfactionInput {
  readonly targetLength: number;
  readonly actualLength: number;
}

function constraintSatisfactionScore(entries: readonly ConstraintSatisfactionInput[]): number {
  if (entries.length === 0) return 0.5;
  const scores = entries.map((entry) => {
    if (entry.targetLength <= 0) return 0.5;
    const relativeError = Math.abs(entry.actualLength - entry.targetLength) / entry.targetLength;
    return Math.max(0, 1 - relativeError);
  });
  return averageConfidence(scores);
}

export interface CrossViewScoringInput {
  readonly viewMetrics: readonly ViewFitMetric[];
  readonly landmarkMetrics: readonly LandmarkFitMetric[];
  readonly cameraConfidence: number;
  readonly coverageScore: number;
  readonly scaleResolved: boolean;
  readonly constraintEntries: readonly ConstraintSatisfactionInput[];
  readonly structurallyValid: boolean;
  readonly degenerateRatio: number;
}

export function computeCrossViewFitScore(input: CrossViewScoringInput): CrossViewFitScore {
  const weightedSilhouette =
    input.viewMetrics.length === 0
      ? 0
      : input.viewMetrics.reduce((sum, metric) => sum + metric.silhouetteIoU * Math.max(metric.weight, 0.1), 0) /
        input.viewMetrics.reduce((sum, metric) => sum + Math.max(metric.weight, 0.1), 0);

  const landmarkScores = input.landmarkMetrics.map((metric) => {
    if (!metric.fitted || metric.distanceToSurface === undefined) return 0;
    return Math.max(0, 1 - metric.distanceToSurface / LANDMARK_FIT_TOLERANCE);
  });
  const landmark = input.landmarkMetrics.length === 0 ? 0.5 : averageConfidence(landmarkScores);

  const topologyViability = input.structurallyValid ? Math.max(0, 1 - input.degenerateRatio) : 0;
  const constraintSatisfaction = constraintSatisfactionScore(input.constraintEntries);
  const scale = input.scaleResolved ? 1 : 0.5;

  const values = {
    silhouette: weightedSilhouette,
    landmark,
    cameraConsistency: input.cameraConfidence,
    scale,
    constraintSatisfaction,
    coverage: input.coverageScore,
    topologyViability,
  };

  const overall =
    values.silhouette * WEIGHTS.silhouette +
    values.landmark * WEIGHTS.landmark +
    values.cameraConsistency * WEIGHTS.cameraConsistency +
    values.scale * WEIGHTS.scale +
    values.constraintSatisfaction * WEIGHTS.constraintSatisfaction +
    values.coverage * WEIGHTS.coverage +
    values.topologyViability * WEIGHTS.topologyViability;

  return { ...values, overall, weights: { ...WEIGHTS } };
}
