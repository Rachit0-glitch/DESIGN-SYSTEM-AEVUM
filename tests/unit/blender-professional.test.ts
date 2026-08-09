import {
  BlenderOperationSchema,
  classifyMeshOperation,
  estimateTopologyGrowth,
  MeshSelectionSchema,
  PbrMaterialReportSchema,
  TopologyReportSchema,
  UvReportSchema,
  validateGrowthEstimate,
  WEB_QUALITY_TARGETS,
} from "@aevum/blender-bridge";
import { describe, expect, it } from "vitest";

const objectId = "group_11111111-1111-4111-8111-111111111111";

describe("Phase 16 professional 3D contracts", () => {
  it("accepts explicit deterministic selectors and rejects ambiguous or code-bearing input", () => {
    expect(MeshSelectionSchema.parse({ kind: "FACE_IDS", indices: [0, 2, 4] })).toEqual({
      kind: "FACE_IDS",
      indices: [0, 2, 4],
    });
    expect(MeshSelectionSchema.safeParse({ kind: "FACE_IDS", indices: [] }).success).toBe(false);
    expect(MeshSelectionSchema.safeParse({ kind: "CURRENT_SELECTION" }).success).toBe(false);
    expect(
      BlenderOperationSchema.safeParse({
        operationVersion: "1.0.0",
        kind: "mesh.bevel",
        objectId,
        selection: { kind: "ALL", domain: "EDGE" },
        width: 0.01,
        segments: 2,
        profile: 0.5,
        affect: "EDGES",
        operator: "bpy.ops.mesh.bevel",
      }).success,
    ).toBe(false);
  });

  it("classifies inspection, topology-changing, and destructive operations conservatively", () => {
    expect(classifyMeshOperation("mesh.topology_inspect")).toBe("NONDESTRUCTIVE");
    expect(classifyMeshOperation("mesh.bevel")).toBe("TOPOLOGY_CHANGING");
    expect(classifyMeshOperation("mesh.delete_faces")).toBe("DESTRUCTIVE");
    expect(classifyMeshOperation("topology.remesh")).toBe("DESTRUCTIVE");
  });

  it("produces deterministic topology estimates and rejects unsafe growth", () => {
    const first = estimateTopologyGrowth({
      kind: "mesh.subdivide",
      vertexCount: 100_000,
      faceCount: 100_000,
      selectedCount: 100_000,
      subdivisionLevel: 3,
    });
    const second = estimateTopologyGrowth({
      kind: "mesh.subdivide",
      vertexCount: 100_000,
      faceCount: 100_000,
      selectedCount: 100_000,
      subdivisionLevel: 3,
    });
    expect(first).toEqual(second);
    expect(() =>
      validateGrowthEstimate(first, {
        maxSelectedElements: 100_000,
        maxOutputVertices: 2_000_000,
        maxOutputFaces: 2_000_000,
        maxTopologyGrowthRatio: 8,
        maxSubdivisionLevel: 3,
        maxBevelSegments: 8,
        maxLoopCuts: 16,
        maxUvIslands: 10_000,
        maxModifiers: 64,
      }),
    ).toThrow("MESH_OPERATION_BUDGET_EXCEEDED");
  });

  it("validates bounded modeling, UV, and material operation schemas", () => {
    const operations = [
      {
        operationVersion: "1.0.0",
        kind: "mesh.extrude",
        objectId,
        selection: { kind: "FACE_IDS", indices: [0] },
        direction: { x: 0, y: 1, z: 0 },
        distance: 0.1,
        coordinateSpace: "LOCAL",
      },
      {
        operationVersion: "1.0.0",
        kind: "uv.unwrap",
        objectId,
        selection: { kind: "ALL", domain: "FACE" },
        method: "ANGLE_BASED",
        margin: 0.02,
      },
      {
        operationVersion: "1.0.0",
        kind: "material.update_pbr",
        materialId: "material_11111111-1111-4111-8111-111111111111",
        roughness: 0.4,
        normalStrength: 1.25,
      },
    ];
    expect(operations.every((operation) => BlenderOperationSchema.safeParse(operation).success)).toBe(true);
    expect(BlenderOperationSchema.safeParse({ ...operations[0], distance: Number.POSITIVE_INFINITY }).success).toBe(
      false,
    );
    expect(WEB_QUALITY_TARGETS.WEB_MOBILE.maxTriangles).toBeLessThan(WEB_QUALITY_TARGETS.WEB_HERO_HIGH.maxTriangles);
  });

  it("keeps topology, UV, and PBR reports versioned and fingerprinted", () => {
    const hash = `sha256:${"a".repeat(64)}`;
    const diagnostics: never[] = [];
    expect(
      TopologyReportSchema.safeParse({
        version: "1.0.0",
        objectId,
        profile: "WEB_STATIC",
        quality: "GOOD",
        vertexCount: 4,
        edgeCount: 4,
        faceCount: 1,
        triangleCount: 2,
        triangleFaceCount: 0,
        quadCount: 1,
        ngonCount: 0,
        boundaryEdgeCount: 4,
        nonManifoldEdgeCount: 0,
        looseVertexCount: 0,
        looseEdgeCount: 0,
        looseFaceCount: 0,
        duplicatePositionCandidateCount: 0,
        zeroAreaFaceCount: 0,
        degenerateEdgeCount: 0,
        connectedComponentCount: 1,
        eulerCharacteristic: 1,
        diagnostics,
        fingerprint: hash,
      }).success,
    ).toBe(true);
    expect(
      UvReportSchema.safeParse({
        version: "1.0.0",
        objectId,
        layerCount: 1,
        activeLayer: "UVMap",
        layers: ["UVMap"],
        islandCount: 1,
        seamEdgeCount: 0,
        missingFaceCount: 0,
        zeroAreaFaceCount: 0,
        outOfBoundsLoopCount: 0,
        overlapEstimate: null,
        packingEfficiency: 0.8,
        udimTiles: [1001],
        diagnostics,
        fingerprint: hash,
      }).success,
    ).toBe(true);
    expect(
      PbrMaterialReportSchema.safeParse({
        version: "1.0.0",
        materialId: "material_11111111-1111-4111-8111-111111111111",
        graphSupport: "LOSSLESS_SUPPORTED",
        baseColor: [1, 1, 1, 1],
        metallic: 0,
        roughness: 0.5,
        alpha: 1,
        emission: [0, 0, 0, 1],
        normalStrength: null,
        textureChannels: [],
        diagnostics,
        fingerprint: hash,
      }).success,
    ).toBe(true);
  });
});
