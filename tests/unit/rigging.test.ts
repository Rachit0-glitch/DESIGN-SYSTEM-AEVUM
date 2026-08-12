import { DesignNodeSchema, fixtures, validateDocument } from "@aevum/document-model";
import {
  associatePartsToBones,
  buildBasicHumanoidTemplate,
  buildMechanicalChainTemplate,
  buildRigNodes,
  createBasicHumanoidProvider,
  createCyclicBoneSpecs,
  createDanglingParentBoneSpecs,
  createMechanicalChainProvider,
  createSampleVertexInfluences,
  DEFAULT_RIG_RESOURCE_LIMITS,
  findAutoRigProvider,
  IDENTITY_QUAT,
  listAutoRigProviders,
  normalizeWeights,
  validateBoneHierarchy,
  validateRig,
  validateWeights,
  type BoneSpec,
} from "@aevum/rigging";
import { describe, expect, it } from "vitest";

describe("rigging: bone hierarchy validation", () => {
  it("accepts a valid linear chain and returns a parent-before-child topological order", () => {
    const bones: BoneSpec[] = [
      { key: "root", parentKey: null, head: { x: 0, y: 0, z: 0 }, tail: { x: 0, y: 1, z: 0 }, deforming: true },
      { key: "child", parentKey: "root", head: { x: 0, y: 1, z: 0 }, tail: { x: 0, y: 2, z: 0 }, deforming: true },
    ];
    const result = validateBoneHierarchy(bones);
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.topologicalOrder.map((bone) => bone.key)).toEqual(["root", "child"]);
  });

  it("detects a real cycle", () => {
    const result = validateBoneHierarchy(createCyclicBoneSpecs());
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((entry) => entry.code === "RIG_CYCLE")).toBe(true);
  });

  it("detects a dangling parent reference", () => {
    const result = validateBoneHierarchy(createDanglingParentBoneSpecs());
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((entry) => entry.code === "RIG_DANGLING_REFERENCE")).toBe(true);
  });

  it("rejects self-parenting and duplicate keys", () => {
    const selfParent = validateBoneHierarchy([
      { key: "a", parentKey: "a", head: { x: 0, y: 0, z: 0 }, tail: { x: 0, y: 1, z: 0 }, deforming: true },
    ]);
    expect(selfParent.valid).toBe(false);
    expect(selfParent.diagnostics.some((entry) => entry.code === "RIG_HIERARCHY_INVALID")).toBe(true);

    const duplicate = validateBoneHierarchy([
      { key: "a", parentKey: null, head: { x: 0, y: 0, z: 0 }, tail: { x: 0, y: 1, z: 0 }, deforming: true },
      { key: "a", parentKey: null, head: { x: 1, y: 0, z: 0 }, tail: { x: 1, y: 1, z: 0 }, deforming: true },
    ]);
    expect(duplicate.valid).toBe(false);
    expect(duplicate.diagnostics.some((entry) => entry.code === "RIG_HIERARCHY_INVALID")).toBe(true);
  });
});

describe("rigging: weight validation and normalization", () => {
  it("detects unweighted vertices, negative weights, and non-normalized sums from real sample data", () => {
    const report = validateWeights({
      influences: createSampleVertexInfluences(),
      jointCount: 2,
      maxInfluencesPerVertex: 4,
    });
    expect(report.vertexCount).toBe(4);
    expect(report.unweightedVertexCount).toBe(1);
    expect(report.normalized).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SKIN_VERTEX_UNWEIGHTED")).toBe(true);
    // v2's negative influence classifies it as invalid, not merely "not normalized" — the two
    // per-vertex checks are mutually exclusive by design (an invalid vertex isn't double-flagged).
    expect(report.issues.some((issue) => issue.code === "SKIN_WEIGHT_NEGATIVE")).toBe(true);
    expect(report.invalidVertexCount).toBeGreaterThan(0);
  });

  it("flags a vertex whose otherwise-valid weights do not sum to one", () => {
    const report = validateWeights({
      influences: [[{ jointIndex: 0, weight: 0.5 }]],
      jointCount: 1,
      maxInfluencesPerVertex: 4,
    });
    expect(report.normalized).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SKIN_WEIGHT_NOT_NORMALIZED")).toBe(true);
    expect(report.diagnostics.some((entry) => entry.code === "SKIN_WEIGHT_NOT_NORMALIZED")).toBe(true);
  });

  it("flags out-of-range joint indices and excessive influence counts", () => {
    const report = validateWeights({
      influences: [
        [{ jointIndex: 5, weight: 1 }],
        [
          { jointIndex: 0, weight: 0.25 },
          { jointIndex: 0, weight: 0.25 },
          { jointIndex: 0, weight: 0.25 },
          { jointIndex: 0, weight: 0.15 },
          { jointIndex: 0, weight: 0.1 },
        ],
      ],
      jointCount: 2,
      maxInfluencesPerVertex: 4,
    });
    expect(report.issues.some((issue) => issue.code === "SKIN_BONE_REFERENCE_INVALID")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "SKIN_INFLUENCE_LIMIT_EXCEEDED")).toBe(true);
  });

  it("reports orphan joints that no vertex references", () => {
    const report = validateWeights({
      influences: [[{ jointIndex: 0, weight: 1 }]],
      jointCount: 3,
      maxInfluencesPerVertex: 4,
    });
    expect(report.diagnostics.some((entry) => entry.code === "SKIN_ORPHAN_GROUP")).toBe(true);
  });

  it("normalizes real invalid weight data without fabricating influences for unweighted vertices", () => {
    const result = normalizeWeights({ influences: createSampleVertexInfluences(), maxInfluencesPerVertex: 4 });
    expect(result.influences).toHaveLength(4);

    // v0: already normalized, unchanged.
    expect(result.influences[0]).toEqual([{ jointIndex: 0, weight: 1 }]);

    // v2: negative influence dropped, remaining weights rescaled to sum to 1.
    const v2 = result.influences[2] ?? [];
    const v2Sum = v2.reduce((total, influence) => total + influence.weight, 0);
    expect(v2Sum).toBeCloseTo(1, 5);
    expect(v2.every((influence) => influence.weight > 0)).toBe(true);

    // v3: genuinely has no influences — normalization must not invent one.
    expect(result.influences[3]).toEqual([]);
    expect(result.verticesModified).toBeGreaterThan(0);
  });

  it("keeps only the highest-weight influences when exceeding maxInfluencesPerVertex", () => {
    const result = normalizeWeights({
      influences: [
        [
          { jointIndex: 0, weight: 0.4 },
          { jointIndex: 1, weight: 0.3 },
          { jointIndex: 2, weight: 0.2 },
          { jointIndex: 3, weight: 0.1 },
        ],
      ],
      maxInfluencesPerVertex: 2,
    });
    const kept = result.influences[0] ?? [];
    expect(kept.map((influence) => influence.jointIndex)).toEqual([0, 1]);
    expect(kept.reduce((total, influence) => total + influence.weight, 0)).toBeCloseTo(1, 5);
    expect(result.influencesRemoved).toBe(2);
  });
});

describe("rigging: deterministic templates", () => {
  it("builds a valid mechanical chain with the requested segment count", () => {
    const result = buildMechanicalChainTemplate({ segmentCount: 3 });
    expect(result.templateId).toBe("MECHANICAL_CHAIN");
    expect(result.bones.map((bone) => bone.key)).toEqual(["base", "arm", "forearm", "tool"]);
    expect(validateBoneHierarchy(result.bones).valid).toBe(true);
    for (const bone of result.bones) {
      const dx = bone.tail.x - bone.head.x;
      const dy = bone.tail.y - bone.head.y;
      const dz = bone.tail.z - bone.head.z;
      expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(0);
    }
  });

  it("builds a valid basic humanoid template with a branching hierarchy and no degenerate bones", () => {
    const result = buildBasicHumanoidTemplate();
    expect(result.templateId).toBe("BASIC_HUMANOID");
    expect(validateBoneHierarchy(result.bones).valid).toBe(true);
    // A branching hierarchy: chest has three children (neck, upperArm.L, upperArm.R), hips has
    // three (spine, upperLeg.L, upperLeg.R) — proves this isn't just another linear chain.
    const childCounts = new Map<string, number>();
    for (const bone of result.bones) {
      if (bone.parentKey) childCounts.set(bone.parentKey, (childCounts.get(bone.parentKey) ?? 0) + 1);
    }
    expect(childCounts.get("chest")).toBeGreaterThanOrEqual(3);
    expect(childCounts.get("hips")).toBeGreaterThanOrEqual(3);
    for (const bone of result.bones) {
      const dx = bone.tail.x - bone.head.x;
      const dy = bone.tail.y - bone.head.y;
      const dz = bone.tail.z - bone.head.z;
      expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(0);
    }
  });

  it("exposes both templates through the provider-neutral AutoRigProvider registry", () => {
    const providers = listAutoRigProviders();
    expect(providers.map((provider) => provider.id).sort()).toEqual(["BASIC_HUMANOID", "MECHANICAL_CHAIN"]);
    expect(findAutoRigProvider("MECHANICAL_CHAIN")?.id).toBe(createMechanicalChainProvider().id);
    expect(createBasicHumanoidProvider().generate().templateId).toBe("BASIC_HUMANOID");
    expect(findAutoRigProvider("MECHANICAL_CHAIN")?.generate({ segmentCount: 2 }).bones).toHaveLength(3);
  });
});

describe("rigging: node construction against the real canonical schema", () => {
  it("builds RIG_3D and BONE_3D nodes that parse against the real DesignNodeSchema, with a correct parent chain", () => {
    const template = buildMechanicalChainTemplate({ segmentCount: 3 });
    const built = buildRigNodes({
      parentId: "model_00000000-0000-4000-8000-000000000001",
      rigName: "Test Mechanical Rig",
      bones: template.bones,
      rigMethod: "TEMPLATE_MECHANICAL_CHAIN",
      scope: { test: "mechanical-chain" },
    });

    expect(DesignNodeSchema.safeParse(built.rig).success).toBe(true);
    for (const bone of built.bones) {
      expect(DesignNodeSchema.safeParse(bone).success).toBe(true);
    }

    expect(built.rig.boneIds).toHaveLength(built.bones.length);
    expect(built.rig.childIds).toEqual([built.rig.rootBoneId]);
    const baseBone = built.bones.find((bone) => bone.name === "base");
    expect(baseBone?.id).toBe(built.rig.rootBoneId);
    expect(baseBone?.parentId).toBe(built.rig.id);

    const armBone = built.bones.find((bone) => bone.name === "arm");
    expect(armBone?.parentId).toBe(baseBone?.id);
    expect(baseBone?.childIds).toContain(armBone?.id);
    expect(built.bones.every((bone) => bone.length > 0)).toBe(true);
  });

  it("generates identical node IDs for identical input and different IDs for a different scope", () => {
    const template = buildMechanicalChainTemplate({ segmentCount: 2 });
    const first = buildRigNodes({
      parentId: "model_00000000-0000-4000-8000-000000000001",
      rigName: "Rig",
      bones: template.bones,
      rigMethod: "TEMPLATE_MECHANICAL_CHAIN",
      scope: { source: "a" },
    });
    const second = buildRigNodes({
      parentId: "model_00000000-0000-4000-8000-000000000001",
      rigName: "Rig",
      bones: template.bones,
      rigMethod: "TEMPLATE_MECHANICAL_CHAIN",
      scope: { source: "a" },
    });
    const third = buildRigNodes({
      parentId: "model_00000000-0000-4000-8000-000000000001",
      rigName: "Rig",
      bones: template.bones,
      rigMethod: "TEMPLATE_MECHANICAL_CHAIN",
      scope: { source: "b" },
    });
    expect(second.rig.id).toBe(first.rig.id);
    expect(second.bones.map((bone) => bone.id)).toEqual(first.bones.map((bone) => bone.id));
    expect(third.rig.id).not.toBe(first.rig.id);
  });

  it("throws rather than silently building nodes from an invalid bone hierarchy", () => {
    expect(() =>
      buildRigNodes({
        parentId: "model_00000000-0000-4000-8000-000000000001",
        rigName: "Broken",
        bones: createCyclicBoneSpecs(),
        rigMethod: "MANUAL",
        scope: {},
      }),
    ).toThrow();
  });

  it("rejects duplicate cross-rig bone membership in a complete canonical document", () => {
    const document = fixtures.landingPage();
    const parentId = document.rootNodeIds[0];
    if (!parentId) throw new Error("Expected fixture root.");
    const built = buildRigNodes({
      parentId,
      rigName: "Primary",
      bones: buildMechanicalChainTemplate({ segmentCount: 1 }).bones,
      rigMethod: "MANUAL",
      scope: "primary",
    });
    const second = buildRigNodes({
      parentId,
      rigName: "Secondary",
      bones: buildMechanicalChainTemplate({ segmentCount: 1 }).bones,
      rigMethod: "MANUAL",
      scope: "secondary",
    });
    const invalidSecond = {
      ...second.rig,
      boneIds: [built.bones[0]?.id ?? ""],
      rootBoneId: built.bones[0]?.id ?? "",
      childIds: [],
    };
    const root = document.nodes[parentId];
    const invalid = {
      ...document,
      nodes: {
        ...document.nodes,
        [parentId]: { ...root, childIds: [...(root?.childIds ?? []), built.rig.id, invalidSecond.id] },
        [built.rig.id]: built.rig,
        ...Object.fromEntries(built.bones.map((bone) => [bone.id, bone])),
        [invalidSecond.id]: invalidSecond,
      },
    };

    const result = validateDocument(invalid);
    expect(result.success).toBe(false);
    expect(result.issues.some((entry) => entry.message.includes("already belongs to rig"))).toBe(true);
  });
});

describe("rigging: part-to-bone association", () => {
  it("associates parts to bones by exact case-insensitive label match", () => {
    const result = associatePartsToBones(
      [
        { partId: "part-1", label: "Crown" },
        { partId: "part-2", label: "strap" },
        { partId: "part-3", label: "unmatched-widget" },
      ],
      ["crown", "strap", "case"],
    );
    expect(result.associations).toEqual([
      { partId: "part-1", partLabel: "Crown", boneKey: "crown" },
      { partId: "part-2", partLabel: "strap", boneKey: "strap" },
    ]);
    expect(result.unassociatedParts).toEqual(["part-3"]);
    expect(result.diagnostics.some((entry) => entry.code === "RIG_BONE_MISSING")).toBe(true);
  });
});

describe("rigging: combined rig validation report", () => {
  function buildValidRig() {
    const template = buildMechanicalChainTemplate({ segmentCount: 2 });
    return buildRigNodes({
      parentId: "model_00000000-0000-4000-8000-000000000001",
      rigName: "Validation Rig",
      bones: template.bones,
      rigMethod: "TEMPLATE_MECHANICAL_CHAIN",
      scope: { test: "validation" },
    });
  }

  it("reports a valid rig as valid with a real fingerprint", () => {
    const built = buildValidRig();
    const report = validateRig({ rig: built.rig, bones: built.bones, limits: DEFAULT_RIG_RESOURCE_LIMITS });
    expect(report.valid).toBe(true);
    expect(report.hierarchyValid).toBe(true);
    expect(report.restPoseValid).toBe(true);
    expect(report.boneCount).toBe(built.bones.length);
    expect(report.exportCompatible).toBe(true);
    expect(report.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/i);
  });

  it("flags an IK chain whose root is not an ancestor of its end effector", () => {
    const built = buildValidRig();
    const [rootBone, ...rest] = built.bones;
    const farBone = rest.at(-1);
    if (!rootBone || !farBone) throw new Error("Expected at least two bones.");
    const rigWithBadChain = {
      ...built.rig,
      ikChains: [
        {
          id: "ikchain_00000000-0000-4000-8000-000000000001",
          rootBoneId: farBone.id,
          endEffectorBoneId: rootBone.id,
          chainLength: 1,
          targetNodeId: "group_00000000-0000-4000-8000-000000000001",
          iterations: 500,
        },
      ],
    };
    const report = validateRig({ rig: rigWithBadChain, bones: built.bones, limits: DEFAULT_RIG_RESOURCE_LIMITS });
    expect(report.valid).toBe(false);
    expect(report.diagnostics.some((entry) => entry.code === "IK_CHAIN_INVALID")).toBe(true);
  });

  it("flags a constraint referencing a bone that does not exist in the rig", () => {
    const built = buildValidRig();
    const rigWithBadConstraint = {
      ...built.rig,
      constraints: [
        {
          id: "constraint_00000000-0000-4000-8000-000000000001",
          type: "COPY_ROTATION" as const,
          targetBoneId: "bone_00000000-0000-4000-8000-0000000000ff",
          influence: 1,
          settings: {},
        },
      ],
    };
    const report = validateRig({ rig: rigWithBadConstraint, bones: built.bones, limits: DEFAULT_RIG_RESOURCE_LIMITS });
    expect(report.valid).toBe(false);
    expect(report.diagnostics.some((entry) => entry.code === "CONSTRAINT_TARGET_INVALID")).toBe(true);
  });

  it("flags exceeding the configured bone-count resource limit", () => {
    const built = buildValidRig();
    const report = validateRig({
      rig: built.rig,
      bones: built.bones,
      limits: { ...DEFAULT_RIG_RESOURCE_LIMITS, maxBones: 1 },
    });
    expect(report.valid).toBe(false);
    expect(report.diagnostics.some((entry) => entry.code === "RIG_RESOURCE_LIMIT_EXCEEDED")).toBe(true);
  });
});

describe("rigging: math primitives", () => {
  it("exposes an identity quaternion", () => {
    expect(IDENTITY_QUAT).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });
});
