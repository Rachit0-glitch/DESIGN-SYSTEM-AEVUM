import type { PackageContract } from "@aevum/shared";

export { deterministicEntityId, deterministicScopedId, fingerprint, stableStringify } from "./deterministic.js";
export { diagnostic, hasBlockingDiagnostics, hasErrorDiagnostics, sortDiagnostics } from "./diagnostics.js";
export {
  createCyclicBoneSpecs,
  createDanglingParentBoneSpecs,
  createSampleVertexInfluences,
} from "./fixtures.js";
export { validateBoneHierarchy, type BoneHierarchyValidation } from "./hierarchy.js";
export { deepFreeze } from "./immutable.js";
export {
  cross,
  dot,
  IDENTITY_QUAT,
  length,
  normalize,
  quaternionFromTo,
  subtract,
  ZERO_VEC3,
  type Quat,
  type Vec3,
} from "./math.js";
export { buildRigNodes, type BuildRigNodesInput, type BuiltRigNodes } from "./node-builder.js";
export { evaluatePose, resetPose, type EvaluatePoseInput, type IKTargetOverride } from "./pose.js";
export { skinVerticesCpu, type CpuSkinningInput } from "./skinning.js";
export { validateDeformation } from "./deformation.js";
export { editWeights, inspectWeights, type EditWeightsInput, type EditWeightsResult } from "./weight-editing.js";
export { createHumanoidSemanticMapping, retargetPose, type RetargetPoseInput } from "./retarget.js";
export { associatePartsToBones, type PartAssociationResult, type PartLike } from "./part-association.js";
export {
  createBasicHumanoidProvider,
  createMechanicalChainProvider,
  findAutoRigProvider,
  listAutoRigProviders,
  type AutoRigProvider,
} from "./provider.js";
export * from "./schemas.js";
export { buildBasicHumanoidTemplate } from "./templates/humanoid.js";
export { buildMechanicalChainTemplate, type MechanicalChainOptions } from "./templates/mechanical.js";
export { validateRig, type ValidateRigInput } from "./validation.js";
export { normalizeWeights, validateWeights, type NormalizeWeightsInput, type ValidateWeightsInput } from "./weights.js";

export const packageContract: PackageContract = {
  name: "@aevum/rigging",
  kind: "package",
  responsibility:
    "Canonical rig/skeleton/bone/skin/weight model construction and validation: bone hierarchy checks, weight validation and normalization, deterministic mechanical and architecture-test humanoid rig templates, part-to-bone association, and a combined rig validation report.",
  owns: "Bone-spec hierarchy validation, per-vertex weight validation/normalization, RIG_3D/BONE_3D node construction with deterministic IDs, the provider-neutral AutoRigProvider interface and its two deterministic templates, and rig validation reporting.",
  mustNotOwn:
    "Real Blender execution, canonical document mutation, MCP transport, Agent orchestration, facial rigging, cloth/hair bones, motion capture retargeting, or any external/paid rigging service.",
  status: "IMPLEMENTED",
};

export const RIGGING_STATUS = packageContract.status;
