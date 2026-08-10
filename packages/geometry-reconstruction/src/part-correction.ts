import type { MultiViewReferenceSet, Part, Vec3 } from "@aevum/multiview-reconstruction";
import { computeMeshBounds } from "./mesh-utils.js";
import { generateBoxMesh } from "./primitives.js";
import type { PartMesh, ReconstructionPassActionSchema } from "./schemas.js";
import type { z } from "zod";

export interface PartNeighbor {
  readonly label: string;
  readonly action: z.infer<typeof ReconstructionPassActionSchema>;
  readonly part: PartMesh;
}

const TRANSLATE_FACTORS = [0.1, -0.1, 0.05, -0.05];
const AXES: ReadonlyArray<keyof Vec3> = ["x", "y", "z"];

/** Bounded translation neighbors, scaled to the part's own size rather than a fixed absolute
 * distance, so the search step is meaningful for both small and large parts. */
export function partTranslationNeighbors(part: PartMesh): PartNeighbor[] {
  const bounds = computeMeshBounds(part.mesh);
  const size = { x: bounds.size.x || 0.05, y: bounds.size.y || 0.05, z: bounds.size.z || 0.05 };
  const neighbors: PartNeighbor[] = [];
  for (const axis of AXES) {
    for (const factor of TRANSLATE_FACTORS) {
      const offset = size[axis] * factor;
      const position = { ...part.localTransform.position, [axis]: part.localTransform.position[axis] + offset };
      neighbors.push({
        label: `translate-${axis}${factor > 0 ? "+" : ""}${Math.round(factor * 100)}%`,
        action: "PART_TRANSLATE",
        part: { ...part, localTransform: { ...part.localTransform, position } },
      });
    }
  }
  return neighbors;
}

/** Bounded axis-scale neighbors for box-primitive parts (regenerates the box mesh at scaled
 * half-extents). Non-box parts (voxel/cylinder) are not yet axis-scale-corrected — an explicit,
 * disclosed limitation rather than an unsafe generic mesh scale. */
export function partAxisScaleNeighbors(part: PartMesh): PartNeighbor[] {
  if (part.representation !== "BOX_PRIMITIVE") return [];
  const bounds = computeMeshBounds(part.mesh);
  const halfExtents = { x: bounds.size.x / 2, y: bounds.size.y / 2, z: bounds.size.z / 2 };
  const factors = [0.1, -0.1, 0.05, -0.05];
  const neighbors: PartNeighbor[] = [];
  for (const axis of AXES) {
    for (const factor of factors) {
      const next = { ...halfExtents, [axis]: Math.max(0.005, halfExtents[axis] * (1 + factor)) };
      neighbors.push({
        label: `axis-scale-${axis}${factor > 0 ? "+" : ""}${Math.round(factor * 100)}%`,
        action: "PART_AXIS_SCALE",
        part: { ...part, mesh: generateBoxMesh(next) },
      });
    }
  }
  return neighbors;
}

/**
 * A single, real, deterministic reposition move: recenters the part on the centroid of its
 * Phase 17 triangulated landmarks (when any exist with a resolved 3D estimate). This is a
 * heuristic candidate move, not an assumed-correct placement — it is only kept by the correction
 * loop if it measurably improves the score without regressing other evidence.
 */
export function partRepositionFromLandmarksNeighbor(
  part: PartMesh,
  referenceSet: MultiViewReferenceSet,
  evidencePart: Part | undefined,
): PartNeighbor | undefined {
  if (!evidencePart) return undefined;
  const landmarkIds = new Set(evidencePart.observations.flatMap((observation) => observation.landmarkIds));
  const estimatedPositions = referenceSet.landmarks
    .filter((landmark) => landmarkIds.has(landmark.id))
    .map((landmark) => landmark.estimated3D)
    .filter((position): position is Vec3 => position !== undefined);
  if (estimatedPositions.length === 0) return undefined;

  const centroid = estimatedPositions.reduce(
    (sum, position) => ({
      x: sum.x + position.x / estimatedPositions.length,
      y: sum.y + position.y / estimatedPositions.length,
      z: sum.z + position.z / estimatedPositions.length,
    }),
    { x: 0, y: 0, z: 0 },
  );

  return {
    label: "reposition-from-landmarks",
    action: "PART_REPOSITION_FROM_LANDMARKS",
    part: { ...part, localTransform: { ...part.localTransform, position: centroid } },
  };
}
