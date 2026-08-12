import {
  buildBasicHumanoidTemplate,
  buildMechanicalChainTemplate,
  buildRigNodes,
  createHumanoidSemanticMapping,
  editWeights,
  evaluatePose,
  inspectWeights,
  resetPose,
  retargetPose,
  skinVerticesCpu,
  validateDeformation,
} from "@aevum/rigging";
import { describe, expect, it } from "vitest";

function mechanical() {
  return buildRigNodes({
    parentId: "model_00000000-0000-4000-8000-000000000001",
    rigName: "Runtime Rig",
    bones: buildMechanicalChainTemplate({ segmentCount: 3, segmentLength: 1, baseHeight: 1 }).bones,
    rigMethod: "TEMPLATE_MECHANICAL_CHAIN",
    scope: "runtime",
  });
}

describe("rigging runtime", () => {
  it("evaluates deterministic immutable rest and FK poses with valid joint matrices", () => {
    const built = mechanical();
    const rest = resetPose({ rig: built.rig, bones: built.bones });
    const parent = built.bones.find((bone) => bone.name === "arm");
    const child = built.bones.find((bone) => bone.name === "forearm");
    if (!parent || !child) throw new Error("Fixture bones missing.");
    const posed = evaluatePose({
      rig: built.rig,
      bones: built.bones,
      deltas: [{ boneId: parent.id, rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } }],
      time: 0.5,
      progress: 0.5,
      source: "ANIMATION",
    });
    expect(posed.fingerprint).toBe(
      evaluatePose({
        rig: built.rig,
        bones: built.bones,
        deltas: [{ boneId: parent.id, rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } }],
        time: 0.5,
        progress: 0.5,
        source: "ANIMATION",
      }).fingerprint,
    );
    expect(posed.bones.find((bone) => bone.boneId === child.id)?.worldMatrix).not.toEqual(
      rest.bones.find((bone) => bone.boneId === child.id)?.worldMatrix,
    );
    expect(posed.bones.every((bone) => bone.jointMatrix.length === 16 && bone.jointMatrix.every(Number.isFinite))).toBe(
      true,
    );
    expect(Object.isFrozen(posed)).toBe(true);
  });

  it("performs real CPU linear blend skinning and deformation validation", () => {
    const built = mechanical();
    const bone = built.bones[1];
    if (!bone) throw new Error("Fixture bone missing.");
    const pose = evaluatePose({
      rig: built.rig,
      bones: built.bones,
      deltas: [{ boneId: bone.id, translation: { x: 0.5, y: 0, z: 0 } }],
    });
    const rest = resetPose({ rig: built.rig, bones: built.bones });
    const jointIndex = pose.bones.findIndex((entry) => entry.boneId === bone.id);
    const result = skinVerticesCpu({
      vertices: [
        { position: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 1, z: 0 }, influences: [{ jointIndex, weight: 1 }] },
      ],
      jointMatrices: pose.bones.map((entry) => entry.jointMatrix),
    });
    const restResult = skinVerticesCpu({
      vertices: [{ position: { x: 0, y: 1, z: 0 }, influences: [{ jointIndex, weight: 1 }] }],
      jointMatrices: rest.bones.map((entry) => entry.jointMatrix),
    });
    expect(result.classification).toBe("REAL");
    expect(result.vertices[0]?.position).not.toEqual(restResult.vertices[0]?.position);
    expect(
      Math.hypot(
        result.vertices[0]?.normal?.x ?? 0,
        result.vertices[0]?.normal?.y ?? 0,
        result.vertices[0]?.normal?.z ?? 0,
      ),
    ).toBeCloseTo(1, 5);
    expect(
      validateDeformation(
        [{ x: 0, y: 1, z: 0 }],
        result.vertices.map((entry) => entry.position),
      ).valid,
    ).toBe(true);
  });

  it("solves bounded IK and reports an unreachable target without hanging", () => {
    const built = mechanical();
    const root = built.bones.find((bone) => bone.name === "arm");
    const end = built.bones.find((bone) => bone.name === "tool");
    if (!root || !end) throw new Error("Fixture chain missing.");
    const chainId = "constraint_00000000-0000-4000-8000-000000000001";
    const rig = {
      ...built.rig,
      ikChains: [
        {
          id: chainId,
          rootBoneId: root.id,
          endEffectorBoneId: end.id,
          chainLength: 3,
          targetNodeId: "group_00000000-0000-4000-8000-000000000001",
          iterations: 32,
        },
      ],
    };
    const reachable = evaluatePose({
      rig,
      bones: built.bones,
      ikTargets: [{ chainId, target: { x: 1.5, y: 1.5, z: 0 }, iterations: 32 }],
    });
    const unreachable = evaluatePose({
      rig,
      bones: built.bones,
      ikTargets: [{ chainId, target: { x: 100, y: 100, z: 0 }, iterations: 4 }],
    });
    expect(reachable.ikResults[0]?.iterations).toBeLessThanOrEqual(32);
    expect(unreachable.ikResults[0]?.reachable).toBe(false);
    expect(unreachable.diagnostics.some((entry) => entry.code === "IK_TARGET_UNREACHABLE")).toBe(true);
  });

  it("supports bounded manual weight edits, normalization, and inspection", () => {
    const result = editWeights({
      influences: [[{ jointIndex: 0, weight: 1 }], [{ jointIndex: 0, weight: 1 }]],
      jointCount: 2,
      operations: [{ mode: "SET", vertexIndices: [1], jointIndex: 1, value: 0.75 }],
      normalize: true,
    });
    expect(result.verticesModified).toBe(1);
    expect(result.influences[1]?.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1, 6);
    expect(inspectWeights(result.influences, 2).validation.normalized).toBe(true);
    expect(() =>
      editWeights({
        influences: [[{ jointIndex: 0, weight: 1 }]],
        jointCount: 1,
        operations: [{ mode: "SET", vertexIndices: [9], jointIndex: 0, value: 1 }],
      }),
    ).toThrow();
  });

  it("retargets a fixed humanoid pose by semantic role and reports mapping loss", () => {
    const template = buildBasicHumanoidTemplate();
    const source = buildRigNodes({
      parentId: "model_00000000-0000-4000-8000-000000000001",
      rigName: "Source",
      bones: template.bones,
      rigMethod: "TEMPLATE_BASIC_HUMANOID",
      scope: "source",
    });
    const target = buildRigNodes({
      parentId: "model_00000000-0000-4000-8000-000000000002",
      rigName: "Target",
      bones: template.bones,
      rigMethod: "TEMPLATE_BASIC_HUMANOID",
      scope: "target",
    });
    const sourceArm = source.bones.find((bone) => bone.metadata.tags.includes("upperArmLeft"));
    if (!sourceArm) throw new Error("Humanoid arm missing.");
    const sourcePose = evaluatePose({
      rig: source.rig,
      bones: source.bones,
      deltas: [{ boneId: sourceArm.id, rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } }],
    });
    const mappings = createHumanoidSemanticMapping(source.bones, target.bones);
    const retargeted = retargetPose({ sourcePose, sourceBones: source.bones, targetBones: target.bones, mappings });
    expect(retargeted.targetPoseDeltas.length).toBe(mappings.length);
    expect(evaluatePose({ rig: target.rig, bones: target.bones, deltas: retargeted.targetPoseDeltas }).source).toBe(
      "FK",
    );
    expect(retargeted.fingerprint).toMatch(/^sha256:/);
  });
});
