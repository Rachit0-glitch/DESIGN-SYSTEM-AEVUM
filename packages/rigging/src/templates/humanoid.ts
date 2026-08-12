import { validateBoneHierarchy } from "../hierarchy.js";
import type { BoneSpec, RigDiagnostic, RigTemplateResult } from "../schemas.js";
import type { Vec3 } from "../math.js";

function bone(key: string, parentKey: string | null, head: Vec3, tail: Vec3, humanoidLabel?: string): BoneSpec {
  return { key, parentKey, head, tail, deforming: true, ...(humanoidLabel ? { humanoidLabel } : {}) };
}

/**
 * Deterministic BASIC_HUMANOID template (Phase 19B §29): a small, architecture-test-only
 * skeleton (spine + one arm + one leg pair) used to prove the rig/skin/pose pipeline handles a
 * branching hierarchy, not a claim of anatomical or production character-rig quality — see
 * Phase 19B's Honest Scope. Deliberately excludes fingers, facial bones, and twist bones.
 */
export function buildBasicHumanoidTemplate(): RigTemplateResult {
  const bones: BoneSpec[] = [
    bone("hips", null, { x: 0, y: 0, z: 0 }, { x: 0, y: 0.1, z: 0 }, "hips"),
    bone("spine", "hips", { x: 0, y: 0.1, z: 0 }, { x: 0, y: 0.2, z: 0 }, "spine"),
    bone("chest", "spine", { x: 0, y: 0.2, z: 0 }, { x: 0, y: 0.2, z: 0.02 }, "chest"),
    bone("neck", "chest", { x: 0, y: 0.2, z: 0 }, { x: 0, y: 0.08, z: 0 }, "neck"),
    bone("head", "neck", { x: 0, y: 0.08, z: 0 }, { x: 0, y: 0.15, z: 0 }, "head"),
    bone("upperArm.L", "chest", { x: 0.1, y: 0.15, z: 0 }, { x: 0.25, y: 0, z: 0 }, "upperArmLeft"),
    bone("lowerArm.L", "upperArm.L", { x: 0, y: 0.25, z: 0 }, { x: 0, y: 0.22, z: 0 }, "lowerArmLeft"),
    bone("upperArm.R", "chest", { x: -0.1, y: 0.15, z: 0 }, { x: -0.25, y: 0, z: 0 }, "upperArmRight"),
    bone("lowerArm.R", "upperArm.R", { x: 0, y: 0.25, z: 0 }, { x: 0, y: 0.22, z: 0 }, "lowerArmRight"),
    bone("upperLeg.L", "hips", { x: 0.09, y: 0, z: 0 }, { x: 0, y: -0.4, z: 0 }, "upperLegLeft"),
    bone("lowerLeg.L", "upperLeg.L", { x: 0, y: 0.4, z: 0 }, { x: 0, y: 0.38, z: 0 }, "lowerLegLeft"),
    bone("upperLeg.R", "hips", { x: -0.09, y: 0, z: 0 }, { x: 0, y: -0.4, z: 0 }, "upperLegRight"),
    bone("lowerLeg.R", "upperLeg.R", { x: 0, y: 0.4, z: 0 }, { x: 0, y: 0.38, z: 0 }, "lowerLegRight"),
  ];

  const hierarchy = validateBoneHierarchy(bones);
  const diagnostics: RigDiagnostic[] = [...hierarchy.diagnostics];
  return { templateId: "BASIC_HUMANOID", bones, diagnostics };
}
