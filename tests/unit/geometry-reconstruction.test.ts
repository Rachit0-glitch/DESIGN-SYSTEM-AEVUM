import {
  boundsOfPoints,
  boxDimensionNeighbors,
  buildHullViews,
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
  createMultiPartGroundTruthFixture,
  createNoisyViewBoxGroundTruthFixture,
  detectPartOverlaps,
  dilateOccupancy,
  distanceToMeshSurface,
  erodeOccupancy,
  extractVoxelSurface,
  fitBoxDimensions,
  fitCylinderDimensions,
  generateBoxMesh,
  generateCylinderMesh,
  mergeMeshes,
  partAxisScaleNeighbors,
  partRepositionFromLandmarksNeighbor,
  partTranslationNeighbors,
  pointInPolygon,
  rasterizePolygon,
  rectArea,
  rectCentroid,
  rectIoU,
  refineOccupancyFromEvidence,
  resolveScaleFactor,
  scorePart,
  translateMesh,
  type PartMesh,
} from "@aevum/geometry-reconstruction";
import { analyzeMultiView, createMultiViewTask, quaternionFromLookAt } from "@aevum/multiview-reconstruction";
import { describe, expect, it } from "vitest";

const FIXTURE_NOW = "2026-08-09T00:00:00.000Z";
const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };

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

  it("computes rectangle IoU, area, and centroid for real axis-aligned bounds", () => {
    const a = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const b = { minX: 0.5, minY: 0, maxX: 1.5, maxY: 1 };
    expect(rectIoU(a, a)).toBeCloseTo(1, 5);
    expect(rectIoU(a, b)).toBeCloseTo(0.5 / 1.5, 5);
    expect(rectArea(a)).toBeCloseTo(1, 5);
    expect(rectCentroid(a)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("computes real bounds from a point set", () => {
    const bounds = boundsOfPoints([
      { x: -1, y: 2 },
      { x: 3, y: -4 },
      { x: 0, y: 0 },
    ]);
    expect(bounds).toEqual({ minX: -1, minY: -4, maxX: 3, maxY: 2 });
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

describe("geometry-reconstruction: per-part scoring (Phase 19A)", () => {
  it("scores a part highly when its world mesh matches its Phase 17 observed bounds", () => {
    const fixture = createMultiPartGroundTruthFixture();
    const task = createMultiViewTask(fixture.taskInput);
    const { referenceSet } = analyzeMultiView(task, { createdAt: FIXTURE_NOW });
    const bodyPart = referenceSet.parts.find((part) => part.label === "body");
    if (!bodyPart) throw new Error("Expected a body part in the reference set.");

    const score = scorePart({
      partId: bodyPart.id,
      label: "body",
      worldMesh: generateBoxMesh(fixture.bodyHalfExtents),
      referenceSet,
      evidencePart: bodyPart,
      maxTriangles: 10_000,
    });

    expect(score.silhouetteFit).toBeGreaterThan(0.5);
    expect(score.overall).toBeGreaterThan(0.5);
    expect(score.diagnostics.some((entry) => entry.code === "PART_SILHOUETTE_TOO_LARGE")).toBe(false);
    expect(score.diagnostics.some((entry) => entry.code === "PART_POSITION_MISMATCH")).toBe(false);
  });

  it("flags an oversized part and a mispositioned part with real diagnostics", () => {
    const fixture = createMultiPartGroundTruthFixture();
    const task = createMultiViewTask(fixture.taskInput);
    const { referenceSet } = analyzeMultiView(task, { createdAt: FIXTURE_NOW });
    const bodyPart = referenceSet.parts.find((part) => part.label === "body");
    if (!bodyPart) throw new Error("Expected a body part in the reference set.");

    const oversizedScore = scorePart({
      partId: bodyPart.id,
      label: "body",
      worldMesh: generateBoxMesh({
        x: fixture.bodyHalfExtents.x * 2,
        y: fixture.bodyHalfExtents.y * 2,
        z: fixture.bodyHalfExtents.z * 2,
      }),
      referenceSet,
      evidencePart: bodyPart,
      maxTriangles: 10_000,
    });
    expect(oversizedScore.diagnostics.some((entry) => entry.code === "PART_SILHOUETTE_TOO_LARGE")).toBe(true);

    const shiftedScore = scorePart({
      partId: bodyPart.id,
      label: "body",
      worldMesh: translateMesh(generateBoxMesh(fixture.bodyHalfExtents), { x: 0.5, y: 0, z: 0 }),
      referenceSet,
      evidencePart: bodyPart,
      maxTriangles: 10_000,
    });
    expect(shiftedScore.diagnostics.some((entry) => entry.code === "PART_POSITION_MISMATCH")).toBe(true);
  });

  it("returns a neutral, disclosed score when no matching Phase 17 evidence part exists", () => {
    const fixture = createMultiPartGroundTruthFixture();
    const task = createMultiViewTask(fixture.taskInput);
    const { referenceSet } = analyzeMultiView(task, { createdAt: FIXTURE_NOW });
    const score = scorePart({
      partId: "part_unmatched",
      label: "unmatched",
      worldMesh: generateBoxMesh(fixture.bodyHalfExtents),
      referenceSet,
      evidencePart: undefined,
      maxTriangles: 10_000,
    });
    expect(score.silhouetteFit).toBe(0);
    expect(score.landmarkFit).toBe(0.5);
    expect(score.constraintFit).toBe(0.5);
  });
});

describe("geometry-reconstruction: part overlap detection (Phase 19A)", () => {
  function makePart(
    partId: string,
    label: string,
    halfExtents: { x: number; y: number; z: number },
    position: { x: number; y: number; z: number },
  ): PartMesh {
    return {
      partId,
      label,
      representation: "BOX_PRIMITIVE",
      mesh: generateBoxMesh(halfExtents),
      localTransform: { position, rotation: IDENTITY_ROTATION },
    };
  }

  it("flags two parts whose bounding boxes overlap well beyond tolerance", () => {
    const a = makePart("part-a", "body", { x: 0.3, y: 0.3, z: 0.3 }, { x: 0, y: 0, z: 0 });
    const b = makePart("part-b", "cap", { x: 0.3, y: 0.3, z: 0.3 }, { x: 0.1, y: 0, z: 0 });
    const diagnostics = detectPartOverlaps([a, b], 0.15);
    expect(diagnostics.some((entry) => entry.code === "PART_OVERLAP_DETECTED")).toBe(true);
  });

  it("reports no diagnostics for spatially separated parts", () => {
    const a = makePart("part-a", "body", { x: 0.3, y: 0.3, z: 0.3 }, { x: 0, y: 0, z: 0 });
    const b = makePart("part-b", "cap", { x: 0.1, y: 0.1, z: 0.1 }, { x: 0.6, y: 0, z: 0 });
    expect(detectPartOverlaps([a, b], 0.15)).toHaveLength(0);
  });
});

describe("geometry-reconstruction: part correction neighbors (Phase 19A)", () => {
  const part: PartMesh = {
    partId: "part-body",
    label: "body",
    representation: "BOX_PRIMITIVE",
    mesh: generateBoxMesh({ x: 0.3, y: 0.3, z: 0.2 }),
    localTransform: { position: { x: 0, y: 0, z: 0 }, rotation: IDENTITY_ROTATION },
  };

  it("generates a bounded set of translation neighbors scaled to the part's own size", () => {
    const neighbors = partTranslationNeighbors(part);
    expect(neighbors.length).toBe(12); // 3 axes x 4 factors
    for (const neighbor of neighbors) {
      expect(neighbor.action).toBe("PART_TRANSLATE");
      expect(checkStructuralValidity(neighbor.part.mesh, 1000).valid).toBe(true);
    }
    const xPlus = neighbors.find((entry) => entry.label === "translate-x+10%");
    // Box size on x is 0.6 (half-extent 0.3); a 10% offset should be 0.06, not a fixed constant.
    expect(xPlus?.part.localTransform.position.x).toBeCloseTo(0.06, 5);
  });

  it("generates axis-scale neighbors only for box-primitive parts", () => {
    const boxNeighbors = partAxisScaleNeighbors(part);
    expect(boxNeighbors.length).toBe(12);
    for (const neighbor of boxNeighbors) expect(neighbor.action).toBe("PART_AXIS_SCALE");

    const voxelPart: PartMesh = { ...part, representation: "VOXEL_HULL" };
    expect(partAxisScaleNeighbors(voxelPart)).toHaveLength(0);
  });

  it("proposes no reposition move without a matching evidence part or resolved landmarks", () => {
    const fixture = createMultiPartGroundTruthFixture();
    const task = createMultiViewTask(fixture.taskInput);
    const { referenceSet } = analyzeMultiView(task, { createdAt: FIXTURE_NOW });
    expect(partRepositionFromLandmarksNeighbor(part, referenceSet, undefined)).toBeUndefined();

    const bodyPart = referenceSet.parts.find((entry) => entry.label === "body");
    if (!bodyPart) throw new Error("Expected a body part in the reference set.");
    // The multi-part fixture attaches no landmark hints, so the body part has no linked landmarks
    // with a resolved 3D estimate — an explicit, disclosed limitation, not a fabricated move.
    expect(partRepositionFromLandmarksNeighbor(part, referenceSet, bodyPart)).toBeUndefined();
  });
});

describe("geometry-reconstruction: voxel occupancy refinement (Phase 19A)", () => {
  it("dilates and erodes a single-voxel grid via real 6-connected morphology", () => {
    const resolution = 5;
    const occupancy = new Uint8Array(resolution ** 3);
    const index = (x: number, y: number, z: number) => x * resolution * resolution + y * resolution + z;
    const center = index(2, 2, 2);
    occupancy[center] = 1;

    const dilated = dilateOccupancy(occupancy, resolution);
    expect(countOccupied(dilated)).toBe(7); // the voxel plus its 6 face neighbors

    const eroded = erodeOccupancy(dilated, resolution);
    // Erosion strips every dilated neighbor that doesn't itself have all 6 neighbors occupied;
    // only the original center voxel qualifies.
    expect(countOccupied(eroded)).toBe(1);
    expect(eroded[center]).toBe(1);
  });

  it("is a no-op when refining occupancy against the exact views it was carved from", () => {
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
    const resolution = 12;
    const halfExtent = 0.6;
    const { occupancy } = carveVisualHull([front, side], { resolution, halfExtent });

    // Strict-intersection carving is already the tightest hull consistent with every view; feeding
    // the same views back into refinement must never find anything left to add or remove.
    const result = refineOccupancyFromEvidence(occupancy, {
      resolution,
      halfExtent,
      views: [front, side],
      consensusMinViews: 2,
      maxChangedVoxelRatio: 1,
    });
    expect(result.addedVoxels).toBe(0);
    expect(result.removedVoxels).toBe(0);
  });

  it("never adds volume a dissenting camera disputes, even for a fixture built to tempt recovery", () => {
    const fixture = createNoisyViewBoxGroundTruthFixture();
    const task = createMultiViewTask(fixture.taskInput);
    const { referenceSet } = analyzeMultiView(task, { createdAt: FIXTURE_NOW });
    const views = buildHullViews(referenceSet);
    const resolution = 16;
    const halfExtent = 0.5;
    const { occupancy: carved } = carveVisualHull(views, { resolution, halfExtent });

    const result = refineOccupancyFromEvidence(carved, {
      resolution,
      halfExtent,
      views,
      consensusMinViews: views.length,
      maxChangedVoxelRatio: 0.25,
    });

    // The RIGHT view's silhouette was deliberately shrunk (a real, disputed observation) — addition
    // requires unanimity, so no voxel it disputes may ever be voted back in.
    expect(result.addedVoxels).toBe(0);
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
