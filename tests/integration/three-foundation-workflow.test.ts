import { computeSha256 } from "@aevum/assets";
import { executeCommand } from "@aevum/command-engine";
import { createAsset, fixtures, validateDocument } from "@aevum/document-model";
import {
  apply3DImportProposal,
  compile3DImportTransaction,
  create3DImportProposal,
  create3DRenderPlan,
  dryRun3DImportProposal,
  frameCameraToBounds,
} from "@aevum/renderer-3d";
import { createRuntimeViewport, project3DScene, projectScene } from "@aevum/scene-runtime";
import { createThreeFixture } from "@aevum/test-fixtures";
import { describe, expect, it } from "vitest";
import { createAnimationTimeline } from "../helpers/animation-fixture.js";

const actor = { id: "phase-14-test", type: "SYSTEM" as const, displayName: "Phase 14" };

describe("Phase 14 canonical 3D workflow", () => {
  it("dry-runs and atomically imports, projects, and plans a registered GLB", async () => {
    const fixture = await createThreeFixture();
    const asset = createAsset({
      type: "GLB",
      name: "Workflow fixture",
      hash: computeSha256(fixture.glb),
      uri: "registered/workflow.glb",
      mimeType: "model/gltf-binary",
      byteSize: fixture.glb.byteLength,
    });
    const document = fixtures.empty();
    document.assets[asset.id] = asset;
    const proposal = await create3DImportProposal({ canonicalDocument: document, asset, bytes: fixture.glb });
    const commandInput = {
      proposal,
      document,
      actor,
      timestamp: "2026-08-09T00:00:00.000Z",
      correlationId: "phase-14-workflow",
    };
    const dryRun = dryRun3DImportProposal(commandInput);

    expect(document.rootNodeIds).toEqual([]);
    expect(dryRun.newDocument.rootNodeIds).toEqual(proposal.rootNodeIds);
    expect(dryRun.auditRecord.commandTypes).toEqual(["scene3d.import"]);

    const committed = apply3DImportProposal(commandInput);
    expect(committed.newDocument.documentVersion).toBe(document.documentVersion + 1);
    expect(committed.events[0]?.type).toBe("Scene3DImported");
    expect(validateDocument(committed.newDocument).success).toBe(true);

    const projection = projectScene(committed.newDocument, createRuntimeViewport(committed.newDocument));
    const threeProjection = project3DScene(committed.newDocument, projection);
    const firstPlan = create3DRenderPlan(threeProjection);
    const secondPlan = create3DRenderPlan(threeProjection);
    expect(threeProjection.complete).toBe(true);
    expect(threeProjection.meshes.size).toBe(3);
    expect(threeProjection.scenes[0]?.bounds?.center.x).toBeCloseTo(12);
    expect(firstPlan).toEqual(secondPlan);
    expect(firstPlan.operations.filter((operation) => operation.kind === "DRAW_PRIMITIVE")).toHaveLength(3);
    expect(firstPlan.operations.map((operation) => operation.index)).toEqual(
      firstPlan.operations.map((_, index) => index),
    );
  });

  it("frames canonical cameras without mutating their source records", () => {
    const document = fixtures.empty();
    const camera = {
      id: "camera_00000000-0000-4000-8000-000000000001",
      name: "Fixture camera",
      projection: "PERSPECTIVE" as const,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        skew: { x: 0, y: 0 },
        anchor: { x: 0, y: 0 },
        pivot: { x: 0, y: 0, z: 0 },
        opacity: 1,
        clipping: false,
        maskIds: [],
        coordinateSpace: "LOCAL" as const,
      },
      verticalFieldOfView: Math.PI / 3,
      nearClip: 0.1,
      farClip: 1000,
      depthOfField: { enabled: false, aperture: 2.8, focusDistance: 0, bladeCount: 6 },
    };
    document.cameras[camera.id] = camera;
    const framed = frameCameraToBounds(camera, {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 2 },
      radius: Math.sqrt(3),
    });
    expect(framed.transform.position.z).toBeGreaterThan(3);
    expect(framed.transform.quaternion?.w).toBeCloseTo(1);
    expect(camera.transform.position.z).toBe(0);
  });

  it("rolls back an invalid atomic import without changing the source document", async () => {
    const fixture = await createThreeFixture();
    const asset = createAsset({
      type: "GLB",
      name: "Rollback fixture",
      hash: computeSha256(fixture.glb),
      uri: "registered/rollback.glb",
      mimeType: "model/gltf-binary",
      byteSize: fixture.glb.byteLength,
    });
    const document = fixtures.empty();
    document.assets[asset.id] = asset;
    const proposal = await create3DImportProposal({ canonicalDocument: document, asset, bytes: fixture.glb });
    const command = structuredClone(
      compile3DImportTransaction({
        proposal,
        document,
        actor,
        timestamp: "2026-08-09T00:00:00.000Z",
        correlationId: "phase-14-rollback",
      }),
    );
    if (command.type !== "scene3d.import") throw new Error("Expected a 3D import command.");
    const invalidCommand = {
      ...command,
      payload: { ...command.payload, nodes: command.payload.nodes.filter((node) => node.type !== "GROUP_3D") },
    };

    expect(() => executeCommand(document, invalidCommand)).toThrow();
    expect(document.rootNodeIds).toEqual([]);
    expect(Object.keys(document.nodes)).toEqual([]);
    expect(document.documentVersion).toBe(1);
  });

  it("resolves responsive cameras, quality profiles, and reduced-motion camera timelines", async () => {
    const fixture = await createThreeFixture();
    const asset = createAsset({
      type: "GLB",
      name: "Responsive 3D fixture",
      hash: computeSha256(fixture.glb),
      uri: "registered/responsive.glb",
      mimeType: "model/gltf-binary",
      byteSize: fixture.glb.byteLength,
    });
    const source = fixtures.empty();
    source.assets[asset.id] = asset;
    const proposal = await create3DImportProposal({ canonicalDocument: source, asset, bytes: fixture.glb });
    const document = structuredClone(
      apply3DImportProposal({
        proposal,
        document: source,
        actor,
        timestamp: "2026-08-09T00:00:00.000Z",
        correlationId: "phase-14-responsive",
      }).newDocument,
    );
    const scene = Object.values(document.nodes).find((node) => node.type === "SCENE_3D");
    const primaryCamera = Object.values(document.cameras)[0];
    if (!scene || !primaryCamera) throw new Error("Responsive fixture requires a scene and camera.");
    const mobileCamera = structuredClone(primaryCamera);
    mobileCamera.id = "camera_00000000-0000-4000-8000-000000000002";
    mobileCamera.name = "Mobile camera";
    document.cameras[mobileCamera.id] = mobileCamera;
    scene.responsive = {
      breakpoints: { MOBILE: { activeCameraId: mobileCamera.id } },
      reducedMotionOverride: { motion: { behavior: "DISABLE", durationScale: 1 } },
    };
    const timeline = createAnimationTimeline(primaryCamera.id);
    document.timelines[timeline.id] = timeline;
    const normalViewport = {
      ...createRuntimeViewport(document),
      qualityMode: "DRAFT" as const,
      animation: { time: 1, timelineIds: [timeline.id] },
    };
    const reducedViewport = { ...normalViewport, reducedMotion: true };
    const mobileViewport = {
      ...normalViewport,
      id: "mobile",
      width: 390,
      height: 844,
      category: "MOBILE" as const,
      orientation: "PORTRAIT" as const,
    };

    const normal = project3DScene(document, projectScene(document, normalViewport));
    const reduced = project3DScene(document, projectScene(document, reducedViewport));
    const mobile = project3DScene(document, projectScene(document, mobileViewport));
    expect(normal.scenes[0]?.qualityMode).toBe("DRAFT");
    expect(normal.cameras.get(primaryCamera.id)?.transform.position.x).toBeCloseTo(50);
    expect(reduced.cameras.get(primaryCamera.id)?.transform.position.x).toBeCloseTo(100);
    expect(mobile.scenes[0]?.activeCameraId).toBe(mobileCamera.id);
  });
});
