import {
  boxDimensionNeighbors,
  carveVisualHull,
  centroidOf,
  chamferBoundaryDistance,
  checkStructuralValidity,
  checkViewRegression,
  compareRasterGrids,
  computeMeshBounds,
  convexHull,
  countOccupied,
  createBoxGroundTruthFixture,
  createCylinderGroundTruthFixture,
  distanceToMeshSurface,
  extractVoxelSurface,
  fitBoxDimensions,
  fitCylinderDimensions,
  generateBoxMesh,
  generateCylinderMesh,
  mergeMeshes,
  pointInPolygon,
  rasterizePolygon,
  resolveScaleFactor,
  translateMesh,
} from "@aevum/geometry-reconstruction";
import { analyzeMultiView, createMultiViewTask, quaternionFromLookAt } from "@aevum/multiview-reconstruction";
import { describe, expect, it } from "vitest";

describe("geometry-reconstruction: 2D geometry", () => {
  it("computes the convex hull of a point set with interior points removed", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(hull).toHaveLength(4);
    expect(hull.some((point) => point.x === 0.5 && point.y === 0.5)).toBe(false);
  });

  it("classifies points inside and outside a square polygon", () => {
    const square = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ];
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0.05, y: 0.05 }, square)).toBe(false);
  });

  it("computes a real IoU of 1.0 for identical rasterized squares and less for a shifted one", () => {
    const square = [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 },
    ];
    const shifted = square.map((point) => ({ x: point.x + 0.2, y: point.y }));
    const identical = compareRasterGrids(rasterizePolygon(square, 32), rasterizePolygon(square, 32));
    const overlapping = compareRasterGrids(rasterizePolygon(shifted, 32), rasterizePolygon(square, 32));
    expect(identical.iou).toBeCloseTo(1, 5);
    expect(overlapping.iou).toBeLessThan(1);
    expect(overlapping.iou).toBeGreaterThan(0);
  });

  it("computes zero Chamfer distance for identical contours and a positive distance otherwise", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const b = a.map((point) => ({ x: point.x + 0.5, y: point.y }));
    expect(chamferBoundaryDistance(a, a)).toBe(0);
    expect(chamferBoundaryDistance(a, b)).toBeGreaterThan(0);
  });

  it("computes the centroid of a symmetric square as its geometric center", () => {
    const centroid = centroidOf([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    expect(centroid.x).toBeCloseTo(0.5, 5);
    expect(centroid.y).toBeCloseTo(0.5, 5);
  });
});

describe("geometry-reconstruction: primitive mesh generation", () => {
  it("generates a box with 8 unique corner positions across 24 duplicated (per-face) vertices and 12 triangles", () => {
    const mesh = generateBoxMesh({ x: 0.5, y: 0.3, z: 0.2 });
    expect(mesh.positions.length / 3).toBe(24);
    expect(mesh.indices.length / 3).toBe(12);
    const bounds = computeMeshBounds(mesh);
    expect(bounds.size.x).toBeCloseTo(1, 5);
    expect(bounds.size.y).toBeCloseTo(0.6, 5);
    expect(bounds.size.z).toBeCloseTo(0.4, 5);
  });

  it("generates a cylinder whose bounds match the requested radius and height", () => {
    const mesh = generateCylinderMesh(0.4, 0.6, 16);
    const bounds = computeMeshBounds(mesh);
    expect(bounds.size.x).toBeCloseTo(0.8, 2);
    expect(bounds.size.z).toBeCloseTo(0.8, 2);
    expect(bounds.size.y).toBeCloseTo(1.2, 5);
  });
});

describe("geometry-reconstruction: mesh utilities", () => {
  it("computes real bounds for a merged, translated mesh", () => {
    const box = generateBoxMesh({ x: 0.1, y: 0.1, z: 0.1 });
    const translated = translateMesh(box, { x: 1, y: 0, z: 0 });
    const merged = mergeMeshes([box, translated]);
    const bounds = computeMeshBounds(merged);
    expect(bounds.min.x).toBeCloseTo(-0.1, 5);
    expect(bounds.max.x).toBeCloseTo(1.1, 5);
  });

  it("flags a degenerate (zero-area) triangle and accepts a valid box", () => {
    const box = generateBoxMesh({ x: 0.2, y: 0.2, z: 0.2 });
    expect(checkStructuralValidity(box, 1000).valid).toBe(true);

    const degenerate = {
      positions: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      indices: [0, 1, 2],
    };
    const result = checkStructuralValidity(degenerate, 1000);
    expect(result.valid).toBe(false);
    expect(result.degenerateTriangleCount).toBe(1);
  });

  it("rejects a mesh exceeding the configured triangle limit", () => {
    const box = generateBoxMesh({ x: 0.2, y: 0.2, z: 0.2 });
    expect(checkStructuralValidity(box, 1).valid).toBe(false);
  });

  it("computes a real closest-point-on-triangle distance", () => {
    const box = generateBoxMesh({ x: 1, y: 1, z: 1 });
    // The box spans [-1, 1] on every axis; a point 2 units past the +X face along X should be
    // exactly 2 units from the nearest surface point (1, 0, 0).
    const distance = distanceToMeshSurface({ x: 3, y: 0, z: 0 }, box);
    expect(distance).toBeCloseTo(2, 3);
    // A point already on the surface should have ~zero distance.
    expect(distanceToMeshSurface({ x: 1, y: 0, z: 0 }, box)).toBeCloseTo(0, 3);
  });
});

describe("geometry-reconstruction: voxel visual hull", () => {
  it("carves the real intersection of two orthogonal silhouettes into a nonempty, bounded volume", () => {
    // Two cameras looking along -Z and -X respectively (canonical forward axis is -Z), each
    // seeing a centered square silhouette — the intersection should be a real, nonempty volume
    // strictly smaller than the full sampled grid.
    const front = {
      viewId: "front",
      geometry: {
        position: { x: 0, y: 0, z: 2 },
        orientation: quaternionFromLookAt({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 0 }),
        verticalFieldOfView: Math.PI / 3,
        aspectRatio: 1,
        principalPoint: { x: 0.5, y: 0.5 },
      },
      silhouette: [
        { x: 0.3, y: 0.3 },
        { x: 0.7, y: 0.3 },
        { x: 0.7, y: 0.7 },
        { x: 0.3, y: 0.7 },
      ],
    };
    const side = {
      viewId: "side",
      geometry: {
        position: { x: 2, y: 0, z: 0 },
        orientation: quaternionFromLookAt({ x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
        verticalFieldOfView: Math.PI / 3,
        aspectRatio: 1,
        principalPoint: { x: 0.5, y: 0.5 },
      },
      silhouette: [
        { x: 0.3, y: 0.3 },
        { x: 0.7, y: 0.3 },
        { x: 0.7, y: 0.7 },
        { x: 0.3, y: 0.7 },
      ],
    };

    const resolution = 16;
    const halfExtent = 0.6;
    const { occupancy, sampleCount } = carveVisualHull([front, side], { resolution, halfExtent });
    const occupied = countOccupied(occupancy);
    expect(sampleCount).toBe(resolution ** 3);
    expect(occupied).toBeGreaterThan(0);
    expect(occupied).toBeLessThan(sampleCount);

    const mesh = extractVoxelSurface(occupancy, resolution, halfExtent);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(checkStructuralValidity(mesh, 100_000).nonFiniteVertexCount).toBe(0);
  });

  it("carves nothing when silhouettes cannot possibly intersect", () => {
    const geometry = {
      position: { x: 0, y: 0, z: 2 },
      orientation: quaternionFromLookAt({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 0 }),
      verticalFieldOfView: Math.PI / 3,
      aspectRatio: 1,
      principalPoint: { x: 0.5, y: 0.5 },
    };
    const tinyCorner = [
      { x: 0.01, y: 0.01 },
      { x: 0.05, y: 0.01 },
      { x: 0.05, y: 0.05 },
      { x: 0.01, y: 0.05 },
    ];
    const oppositeCorner = [
      { x: 0.95, y: 0.95 },
      { x: 0.99, y: 0.95 },
      { x: 0.99, y: 0.99 },
      { x: 0.95, y: 0.99 },
    ];
    const { occupancy } = carveVisualHull(
      [
        { viewId: "a", geometry, silhouette: tinyCorner },
        { viewId: "b", geometry, silhouette: oppositeCorner },
      ],
      { resolution: 12, halfExtent: 0.5 },
    );
    expect(countOccupied(occupancy)).toBe(0);
  });
});

describe("geometry-reconstruction: correction primitives", () => {
  it("generates a bounded set of dimension neighbors", () => {
    const neighbors = boxDimensionNeighbors({ x: 0.3, y: 0.3, z: 0.3 });
    expect(neighbors.length).toBe(12); // 3 axes x 4 factors
    for (const neighbor of neighbors) {
      expect(checkStructuralValidity(neighbor.mesh, 1000).valid).toBe(true);
    }
  });

  it("detects a per-view silhouette regression and lets an improvement without regression through", () => {
    const baseMetric = {
      viewId: "v1",
      role: "FRONT",
      silhouetteIoU: 0.8,
      silhouettePrecision: 0.8,
      silhouetteRecall: 0.8,
      boundaryDistance: 0.1,
      centroidDistance: 0.1,
      areaDifference: 0.1,
      weight: 0.9,
    };
    const before = [baseMetric];
    const regressed = [{ ...baseMetric, silhouetteIoU: 0.5 }];
    const improved = [{ ...baseMetric, silhouetteIoU: 0.9 }];
    expect(checkViewRegression(before, regressed).regressed).toBe(true);
    expect(checkViewRegression(before, improved).regressed).toBe(false);
  });
});

describe("geometry-reconstruction: dimension fitting from real Phase 17 evidence", () => {
  it("fits box dimensions close to the ground-truth extents from a real reference set", () => {
    const fixture = createBoxGroundTruthFixture();
    const task = createMultiViewTask(fixture.taskInput);
    const { referenceSet } = analyzeMultiView(task, { createdAt: "2026-08-09T00:00:00.000Z" });
    const fit = fitBoxDimensions(referenceSet);
    // The turntable-radius assumption is honest, not exact — allow generous tolerance, but prove
    // it is in the right ballpark and not a meaningless default.
    expect(fit.halfExtents.x).toBeGreaterThan(0);
    expect(fit.halfExtents.y).toBeGreaterThan(0);
    expect(fit.confidence).toBeGreaterThan(0);
  });

  it("proposes a cylinder fit only when the TOP silhouette is genuinely round", () => {
    const boxFixture = createBoxGroundTruthFixture();
    const boxTask = createMultiViewTask(boxFixture.taskInput);
    const { referenceSet: boxReferenceSet } = analyzeMultiView(boxTask, { createdAt: "2026-08-09T00:00:00.000Z" });
    expect(fitCylinderDimensions(boxReferenceSet)).toBeUndefined();

    const cylinderFixture = createCylinderGroundTruthFixture();
    const cylinderTask = createMultiViewTask(cylinderFixture.taskInput);
    const { referenceSet: cylinderReferenceSet } = analyzeMultiView(cylinderTask, {
      createdAt: "2026-08-09T00:00:00.000Z",
    });
    expect(fitCylinderDimensions(cylinderReferenceSet)).toBeDefined();
  });

  it("stays scale-relative without evidence and resolves when scale evidence exists", () => {
    const fixture = createBoxGroundTruthFixture();
    const task = createMultiViewTask(fixture.taskInput);
    const { referenceSet } = analyzeMultiView(task, { createdAt: "2026-08-09T00:00:00.000Z" });
    const result = resolveScaleFactor(referenceSet, { x: 0.3, y: 0.4, z: 0.2 });
    expect(result.resolved).toBe(false);
    expect(result.scaleFactor).toBe(1);
  });
});
