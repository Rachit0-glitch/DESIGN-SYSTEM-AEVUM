import { diagnostic } from "./diagnostics.js";
import type { BoneSpec, RigDiagnostic } from "./schemas.js";

export interface BoneHierarchyValidation {
  readonly valid: boolean;
  /** Parents ordered before children — safe for sequential deterministic-ID assignment and for
   * Blender edit-bone creation (a bone's parent must already exist when it is created). */
  readonly topologicalOrder: readonly BoneSpec[];
  readonly diagnostics: readonly RigDiagnostic[];
}

/**
 * Real cycle/multi-parent/dangling-reference/self-parent detection over a flat bone-spec list
 * (Phase 19B §6). Bone specs are keyed by a caller-chosen `key` (not yet a canonical EntityId,
 * since specs are the provider-neutral input construction happens from) with `parentKey`
 * references resolved against that same key space.
 */
export function validateBoneHierarchy(bones: readonly BoneSpec[]): BoneHierarchyValidation {
  const diagnostics: RigDiagnostic[] = [];
  const byKey = new Map(bones.map((bone) => [bone.key, bone]));

  const duplicateKeys = bones.map((bone) => bone.key).filter((key, index, all) => all.indexOf(key) !== index);
  for (const key of new Set(duplicateKeys)) {
    diagnostics.push(
      diagnostic({
        code: "RIG_HIERARCHY_INVALID",
        severity: "CRITICAL",
        message: `Bone key "${key}" is declared more than once.`,
        stage: "HIERARCHY_VALIDATION",
        recoverable: false,
        relatedIds: [key],
      }),
    );
  }

  for (const bone of bones) {
    if (bone.parentKey === bone.key) {
      diagnostics.push(
        diagnostic({
          code: "RIG_HIERARCHY_INVALID",
          severity: "CRITICAL",
          message: `Bone "${bone.key}" cannot be its own parent.`,
          stage: "HIERARCHY_VALIDATION",
          recoverable: false,
          relatedIds: [bone.key],
        }),
      );
    } else if (bone.parentKey !== null && !byKey.has(bone.parentKey)) {
      diagnostics.push(
        diagnostic({
          code: "RIG_DANGLING_REFERENCE",
          severity: "CRITICAL",
          message: `Bone "${bone.key}" references parent "${bone.parentKey}", which does not exist.`,
          stage: "HIERARCHY_VALIDATION",
          recoverable: false,
          relatedIds: [bone.key, bone.parentKey],
        }),
      );
    }
  }

  const cycleMembers = new Set<string>();
  for (const bone of bones) {
    const visited = new Set<string>([bone.key]);
    let current: BoneSpec | undefined = bone;
    while (current?.parentKey) {
      if (visited.has(current.parentKey)) {
        for (const member of visited) cycleMembers.add(member);
        break;
      }
      visited.add(current.parentKey);
      current = byKey.get(current.parentKey);
    }
  }
  if (cycleMembers.size > 0) {
    diagnostics.push(
      diagnostic({
        code: "RIG_CYCLE",
        severity: "CRITICAL",
        message: `Bone hierarchy contains a cycle involving: ${[...cycleMembers].sort().join(", ")}.`,
        stage: "HIERARCHY_VALIDATION",
        recoverable: false,
        relatedIds: [...cycleMembers].sort(),
      }),
    );
  }

  const valid = diagnostics.length === 0;
  const topologicalOrder: BoneSpec[] = [];
  if (valid) {
    const resolved = new Set<string>();
    const remaining = [...bones];
    while (remaining.length > 0) {
      const progressIndex = remaining.findIndex((bone) => bone.parentKey === null || resolved.has(bone.parentKey));
      if (progressIndex === -1) break;
      const [next] = remaining.splice(progressIndex, 1);
      if (!next) break;
      topologicalOrder.push(next);
      resolved.add(next.key);
    }
  }

  return {
    valid,
    topologicalOrder,
    diagnostics: diagnostics.sort((left, right) => left.code.localeCompare(right.code)),
  };
}
