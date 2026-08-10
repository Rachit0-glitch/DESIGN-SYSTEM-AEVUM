import {
  resolveCameraGeometry,
  type MultiViewReferenceSet,
  type Part,
  type ResolvedCameraGeometry,
} from "@aevum/multiview-reconstruction";
import { diagnostic } from "./diagnostics.js";
import { generateBoxMesh, generateCylinderMesh, fitBoxDimensions, fitCylinderDimensions } from "./primitives.js";
import type { HullView } from "./voxel-hull.js";
import { carveVisualHull, countOccupied, extractVoxelSurface } from "./voxel-hull.js";
import type { GeometryDiagnostic, GeometryRepresentationSchema, PartMesh, ReconstructionConfig } from "./schemas.js";
import type { z } from "zod";

const IDENTITY_TRANSFORM = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };

export interface RawCandidate {
  readonly generationMethod: z.infer<typeof GeometryRepresentationSchema>;
  readonly parts: readonly PartMesh[];
  readonly sampleCount?: number;
}

function frustumExtent(camera: ResolvedCameraGeometry, axis: "horizontal" | "vertical"): number {
  const distance = Math.hypot(camera.position.x, camera.position.y, camera.position.z);
  const halfHeight = Math.tan(camera.verticalFieldOfView / 2) * distance;
  const halfWidth = halfHeight * camera.aspectRatio;
  return axis === "vertical" ? halfHeight * 2 : halfWidth * 2;
}

const DEFAULT_PART_HALF_EXTENT = 0.15;

/** Estimates one part's box from its own 2D bounds observation, converting normalized fractions
 * to world lengths via that observation's camera frustum, and placing it vertically using the
 * observation's normalized center-Y (image grows downward; world Y grows upward). */
function estimatePartBox(part: Part, referenceSet: MultiViewReferenceSet): PartMesh {
  const observation = part.observations[0];
  const view = observation ? referenceSet.views.find((entry) => entry.id === observation.viewId) : undefined;
  const geometry = resolveCameraGeometry(view?.cameraEstimate);

  const widthFraction = observation ? observation.bounds.maxX - observation.bounds.minX : 0;
  const heightFraction = observation ? observation.bounds.maxY - observation.bounds.minY : 0;
  const worldWidth = geometry ? widthFraction * frustumExtent(geometry, "horizontal") : DEFAULT_PART_HALF_EXTENT * 2;
  const worldHeight = geometry ? heightFraction * frustumExtent(geometry, "vertical") : DEFAULT_PART_HALF_EXTENT * 2;

  let yOffset = 0;
  if (observation && geometry) {
    const centerYNormalized = (observation.bounds.minY + observation.bounds.maxY) / 2;
    yOffset = -(centerYNormalized - 0.5) * frustumExtent(geometry, "vertical");
  }

  const halfExtents = {
    x: Math.max(worldWidth / 2, 0.01),
    y: Math.max(worldHeight / 2, 0.01),
    z: Math.max(worldWidth / 2, 0.01),
  };
  return {
    partId: part.id,
    label: part.label,
    representation: "BOX_PRIMITIVE",
    mesh: generateBoxMesh(halfExtents),
    localTransform: { position: { x: 0, y: yOffset, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
  };
}

export function buildHullViews(referenceSet: MultiViewReferenceSet): HullView[] {
  const views: HullView[] = [];
  for (const view of referenceSet.views) {
    if (!view.silhouette) continue;
    const geometry = resolveCameraGeometry(view.cameraEstimate);
    if (!geometry) continue;
    views.push({ viewId: view.id, geometry, silhouette: view.silhouette.contour });
  }
  return views;
}

export interface GenerateCandidatesResult {
  readonly candidates: readonly RawCandidate[];
  readonly diagnostics: readonly GeometryDiagnostic[];
}

/** Generates the initial (pass 0) candidate set: one box per Phase 17 part when part evidence
 * exists (preserving part identity rather than flattening), otherwise a single-part box, an
 * optional cylinder alternative when the evidence genuinely supports one, and a voxel visual-hull
 * candidate when enough calibrated silhouette views exist. Every representation is bounded by
 * `config.maxCandidates`. */
export function generateInitialCandidates(
  referenceSet: MultiViewReferenceSet,
  config: ReconstructionConfig,
): GenerateCandidatesResult {
  const candidates: RawCandidate[] = [];
  const diagnostics: GeometryDiagnostic[] = [];

  if (referenceSet.parts.length > 0) {
    candidates.push({
      generationMethod: "BOX_PRIMITIVE",
      parts: referenceSet.parts.map((part) => estimatePartBox(part, referenceSet)),
    });
    if (referenceSet.parts.length > 1) {
      diagnostics.push(
        diagnostic({
          code: "PART_FLATTENED_WARNING",
          severity: "INFO",
          message: `${referenceSet.parts.length} parts were reconstructed as independent boxes, not flattened into one mesh.`,
          stage: "CANDIDATE_GENERATION",
          recoverable: true,
          relatedIds: referenceSet.parts.map((part) => part.id),
        }),
      );
    }
  } else {
    const boxFit = fitBoxDimensions(referenceSet);
    candidates.push({
      generationMethod: "BOX_PRIMITIVE",
      parts: [
        {
          partId: "root",
          label: referenceSet.subject.label ?? "object",
          representation: "BOX_PRIMITIVE",
          mesh: generateBoxMesh(boxFit.halfExtents),
          localTransform: IDENTITY_TRANSFORM,
        },
      ],
    });

    if (candidates.length < config.maxCandidates) {
      const cylinderFit = fitCylinderDimensions(referenceSet);
      if (cylinderFit) {
        candidates.push({
          generationMethod: "CYLINDER_PRIMITIVE",
          parts: [
            {
              partId: "root",
              label: referenceSet.subject.label ?? "object",
              representation: "CYLINDER_PRIMITIVE",
              mesh: generateCylinderMesh(cylinderFit.radius, cylinderFit.halfHeight),
              localTransform: IDENTITY_TRANSFORM,
            },
          ],
        });
      }
    }
  }

  // Voxel-hull is the general-purpose fallback for when there is no part decomposition. When
  // Phase 17 already supplied explicit part evidence, respecting that decomposition takes
  // priority over a numerically-competing flattened candidate that would erase part identity.
  if (candidates.length < config.maxCandidates && referenceSet.parts.length === 0) {
    const hullViews = buildHullViews(referenceSet);
    if (hullViews.length >= 2) {
      const boxFit = fitBoxDimensions(referenceSet);
      const halfExtent = Math.max(boxFit.halfExtents.x, boxFit.halfExtents.y, boxFit.halfExtents.z, 0.3) * 1.3;
      const { occupancy, sampleCount } = carveVisualHull(hullViews, { resolution: config.voxelResolution, halfExtent });
      const occupied = countOccupied(occupancy);
      if (occupied > 0) {
        candidates.push({
          generationMethod: "VOXEL_HULL",
          sampleCount,
          parts: [
            {
              partId: "root",
              label: referenceSet.subject.label ?? "object",
              representation: "VOXEL_HULL",
              mesh: extractVoxelSurface(occupancy, config.voxelResolution, halfExtent),
              localTransform: IDENTITY_TRANSFORM,
            },
          ],
        });
      } else {
        diagnostics.push(
          diagnostic({
            code: "CANDIDATE_REJECTED_DEGENERATE_GEOMETRY",
            severity: "INFO",
            message:
              "Silhouette carving produced an empty volume (silhouettes did not intersect); voxel-hull candidate skipped.",
            stage: "CANDIDATE_GENERATION",
            recoverable: true,
          }),
        );
      }
    }
  }

  return { candidates, diagnostics };
}
