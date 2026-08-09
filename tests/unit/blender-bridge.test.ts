import {
  BLENDER_BRIDGE_PROTOCOL_VERSION,
  BlenderOperationSchema,
  createBlenderJob,
  getBlenderBridgeHealth,
  validateBlenderJob,
  validateBlenderInputIsolation,
} from "@aevum/blender-bridge";
import { ROLE_PERMISSIONS, TOOL_SCHEMAS } from "@aevum/mcp-protocol";
import { describe, expect, it } from "vitest";

const input = {
  workspaceId: "workspace_phase15",
  actorId: "actor_phase15",
  correlationId: "correlation_phase15",
  createdAt: "2026-08-09T12:00:00.000Z",
  inputAsset: {
    assetId: "asset_11111111-1111-4111-8111-111111111111",
    hash: `sha256:${"a".repeat(64)}`,
    mimeType: "model/gltf-binary" as const,
    byteSize: 128,
  },
  identityBindings: [],
  operation: {
    operationVersion: "1.0.0" as const,
    kind: "object.transform" as const,
    objectId: "group_11111111-1111-4111-8111-111111111111",
    mode: "DELTA" as const,
    coordinateSpace: "LOCAL" as const,
    unit: "M" as const,
    translation: { x: 0.02, y: 0, z: 0 },
  },
  resourceBudget: {
    maxInputBytes: 1_024,
    maxOutputBytes: 2_048,
    maxObjects: 100,
    maxMeshes: 100,
    maxMaterials: 100,
    timeoutMs: 10_000,
  },
  expectedOutputs: { inspection: true, glb: true },
};

describe("Phase 15 Blender Bridge contracts", () => {
  it("creates immutable deterministic jobs with explicit lifecycle budgets", () => {
    const first = createBlenderJob(input);
    const second = createBlenderJob(input);
    expect(first).toEqual(second);
    expect(first.protocolVersion).toBe(BLENDER_BRIDGE_PROTOCOL_VERSION);
    expect(first.id).toMatch(/^blender-job:[0-9a-f]{32}$/);
    expect(Object.isFrozen(first)).toBe(true);
    expect(validateBlenderJob(first)).toEqual(first);
  });

  it("allows only the finite semantic operation registry", () => {
    expect(
      BlenderOperationSchema.safeParse({ operationVersion: "1.0.0", kind: "execute_python", code: "import bpy" })
        .success,
    ).toBe(false);
    expect(
      BlenderOperationSchema.safeParse({ ...input.operation, translation: { x: Number.NaN, y: 0, z: 0 } }).success,
    ).toBe(false);
    expect(
      TOOL_SCHEMAS["blender.update_material"].input.safeParse({
        assetId: input.inputAsset.assetId,
        targetId: "material_11111111-1111-4111-8111-111111111111",
        expectedDocumentVersion: 1,
        roughness: 2,
      }).success,
    ).toBe(false);
  });

  it("rejects standalone GLTF filesystem and network resources before Blender starts", () => {
    const external = new TextEncoder().encode(
      JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "../secret.bin" }] }),
    );
    const remote = new TextEncoder().encode(
      JSON.stringify({ asset: { version: "2.0" }, images: [{ uri: "https://example.com/x.png" }] }),
    );
    const embedded = new TextEncoder().encode(
      JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "data:application/octet-stream;base64,AA==" }] }),
    );
    const gltfJob = {
      ...createBlenderJob(input),
      inputAsset: { ...createBlenderJob(input).inputAsset, mimeType: "model/gltf+json" as const },
    };
    expect(() => validateBlenderInputIsolation(gltfJob, external)).toThrow(/must be embedded/);
    expect(() => validateBlenderInputIsolation(gltfJob, remote)).toThrow(/must be embedded/);
    expect(() => validateBlenderInputIsolation(gltfJob, embedded)).not.toThrow();
  });

  it("separates bridge liveness from executable-backed readiness and maps permissions conservatively", () => {
    expect(getBlenderBridgeHealth()).toMatchObject({ ok: true, checks: { bridge: true, blenderRuntime: false } });
    expect(ROLE_PERMISSIONS.VIEWER).toContain("blender.read");
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain("blender.write");
    expect(ROLE_PERMISSIONS.AGENT).not.toContain("blender.destructive");
    expect(ROLE_PERMISSIONS.OWNER).toContain("blender.destructive");
  });
});
