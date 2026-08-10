import {
  resolveCameraGeometry,
  vectorLength,
  type MultiViewReferenceSet,
  type ResolvedCameraGeometry,
  type ViewRecord,
} from "@aevum/multiview-reconstruction";
import type { RawMesh } from "./schemas.js";

/** World-space full extent (horizontal or vertical) of the camera's view frustum at the distance
 * of the world origin — the real geometric basis for converting a Phase 17 normalized silhouette
 * fraction into an assumed metric length under the disclosed turntable-radius assumption. */
function frustumExtentAtOrigin(camera: ResolvedCameraGeometry, axis: "horizontal" | "vertical"): number {
  const distance = vectorLength(camera.position);
  const halfHeight = Math.tan(camera.verticalFieldOfView / 2) * distance;
  const halfWidth = halfHeight * camera.aspectRatio;
  return axis === "vertical" ? halfHeight * 2 : halfWidth * 2;
}

export interface BoxFitResult {
  readonly halfExtents: { readonly x: number; readonly y: number; readonly z: number };
  readonly usedConstraintIds: readonly string[];
  readonly confidence: number;
}

const DEFAULT_HALF_EXTENT = 0.3;

export interface ResolvedDimensionTarget {
  readonly label: "FRONT_WIDTH" | "SIDE_DEPTH" | "OVERALL_HEIGHT";
  readonly constraintId: string;
  readonly worldLength: number;
  readonly confidence: number;
}

/** Resolves each Phase 17 silhouette-backed dimension constraint (FRONT_WIDTH/SIDE_DEPTH/
 * OVERALL_HEIGHT) into an assumed metric world length, via the constraint's own source view's
 * camera frustum. Only constraints with a resolvable camera are returned — never a fabricated
 * value for evidence that doesn't exist. */
export function resolveDimensionTargets(referenceSet: MultiViewReferenceSet): readonly ResolvedDimensionTarget[] {
  const viewsById = new Map(referenceSet.views.map((view) => [view.id, view]));
  const targets: ResolvedDimensionTarget[] = [];

  const specs: ReadonlyArray<{ label: ResolvedDimensionTarget["label"]; axis: "horizontal" | "vertical" }> = [
    { label: "FRONT_WIDTH", axis: "horizontal" },
    { label: "SIDE_DEPTH", axis: "horizontal" },
    { label: "OVERALL_HEIGHT", axis: "vertical" },
  ];

  for (const spec of specs) {
    const constraint = referenceSet.constraints.find(
      (entry) => entry.type === "BOUNDING_DIMENSION" && entry.details.label === spec.label,
    );
    if (!constraint || constraint.value === undefined) continue;
    const sourceViewId = constraint.entityIds.find((id) => viewsById.has(id));
    const view = sourceViewId ? viewsById.get(sourceViewId) : undefined;
    const geometry = resolveCameraGeometry(view?.cameraEstimate);
    if (!geometry) continue;
    targets.push({
      label: spec.label,
      constraintId: constraint.id,
      worldLength: constraint.value * frustumExtentAtOrigin(geometry, spec.axis),
      confidence: constraint.confidence,
    });
  }

  return targets;
}

/** Derives box half-extents from `resolveDimensionTargets`. Falls back to a small default extent
 * — never a "confident" guess — for any axis without supporting evidence. */
export function fitBoxDimensions(referenceSet: MultiViewReferenceSet): BoxFitResult {
  const targets = resolveDimensionTargets(referenceSet);
  const byLabel = new Map(targets.map((target) => [target.label, target]));
  const width = byLabel.get("FRONT_WIDTH")?.worldLength;
  const depth = byLabel.get("SIDE_DEPTH")?.worldLength;
  const height = byLabel.get("OVERALL_HEIGHT")?.worldLength;
  const confidences = targets.map((target) => target.confidence);

  return {
    halfExtents: {
      x: (width ?? DEFAULT_HALF_EXTENT * 2) / 2,
      y: (height ?? DEFAULT_HALF_EXTENT * 2) / 2,
      z: (depth ?? DEFAULT_HALF_EXTENT * 2) / 2,
    },
    usedConstraintIds: targets.map((target) => target.constraintId),
    confidence: confidences.length === 0 ? 0 : confidences.reduce((sum, value) => sum + value, 0) / confidences.length,
  };
}

export interface CylinderFitResult {
  readonly radius: number;
  readonly halfHeight: number;
  readonly usedConstraintIds: readonly string[];
  readonly confidence: number;
}

/** A cylinder is only proposed as an alternative candidate when real evidence supports it: a TOP
 * view silhouette with a near-square (round) bounding box, and at least weak symmetry evidence.
 * Otherwise this returns undefined rather than forcing every object into a cylinder. */
export function fitCylinderDimensions(referenceSet: MultiViewReferenceSet): CylinderFitResult | undefined {
  const topView = referenceSet.views.find((view) => view.role.role === "TOP" && view.silhouette);
  if (!topView?.silhouette) return undefined;
  const { bounds } = topView.silhouette;
  const footprintWidth = bounds.maxX - bounds.minX;
  const footprintHeight = bounds.maxY - bounds.minY;
  const roundness = Math.min(footprintWidth, footprintHeight) / Math.max(footprintWidth, footprintHeight);
  if (roundness < 0.85) return undefined;

  const symmetry = referenceSet.constraints.find((entry) => entry.type === "SYMMETRY");
  if (!symmetry || symmetry.confidence < 0.3) return undefined;

  const box = fitBoxDimensions(referenceSet);
  return {
    radius: Math.max(box.halfExtents.x, box.halfExtents.z),
    halfHeight: box.halfExtents.y,
    usedConstraintIds: [...box.usedConstraintIds, symmetry.id],
    confidence: Math.min(box.confidence, symmetry.confidence),
  };
}

function pushVertex(
  positions: number[],
  normals: number[],
  point: readonly [number, number, number],
  normal: readonly [number, number, number],
): number {
  const index = positions.length / 3;
  positions.push(point[0], point[1], point[2]);
  normals.push(normal[0], normal[1], normal[2]);
  return index;
}

/** A real, standard box mesh (24 vertices — 4 per face, so each face gets a correct flat normal
 * rather than an averaged/incorrect shared-vertex normal), centered at the local origin. */
export function generateBoxMesh(halfExtents: { readonly x: number; readonly y: number; readonly z: number }): RawMesh {
  const { x: hx, y: hy, z: hz } = halfExtents;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  const faces: ReadonlyArray<{
    readonly normal: readonly [number, number, number];
    readonly corners: ReadonlyArray<readonly [number, number, number]>;
  }> = [
    {
      normal: [0, 0, 1],
      corners: [
        [-hx, -hy, hz],
        [hx, -hy, hz],
        [hx, hy, hz],
        [-hx, hy, hz],
      ],
    },
    {
      normal: [0, 0, -1],
      corners: [
        [hx, -hy, -hz],
        [-hx, -hy, -hz],
        [-hx, hy, -hz],
        [hx, hy, -hz],
      ],
    },
    {
      normal: [1, 0, 0],
      corners: [
        [hx, -hy, hz],
        [hx, -hy, -hz],
        [hx, hy, -hz],
        [hx, hy, hz],
      ],
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [-hx, -hy, -hz],
        [-hx, -hy, hz],
        [-hx, hy, hz],
        [-hx, hy, -hz],
      ],
    },
    {
      normal: [0, 1, 0],
      corners: [
        [-hx, hy, hz],
        [hx, hy, hz],
        [hx, hy, -hz],
        [-hx, hy, -hz],
      ],
    },
    {
      normal: [0, -1, 0],
      corners: [
        [-hx, -hy, -hz],
        [hx, -hy, -hz],
        [hx, -hy, hz],
        [-hx, -hy, hz],
      ],
    },
  ];

  for (const face of faces) {
    const [a, b, c, d] = face.corners.map((corner) => pushVertex(positions, normals, corner, face.normal));
    indices.push(a ?? 0, b ?? 0, c ?? 0, a ?? 0, c ?? 0, d ?? 0);
  }

  return { positions, normals, indices };
}

/** A real, standard parametric cylinder mesh (side quads + fan-triangulated caps), Y-axis aligned
 * to match the canonical Y-up convention, centered at the local origin. */
export function generateCylinderMesh(radius: number, halfHeight: number, segments = 16): RawMesh {
  const boundedSegments = Math.max(6, Math.min(64, Math.round(segments)));
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  interface RingPoint {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly nx: number;
    readonly nz: number;
  }
  const ring = (y: number): RingPoint[] =>
    Array.from({ length: boundedSegments }, (_, i) => {
      const angle = (i / boundedSegments) * Math.PI * 2;
      return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius, nx: Math.cos(angle), nz: Math.sin(angle) };
    });

  const top = ring(halfHeight);
  const bottom = ring(-halfHeight);
  const zeroRingPoint: RingPoint = { x: 0, y: 0, z: 0, nx: 0, nz: 0 };

  const topSideIndices: number[] = [];
  const bottomSideIndices: number[] = [];
  for (let i = 0; i < boundedSegments; i += 1) {
    const t = top[i] ?? zeroRingPoint;
    const b = bottom[i] ?? zeroRingPoint;
    topSideIndices.push(pushVertex(positions, normals, [t.x, t.y, t.z], [t.nx, 0, t.nz]));
    bottomSideIndices.push(pushVertex(positions, normals, [b.x, b.y, b.z], [b.nx, 0, b.nz]));
  }
  for (let i = 0; i < boundedSegments; i += 1) {
    const next = (i + 1) % boundedSegments;
    indices.push(bottomSideIndices[i] ?? 0, bottomSideIndices[next] ?? 0, topSideIndices[next] ?? 0);
    indices.push(bottomSideIndices[i] ?? 0, topSideIndices[next] ?? 0, topSideIndices[i] ?? 0);
  }

  const topCenter = pushVertex(positions, normals, [0, halfHeight, 0], [0, 1, 0]);
  const topCapIndices = top.map((point) => pushVertex(positions, normals, [point.x, point.y, point.z], [0, 1, 0]));
  for (let i = 0; i < boundedSegments; i += 1) {
    const next = (i + 1) % boundedSegments;
    indices.push(topCenter, topCapIndices[i] ?? 0, topCapIndices[next] ?? 0);
  }

  const bottomCenter = pushVertex(positions, normals, [0, -halfHeight, 0], [0, -1, 0]);
  const bottomCapIndices = bottom.map((point) =>
    pushVertex(positions, normals, [point.x, point.y, point.z], [0, -1, 0]),
  );
  for (let i = 0; i < boundedSegments; i += 1) {
    const next = (i + 1) % boundedSegments;
    indices.push(bottomCenter, bottomCapIndices[next] ?? 0, bottomCapIndices[i] ?? 0);
  }

  return { positions, normals, indices };
}

export interface ScaleApplicationResult {
  readonly scaleFactor: number;
  readonly resolved: boolean;
  readonly referenceDimension: "OVERALL_HEIGHT" | "LARGEST_EXTENT" | "NONE";
}

/** Resolves a uniform scale factor from Phase 17 scale evidence. Evidence is assumed to describe
 * the object's overall height when available, else its largest extent — an explicit, disclosed
 * assumption (scale evidence does not itself say which axis it measures). Without any scale
 * evidence, the model stays in its assumed-turntable-radius units (scaleFactor 1, unresolved). */
export function resolveScaleFactor(
  referenceSet: MultiViewReferenceSet,
  currentHalfExtents: { readonly x: number; readonly y: number; readonly z: number },
): ScaleApplicationResult {
  const [evidence] = referenceSet.scaleEvidence;
  if (!evidence) {
    return { scaleFactor: 1, resolved: false, referenceDimension: "NONE" };
  }
  const metersPerUnit = { MM: 0.001, CM: 0.01, M: 1, IN: 0.0254, FT: 0.3048 } as const;
  const targetMeters = evidence.value * metersPerUnit[evidence.unit];

  const heightConstraint = referenceSet.constraints.some(
    (entry) => entry.type === "BOUNDING_DIMENSION" && entry.details.label === "OVERALL_HEIGHT",
  );
  const currentHeight = currentHalfExtents.y * 2;
  const largestExtent = Math.max(currentHalfExtents.x, currentHalfExtents.y, currentHalfExtents.z) * 2;
  const referenceDimension = heightConstraint && currentHeight > 0 ? "OVERALL_HEIGHT" : "LARGEST_EXTENT";
  const currentValue = referenceDimension === "OVERALL_HEIGHT" ? currentHeight : largestExtent;

  return {
    scaleFactor: currentValue > 0 ? targetMeters / currentValue : 1,
    resolved: currentValue > 0,
    referenceDimension: currentValue > 0 ? referenceDimension : "NONE",
  };
}

export function scaleMesh(mesh: RawMesh, factor: number): RawMesh {
  return {
    positions: mesh.positions.map((value) => value * factor),
    ...(mesh.normals ? { normals: mesh.normals } : {}),
    indices: mesh.indices,
  };
}

export function findViewByRole(referenceSet: MultiViewReferenceSet, role: string): ViewRecord | undefined {
  return referenceSet.views.find((view) => view.role.role === role);
}
