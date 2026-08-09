import {
  addVectors,
  buildCoverageReport,
  buildLandmarks,
  classifyViewRole,
  computeSilhouetteStatistics,
  confidence,
  createRoleBasedCameraEstimator,
  createStrongProductFixture,
  createIncompleteFixture,
  createMultiViewTask,
  deserializeMultiViewTask,
  detectDuplicateRoles,
  fingerprint,
  MultiViewTaskSchema,
  projectPoint,
  quaternionFromLookAt,
  rayForNormalizedPoint,
  resolveCameraGeometry,
  serializeMultiViewTask,
  triangulateRays,
} from "@aevum/multiview-reconstruction";
import { describe, expect, it } from "vitest";

describe("multiview-reconstruction: camera math", () => {
  it("round-trips a point through ray casting and projection for a look-at camera", () => {
    const orientation = quaternionFromLookAt({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 });
    const camera = {
      position: { x: 0, y: 0, z: 1 },
      orientation,
      verticalFieldOfView: Math.PI / 4,
      aspectRatio: 1,
      principalPoint: { x: 0.5, y: 0.5 },
    };
    const point = { x: 0.1, y: 0.05, z: 0 };
    const projected = projectPoint(camera, point);
    expect(projected).toBeDefined();
    if (!projected) return;
    const ray = rayForNormalizedPoint(camera, projected);
    // The ray from the reprojected point must pass back through the original point.
    const t = (point.z - ray.origin.z) / ray.direction.z;
    const recovered = addVectors(ray.origin, {
      x: ray.direction.x * t,
      y: ray.direction.y * t,
      z: ray.direction.z * t,
    });
    expect(recovered.x).toBeCloseTo(point.x, 4);
    expect(recovered.y).toBeCloseTo(point.y, 4);
  });

  it("returns undefined for a point behind the camera rather than fabricating a projection", () => {
    const orientation = quaternionFromLookAt({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 });
    const camera = {
      position: { x: 0, y: 0, z: 1 },
      orientation,
      verticalFieldOfView: Math.PI / 4,
      aspectRatio: 1,
      principalPoint: { x: 0.5, y: 0.5 },
    };
    expect(projectPoint(camera, { x: 0, y: 0, z: 2 })).toBeUndefined();
  });

  it("triangulates a known 3D point from two cameras with near-zero residual", () => {
    const trueX = { x: 0, y: 0, z: 1 };
    const target = { x: 0, y: 0, z: 0 };
    const point = { x: 0.15, y: 0.1, z: 0 };
    const cameraFront = {
      position: trueX,
      orientation: quaternionFromLookAt(trueX, target),
      verticalFieldOfView: Math.PI / 4,
      aspectRatio: 1,
      principalPoint: { x: 0.5, y: 0.5 },
    };
    const cameraSide = {
      position: { x: 1, y: 0, z: 0 },
      orientation: quaternionFromLookAt({ x: 1, y: 0, z: 0 }, target),
      verticalFieldOfView: Math.PI / 4,
      aspectRatio: 1,
      principalPoint: { x: 0.5, y: 0.5 },
    };
    const observationFront = projectPoint(cameraFront, point);
    const observationSide = projectPoint(cameraSide, point);
    expect(observationFront).toBeDefined();
    expect(observationSide).toBeDefined();
    if (!observationFront || !observationSide) return;

    const result = triangulateRays([
      { viewId: "front", ray: rayForNormalizedPoint(cameraFront, observationFront) },
      { viewId: "side", ray: rayForNormalizedPoint(cameraSide, observationSide) },
    ]);
    expect(result).toBeDefined();
    if (!result) return;
    expect(result.point.x).toBeCloseTo(point.x, 3);
    expect(result.point.y).toBeCloseTo(point.y, 3);
    expect(result.point.z).toBeCloseTo(point.z, 3);
    expect(result.residual).toBeLessThan(1e-6);
  });

  it("refuses to triangulate degenerate (parallel or single) rays rather than inventing a point", () => {
    expect(
      triangulateRays([{ viewId: "only", ray: { origin: { x: 0, y: 0, z: 1 }, direction: { x: 0, y: 0, z: -1 } } }]),
    ).toBeUndefined();
    expect(
      triangulateRays([
        { viewId: "a", ray: { origin: { x: 0, y: 0, z: 1 }, direction: { x: 0, y: 0, z: -1 } } },
        { viewId: "b", ray: { origin: { x: 0, y: 0, z: 2 }, direction: { x: 0, y: 0, z: -1 } } },
      ]),
    ).toBeUndefined();
  });
});

describe("multiview-reconstruction: camera estimator", () => {
  it("derives a real geometric turntable pose for a known role with capped confidence", () => {
    const estimator = createRoleBasedCameraEstimator();
    const estimate = estimator.estimate({
      viewId: "view-1",
      role: { role: "RIGHT", confidence: 0.95, evidence: [], method: "USER_PROVIDED" },
      imageWidth: 1024,
      imageHeight: 1024,
    });
    expect(estimate.projection).toBe("PERSPECTIVE");
    expect(estimate.confidence).toBeLessThanOrEqual(0.6);
    expect(estimate.extrinsics.position?.x).toBeGreaterThan(0);
    const geometry = resolveCameraGeometry(estimate);
    expect(geometry).toBeDefined();
  });

  it("honestly reports UNKNOWN for a role with no turntable assumption", () => {
    const estimator = createRoleBasedCameraEstimator();
    const estimate = estimator.estimate({
      viewId: "view-2",
      role: { role: "DETAIL", confidence: 0.9, evidence: [], method: "USER_PROVIDED" },
      imageWidth: 1024,
      imageHeight: 1024,
    });
    expect(estimate.projection).toBe("UNKNOWN");
    expect(estimate.confidence).toBe(0);
    expect(estimate.diagnostics.some((entry) => entry.code === "CAMERA_UNKNOWN")).toBe(true);
  });
});

describe("multiview-reconstruction: view roles", () => {
  it("classifies UNKNOWN with a diagnostic when no hint is supplied", () => {
    const result = classifyViewRole({ viewId: "view-1", assetId: "asset-1", hints: [] });
    expect(result.classification.role).toBe("UNKNOWN");
    expect(result.classification.confidence).toBe(0);
    expect(result.diagnostics.some((entry) => entry.code === "VIEW_ROLE_AMBIGUOUS")).toBe(true);
  });

  it("gives user-provided hints higher confidence than caller-inferred hints", () => {
    const userProvided = classifyViewRole({
      viewId: "view-1",
      assetId: "asset-1",
      hints: [{ assetId: "asset-1", role: "FRONT", userProvided: true }],
    });
    const inferred = classifyViewRole({
      viewId: "view-2",
      assetId: "asset-2",
      hints: [{ assetId: "asset-2", role: "FRONT", userProvided: false }],
    });
    expect(userProvided.classification.method).toBe("USER_PROVIDED");
    expect(inferred.classification.method).toBe("INFERRED_FROM_HINT");
    expect(userProvided.classification.confidence).toBeGreaterThan(inferred.classification.confidence);
  });

  it("flags two views independently claiming the same non-UNKNOWN role", () => {
    const diagnostics = detectDuplicateRoles([
      { viewId: "a", role: { role: "FRONT", confidence: 0.9, evidence: [], method: "USER_PROVIDED" } },
      { viewId: "b", role: { role: "FRONT", confidence: 0.9, evidence: [], method: "USER_PROVIDED" } },
    ]);
    expect(diagnostics.some((entry) => entry.code === "VIEW_DUPLICATE")).toBe(true);
  });
});

describe("multiview-reconstruction: silhouette statistics", () => {
  it("computes real bounds, centroid, area, and aspect ratio from a contour", () => {
    const statistics = computeSilhouetteStatistics([
      { x: 0.3, y: 0.2 },
      { x: 0.7, y: 0.2 },
      { x: 0.7, y: 0.8 },
      { x: 0.3, y: 0.8 },
    ]);
    expect(statistics.bounds).toEqual({ minX: 0.3, minY: 0.2, maxX: 0.7, maxY: 0.8 });
    expect(statistics.centroid.x).toBeCloseTo(0.5, 5);
    expect(statistics.centroid.y).toBeCloseTo(0.5, 5);
    expect(statistics.areaRatio).toBeCloseTo(0.4 * 0.6, 5);
    expect(statistics.aspectRatio).toBeCloseTo(0.4 / 0.6, 5);
  });
});

describe("multiview-reconstruction: coverage", () => {
  it("scores a single front-only view far below a five-view set covering distinct directions", () => {
    const singleFront = buildCoverageReport([
      {
        id: "view:00000000000000000000000000000001",
        assetId: "asset_00000000-0000-4000-8000-000000000001",
        role: { role: "FRONT", confidence: 0.95, evidence: [], method: "USER_PROVIDED" },
        imageWidth: 1024,
        imageHeight: 1024,
        orientation: "SQUARE",
        provenance: { source: "USER", provider: "test", providerVersion: "1.0.0", confidence: 0.95 },
      },
    ]);
    const roles = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP"] as const;
    const fiveViews = buildCoverageReport(
      roles.map((role, index) => ({
        id: `view:0000000000000000000000000000000${index}`,
        assetId: `asset_00000000-0000-4000-8000-00000000000${index}`,
        role: { role, confidence: 0.95, evidence: [], method: "USER_PROVIDED" as const },
        imageWidth: 1024,
        imageHeight: 1024,
        orientation: "SQUARE" as const,
        provenance: { source: "USER" as const, provider: "test", providerVersion: "1.0.0", confidence: 0.95 },
      })),
    );
    expect(fiveViews.coverage.overallScore).toBeGreaterThan(singleFront.coverage.overallScore);
    expect(fiveViews.coverage.diversityScore).toBeGreaterThan(singleFront.coverage.diversityScore);
  });
});

describe("multiview-reconstruction: landmarks", () => {
  it("triangulates a consistent landmark and detects a perturbed, conflicting one", () => {
    const cameraFront = createRoleBasedCameraEstimator().estimate({
      viewId: "front",
      role: { role: "FRONT", confidence: 0.95, evidence: [], method: "USER_PROVIDED" },
      imageWidth: 1024,
      imageHeight: 1024,
    });
    const cameraRight = createRoleBasedCameraEstimator().estimate({
      viewId: "right",
      role: { role: "RIGHT", confidence: 0.95, evidence: [], method: "USER_PROVIDED" },
      imageWidth: 1024,
      imageHeight: 1024,
    });
    const geometryFront = resolveCameraGeometry(cameraFront);
    const geometryRight = resolveCameraGeometry(cameraRight);
    if (!geometryFront || !geometryRight) throw new Error("Expected resolvable turntable geometry.");
    const point = { x: 0.2, y: 0.2, z: 0.2 };
    const observedFront = projectPoint(geometryFront, point);
    const observedRight = projectPoint(geometryRight, point);
    if (!observedFront || !observedRight) throw new Error("Expected the fixture point to be projectable.");

    const consistentResult = buildLandmarks({
      hints: [
        {
          semanticLabel: "corner",
          observations: [
            { assetId: "asset-front", normalized: observedFront },
            { assetId: "asset-right", normalized: observedRight },
          ],
        },
      ],
      assetIdToViewId: new Map([
        ["asset-front", "front"],
        ["asset-right", "right"],
      ]),
      cameraByViewId: new Map([
        ["front", cameraFront],
        ["right", cameraRight],
      ]),
      config: {
        maxViews: 16,
        maxLandmarks: 64,
        maxObservationsPerLandmark: 16,
        maxSilhouetteSamples: 128,
        maxParts: 32,
        maxConstraints: 64,
      },
    });
    expect(consistentResult.landmarks[0]?.estimated3D).toBeDefined();
    expect(consistentResult.correspondences[0]?.consistent).toBe(true);
    expect(consistentResult.diagnostics.some((entry) => entry.code === "LANDMARK_CONFLICT")).toBe(false);

    const conflictingResult = buildLandmarks({
      hints: [
        {
          semanticLabel: "corner",
          observations: [
            { assetId: "asset-front", normalized: observedFront },
            { assetId: "asset-right", normalized: { x: 1 - observedRight.x, y: observedRight.y } },
          ],
        },
      ],
      assetIdToViewId: new Map([
        ["asset-front", "front"],
        ["asset-right", "right"],
      ]),
      cameraByViewId: new Map([
        ["front", cameraFront],
        ["right", cameraRight],
      ]),
      config: {
        maxViews: 16,
        maxLandmarks: 64,
        maxObservationsPerLandmark: 16,
        maxSilhouetteSamples: 128,
        maxParts: 32,
        maxConstraints: 64,
      },
    });
    expect(conflictingResult.correspondences[0]?.consistent).toBe(false);
    expect(conflictingResult.diagnostics.some((entry) => entry.code === "LANDMARK_CONFLICT")).toBe(true);
  });

  it("records insufficient-observation diagnostics rather than triangulating from one view", () => {
    const result = buildLandmarks({
      hints: [{ semanticLabel: "lonely", observations: [{ assetId: "asset-front", normalized: { x: 0.5, y: 0.5 } }] }],
      assetIdToViewId: new Map([["asset-front", "front"]]),
      cameraByViewId: new Map(),
      config: {
        maxViews: 16,
        maxLandmarks: 64,
        maxObservationsPerLandmark: 16,
        maxSilhouetteSamples: 128,
        maxParts: 32,
        maxConstraints: 64,
      },
    });
    expect(result.landmarks[0]?.estimated3D).toBeUndefined();
    expect(result.diagnostics.some((entry) => entry.code === "LANDMARK_INSUFFICIENT_OBSERVATIONS")).toBe(true);
  });
});

describe("multiview-reconstruction: confidence", () => {
  it("buckets scores into consistent labels", () => {
    expect(confidence(0.9).label).toBe("HIGH");
    expect(confidence(0.7).label).toBe("MEDIUM");
    expect(confidence(0.3).label).toBe("LOW");
    expect(confidence(0).label).toBe("UNKNOWN");
  });
});

describe("multiview-reconstruction: task determinism, immutability, serialization", () => {
  it("creates identical, frozen tasks for identical input and rejects tampering", () => {
    const input = createStrongProductFixture();
    const first = createMultiViewTask(input);
    const second = createMultiViewTask(input);
    expect(first).toEqual(second);
    expect(first.id).toBe(second.id);
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      (first as { subjectLabel?: string }).subjectLabel = "tampered";
    }).toThrow();
  });

  it("round-trips a task through stable serialization", () => {
    const task = createMultiViewTask(createIncompleteFixture());
    const serialized = serializeMultiViewTask(task);
    const restored = deserializeMultiViewTask(serialized);
    expect(restored).toEqual(task);
    expect(fingerprint(task)).toBe(fingerprint(restored));
  });

  it("rejects a task with duplicate source asset IDs", () => {
    const input = createStrongProductFixture();
    const firstView = input.views[0];
    if (!firstView) throw new Error("Expected the strong fixture to have at least one view.");
    const duplicated = { ...input, views: [firstView, firstView] };
    expect(
      MultiViewTaskSchema.safeParse({ ...duplicated, id: `multiview-task:${"0".repeat(32)}`, taskVersion: "1.0.0" })
        .success,
    ).toBe(false);
  });
});
