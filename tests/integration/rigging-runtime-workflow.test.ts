import { validateBoneTracks } from "@aevum/animation-core";
import { createEntityId, type CanonicalDesignDocument, type Timeline } from "@aevum/document-model";
import { create3DRenderPlan } from "@aevum/renderer-3d";
import { buildMechanicalChainTemplate, buildRigNodes } from "@aevum/rigging";
import { createRuntimeViewport, project3DScene, projectScene, sceneRuntimeFixtures } from "@aevum/scene-runtime";
import { describe, expect, it } from "vitest";

function riggedScene(): { document: CanonicalDesignDocument; timeline: Timeline; meshId: string; rigId: string } {
  const document = sceneRuntimeFixtures.mixed();
  const scene = Object.values(document.nodes).find((node) => node.type === "SCENE_3D");
  const mesh = Object.values(document.nodes).find((node) => node.type === "MESH_3D");
  if (scene?.type !== "SCENE_3D" || mesh?.type !== "MESH_3D") throw new Error("3D fixture missing.");
  const built = buildRigNodes({
    parentId: scene.id,
    rigName: "Projected Rig",
    bones: buildMechanicalChainTemplate({ segmentCount: 2 }).bones,
    rigMethod: "TEMPLATE_MECHANICAL_CHAIN",
    scope: "projection",
  });
  scene.childIds.push(built.rig.id);
  document.nodes[built.rig.id] = built.rig;
  for (const bone of built.bones) document.nodes[bone.id] = bone;
  mesh.geometry.skinAttributes = true;
  mesh.skinBinding = {
    rigId: built.rig.id,
    jointIds: built.bones.map((bone) => bone.id),
    maxInfluencesPerVertex: 4,
    weightMethod: "MANUAL",
    normalized: true,
    vertexCount: mesh.geometry.vertexCount,
    unweightedVertexCount: 0,
  };
  const animated = built.bones[1];
  if (!animated) throw new Error("Animated bone missing.");
  const timeline: Timeline = {
    id: createEntityId("timeline"),
    version: "1.0.0",
    name: "Bone pose",
    type: "TIME",
    duration: 1,
    frameRate: 60,
    timeScale: 1,
    loop: { enabled: false, count: 1, mode: "RESTART" },
    clips: [],
    markers: [],
    triggers: [],
    events: [],
    labels: {},
    metadata: {},
    tracks: [
      {
        id: createEntityId("track"),
        targetId: animated.id,
        property: "ROTATION",
        propertyPath: "transform.quaternion",
        valueType: "STRUCTURED",
        muted: false,
        locked: false,
        layer: 0,
        keyframes: [
          {
            id: createEntityId("keyframe"),
            time: 0,
            value: { x: 0, y: 0, z: 0, w: 1 },
            easing: { type: "LINEAR" },
            interpolation: "LINEAR",
            metadata: {},
          },
          {
            id: createEntityId("keyframe"),
            time: 1,
            value: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },
            easing: { type: "LINEAR" },
            interpolation: "LINEAR",
            metadata: {},
          },
        ],
      },
    ],
  };
  document.timelines[timeline.id] = timeline;
  return { document, timeline, meshId: mesh.id, rigId: built.rig.id };
}

describe("Phase 19B runtime integration", () => {
  it("evaluates animation before projection and emits renderer-ready skin operations", () => {
    const { document, timeline, meshId, rigId } = riggedScene();
    const viewport = {
      ...createRuntimeViewport(document),
      animation: { time: 0.5, progress: 0.5, timelineIds: [timeline.id] },
    };
    const projection = project3DScene(document, projectScene(document, viewport));
    const rig = projection.rigs.get(rigId);
    const skinning = projection.meshes.get(meshId)?.skinning;
    expect(rig?.pose.source).toBe("ANIMATION");
    expect(rig?.pose.time).toBe(0.5);
    expect(skinning?.classification).toBe("REAL_CPU_AVAILABLE");
    expect(skinning?.jointMatrices).toHaveLength(skinning?.jointIds.length ?? 0);
    const plan = create3DRenderPlan(projection);
    const skinOperation = plan.operations.find((operation) => operation.kind === "SKIN_BIND");
    expect(skinOperation?.payload).toMatchObject({ rigId, classification: "REAL_CPU_AVAILABLE" });
    expect(plan.operations.find((operation) => operation.kind === "DRAW_PRIMITIVE")?.dependencies).toContain(
      skinOperation?.id,
    );
  });

  it("validates supported and broken bone track paths deterministically", () => {
    const { document, timeline, rigId } = riggedScene();
    const rig = document.nodes[rigId];
    if (rig?.type !== "RIG_3D") throw new Error("Rig missing.");
    expect(validateBoneTracks(timeline, rig.boneIds).success).toBe(true);
    const invalid = {
      ...timeline,
      tracks: timeline.tracks.map((track) => ({ ...track, propertyPath: "material.color" })),
    };
    expect(
      validateBoneTracks(invalid, rig.boneIds).diagnostics.some((entry) => entry.code === "INVALID_BONE_TRACK"),
    ).toBe(true);
  });

  it("samples timeline-driven joint matrices deterministically at start, midpoint, and end", () => {
    const { document, timeline, rigId } = riggedScene();
    const samples = [0, 0.5, 1].map((time) => {
      const viewport = {
        ...createRuntimeViewport(document),
        animation: { time, progress: time, timelineIds: [timeline.id] },
      };
      return project3DScene(document, projectScene(document, viewport)).rigs.get(rigId)?.pose;
    });
    expect(samples.every((pose) => pose?.bones.every((bone) => bone.jointMatrix.every(Number.isFinite)))).toBe(true);
    expect(new Set(samples.map((pose) => pose?.fingerprint)).size).toBe(3);
    const repeated = project3DScene(
      document,
      projectScene(document, {
        ...createRuntimeViewport(document),
        animation: { time: 0.5, progress: 0.5, timelineIds: [timeline.id] },
      }),
    ).rigs.get(rigId)?.pose;
    expect(repeated?.fingerprint).toBe(samples[1]?.fingerprint);
  });
});
