import {
  createRoleBasedCameraEstimator,
  projectPoint,
  resolveCameraGeometry,
  type MultiViewTaskInput,
  type Vec3,
  type ViewRoleClassification,
} from "@aevum/multiview-reconstruction";
import { convexHull, type Point2D } from "./geometry-2d.js";

export const GEOMETRY_FIXTURE_NOW = "2026-08-09T00:00:00.000Z";
const PROJECT_ID = "project_00000000-0000-4000-8000-000000000000";
const CREATED_BY = { id: "user_fixture", type: "USER" as const };

function assetId(index: number): string {
  return `asset_00000000-0000-4000-8000-00000000000${index}`;
}

const estimator = createRoleBasedCameraEstimator();

function geometryForRole(role: ViewRoleClassification["role"]) {
  const cameraEstimate = estimator.estimate({
    viewId: "fixture-projection",
    role: { role, confidence: 0.95, evidence: ["ground-truth fixture"], method: "USER_PROVIDED" },
    imageWidth: 1024,
    imageHeight: 1024,
  });
  const geometry = resolveCameraGeometry(cameraEstimate);
  if (!geometry) throw new Error(`Fixture cannot resolve camera geometry for role ${role}.`);
  return geometry;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampPoint(point: Point2D): Point2D {
  return { x: clampUnit(point.x), y: clampUnit(point.y) };
}

function projectPointOrThrow(role: ViewRoleClassification["role"], point: Vec3): Point2D {
  const projected = projectPoint(geometryForRole(role), point);
  if (!projected) throw new Error(`Fixture point is not projectable from role ${role}.`);
  return clampPoint(projected);
}

function projectPoints(role: ViewRoleClassification["role"], points: readonly Vec3[]): Point2D[] {
  const geometry = geometryForRole(role);
  const projected: Point2D[] = [];
  for (const point of points) {
    const result = projectPoint(geometry, point);
    if (result) projected.push(clampPoint(result));
  }
  return projected;
}

/** The real ground-truth silhouette of a box: the convex hull of all 8 corners projected through
 * the role's camera — not a hand-drawn rectangle. `center` defaults to the origin; a nonzero
 * center is used by the voxel-refinement fixture to create genuine (not injected) multi-view
 * silhouette disagreement against the origin-centered turntable camera assumption. */
function boxSilhouette(
  role: ViewRoleClassification["role"],
  halfExtents: Vec3,
  center: Vec3 = { x: 0, y: 0, z: 0 },
): Point2D[] {
  const { x: hx, y: hy, z: hz } = halfExtents;
  const corners: Vec3[] = [
    { x: -hx, y: -hy, z: -hz },
    { x: hx, y: -hy, z: -hz },
    { x: hx, y: hy, z: -hz },
    { x: -hx, y: hy, z: -hz },
    { x: -hx, y: -hy, z: hz },
    { x: hx, y: -hy, z: hz },
    { x: hx, y: hy, z: hz },
    { x: -hx, y: hy, z: hz },
  ].map((corner) => ({ x: corner.x + center.x, y: corner.y + center.y, z: corner.z + center.z }));
  return convexHull(projectPoints(role, corners));
}

/** The real ground-truth silhouette of a cylinder: the convex hull of points sampled on its top
 * and bottom rims (32 samples each), projected through the role's camera. */
function cylinderSilhouette(role: ViewRoleClassification["role"], radius: number, halfHeight: number): Point2D[] {
  const samples: Vec3[] = [];
  const segments = 32;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    samples.push({ x, y: halfHeight, z }, { x, y: -halfHeight, z });
  }
  return convexHull(projectPoints(role, samples));
}

function boxTaskInput(
  halfExtents: Vec3,
  roles: readonly ViewRoleClassification["role"][],
  subjectLabel: string,
  seed: number,
): MultiViewTaskInput {
  const cornerPoint: Vec3 = { x: halfExtents.x, y: halfExtents.y, z: halfExtents.z };
  const landmarkRoles = roles.filter((role) => ["FRONT", "RIGHT", "TOP"].includes(role));
  return {
    projectId: PROJECT_ID,
    subjectLabel,
    views: roles.map((role, index) => ({
      assetId: assetId(index + 1),
      imageWidth: 1024,
      imageHeight: 1024,
      silhouetteContour: boxSilhouette(role, halfExtents),
    })),
    roleHints: roles.map((role, index) => ({ assetId: assetId(index + 1), role, userProvided: true })),
    landmarkHints:
      landmarkRoles.length >= 2
        ? [
            {
              semanticLabel: "corner",
              observations: landmarkRoles.map((role) => ({
                assetId: assetId(roles.indexOf(role) + 1),
                normalized: projectPointOrThrow(role, cornerPoint),
                visibility: "VISIBLE" as const,
              })),
            },
          ]
        : [],
    partHints: [],
    scaleHints: [],
    config: {
      maxViews: 16,
      maxLandmarks: 64,
      maxObservationsPerLandmark: 16,
      maxSilhouetteSamples: 128,
      maxParts: 32,
      maxConstraints: 64,
    },
    deterministicSeed: seed,
    createdAt: GEOMETRY_FIXTURE_NOW,
    createdBy: CREATED_BY,
  };
}

export interface GroundTruthBoxFixture {
  readonly taskInput: MultiViewTaskInput;
  readonly trueHalfExtents: Vec3;
}

/** A. A box with known half-extents, observed from five roles (front/back/left/right/top). The
 * silhouettes and landmark are real projections of that box — the true geometry is discarded by
 * the caller before reconstruction, only used afterward to grade the result. */
export function createBoxGroundTruthFixture(): GroundTruthBoxFixture {
  const trueHalfExtents: Vec3 = { x: 0.3, y: 0.4, z: 0.2 };
  return {
    taskInput: boxTaskInput(trueHalfExtents, ["FRONT", "BACK", "LEFT", "RIGHT", "TOP"], "Ground-truth box", 101),
    trueHalfExtents,
  };
}

export interface GroundTruthCylinderFixture {
  readonly taskInput: MultiViewTaskInput;
  readonly trueRadius: number;
  readonly trueHalfHeight: number;
}

/** B. A cylinder with known radius/height. TOP silhouette is a real projected circle (round
 * footprint), so the reconstruction pipeline's own roundness heuristic should select a cylinder. */
export function createCylinderGroundTruthFixture(): GroundTruthCylinderFixture {
  const trueRadius = 0.25;
  const trueHalfHeight = 0.35;
  const roles: ViewRoleClassification["role"][] = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP"];
  return {
    taskInput: {
      projectId: PROJECT_ID,
      subjectLabel: "Ground-truth cylinder",
      views: roles.map((role, index) => ({
        assetId: assetId(index + 1),
        imageWidth: 1024,
        imageHeight: 1024,
        silhouetteContour: cylinderSilhouette(role, trueRadius, trueHalfHeight),
      })),
      roleHints: roles.map((role, index) => ({ assetId: assetId(index + 1), role, userProvided: true })),
      landmarkHints: [],
      partHints: [],
      scaleHints: [],
      config: {
        maxViews: 16,
        maxLandmarks: 64,
        maxObservationsPerLandmark: 16,
        maxSilhouetteSamples: 128,
        maxParts: 32,
        maxConstraints: 64,
      },
      deterministicSeed: 102,
      createdAt: GEOMETRY_FIXTURE_NOW,
      createdBy: CREATED_BY,
    },
    trueRadius,
    trueHalfHeight,
  };
}

/** C. A single front view of the same ground-truth box — valid evidence, but depth-insufficient.
 * Reconstruction must not fabricate the missing side/top geometry. */
export function createMissingViewFixture(): GroundTruthBoxFixture {
  const trueHalfExtents: Vec3 = { x: 0.3, y: 0.4, z: 0.2 };
  return { taskInput: boxTaskInput(trueHalfExtents, ["FRONT"], "Ground-truth box (front only)", 103), trueHalfExtents };
}

/** D. The same front+right pair as the box fixture, but the RIGHT view's silhouette is mirrored
 * (a genuinely incompatible observation) and both views share the FRONT role — real conflicting
 * evidence, not a synthetic score injected after the fact. */
export function createConflictingViewFixture(): GroundTruthBoxFixture {
  const trueHalfExtents: Vec3 = { x: 0.3, y: 0.4, z: 0.2 };
  const rightSilhouette = boxSilhouette("RIGHT", trueHalfExtents);
  const mirroredRight = rightSilhouette.map((point) => ({ x: 1 - point.x, y: point.y }));
  return {
    taskInput: {
      projectId: PROJECT_ID,
      subjectLabel: "Conflicting-evidence box",
      views: [
        {
          assetId: assetId(1),
          imageWidth: 1024,
          imageHeight: 1024,
          silhouetteContour: boxSilhouette("FRONT", trueHalfExtents),
        },
        { assetId: assetId(2), imageWidth: 1024, imageHeight: 1024, silhouetteContour: mirroredRight },
      ],
      roleHints: [
        { assetId: assetId(1), role: "FRONT", userProvided: true },
        { assetId: assetId(2), role: "FRONT", userProvided: true },
      ],
      landmarkHints: [],
      partHints: [],
      scaleHints: [
        { source: "USER_PROVIDED", value: 60, unit: "MM", confidence: 0.9 },
        { source: "KNOWN_SPECIFICATION", value: 400, unit: "MM", confidence: 0.9 },
      ],
      config: {
        maxViews: 16,
        maxLandmarks: 64,
        maxObservationsPerLandmark: 16,
        maxSilhouetteSamples: 128,
        maxParts: 32,
        maxConstraints: 64,
      },
      deterministicSeed: 104,
      createdAt: GEOMETRY_FIXTURE_NOW,
      createdBy: CREATED_BY,
    },
    trueHalfExtents,
  };
}

export interface GroundTruthMultiPartFixture {
  readonly taskInput: MultiViewTaskInput;
  readonly bodyHalfExtents: Vec3;
  readonly capHalfExtents: Vec3;
}

/** E. A compact two-part product: a larger "body" box and a smaller "cap" box stacked above it,
 * each with its own real projected 2D bounds per view, and explicit Phase 17 part hints keeping
 * their identity separate. */
export function createMultiPartGroundTruthFixture(): GroundTruthMultiPartFixture {
  const bodyHalfExtents: Vec3 = { x: 0.3, y: 0.3, z: 0.2 };
  const capHalfExtents: Vec3 = { x: 0.12, y: 0.08, z: 0.12 };
  const capCenterY = bodyHalfExtents.y + capHalfExtents.y;
  const roles: ViewRoleClassification["role"][] = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP"];

  function partBounds2D(role: ViewRoleClassification["role"], halfExtents: Vec3, centerY: number) {
    const { x: hx, y: hy, z: hz } = halfExtents;
    const corners: Vec3[] = [
      { x: -hx, y: centerY - hy, z: -hz },
      { x: hx, y: centerY - hy, z: -hz },
      { x: hx, y: centerY + hy, z: -hz },
      { x: -hx, y: centerY + hy, z: -hz },
      { x: -hx, y: centerY - hy, z: hz },
      { x: hx, y: centerY - hy, z: hz },
      { x: hx, y: centerY + hy, z: hz },
      { x: -hx, y: centerY + hy, z: hz },
    ];
    const projected = projectPoints(role, corners);
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }

  const fullSilhouette = (role: ViewRoleClassification["role"]) => {
    const bodyBounds = partBounds2D(role, bodyHalfExtents, 0);
    const capBounds = partBounds2D(role, capHalfExtents, capCenterY);
    const corners: Point2D[] = [
      { x: bodyBounds.minX, y: bodyBounds.minY },
      { x: bodyBounds.maxX, y: bodyBounds.minY },
      { x: bodyBounds.maxX, y: bodyBounds.maxY },
      { x: bodyBounds.minX, y: bodyBounds.maxY },
      { x: capBounds.minX, y: capBounds.minY },
      { x: capBounds.maxX, y: capBounds.minY },
      { x: capBounds.maxX, y: capBounds.maxY },
      { x: capBounds.minX, y: capBounds.maxY },
    ];
    return convexHull(corners);
  };

  return {
    taskInput: {
      projectId: PROJECT_ID,
      subjectLabel: "Ground-truth multi-part product",
      views: roles.map((role, index) => ({
        assetId: assetId(index + 1),
        imageWidth: 1024,
        imageHeight: 1024,
        silhouetteContour: fullSilhouette(role),
      })),
      roleHints: roles.map((role, index) => ({ assetId: assetId(index + 1), role, userProvided: true })),
      landmarkHints: [],
      partHints: [
        {
          label: "body",
          observations: roles.map((role, index) => ({
            assetId: assetId(index + 1),
            bounds: partBounds2D(role, bodyHalfExtents, 0),
            visibility: "VISIBLE" as const,
          })),
        },
        {
          label: "cap",
          observations: roles
            .filter((role) => role !== "TOP")
            .map((role) => ({
              assetId: assetId(roles.indexOf(role) + 1),
              bounds: partBounds2D(role, capHalfExtents, capCenterY),
              visibility: "VISIBLE" as const,
            })),
        },
      ],
      scaleHints: [],
      config: {
        maxViews: 16,
        maxLandmarks: 64,
        maxObservationsPerLandmark: 16,
        maxSilhouetteSamples: 128,
        maxParts: 32,
        maxConstraints: 64,
      },
      deterministicSeed: 105,
      createdAt: GEOMETRY_FIXTURE_NOW,
      createdBy: CREATED_BY,
    },
    bodyHalfExtents,
    capHalfExtents,
  };
}

export interface GroundTruthOffsetBoxFixture {
  readonly taskInput: MultiViewTaskInput;
  readonly trueHalfExtents: Vec3;
  readonly trueCenter: Vec3;
}

/**
 * F. A box whose TRUE position is slightly off the world origin, observed through the same
 * role-based turntable camera assumption (which always looks at the origin). This creates real,
 * non-injected multi-view silhouette disagreement — the assumed camera pose is honestly slightly
 * wrong relative to the true object — giving the voxel visual-hull carving genuine false-positive/
 * false-negative regions for occupancy refinement to correct, rather than a perfectly self-
 * consistent evidence set with nothing left to fix.
 */
export function createOffsetBoxGroundTruthFixture(): GroundTruthOffsetBoxFixture {
  const trueHalfExtents: Vec3 = { x: 0.22, y: 0.22, z: 0.22 };
  const trueCenter: Vec3 = { x: 0.09, y: 0, z: 0 };
  const roles: ViewRoleClassification["role"][] = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP"];
  return {
    taskInput: {
      projectId: PROJECT_ID,
      subjectLabel: "Ground-truth offset box (voxel refinement fixture)",
      views: roles.map((role, index) => ({
        assetId: assetId(index + 1),
        imageWidth: 1024,
        imageHeight: 1024,
        silhouetteContour: boxSilhouette(role, trueHalfExtents, trueCenter),
      })),
      roleHints: roles.map((role, index) => ({ assetId: assetId(index + 1), role, userProvided: true })),
      landmarkHints: [],
      partHints: [],
      scaleHints: [],
      config: {
        maxViews: 16,
        maxLandmarks: 64,
        maxObservationsPerLandmark: 16,
        maxSilhouetteSamples: 128,
        maxParts: 32,
        maxConstraints: 64,
      },
      deterministicSeed: 106,
      createdAt: GEOMETRY_FIXTURE_NOW,
      createdBy: CREATED_BY,
    },
    trueHalfExtents,
    trueCenter,
  };
}

function shrinkTowardCentroid(contour: readonly Point2D[], factor: number): Point2D[] {
  const centroid = contour.reduce(
    (sum, point) => ({ x: sum.x + point.x / contour.length, y: sum.y + point.y / contour.length }),
    { x: 0, y: 0 },
  );
  return contour.map((point) => ({
    x: clampUnit(centroid.x + (point.x - centroid.x) * factor),
    y: clampUnit(centroid.y + (point.y - centroid.y) * factor),
  }));
}

export interface GroundTruthNoisyViewFixture {
  readonly taskInput: MultiViewTaskInput;
  readonly trueHalfExtents: Vec3;
}

/**
 * G. A box observed accurately from four roles, plus one (RIGHT) whose silhouette is genuinely
 * under-segmented (shrunk toward its own centroid, simulating a real partial-occlusion/bad-
 * segmentation observation) — not a hand-picked "expected" result. The strict unanimous visual
 * hull will under-carve wherever the bad view disagrees; multi-view-consensus refinement should
 * recover the volume the other four views support without being fooled by the one bad view.
 */
export function createNoisyViewBoxGroundTruthFixture(): GroundTruthNoisyViewFixture {
  const trueHalfExtents: Vec3 = { x: 0.25, y: 0.25, z: 0.25 };
  const roles: ViewRoleClassification["role"][] = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP"];
  return {
    taskInput: {
      projectId: PROJECT_ID,
      subjectLabel: "Ground-truth box with one noisy view",
      views: roles.map((role, index) => ({
        assetId: assetId(index + 1),
        imageWidth: 1024,
        imageHeight: 1024,
        silhouetteContour:
          role === "RIGHT"
            ? shrinkTowardCentroid(boxSilhouette(role, trueHalfExtents), 0.6)
            : boxSilhouette(role, trueHalfExtents),
      })),
      roleHints: roles.map((role, index) => ({ assetId: assetId(index + 1), role, userProvided: true })),
      landmarkHints: [],
      partHints: [],
      scaleHints: [],
      config: {
        maxViews: 16,
        maxLandmarks: 64,
        maxObservationsPerLandmark: 16,
        maxSilhouetteSamples: 128,
        maxParts: 32,
        maxConstraints: 64,
      },
      deterministicSeed: 107,
      createdAt: GEOMETRY_FIXTURE_NOW,
      createdBy: CREATED_BY,
    },
    trueHalfExtents,
  };
}
