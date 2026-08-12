import {
  analyzeComposition,
  evaluateCamera,
  focalLengthForVerticalFieldOfView,
  proposeCanonicalCamera,
  validateCinematics,
  verticalFieldOfView,
} from "@aevum/camera-cinematics";
import {
  beginTransaction,
  createCommandId,
  createTransactionId,
  CURRENT_COMMAND_VERSION,
  type ApplyCinematicSequenceCommand,
  type CreateCameraCommand,
} from "@aevum/command-engine";
import {
  CameraPathSchema,
  CameraSchema,
  CinematicSequenceSchema,
  CinematicShotSchema,
  createEntityId,
  createTransform,
  validateDocument,
  type CanonicalDesignDocument,
} from "@aevum/document-model";
import { createRoleBasedCameraEstimator } from "@aevum/multiview-reconstruction";
import { create3DRenderPlan } from "@aevum/renderer-3d";
import { createRuntimeViewport, project3DScene, projectScene, sceneRuntimeFixtures } from "@aevum/scene-runtime";
import { describe, expect, it } from "vitest";

const NOW = "2026-08-12T12:00:00.000Z";

function fixture() {
  const document = sceneRuntimeFixtures.mixed();
  const scene = Object.values(document.nodes).find((node) => node.type === "SCENE_3D");
  if (scene?.type !== "SCENE_3D") throw new Error("Expected a canonical 3D scene.");
  const cameraId = createEntityId("camera");
  const secondCameraId = createEntityId("camera");
  const camera = CameraSchema.parse({
    id: cameraId,
    name: "Hero orbit camera",
    projection: "PERSPECTIVE",
    transform: { ...createTransform(), position: { x: 0, y: 1, z: 5 } },
    focalLength: 50,
    sensor: { width: 36, height: 24, fit: "VERTICAL" },
    nearClip: 0.1,
    farClip: 1_000,
    depthOfField: { enabled: true, aperture: 2.8, focusDistance: 5, bladeCount: 7 },
    targetingMode: "LOOK_AT_POINT",
    target: { x: 0, y: 0, z: 0 },
    framing: { safeArea: { x: 0.9, y: 0.9 }, guide: "RULE_OF_THIRDS" },
  });
  const secondCamera = CameraSchema.parse({
    ...camera,
    id: secondCameraId,
    name: "Detail dolly camera",
    transform: { ...camera.transform, position: { x: 3, y: 1, z: 4 } },
  });
  const orbitPath = CameraPathSchema.parse({
    id: createEntityId("camera-path"),
    name: "Half orbit",
    cameraId,
    type: "ORBIT",
    target: { x: 0, y: 0, z: 0 },
    orbit: { radius: 5, startAzimuth: 0, endAzimuth: Math.PI, elevation: 0.2 },
  });
  const dollyPath = CameraPathSchema.parse({
    id: createEntityId("camera-path"),
    name: "Detail dolly",
    cameraId: secondCameraId,
    type: "DOLLY",
    target: { x: 0, y: 0, z: 0 },
    startPosition: { x: 3, y: 1, z: 4 },
    endPosition: { x: 1.5, y: 0.5, z: 2 },
  });
  const firstShot = CinematicShotSchema.parse({
    id: createEntityId("shot"),
    name: "Establishing orbit",
    cameraId,
    cameraPathId: orbitPath.id,
    startTime: 0,
    duration: 2,
    transitionIn: { type: "CUT", duration: 0 },
    composition: { guide: "RULE_OF_THIRDS", desiredCoverage: 0.5, safeMargin: 0.05 },
  });
  const secondShot = CinematicShotSchema.parse({
    id: createEntityId("shot"),
    name: "Detail dolly",
    cameraId: secondCameraId,
    cameraPathId: dollyPath.id,
    startTime: 2,
    duration: 2,
    transitionIn: { type: "CUT", duration: 0 },
  });
  const sequence = CinematicSequenceSchema.parse({
    id: createEntityId("sequence"),
    version: "1.0.0",
    name: "Product reveal",
    sceneId: scene.id,
    shotIds: [firstShot.id, secondShot.id],
    duration: 4,
    allowGaps: false,
  });
  document.cameras = { ...document.cameras, [camera.id]: camera, [secondCamera.id]: secondCamera };
  document.cameraPaths = { [orbitPath.id]: orbitPath, [dollyPath.id]: dollyPath };
  document.cinematicShots = { [firstShot.id]: firstShot, [secondShot.id]: secondShot };
  document.cinematicSequences = { [sequence.id]: sequence };
  document.nodes[scene.id] = { ...scene, activeCameraId: camera.id };
  return { document, scene, camera, secondCamera, orbitPath, dollyPath, firstShot, secondShot, sequence };
}

function commandBase(document: CanonicalDesignDocument) {
  return {
    id: createCommandId(),
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: document.metadata.id,
    expectedDocumentVersion: document.documentVersion,
    timestamp: NOW,
    actor: { id: "phase21-test", type: "SYSTEM" as const },
    correlationId: "phase21-camera",
    transactionId: createTransactionId(),
  };
}

describe("Phase 21 camera and cinematics", () => {
  it("derives coherent physical lens values and preserves multiview confidence evidence", () => {
    const physicalCamera = CameraSchema.parse({
      id: createEntityId("camera"),
      name: "Physical camera",
      projection: "PERSPECTIVE",
      transform: createTransform(),
      focalLength: 50,
      sensor: { width: 36, height: 24, fit: "VERTICAL" },
      nearClip: 0.1,
      farClip: 1_000,
      depthOfField: { enabled: false, aperture: 2.8, focusDistance: 5 },
    });
    const fieldOfView = verticalFieldOfView(physicalCamera);
    expect(focalLengthForVerticalFieldOfView(fieldOfView, 24)).toBeCloseTo(50, 10);
    const estimate = createRoleBasedCameraEstimator({ verticalFieldOfView: fieldOfView }).estimate({
      viewId: "front",
      role: { role: "FRONT", confidence: 0.9, evidence: ["user label"], method: "USER_PROVIDED" },
      imageWidth: 1_920,
      imageHeight: 1_080,
    });
    const proposed = proposeCanonicalCamera(estimate, "Matched camera");
    expect(proposed.camera.focalLength).toBeCloseTo(50, 10);
    expect(proposed.camera.matchProvenance?.confidence).toBe(estimate.confidence);
    expect(proposed.evidence).toEqual(["view:front", "method:ROLE_ASSUMED_TURNTABLE"]);
  });

  it("evaluates orbit, dolly, target orientation, focus, and exact cut timing deterministically", () => {
    const { document, firstShot, secondShot, sequence } = fixture();
    const first = evaluateCamera({ document, sequenceId: sequence.id, time: 1 });
    const repeated = evaluateCamera({ document, sequenceId: sequence.id, time: 1 });
    const cut = evaluateCamera({ document, sequenceId: sequence.id, time: 2 });
    const dolly = evaluateCamera({ document, sequenceId: sequence.id, time: 3 });
    expect(first).toEqual(repeated);
    expect(first.sourceShotId).toBe(firstShot.id);
    expect(cut.sourceShotId).toBe(secondShot.id);
    expect(dolly.camera.transform.position.z).toBeCloseTo(3);
    expect(first.camera.transform.quaternion).toBeDefined();
    expect(first.focusDistance).toBeGreaterThan(0);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("attributes composition failures and emits bounded correction proposals without mutation", () => {
    const { document, sequence } = fixture();
    const before = structuredClone(document);
    const resolved = [0, 1, 2, 3].map((time) => evaluateCamera({ document, sequenceId: sequence.id, time }));
    const report = validateCinematics({ document, sequenceId: sequence.id, resolvedCameras: resolved });
    const firstResolved = resolved[0];
    if (!firstResolved) throw new Error("Expected a resolved camera sample.");
    const composition = analyzeComposition(firstResolved, {
      min: { x: -10, y: -10, z: -1 },
      max: { x: 10, y: 10, z: 1 },
    });
    expect(composition.diagnostics.some((entry) => entry.code === "SUBJECT_CLIPPED")).toBe(true);
    expect(report.cameraIds).toHaveLength(2);
    expect(report.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(document).toEqual(before);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it("creates cameras and applies complete cinematic sequences through atomic commands", () => {
    const prepared = fixture();
    const sourceScene = structuredClone(prepared.scene);
    delete sourceScene.activeCameraId;
    const source: CanonicalDesignDocument = {
      ...prepared.document,
      nodes: {
        ...prepared.document.nodes,
        [prepared.scene.id]: sourceScene,
      },
      cameras: Object.fromEntries(
        Object.entries(prepared.document.cameras).filter(
          ([id]) => id !== prepared.camera.id && id !== prepared.secondCamera.id,
        ),
      ),
      cameraPaths: {},
      cinematicShots: {},
      cinematicSequences: {},
    };
    const create: CreateCameraCommand = {
      ...commandBase(source),
      type: "camera.create",
      payload: { camera: prepared.camera, sceneId: prepared.scene.id, makeActive: true },
    };
    const firstCommit = beginTransaction(source, { transactionId: create.transactionId }).execute(create).commit();
    const createSecond: CreateCameraCommand = {
      ...commandBase(firstCommit.newDocument),
      type: "camera.create",
      payload: { camera: prepared.secondCamera },
    };
    const secondCommit = beginTransaction(firstCommit.newDocument, { transactionId: createSecond.transactionId })
      .execute(createSecond)
      .commit();
    const apply: ApplyCinematicSequenceCommand = {
      ...commandBase(secondCommit.newDocument),
      type: "cinematic.apply_sequence",
      payload: {
        sequence: prepared.sequence,
        shots: [prepared.firstShot, prepared.secondShot],
        paths: [prepared.orbitPath, prepared.dollyPath],
        timelines: [],
      },
    };
    const committed = beginTransaction(secondCommit.newDocument, { transactionId: apply.transactionId })
      .execute(apply)
      .commit().newDocument;
    expect(committed.cinematicSequences[prepared.sequence.id]).toEqual(prepared.sequence);
    expect(validateDocument(committed).success).toBe(true);
    expect(source.cameras[prepared.camera.id]).toBeUndefined();
  });

  it("projects fixed-time resolved camera state into semantic renderer operations", () => {
    const { document, scene, secondShot, sequence } = fixture();
    const viewport = {
      ...createRuntimeViewport(document),
      animation: { time: 2.5, sequenceId: sequence.id },
    };
    const projection = project3DScene(document, projectScene(document, viewport));
    const plan = create3DRenderPlan(projection, scene.id);
    expect(projection.scenes[0]?.activeShotId).toBe(secondShot.id);
    expect(plan.operations.map((operation) => operation.kind)).toEqual(
      expect.arrayContaining([
        "CAMERA_BIND",
        "CAMERA_TRANSFORM",
        "CAMERA_PROJECTION",
        "CAMERA_LENS",
        "CAMERA_DOF",
        "SHOT_ACTIVATE",
      ]),
    );
    expect(create3DRenderPlan(projection, scene.id)).toEqual(plan);
  });
});
