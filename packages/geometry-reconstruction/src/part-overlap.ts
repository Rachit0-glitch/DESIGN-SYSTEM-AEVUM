import type { Vec3 } from "@aevum/multiview-reconstruction";
import { diagnostic } from "./diagnostics.js";
import { computeMeshBounds } from "./mesh-utils.js";
import type { GeometryDiagnostic, PartMesh } from "./schemas.js";

interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

function aabbOf(part: PartMesh): Aabb {
  const bounds = computeMeshBounds(part.mesh);
  return {
    min: {
      x: bounds.min.x + part.localTransform.position.x,
      y: bounds.min.y + part.localTransform.position.y,
      z: bounds.min.z + part.localTransform.position.z,
    },
    max: {
      x: bounds.max.x + part.localTransform.position.x,
      y: bounds.max.y + part.localTransform.position.y,
      z: bounds.max.z + part.localTransform.position.z,
    },
  };
}

function intersectionVolume(a: Aabb, b: Aabb): number {
  const ix = Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x));
  const iy = Math.max(0, Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y));
  const iz = Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
  return ix * iy * iz;
}

function volumeOf(aabb: Aabb): number {
  return (
    Math.max(0, aabb.max.x - aabb.min.x) * Math.max(0, aabb.max.y - aabb.min.y) * Math.max(0, aabb.max.z - aabb.min.z)
  );
}

/**
 * Bounded AABB-level overlap diagnostics between reconstructed parts. This is explicitly an
 * axis-aligned-bounding-box check, not real mesh-level collision detection — attached parts (a
 * crown against a watch body) are expected to touch or slightly overlap, so only overlap beyond
 * `toleranceRatio` of the smaller part's volume is flagged.
 */
export function detectPartOverlaps(parts: readonly PartMesh[], toleranceRatio: number): readonly GeometryDiagnostic[] {
  const diagnostics: GeometryDiagnostic[] = [];
  const boxes = parts.map((part) => ({ part, aabb: aabbOf(part) }));

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const left = boxes[i];
      const right = boxes[j];
      if (!left || !right) continue;
      const overlap = intersectionVolume(left.aabb, right.aabb);
      if (overlap <= 0) continue;
      const smallerVolume = Math.min(volumeOf(left.aabb), volumeOf(right.aabb));
      if (smallerVolume <= 0) continue;
      const overlapRatio = overlap / smallerVolume;
      if (overlapRatio > toleranceRatio) {
        diagnostics.push(
          diagnostic({
            code: "PART_OVERLAP_DETECTED",
            severity: "WARNING",
            message: `Parts "${left.part.label}" and "${right.part.label}" overlap by ${(overlapRatio * 100).toFixed(1)}% of the smaller part's bounding volume.`,
            stage: "PART_OVERLAP_CHECK",
            recoverable: true,
            relatedIds: [left.part.partId, right.part.partId],
            details: { overlapRatio },
          }),
        );
      }
    }
  }

  return diagnostics;
}
