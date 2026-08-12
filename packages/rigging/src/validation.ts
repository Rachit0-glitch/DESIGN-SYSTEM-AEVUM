import type { DesignNode } from "@aevum/document-model";
import { diagnostic, hasErrorDiagnostics, sortDiagnostics } from "./diagnostics.js";
import { fingerprint } from "./deterministic.js";
import { validateBoneHierarchy } from "./hierarchy.js";
import {
  RigValidationReportSchema,
  type RigDiagnostic,
  type RigResourceLimits,
  type RigValidationReport,
} from "./schemas.js";

type RigNode = Extract<DesignNode, { type: "RIG_3D" }>;
type BoneNode = Extract<DesignNode, { type: "BONE_3D" }>;

export interface ValidateRigInput {
  readonly rig: RigNode;
  readonly bones: readonly BoneNode[];
  readonly limits: RigResourceLimits;
  /** Diagnostics already produced by a separate skin-weight validation pass (weights.ts),
   * folded into the combined report rather than recomputed here. */
  readonly skinDiagnostics?: readonly RigDiagnostic[];
  readonly skinBindingCount?: number;
}

const MAX_GLTF_JOINTS = 65_536;

/** Combines hierarchy, resource-limit, rest-pose, IK, and constraint checks into one report
 * (Phase 19B §22). Weight validation runs separately (weights.ts) since it needs per-vertex data
 * this function never receives; its diagnostics are folded in via `skinDiagnostics`. */
export function validateRig(input: ValidateRigInput): RigValidationReport {
  const diagnostics: RigDiagnostic[] = [...(input.skinDiagnostics ?? [])];
  const boneById = new Map(input.bones.map((bone) => [bone.id, bone]));

  const boneSpecs = input.bones.map((bone) => ({
    key: bone.id,
    parentKey: bone.parentId === input.rig.id ? null : bone.parentId,
    head: bone.transform.position,
    tail: bone.transform.position,
    deforming: bone.deforming,
  }));
  const hierarchy = validateBoneHierarchy(boneSpecs);
  diagnostics.push(...hierarchy.diagnostics);

  const deformBoneCount = input.bones.filter((bone) => bone.deforming).length;
  if (input.bones.length > input.limits.maxBones) {
    diagnostics.push(
      diagnostic({
        code: "RIG_RESOURCE_LIMIT_EXCEEDED",
        severity: "ERROR",
        message: `Rig has ${input.bones.length} bones, exceeding the limit of ${input.limits.maxBones}.`,
        stage: "RESOURCE_LIMITS",
        recoverable: true,
        relatedIds: [input.rig.id],
      }),
    );
  }
  if (deformBoneCount > input.limits.maxDeformBones) {
    diagnostics.push(
      diagnostic({
        code: "RIG_RESOURCE_LIMIT_EXCEEDED",
        severity: "ERROR",
        message: `Rig has ${deformBoneCount} deform bones, exceeding the limit of ${input.limits.maxDeformBones}.`,
        stage: "RESOURCE_LIMITS",
        recoverable: true,
        relatedIds: [input.rig.id],
      }),
    );
  }
  if (input.bones.length > MAX_GLTF_JOINTS) {
    diagnostics.push(
      diagnostic({
        code: "RIG_EXPORT_LOSS",
        severity: "CRITICAL",
        message: `Rig has ${input.bones.length} bones, exceeding glTF's ${MAX_GLTF_JOINTS}-joint limit.`,
        stage: "EXPORT_COMPATIBILITY",
        recoverable: false,
        relatedIds: [input.rig.id],
      }),
    );
  }
  if (input.rig.constraints.length > input.limits.maxConstraints) {
    diagnostics.push(
      diagnostic({
        code: "RIG_RESOURCE_LIMIT_EXCEEDED",
        severity: "ERROR",
        message: `Rig has ${input.rig.constraints.length} constraints, exceeding the limit of ${input.limits.maxConstraints}.`,
        stage: "RESOURCE_LIMITS",
        recoverable: true,
        relatedIds: [input.rig.id],
      }),
    );
  }
  if (input.rig.ikChains.length > input.limits.maxIKChains) {
    diagnostics.push(
      diagnostic({
        code: "RIG_RESOURCE_LIMIT_EXCEEDED",
        severity: "ERROR",
        message: `Rig has ${input.rig.ikChains.length} IK chains, exceeding the limit of ${input.limits.maxIKChains}.`,
        stage: "RESOURCE_LIMITS",
        recoverable: true,
        relatedIds: [input.rig.id],
      }),
    );
  }

  let restPoseValid = true;
  for (const bone of input.bones) {
    const { position, scale } = bone.transform;
    const finite = [position.x, position.y, position.z, scale.x, scale.y, scale.z, bone.length].every((value) =>
      Number.isFinite(value),
    );
    if (!finite || bone.length <= 0) {
      restPoseValid = false;
      diagnostics.push(
        diagnostic({
          code: "RIG_REST_POSE_INVALID",
          severity: "CRITICAL",
          message: `Bone "${bone.name}" has a non-finite or non-positive-length rest transform.`,
          stage: "REST_POSE_VALIDATION",
          recoverable: false,
          relatedIds: [bone.id],
        }),
      );
    }
  }

  for (const constraint of input.rig.constraints) {
    const targets = [constraint.targetBoneId, constraint.sourceBoneId].filter((id): id is string => id !== undefined);
    for (const target of targets) {
      if (!boneById.has(target)) {
        diagnostics.push(
          diagnostic({
            code: "CONSTRAINT_TARGET_INVALID",
            severity: "ERROR",
            message: `Constraint "${constraint.id}" references bone "${target}", which does not exist in this rig.`,
            stage: "CONSTRAINT_VALIDATION",
            recoverable: true,
            relatedIds: [constraint.id, target],
          }),
        );
      }
    }
  }

  for (const chain of input.rig.ikChains) {
    const root = boneById.get(chain.rootBoneId);
    const effector = boneById.get(chain.endEffectorBoneId);
    if (!root || !effector) {
      diagnostics.push(
        diagnostic({
          code: "IK_CHAIN_INVALID",
          severity: "ERROR",
          message: `IK chain "${chain.id}" references a root or end-effector bone that does not exist.`,
          stage: "IK_VALIDATION",
          recoverable: true,
          relatedIds: [chain.id],
        }),
      );
      continue;
    }
    let depth = 0;
    let current: BoneNode | undefined = effector;
    while (current && current.id !== chain.rootBoneId && depth <= chain.chainLength) {
      current = current.parentId ? boneById.get(current.parentId) : undefined;
      depth += 1;
    }
    if (!current || current.id !== chain.rootBoneId) {
      diagnostics.push(
        diagnostic({
          code: "IK_CHAIN_INVALID",
          severity: "ERROR",
          message: `IK chain "${chain.id}" root is not an ancestor of its end effector within ${chain.chainLength} bone(s).`,
          stage: "IK_VALIDATION",
          recoverable: true,
          relatedIds: [chain.id],
        }),
      );
    }
  }

  const sorted = sortDiagnostics(diagnostics);
  const valid = !hasErrorDiagnostics(sorted) && hierarchy.valid && restPoseValid;
  const content = {
    rigId: input.rig.id,
    valid,
    boneCount: input.bones.length,
    deformBoneCount,
    hierarchyValid: hierarchy.valid,
    restPoseValid,
    skinBindingCount: input.skinBindingCount ?? 0,
    constraintCount: input.rig.constraints.length,
    ikChainCount: input.rig.ikChains.length,
    exportCompatible: input.bones.length <= MAX_GLTF_JOINTS,
    diagnostics: sorted,
  };
  return RigValidationReportSchema.parse({ ...content, version: "1.0.0", fingerprint: fingerprint(content) });
}
