import {
  applyBlenderReconciliation,
  blenderBridgeConfig,
  createBlenderIdentityBindings,
  createBlenderJob,
  createBlenderJobRunner,
  createBlenderMcpAdapter,
  getBlenderBridgeReadiness,
  createBlenderReconciliationProposal,
  type BlenderExecution,
  type BlenderOperation,
} from "@aevum/blender-bridge";
import { computeSha256 } from "@aevum/assets";
import { createAsset, fixtures, type CanonicalDesignDocument } from "@aevum/document-model";
import { apply3DImportProposal, create3DImportProposal } from "@aevum/renderer-3d";
import { createRuntimeViewport, project3DScene, projectScene } from "@aevum/scene-runtime";
import { env } from "@aevum/shared";
import { createThreeFixture } from "@aevum/test-fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { createAgentTestFixture } from "../helpers/agent-fixture.js";

const actor = { id: "user_blender_test", type: "USER" as const, displayName: "Blender test" };
const timestamp = "2026-08-09T10:00:00.000Z";

interface Foundation {
  readonly bytes: Uint8Array;
  readonly document: CanonicalDesignDocument;
  readonly sourceAssetId: string;
}

async function createFoundation(): Promise<Foundation> {
  const fixture = await createThreeFixture();
  const source = createAsset({
    type: "GLB",
    name: "Phase 15 fixture.glb",
    hash: computeSha256(fixture.glb),
    uri: "fixture://phase15.glb",
    mimeType: "model/gltf-binary",
    byteSize: fixture.glb.byteLength,
  });
  const empty = fixtures.empty();
  empty.assets[source.id] = source;
  const proposal = await create3DImportProposal({ canonicalDocument: empty, asset: source, bytes: fixture.glb });
  const document = apply3DImportProposal({
    document: empty,
    proposal,
    actor,
    timestamp,
    correlationId: "phase15-real-foundation",
  }).newDocument;
  return { bytes: fixture.glb, document, sourceAssetId: source.id };
}

function jobFor(foundation: Foundation, operation: BlenderOperation, expectedGlb = true, timeoutMs = 60_000) {
  const source = foundation.document.assets[foundation.sourceAssetId];
  if (!source) throw new Error("Fixture source asset is missing.");
  return createBlenderJob({
    workspaceId: "workspace_phase15",
    actorId: actor.id,
    correlationId: `phase15-${operation.kind}`,
    createdAt: timestamp,
    inputAsset: {
      assetId: source.id,
      hash: source.hash,
      mimeType: "model/gltf-binary",
      byteSize: foundation.bytes.byteLength,
    },
    identityBindings: [...createBlenderIdentityBindings(foundation.document, source.id)],
    operation,
    resourceBudget: {
      maxInputBytes: 16_777_216,
      maxOutputBytes: 32_000_000,
      maxObjects: 1_000,
      maxMeshes: 1_000,
      maxMaterials: 1_000,
      timeoutMs,
    },
    expectedOutputs: { inspection: true, glb: expectedGlb },
  });
}

function requireRoundTrip(execution: BlenderExecution): asserts execution is BlenderExecution & {
  readonly outputGlb: Uint8Array;
  readonly result: BlenderExecution["result"] & {
    readonly runtime: NonNullable<BlenderExecution["result"]["runtime"]>;
  };
} {
  if (!execution.outputGlb || !execution.result.runtime) {
    throw new Error("Successful Blender write requires runtime metadata and GLB output.");
  }
}

describe.sequential("Phase 15 real Blender 5.1 execution", () => {
  const runner = createBlenderJobRunner(blenderBridgeConfig(env));
  let foundation: Foundation;

  beforeAll(async () => {
    foundation = await createFoundation();
  });

  it("detects the real headless Blender and embedded Python runtimes", async () => {
    const runtime = await runner.inspectRuntime();
    expect(runtime).toMatchObject({
      blenderVersion: "5.1.2",
      pythonVersion: "3.13.9",
      compatibility: "SUPPORTED",
      headless: true,
    });
    await expect(getBlenderBridgeReadiness(runner, blenderBridgeConfig(env))).resolves.toMatchObject({
      ok: true,
      checks: { executable: true, blenderRuntime: true, pythonRuntime: true, headless: true, workspaceWritable: true },
    });
  });

  it("imports and inspects the real hierarchical Blender scene", async () => {
    const execution = await runner.execute(
      jobFor(foundation, { operationVersion: "1.0.0", kind: "scene.inspect" }, false),
      foundation.bytes,
    );
    expect(execution.result.state).toBe("SUCCEEDED");
    expect(execution.result.data).toMatchObject({ objectCount: 5, meshCount: 2, cameraCount: 1, lightCount: 1 });
    expect(execution.result.transitions.map((entry) => entry.state)).toEqual([
      "CREATED",
      "VALIDATING",
      "PREPARING",
      "RUNNING",
      "COLLECTING",
      "VALIDATING_OUTPUT",
      "SUCCEEDED",
    ]);
  });

  it("round-trips one nested object transform through Blender, commands, CDD, and Scene Runtime", async () => {
    const target = Object.values(foundation.document.nodes).find(
      (node) => node.type === "GROUP_3D" && node.name === "detail-mesh",
    );
    const sibling = Object.values(foundation.document.nodes).find(
      (node) => node.type === "GROUP_3D" && node.name === "nested-mesh",
    );
    if (!target || !sibling) throw new Error("Expected fixture hierarchy is missing.");
    const originalTarget = structuredClone(target.transform);
    const originalSibling = structuredClone(sibling.transform);
    const job = jobFor(foundation, {
      operationVersion: "1.0.0",
      kind: "object.transform",
      objectId: target.id,
      mode: "DELTA",
      coordinateSpace: "LOCAL",
      unit: "M",
      translation: { x: 0.02, y: 0, z: 0 },
    });
    const execution = await runner.execute(job, foundation.bytes);
    expect(execution.result.state).toBe("SUCCEEDED");
    expect(execution.outputGlb).toBeDefined();
    requireRoundTrip(execution);
    const reconciliation = await createBlenderReconciliationProposal({
      document: foundation.document,
      job,
      runtime: execution.result.runtime,
      outputGlb: execution.outputGlb,
      actor,
      timestamp: "2026-08-09T10:01:00.000Z",
    });
    expect(reconciliation.modifiedEntityIds).toEqual([target.id]);
    const commit = applyBlenderReconciliation(foundation.document, reconciliation);
    expect(commit.newDocument.nodes[target.id]?.transform.position.x).toBeCloseTo(originalTarget.position.x + 0.02, 4);
    expect(commit.newDocument.nodes[sibling.id]?.transform).toEqual(originalSibling);
    const scene = projectScene(commit.newDocument, createRuntimeViewport(commit.newDocument));
    const projection = project3DScene(commit.newDocument, scene);
    expect(projection.complete).toBe(true);
    expect(projection.nodes.get(target.id)?.worldTransform.matrix).toHaveLength(16);
  });

  it("round-trips bounded PBR material, camera, and light edits", async () => {
    const material = Object.values(foundation.document.materials).find(
      (value) => value.name === "fixture-secondary-pbr",
    );
    const camera = Object.values(foundation.document.cameras)[0];
    const light = Object.values(foundation.document.lights)[0];
    if (!material || !camera || !light) throw new Error("Expected fixture entities are missing.");
    const operations: BlenderOperation[] = [
      {
        operationVersion: "1.0.0",
        kind: "material.update_pbr",
        materialId: material.id,
        baseColor: [0.1, 0.2, 0.3, 0.8],
        metallic: 0.6,
        roughness: 0.4,
        alpha: 0.8,
      },
      {
        operationVersion: "1.0.0",
        kind: "camera.update",
        cameraId: camera.id,
        fieldOfView: Math.PI / 4,
        nearClip: 0.2,
        farClip: 700,
      },
      {
        operationVersion: "1.0.0",
        kind: "light.update",
        lightId: light.id,
        color: [0.2, 0.4, 0.8],
        intensity: 15,
        range: 75,
      },
    ];
    let document = foundation.document;
    for (const [index, operation] of operations.entries()) {
      const scoped = { ...foundation, document };
      const job = jobFor(scoped, operation);
      const execution = await runner.execute(job, foundation.bytes);
      expect(execution.result.state).toBe("SUCCEEDED");
      requireRoundTrip(execution);
      const reconciliation = await createBlenderReconciliationProposal({
        document,
        job,
        runtime: execution.result.runtime,
        outputGlb: execution.outputGlb,
        actor,
        timestamp: `2026-08-09T10:0${index + 2}:00.000Z`,
      });
      document = applyBlenderReconciliation(document, reconciliation).newDocument;
    }
    expect(document.materials[material.id]?.pbr?.roughness).toBeCloseTo(0.4, 5);
    expect(document.materials[material.id]?.pbr?.metalness).toBeCloseTo(0.6, 5);
    expect(document.materials[material.id]?.pbr?.opacity).toBeCloseTo(0.8, 5);
    expect(document.cameras[camera.id]?.verticalFieldOfView).toBeCloseTo(Math.PI / 4, 3);
    expect(document.cameras[camera.id]?.nearClip).toBeCloseTo(0.2, 3);
    expect(document.lights[light.id]?.color.r).toBeCloseTo(0.2, 5);
    expect(document.lights[light.id]?.color.g).toBeCloseTo(0.4, 5);
    expect(document.lights[light.id]?.color.b).toBeCloseTo(0.8, 5);
  });

  it("runs the explicit scene, mesh, material, camera, light, validation, import, and export manifests", async () => {
    const object = Object.values(foundation.document.nodes).find(
      (node) => node.type === "GROUP_3D" && node.name === "detail-mesh",
    );
    const material = Object.values(foundation.document.materials)[0];
    const camera = Object.values(foundation.document.cameras)[0];
    const light = Object.values(foundation.document.lights)[0];
    if (!object || !material || !camera || !light) throw new Error("Expected inspection entities are missing.");
    const operations: Array<{ operation: BlenderOperation; glb: boolean }> = [
      { operation: { operationVersion: "1.0.0", kind: "object.inspect", objectId: object.id }, glb: false },
      { operation: { operationVersion: "1.0.0", kind: "mesh.inspect", objectId: object.id }, glb: false },
      { operation: { operationVersion: "1.0.0", kind: "material.inspect", materialId: material.id }, glb: false },
      { operation: { operationVersion: "1.0.0", kind: "camera.inspect", cameraId: camera.id }, glb: false },
      { operation: { operationVersion: "1.0.0", kind: "light.inspect", lightId: light.id }, glb: false },
      { operation: { operationVersion: "1.0.0", kind: "scene.validate", requireCamera: true }, glb: false },
      { operation: { operationVersion: "1.0.0", kind: "scene.import_gltf" }, glb: true },
      { operation: { operationVersion: "1.0.0", kind: "scene.export_glb" }, glb: true },
    ];
    for (const entry of operations) {
      const execution = await runner.execute(jobFor(foundation, entry.operation, entry.glb), foundation.bytes);
      expect(execution.result.state).toBe("SUCCEEDED");
      expect(execution.result.operation).toBe(entry.operation.kind);
      expect(Boolean(execution.outputGlb)).toBe(entry.glb);
    }
  });

  it("reconciles camera activation, controlled duplication, and explicit deletion atomically", async () => {
    const object = Object.values(foundation.document.nodes).find(
      (node) => node.type === "GROUP_3D" && node.name === "detail-mesh",
    );
    const camera = Object.values(foundation.document.cameras)[0];
    const scene = Object.values(foundation.document.nodes).find((node) => node.type === "SCENE_3D");
    if (!object || !camera || !scene) throw new Error("Expected mutable Blender entities are missing.");
    const duplicateId = "group_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const operations: BlenderOperation[] = [
      { operationVersion: "1.0.0", kind: "camera.activate", cameraId: camera.id },
      {
        operationVersion: "1.0.0",
        kind: "object.duplicate",
        objectId: object.id,
        newEntityId: duplicateId,
        parentPolicy: "SAME_PARENT",
      },
      { operationVersion: "1.0.0", kind: "object.delete", objectId: object.id, childPolicy: "DELETE_CHILDREN" },
    ];
    for (const [index, operation] of operations.entries()) {
      const job = jobFor(foundation, operation);
      const execution = await runner.execute(job, foundation.bytes);
      expect(execution.result.state).toBe("SUCCEEDED");
      requireRoundTrip(execution);
      const proposal = await createBlenderReconciliationProposal({
        document: foundation.document,
        job,
        runtime: execution.result.runtime,
        outputGlb: execution.outputGlb,
        actor,
        timestamp: `2026-08-09T10:1${index}:00.000Z`,
      });
      const commit = applyBlenderReconciliation(foundation.document, proposal);
      if (operation.kind === "camera.activate") {
        expect(commit.newDocument.nodes[scene.id]).toMatchObject({ activeCameraId: camera.id });
      } else if (operation.kind === "object.duplicate") {
        expect(commit.newDocument.nodes[duplicateId]).toMatchObject({ id: duplicateId, parentId: object.parentId });
      } else {
        expect(commit.newDocument.nodes[object.id]).toBeUndefined();
      }
    }
  });

  it("isolates failures, enforces timeout, and cancels a real Blender process", async () => {
    const missingId = "group_00000000-0000-5000-8000-000000000000";
    const failed = await runner.execute(
      jobFor(foundation, {
        operationVersion: "1.0.0",
        kind: "object.inspect",
        objectId: missingId,
      }),
      foundation.bytes,
    );
    expect(failed.result).toMatchObject({
      state: "FAILED",
      diagnostics: [expect.objectContaining({ code: "BLENDER_OBJECT_NOT_FOUND" })],
    });

    const timeout = await runner.execute(
      jobFor(foundation, { operationVersion: "1.0.0", kind: "bridge.test_delay", durationMs: 2_000 }, false, 300),
      foundation.bytes,
    );
    expect(timeout.result.state).toBe("TIMED_OUT");

    const cancellationJob = jobFor(
      foundation,
      { operationVersion: "1.0.0", kind: "bridge.test_delay", durationMs: 5_000 },
      false,
    );
    const pending = runner.execute(cancellationJob, foundation.bytes);
    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(runner.cancel(cancellationJob.id)).toBe(true);
    const cancelled = await pending;
    expect(cancelled.result.state).toBe("CANCELLED");
    expect(runner.activeJobs).toBe(0);
  });

  it("executes the authenticated Agent to MCP to Blender to canonical verification workflow", async () => {
    const target = Object.values(foundation.document.nodes).find(
      (node) => node.type === "GROUP_3D" && node.name === "detail-mesh",
    );
    if (!target) throw new Error("Expected Blender Agent target is missing.");
    const originalX = target.transform.position.x;
    const adapter = createBlenderMcpAdapter({
      runner,
      config: blenderBridgeConfig(env),
      resolveAsset: async (asset) => {
        expect(asset.id).toBe(foundation.sourceAssetId);
        return foundation.bytes;
      },
    });
    const fixture = createAgentTestFixture({
      document: foundation.document,
      category: "EDIT",
      request: "Move the crown 2 cm outward in the 3D model.",
      requestedOutcome: "Move the selected Blender object exactly 2 cm on local X.",
      targetNodeIds: [target.id],
      parameters: {
        operation: "blender_transform",
        assetId: foundation.sourceAssetId,
        nodeId: target.id,
        deltaX: 0.02,
      },
      blenderAdapter: adapter,
      clientTimeoutMs: 60_000,
      mcpToolTimeoutMs: 60_000,
    });
    const result = await fixture.run();
    const current = await fixture.mcp.repository.getCurrentDocument(fixture.mcp.workspaceId, fixture.mcp.projectId);

    expect(result.run.status).toBe("SUCCEEDED");
    expect(fixture.calls.map((entry) => entry.request.tool)).toEqual([
      "system.get_capabilities",
      "blender.inspect_scene",
      "blender.inspect_object",
      "document.get",
      "blender.update_object_transform",
      "blender.update_object_transform",
      "document.get",
    ]);
    expect(
      fixture.calls
        .filter((entry) => entry.request.tool === "blender.update_object_transform")
        .map((entry) => entry.request.dryRun),
    ).toEqual([true, false]);
    expect(current?.nodes[target.id]?.transform.position.x).toBeCloseTo(originalX + 0.02, 4);
    expect(result.run.outcome?.verification?.success).toBe(true);
  });
});
