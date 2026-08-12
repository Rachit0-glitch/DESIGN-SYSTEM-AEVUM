import { validateBoneHierarchy } from "../hierarchy.js";
import type { BoneSpec, RigDiagnostic, RigTemplateResult } from "../schemas.js";

export interface MechanicalChainOptions {
  readonly segmentCount?: number;
  readonly segmentLength?: number;
  readonly baseHeight?: number;
}

const SEGMENT_NAMES = ["arm", "forearm", "tool"] as const;

/**
 * Deterministic MECHANICAL_CHAIN template (Phase 19B §30): a vertical `base` bone topped by a
 * configurable chain of horizontal segments (`arm`, `forearm`, `tool`, ...), each continuing
 * straight from the previous bone's tip in that bone's own local frame — a real, inspectable
 * hierarchy proving rig architecture, not a claim of production mechanical-rig quality.
 */
export function buildMechanicalChainTemplate(options: MechanicalChainOptions = {}): RigTemplateResult {
  const segmentCount = Math.min(Math.max(1, options.segmentCount ?? 3), SEGMENT_NAMES.length);
  const segmentLength = options.segmentLength ?? 0.25;
  const baseHeight = options.baseHeight ?? 0.15;

  const base: BoneSpec = {
    key: "base",
    parentKey: null,
    head: { x: 0, y: 0, z: 0 },
    tail: { x: 0, y: baseHeight, z: 0 },
    deforming: true,
  };
  const bones: BoneSpec[] = [base];
  let previousKey = "base";
  for (let index = 0; index < segmentCount; index += 1) {
    const key = SEGMENT_NAMES[index] ?? `segment_${index}`;
    const head = index === 0 ? { x: 0, y: baseHeight, z: 0 } : { x: 0, y: segmentLength, z: 0 };
    const tail = index === 0 ? { x: segmentLength, y: baseHeight, z: 0 } : { x: 0, y: segmentLength * 2, z: 0 };
    bones.push({ key, parentKey: previousKey, head, tail, deforming: true });
    previousKey = key;
  }

  const hierarchy = validateBoneHierarchy(bones);
  const diagnostics: RigDiagnostic[] = [...hierarchy.diagnostics];
  return { templateId: "MECHANICAL_CHAIN", bones, diagnostics };
}
