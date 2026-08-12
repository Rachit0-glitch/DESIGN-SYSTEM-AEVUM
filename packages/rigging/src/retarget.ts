import type { DesignNode } from "@aevum/document-model";
import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import { fingerprint } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import {
  DEFAULT_RIG_RESOURCE_LIMITS,
  RetargetMappingSchema,
  RetargetResultSchema,
  type EvaluatedPose,
  type RetargetMapping,
  type RetargetResult,
  type RigDiagnostic,
  type RigResourceLimits,
} from "./schemas.js";
import { mat4, quat } from "gl-matrix";

type BoneNode = Extract<DesignNode, { type: "BONE_3D" }>;
const SEMANTIC_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  hips: "hips",
  spine: "spine",
  chest: "chest",
  neck: "neck",
  head: "head",
  upperarmleft: "leftUpperArm",
  lowerarmleft: "leftLowerArm",
  handleft: "leftHand",
  upperarmright: "rightUpperArm",
  lowerarmright: "rightLowerArm",
  handright: "rightHand",
  upperlegleft: "leftUpperLeg",
  lowerlegleft: "leftLowerLeg",
  footleft: "leftFoot",
  upperlegright: "rightUpperLeg",
  lowerlegright: "rightLowerLeg",
  footright: "rightFoot",
});

function semanticRole(bone: BoneNode): string | undefined {
  const tag = bone.metadata.tags[0];
  if (tag) return SEMANTIC_ALIASES[tag.toLowerCase().replace(/[^a-z]/g, "")] ?? tag;
  const key = bone.name.toLowerCase().replace(/[._\s-]/g, "");
  return SEMANTIC_ALIASES[key];
}

export function createHumanoidSemanticMapping(
  source: readonly BoneNode[],
  target: readonly BoneNode[],
): readonly RetargetMapping[] {
  const targets = new Map(
    target.map((bone) => [semanticRole(bone), bone]).filter((entry): entry is [string, BoneNode] => Boolean(entry[0])),
  );
  return deepFreeze(
    source
      .flatMap((bone) => {
        const role = semanticRole(bone);
        const matched = role ? targets.get(role) : undefined;
        return matched ? [{ sourceBoneId: bone.id, targetBoneId: matched.id, semanticRole: role }] : [];
      })
      .sort((a, b) => a.sourceBoneId.localeCompare(b.sourceBoneId)),
  );
}

export interface RetargetPoseInput {
  readonly sourcePose: EvaluatedPose;
  readonly sourceBones: readonly BoneNode[];
  readonly targetBones: readonly BoneNode[];
  readonly mappings: readonly RetargetMapping[];
  readonly limits?: RigResourceLimits;
}

export function retargetPose(input: RetargetPoseInput): RetargetResult {
  const limits = input.limits ?? DEFAULT_RIG_RESOURCE_LIMITS;
  if (input.mappings.length > limits.maxRetargetMappings)
    throw new Error(`Retarget mapping exceeds the ${limits.maxRetargetMappings} entry limit.`);
  const mappings = input.mappings.map((entry) => RetargetMappingSchema.parse(entry));
  const sourceIds = new Set(input.sourceBones.map((bone) => bone.id));
  const targetIds = new Set(input.targetBones.map((bone) => bone.id));
  const seenSource = new Set<string>();
  const seenTarget = new Set<string>();
  const diagnostics: RigDiagnostic[] = [];
  for (const mapping of mappings) {
    if (
      !sourceIds.has(mapping.sourceBoneId) ||
      !targetIds.has(mapping.targetBoneId) ||
      seenSource.has(mapping.sourceBoneId) ||
      seenTarget.has(mapping.targetBoneId)
    )
      diagnostics.push(
        diagnostic({
          code: "RETARGET_MAPPING_INVALID",
          severity: "ERROR",
          message: `Retarget mapping ${mapping.sourceBoneId} -> ${mapping.targetBoneId} is invalid or duplicated.`,
          stage: "RETARGET",
          recoverable: true,
          relatedIds: [mapping.sourceBoneId, mapping.targetBoneId],
        }),
      );
    seenSource.add(mapping.sourceBoneId);
    seenTarget.add(mapping.targetBoneId);
  }
  const sourcePoses = new Map(input.sourcePose.bones.map((bone) => [bone.boneId, bone]));
  const targetPoseDeltas = mappings.flatMap((mapping) => {
    const pose = sourcePoses.get(mapping.sourceBoneId);
    if (!pose) return [];
    const rotation = mat4.getRotation(
      quat.create(),
      mat4.fromValues(
        ...(pose.localMatrix as [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ]),
      ),
    );
    return [
      { boneId: mapping.targetBoneId, rotation: { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] } },
    ];
  });
  const unmappedSourceBoneIds = [...sourceIds].filter((id) => !seenSource.has(id)).sort();
  const unmappedTargetBoneIds = [...targetIds].filter((id) => !seenTarget.has(id)).sort();
  for (const id of unmappedSourceBoneIds)
    diagnostics.push(
      diagnostic({
        code: "RETARGET_BONE_UNMAPPED",
        severity: "WARNING",
        message: `Source bone ${id} is unmapped.`,
        stage: "RETARGET",
        recoverable: true,
        relatedIds: [id],
      }),
    );
  const body = {
    mappings,
    targetPoseDeltas,
    unmappedSourceBoneIds,
    unmappedTargetBoneIds,
    diagnostics: sortDiagnostics(diagnostics),
  };
  return deepFreeze(RetargetResultSchema.parse({ ...body, fingerprint: fingerprint(body) }));
}
