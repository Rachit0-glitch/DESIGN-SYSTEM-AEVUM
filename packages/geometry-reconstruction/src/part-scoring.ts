import {
  averageConfidence,
  projectPoint,
  resolveCameraGeometry,
  type MultiViewReferenceSet,
  type Part,
} from "@aevum/multiview-reconstruction";
import { diagnostic } from "./diagnostics.js";
import { boundsOfPoints, rectArea, rectCentroid, rectIoU, type Point2D } from "./geometry-2d.js";
import { checkStructuralValidity, distanceToMeshSurface } from "./mesh-utils.js";
import { PartScoreSchema, type GeometryDiagnostic, type PartScore, type RawMesh } from "./schemas.js";
import { deepFreeze } from "./immutable.js";

const LANDMARK_FIT_TOLERANCE = 0.2;
const SILHOUETTE_SIZE_TOLERANCE = 0.3;
const POSITION_MISMATCH_TOLERANCE = 0.15;

const PART_SCORE_WEIGHTS = {
  silhouette: 0.4,
  landmark: 0.25,
  constraint: 0.15,
  topology: 0.2,
} as const;

function projectMeshBounds(
  mesh: RawMesh,
  geometry: ReturnType<typeof resolveCameraGeometry>,
): { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } | undefined {
  if (!geometry) return undefined;
  const projected: Point2D[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const point = projectPoint(geometry, {
      x: mesh.positions[i] ?? 0,
      y: mesh.positions[i + 1] ?? 0,
      z: mesh.positions[i + 2] ?? 0,
    });
    if (point) projected.push(point);
  }
  if (projected.length === 0) return undefined;
  return boundsOfPoints(projected);
}

export interface ScorePartInput {
  readonly partId: string;
  readonly label: string;
  /** The part's mesh already positioned in world/object space (local transform applied). */
  readonly worldMesh: RawMesh;
  readonly referenceSet: MultiViewReferenceSet;
  /** The matching Phase 17 part evidence record, when the candidate corresponds to one. */
  readonly evidencePart: Part | undefined;
  readonly maxTriangles: number;
}

/**
 * Real per-part scoring against Phase 17's part-level evidence: bounding-box IoU per observing
 * view (Phase 17 part observations are rectangles, not full silhouette contours, so IoU is
 * computed in rectangle space rather than pretending polygon evidence exists), landmark-to-surface
 * distance for landmarks the part evidence references, and a local structural check. Constraint
 * fit stays neutral (0.5) because Phase 17 does not yet attach geometric constraints to individual
 * parts — an explicit, disclosed limitation rather than a fabricated signal.
 */
export function scorePart(input: ScorePartInput): PartScore {
  const diagnostics: GeometryDiagnostic[] = [];
  const viewScores: Array<{ viewId: string; iou: number }> = [];

  if (input.evidencePart) {
    for (const observation of input.evidencePart.observations) {
      const view = input.referenceSet.views.find((entry) => entry.id === observation.viewId);
      const geometry = resolveCameraGeometry(view?.cameraEstimate);
      const candidateBounds = projectMeshBounds(input.worldMesh, geometry);
      if (!candidateBounds) continue;

      const iou = rectIoU(candidateBounds, observation.bounds);
      viewScores.push({ viewId: observation.viewId, iou });

      const candidateArea = rectArea(candidateBounds);
      const sourceArea = rectArea(observation.bounds);
      if (sourceArea > 0) {
        if (candidateArea > sourceArea * (1 + SILHOUETTE_SIZE_TOLERANCE)) {
          diagnostics.push(
            diagnostic({
              code: "PART_SILHOUETTE_TOO_LARGE",
              severity: "WARNING",
              message: `Part "${input.label}" projects larger than its observed bounds in view ${observation.viewId}.`,
              stage: "PART_SCORING",
              recoverable: true,
              relatedIds: [input.partId, observation.viewId],
            }),
          );
        } else if (candidateArea < sourceArea * (1 - SILHOUETTE_SIZE_TOLERANCE)) {
          diagnostics.push(
            diagnostic({
              code: "PART_SILHOUETTE_TOO_SMALL",
              severity: "WARNING",
              message: `Part "${input.label}" projects smaller than its observed bounds in view ${observation.viewId}.`,
              stage: "PART_SCORING",
              recoverable: true,
              relatedIds: [input.partId, observation.viewId],
            }),
          );
        }
      }

      const centroidDistance = Math.hypot(
        rectCentroid(candidateBounds).x - rectCentroid(observation.bounds).x,
        rectCentroid(candidateBounds).y - rectCentroid(observation.bounds).y,
      );
      if (centroidDistance > POSITION_MISMATCH_TOLERANCE) {
        diagnostics.push(
          diagnostic({
            code: "PART_POSITION_MISMATCH",
            severity: "WARNING",
            message: `Part "${input.label}" is positioned ${centroidDistance.toFixed(3)} away from its observed center in view ${observation.viewId}.`,
            stage: "PART_SCORING",
            recoverable: true,
            relatedIds: [input.partId, observation.viewId],
          }),
        );
      }
    }
  }

  const silhouetteFit = viewScores.length === 0 ? 0 : averageConfidence(viewScores.map((entry) => entry.iou));

  const landmarkIds = new Set(input.evidencePart?.observations.flatMap((observation) => observation.landmarkIds) ?? []);
  const relevantLandmarks = input.referenceSet.landmarks.filter((landmark) => landmarkIds.has(landmark.id));
  const landmarkFitScores = relevantLandmarks.map((landmark) => {
    if (!landmark.estimated3D) return 0;
    const distance = distanceToMeshSurface(landmark.estimated3D, input.worldMesh);
    const fit = Math.max(0, 1 - distance / LANDMARK_FIT_TOLERANCE);
    if (fit < 0.5) {
      diagnostics.push(
        diagnostic({
          code: "PART_LANDMARK_MISMATCH",
          severity: "INFO",
          message: `Part "${input.label}" surface sits ${distance.toFixed(3)} from landmark ${landmark.id}.`,
          stage: "PART_SCORING",
          recoverable: true,
          relatedIds: [input.partId, landmark.id],
        }),
      );
    }
    return fit;
  });
  const landmarkFit = relevantLandmarks.length === 0 ? 0.5 : averageConfidence(landmarkFitScores);

  const constraintFit = 0.5; // neutral: Phase 17 does not yet attach constraints to individual parts
  const structural = checkStructuralValidity(input.worldMesh, input.maxTriangles);
  const topologyViability = structural.valid
    ? 1
    : Math.max(0, 1 - structural.degenerateTriangleCount / Math.max(1, structural.triangleCount));

  const overall =
    silhouetteFit * PART_SCORE_WEIGHTS.silhouette +
    landmarkFit * PART_SCORE_WEIGHTS.landmark +
    constraintFit * PART_SCORE_WEIGHTS.constraint +
    topologyViability * PART_SCORE_WEIGHTS.topology;

  return deepFreeze(
    PartScoreSchema.parse({
      partId: input.partId,
      label: input.label,
      silhouetteFit,
      landmarkFit,
      constraintFit,
      topologyViability,
      overall,
      viewScores,
      diagnostics,
    }),
  );
}
