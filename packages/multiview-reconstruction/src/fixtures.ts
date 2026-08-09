import { createRoleBasedCameraEstimator } from "./camera-estimator.js";
import { projectPoint, type Vec3 } from "./camera-math.js";
import { resolveCameraGeometry } from "./landmarks.js";
import type { MultiViewTaskInput, Normalized2D, ViewRoleClassification } from "./schemas.js";

export const MULTIVIEW_FIXTURE_NOW = "2026-08-09T00:00:00.000Z";

const PROJECT_ID = "project_00000000-0000-4000-8000-000000000000";
const CREATED_BY = { id: "user_fixture", type: "USER" as const };

function assetId(index: number): string {
  return `asset_00000000-0000-4000-8000-00000000000${index}`;
}

function rectContour(minX: number, minY: number, maxX: number, maxY: number) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

const estimator = createRoleBasedCameraEstimator();

/** Projects a world point through the same role-assumed turntable geometry the pipeline itself
 * will compute, so fixture landmark observations are genuinely consistent (or, for the
 * conflicting fixture, genuinely perturbed) rather than hand-guessed pixel coordinates. */
function projectForRole(role: ViewRoleClassification["role"], point: Vec3): { x: number; y: number } {
  const cameraEstimate = estimator.estimate({
    viewId: "fixture-projection",
    role: { role, confidence: 0.95, evidence: ["fixture"], method: "USER_PROVIDED" },
    imageWidth: 1024,
    imageHeight: 1024,
  });
  const geometry = resolveCameraGeometry(cameraEstimate);
  if (!geometry) throw new Error(`Fixture cannot resolve camera geometry for role ${role}.`);
  const projected = projectPoint(geometry, point);
  if (!projected) throw new Error(`Fixture point is not projectable from role ${role}.`);
  return projected;
}

const baseConfig = {
  maxViews: 16,
  maxLandmarks: 64,
  maxObservationsPerLandmark: 16,
  maxSilhouetteSamples: 128,
  maxParts: 32,
  maxConstraints: 64,
};

/** A. Strong product set: front, back, left, right, top, with silhouettes and one genuinely
 * triangulable landmark observed consistently from three views. */
export function createStrongProductFixture(): MultiViewTaskInput {
  const cornerPoint: Vec3 = { x: 0.25, y: 0.25, z: 0.25 };
  return {
    projectId: PROJECT_ID,
    subjectLabel: "Test Watch",
    subjectCategory: "product",
    views: [
      { assetId: assetId(1), imageWidth: 1024, imageHeight: 1024, silhouetteContour: rectContour(0.3, 0.2, 0.7, 0.8) },
      { assetId: assetId(2), imageWidth: 1024, imageHeight: 1024, silhouetteContour: rectContour(0.3, 0.2, 0.7, 0.8) },
      {
        assetId: assetId(3),
        imageWidth: 1024,
        imageHeight: 1024,
        silhouetteContour: rectContour(0.32, 0.22, 0.68, 0.78),
      },
      {
        assetId: assetId(4),
        imageWidth: 1024,
        imageHeight: 1024,
        silhouetteContour: rectContour(0.32, 0.22, 0.68, 0.78),
      },
      {
        assetId: assetId(5),
        imageWidth: 1024,
        imageHeight: 1024,
        silhouetteContour: rectContour(0.35, 0.35, 0.65, 0.65),
      },
    ],
    roleHints: [
      { assetId: assetId(1), role: "FRONT", userProvided: true },
      { assetId: assetId(2), role: "BACK", userProvided: true },
      { assetId: assetId(3), role: "LEFT", userProvided: true },
      { assetId: assetId(4), role: "RIGHT", userProvided: true },
      { assetId: assetId(5), role: "TOP", userProvided: true },
    ],
    landmarkHints: [
      {
        semanticLabel: "crown-corner",
        observations: [
          { assetId: assetId(1), normalized: projectForRole("FRONT", cornerPoint), visibility: "VISIBLE" },
          { assetId: assetId(4), normalized: projectForRole("RIGHT", cornerPoint), visibility: "VISIBLE" },
          { assetId: assetId(5), normalized: projectForRole("TOP", cornerPoint), visibility: "VISIBLE" },
        ],
      },
    ],
    partHints: [
      {
        label: "case",
        observations: [
          { assetId: assetId(1), bounds: { minX: 0.3, minY: 0.2, maxX: 0.7, maxY: 0.8 }, visibility: "VISIBLE" },
          { assetId: assetId(4), bounds: { minX: 0.32, minY: 0.22, maxX: 0.68, maxY: 0.78 }, visibility: "VISIBLE" },
        ],
      },
    ],
    scaleHints: [],
    config: baseConfig,
    deterministicSeed: 1,
    createdAt: MULTIVIEW_FIXTURE_NOW,
    createdBy: CREATED_BY,
  };
}

/** B. Insufficient input: a single front image only. Valid as a reference set, but readiness
 * must honestly reflect the missing depth/coverage evidence rather than fabricate it. */
export function createIncompleteFixture(): MultiViewTaskInput {
  return {
    projectId: PROJECT_ID,
    subjectLabel: "Test Watch",
    views: [
      { assetId: assetId(1), imageWidth: 1024, imageHeight: 1024, silhouetteContour: rectContour(0.3, 0.2, 0.7, 0.8) },
    ],
    roleHints: [{ assetId: assetId(1), role: "FRONT", userProvided: true }],
    landmarkHints: [
      {
        semanticLabel: "crown-corner",
        observations: [{ assetId: assetId(1), normalized: { x: 0.6, y: 0.3 }, visibility: "VISIBLE" }],
      },
    ],
    partHints: [],
    scaleHints: [],
    config: baseConfig,
    deterministicSeed: 2,
    createdAt: MULTIVIEW_FIXTURE_NOW,
    createdBy: CREATED_BY,
  };
}

/** C. Conflicting evidence: the same front+right pair as the strong fixture, but the RIGHT
 * landmark observation is deliberately perturbed far from where consistent triangulation would
 * place it, and both views are mislabeled with the same role. Validation must fail loudly rather
 * than silently average the contradiction away. */
export function createConflictingFixture(): MultiViewTaskInput {
  const cornerPoint: Vec3 = { x: 0.25, y: 0.25, z: 0.25 };
  const frontObservation = projectForRole("FRONT", cornerPoint);
  const rightObservationTruth = projectForRole("RIGHT", cornerPoint);
  // Mirrored horizontally: a genuinely incompatible observation (not just a small offset), large
  // enough that no honest triangulation could reconcile it with the front observation.
  const perturbedRightObservation: Normalized2D = {
    x: 1 - rightObservationTruth.x,
    y: rightObservationTruth.y,
  };
  return {
    projectId: PROJECT_ID,
    subjectLabel: "Test Watch",
    views: [
      { assetId: assetId(1), imageWidth: 1024, imageHeight: 1024, silhouetteContour: rectContour(0.3, 0.2, 0.7, 0.8) },
      { assetId: assetId(4), imageWidth: 1024, imageHeight: 1024, silhouetteContour: rectContour(0.3, 0.2, 0.7, 0.8) },
    ],
    roleHints: [
      { assetId: assetId(1), role: "FRONT", userProvided: true },
      { assetId: assetId(4), role: "FRONT", userProvided: true },
    ],
    landmarkHints: [
      {
        semanticLabel: "crown-corner",
        observations: [
          { assetId: assetId(1), normalized: frontObservation, visibility: "VISIBLE" },
          { assetId: assetId(4), normalized: perturbedRightObservation, visibility: "VISIBLE" },
        ],
      },
    ],
    partHints: [
      {
        label: "case",
        observations: [
          { assetId: assetId(1), bounds: { minX: 0.3, minY: 0.2, maxX: 0.7, maxY: 0.8 }, visibility: "VISIBLE" },
        ],
      },
      {
        label: "case",
        observations: [
          { assetId: assetId(4), bounds: { minX: 0.35, minY: 0.25, maxX: 0.65, maxY: 0.75 }, visibility: "VISIBLE" },
        ],
      },
    ],
    scaleHints: [
      { source: "USER_PROVIDED", value: 42, unit: "MM", confidence: 0.9 },
      { source: "KNOWN_SPECIFICATION", value: 60, unit: "MM", confidence: 0.9 },
    ],
    config: baseConfig,
    deterministicSeed: 3,
    createdAt: MULTIVIEW_FIXTURE_NOW,
    createdBy: CREATED_BY,
  };
}

/** D. Symmetric product: a front silhouette centered on the image, producing a high bounding-box
 * symmetry proxy score. */
export function createSymmetricProductFixture(): MultiViewTaskInput {
  return {
    projectId: PROJECT_ID,
    subjectLabel: "Symmetric Bottle",
    views: [
      {
        assetId: assetId(1),
        imageWidth: 1024,
        imageHeight: 1024,
        silhouetteContour: rectContour(0.35, 0.1, 0.65, 0.9),
      },
    ],
    roleHints: [{ assetId: assetId(1), role: "FRONT", userProvided: true }],
    landmarkHints: [],
    partHints: [],
    scaleHints: [],
    config: baseConfig,
    deterministicSeed: 4,
    createdAt: MULTIVIEW_FIXTURE_NOW,
    createdBy: CREATED_BY,
  };
}

/** E. Asymmetric product: a front silhouette skewed hard to one side, producing a low symmetry
 * proxy score. */
export function createAsymmetricProductFixture(): MultiViewTaskInput {
  return {
    projectId: PROJECT_ID,
    subjectLabel: "Asymmetric Bracket",
    views: [
      { assetId: assetId(1), imageWidth: 1024, imageHeight: 1024, silhouetteContour: rectContour(0.1, 0.1, 0.4, 0.9) },
    ],
    roleHints: [{ assetId: assetId(1), role: "FRONT", userProvided: true }],
    landmarkHints: [],
    partHints: [],
    scaleHints: [],
    config: baseConfig,
    deterministicSeed: 5,
    createdAt: MULTIVIEW_FIXTURE_NOW,
    createdBy: CREATED_BY,
  };
}
