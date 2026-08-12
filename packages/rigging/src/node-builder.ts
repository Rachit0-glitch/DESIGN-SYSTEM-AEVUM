import { createTransform, type DesignNode, type RigMethodSchema } from "@aevum/document-model";
import { deterministicEntityId } from "./deterministic.js";
import { validateBoneHierarchy } from "./hierarchy.js";
import { length, quaternionFromTo, subtract, ZERO_VEC3 } from "./math.js";
import type { BoneSpec } from "./schemas.js";
import type { z } from "zod";

export interface BuildRigNodesInput {
  readonly parentId: string;
  readonly rigName: string;
  readonly bones: readonly BoneSpec[];
  readonly rigMethod: z.infer<typeof RigMethodSchema>;
  /** Mixed into every generated ID so re-running the same template against a different source
   * model (or a different pass) never collides with an earlier rig's node IDs. */
  readonly scope: unknown;
}

export interface BuiltRigNodes {
  readonly rig: Extract<DesignNode, { type: "RIG_3D" }>;
  readonly bones: readonly Extract<DesignNode, { type: "BONE_3D" }>[];
  readonly boneIdByKey: ReadonlyMap<string, string>;
}

/**
 * Deterministically builds a Rig3DNode and its Bone3DNode tree from provider-neutral bone specs
 * (Phase 19B §13/§14). Bone specs must already be hierarchy-valid (see hierarchy.ts) — this
 * function re-validates defensively and throws rather than silently building an invalid rig.
 */
export function buildRigNodes(input: BuildRigNodesInput): BuiltRigNodes {
  const hierarchy = validateBoneHierarchy(input.bones);
  if (!hierarchy.valid) {
    throw new Error(`Cannot build rig nodes from an invalid bone hierarchy: ${hierarchy.diagnostics[0]?.message}`);
  }

  const rigId = deterministicEntityId("rig", { scope: input.scope, parentId: input.parentId, name: input.rigName });
  const boneIdByKey = new Map<string, string>();
  for (const bone of hierarchy.topologicalOrder) {
    boneIdByKey.set(bone.key, deterministicEntityId("bone", { rigId, key: bone.key }));
  }

  const childIdsByBoneId = new Map<string, string[]>();
  const bones = hierarchy.topologicalOrder.map((bone) => {
    const id = boneIdByKey.get(bone.key);
    if (!id) throw new Error(`Missing generated ID for bone "${bone.key}".`);
    const parentBoneId = bone.parentKey ? (boneIdByKey.get(bone.parentKey) ?? null) : null;
    if (parentBoneId) childIdsByBoneId.set(parentBoneId, [...(childIdsByBoneId.get(parentBoneId) ?? []), id]);
    const direction = subtract(bone.tail, bone.head);
    const boneLength = Math.max(1e-4, length(direction));
    const quaternion = length(direction) > 0 ? quaternionFromTo({ x: 0, y: 1, z: 0 }, direction) : undefined;
    return {
      id,
      name: bone.key,
      parentId: parentBoneId ?? rigId,
      childIds: [] as string[],
      visible: true,
      locked: false,
      transform: {
        ...createTransform(),
        position: bone.head,
        rotation: ZERO_VEC3,
        ...(quaternion ? { quaternion } : {}),
      },
      sourceLinks: [],
      metadata: { tags: bone.humanoidLabel ? [bone.humanoidLabel] : [], customData: {} },
      type: "BONE_3D" as const,
      length: boneLength,
      deforming: bone.deforming,
    };
  });

  const bonesWithChildren = bones.map((bone) => ({ ...bone, childIds: childIdsByBoneId.get(bone.id) ?? [] }));
  const rootBoneKey = hierarchy.topologicalOrder.find((bone) => bone.parentKey === null);
  const rootBoneId = rootBoneKey ? boneIdByKey.get(rootBoneKey.key) : undefined;
  if (!rootBoneId) throw new Error("Bone hierarchy has no root bone.");

  const rig = {
    id: rigId,
    name: input.rigName,
    parentId: input.parentId,
    childIds: [rootBoneId],
    visible: true,
    locked: false,
    transform: createTransform(),
    sourceLinks: [],
    metadata: { tags: [], customData: {} },
    type: "RIG_3D" as const,
    rootBoneId,
    boneIds: bonesWithChildren.map((bone) => bone.id),
    ikChains: [],
    constraints: [],
    rigMethod: input.rigMethod,
  };

  return {
    rig: rig as Extract<DesignNode, { type: "RIG_3D" }>,
    bones: bonesWithChildren as Extract<DesignNode, { type: "BONE_3D" }>[],
    boneIdByKey,
  };
}
