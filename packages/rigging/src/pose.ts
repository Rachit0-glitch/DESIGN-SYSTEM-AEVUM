import type { DesignNode } from "@aevum/document-model";
import { mat4, quat, vec3 } from "gl-matrix";
import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import { fingerprint } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import {
  DEFAULT_RIG_RESOURCE_LIMITS,
  EvaluatedPoseSchema,
  PoseDeltaSchema,
  type EvaluatedPose,
  type PoseDelta,
  type RigDiagnostic,
  type RigResourceLimits,
} from "./schemas.js";

type RigNode = Extract<DesignNode, { type: "RIG_3D" }>;
type BoneNode = Extract<DesignNode, { type: "BONE_3D" }>;
type Matrix = mat4;

export interface IKTargetOverride {
  readonly chainId: string;
  readonly target: { readonly x: number; readonly y: number; readonly z: number };
  readonly tolerance?: number;
  readonly iterations?: number;
}

export interface EvaluatePoseInput {
  readonly rig: RigNode;
  readonly bones: readonly BoneNode[];
  readonly deltas?: readonly PoseDelta[];
  readonly ikTargets?: readonly IKTargetOverride[];
  readonly targetPositions?: Readonly<Record<string, { readonly x: number; readonly y: number; readonly z: number }>>;
  readonly time?: number;
  readonly progress?: number;
  readonly source?: EvaluatedPose["source"];
  readonly meshWorldMatrix?: readonly number[];
  readonly limits?: RigResourceLimits;
}

function matrixArray(value: Matrix): number[] {
  return Array.from(value, (entry) => (Math.abs(entry) < 1e-12 ? 0 : entry));
}

function transformMatrix(node: BoneNode): Matrix {
  const rotation = node.transform.quaternion
    ? quat.fromValues(
        node.transform.quaternion.x,
        node.transform.quaternion.y,
        node.transform.quaternion.z,
        node.transform.quaternion.w,
      )
    : quat.fromEuler(
        quat.create(),
        ...([node.transform.rotation.x, node.transform.rotation.y, node.transform.rotation.z].map(
          (value) => (value * 180) / Math.PI,
        ) as [number, number, number]),
      );
  quat.normalize(rotation, rotation);
  return mat4.fromRotationTranslationScale(
    mat4.create(),
    rotation,
    vec3.fromValues(node.transform.position.x, node.transform.position.y, node.transform.position.z),
    vec3.fromValues(node.transform.scale.x, node.transform.scale.y, node.transform.scale.z),
  );
}

function deltaMatrix(delta: PoseDelta | undefined): Matrix {
  if (!delta) return mat4.create();
  const rotation = delta.rotation
    ? quat.normalize(
        quat.create(),
        quat.fromValues(delta.rotation.x, delta.rotation.y, delta.rotation.z, delta.rotation.w),
      )
    : quat.create();
  const translation = delta.translation
    ? vec3.fromValues(delta.translation.x, delta.translation.y, delta.translation.z)
    : vec3.create();
  const scale = delta.scale ? vec3.fromValues(delta.scale.x, delta.scale.y, delta.scale.z) : vec3.fromValues(1, 1, 1);
  return mat4.fromRotationTranslationScale(mat4.create(), rotation, translation, scale);
}

function topologicalBones(rig: RigNode, bones: readonly BoneNode[]): BoneNode[] {
  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  const ordered: BoneNode[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    const bone = byId.get(id);
    if (!bone) return;
    if (bone.parentId && byId.has(bone.parentId)) visit(bone.parentId);
    visited.add(id);
    ordered.push(bone);
  };
  for (const id of rig.boneIds) visit(id);
  return ordered;
}

function evaluateWorld(ordered: readonly BoneNode[], locals: ReadonlyMap<string, Matrix>): Map<string, Matrix> {
  const worlds = new Map<string, Matrix>();
  for (const bone of ordered) {
    const local = locals.get(bone.id) ?? mat4.create();
    const parent = bone.parentId ? worlds.get(bone.parentId) : undefined;
    worlds.set(bone.id, parent ? mat4.multiply(mat4.create(), parent, local) : mat4.clone(local));
  }
  return worlds;
}

function matrixPosition(matrix: Matrix): vec3 {
  return mat4.getTranslation(vec3.create(), matrix);
}

function chainFor(rig: RigNode, bones: ReadonlyMap<string, BoneNode>, chainId: string): BoneNode[] | undefined {
  const chain = rig.ikChains.find((entry) => entry.id === chainId);
  if (!chain) return undefined;
  const result: BoneNode[] = [];
  let current = bones.get(chain.endEffectorBoneId);
  while (current && result.length < chain.chainLength) {
    result.unshift(current);
    if (current.id === chain.rootBoneId) break;
    current = current.parentId ? bones.get(current.parentId) : undefined;
  }
  return result[0]?.id === chain.rootBoneId ? result : undefined;
}

function solveIK(
  rig: RigNode,
  ordered: readonly BoneNode[],
  locals: Map<string, Matrix>,
  overrides: readonly IKTargetOverride[],
  limits: RigResourceLimits,
  diagnostics: RigDiagnostic[],
): EvaluatedPose["ikResults"] {
  const bones = new Map(ordered.map((bone) => [bone.id, bone]));
  const results: EvaluatedPose["ikResults"][number][] = [];
  for (const override of [...overrides].sort((a, b) => a.chainId.localeCompare(b.chainId))) {
    const chain = chainFor(rig, bones, override.chainId);
    if (!chain || chain.length > limits.maxIKChainLength) {
      diagnostics.push(
        diagnostic({
          code: "IK_CHAIN_INVALID",
          severity: "ERROR",
          message: `IK chain ${override.chainId} is missing or invalid.`,
          stage: "IK",
          recoverable: true,
          relatedIds: [override.chainId],
        }),
      );
      continue;
    }
    const target = vec3.fromValues(override.target.x, override.target.y, override.target.z);
    const tolerance = Math.max(1e-6, override.tolerance ?? 1e-4);
    const maxIterations = Math.min(override.iterations ?? limits.maxIKIterations, limits.maxIKIterations);
    let worlds = evaluateWorld(ordered, locals);
    const rootPosition = matrixPosition(worlds.get(chain[0]?.id ?? "") ?? mat4.create());
    const totalLength = chain.reduce((sum, bone) => sum + bone.length, 0);
    const reachable = vec3.distance(rootPosition, target) <= totalLength + tolerance;
    let distance = Number.POSITIVE_INFINITY;
    let iterations = 0;
    for (; iterations < maxIterations; iterations += 1) {
      worlds = evaluateWorld(ordered, locals);
      const end = chain.at(-1);
      if (!end) break;
      const endWorld = worlds.get(end.id);
      if (!endWorld) break;
      const endPosition = vec3.transformMat4(vec3.create(), vec3.fromValues(0, end.length, 0), endWorld);
      distance = vec3.distance(endPosition, target);
      if (distance <= tolerance) break;
      for (let index = chain.length - 2; index >= 0; index -= 1) {
        const joint = chain[index];
        if (!joint) continue;
        worlds = evaluateWorld(ordered, locals);
        const jointWorld = worlds.get(joint.id);
        const currentEndWorld = worlds.get(end.id);
        if (!jointWorld || !currentEndWorld) continue;
        const jointPosition = matrixPosition(jointWorld);
        const currentEnd = vec3.transformMat4(vec3.create(), vec3.fromValues(0, end.length, 0), currentEndWorld);
        const towardEnd = vec3.subtract(vec3.create(), currentEnd, jointPosition);
        const towardTarget = vec3.subtract(vec3.create(), target, jointPosition);
        if (vec3.length(towardEnd) < 1e-9 || vec3.length(towardTarget) < 1e-9) continue;
        vec3.normalize(towardEnd, towardEnd);
        vec3.normalize(towardTarget, towardTarget);
        const worldDelta = quat.rotationTo(quat.create(), towardEnd, towardTarget);
        const parentWorld = joint.parentId ? worlds.get(joint.parentId) : undefined;
        const parentRotation = parentWorld ? mat4.getRotation(quat.create(), parentWorld) : quat.create();
        const localRotation = mat4.getRotation(quat.create(), locals.get(joint.id) ?? mat4.create());
        const localDelta = quat.multiply(
          quat.create(),
          quat.multiply(quat.create(), quat.invert(quat.create(), parentRotation), worldDelta),
          parentRotation,
        );
        quat.multiply(localRotation, localDelta, localRotation);
        quat.normalize(localRotation, localRotation);
        const local = locals.get(joint.id) ?? mat4.create();
        const translation = mat4.getTranslation(vec3.create(), local);
        const scale = mat4.getScaling(vec3.create(), local);
        locals.set(joint.id, mat4.fromRotationTranslationScale(mat4.create(), localRotation, translation, scale));
      }
    }
    const converged = distance <= tolerance;
    if (!reachable)
      diagnostics.push(
        diagnostic({
          code: "IK_TARGET_UNREACHABLE",
          severity: "WARNING",
          message: `IK target for ${override.chainId} is unreachable; the bounded solver returned its closest pose.`,
          stage: "IK",
          recoverable: true,
          relatedIds: [override.chainId],
          details: { distance, iterations },
        }),
      );
    else if (!converged)
      diagnostics.push(
        diagnostic({
          code: "IK_DID_NOT_CONVERGE",
          severity: "WARNING",
          message: `IK chain ${override.chainId} did not converge within ${maxIterations} iterations.`,
          stage: "IK",
          recoverable: true,
          relatedIds: [override.chainId],
          details: { distance, iterations },
        }),
      );
    results.push({
      chainId: override.chainId,
      converged,
      reachable,
      iterations,
      finalDistance: Number.isFinite(distance) ? distance : 0,
    });
  }
  return results;
}

function applyConstraints(
  rig: RigNode,
  ordered: readonly BoneNode[],
  locals: Map<string, Matrix>,
  targetPositions: EvaluatePoseInput["targetPositions"],
  diagnostics: RigDiagnostic[],
): void {
  const boneIds = new Set(ordered.map((bone) => bone.id));
  for (const constraint of [...rig.constraints].sort((a, b) => a.id.localeCompare(b.id))) {
    const targetLocal = locals.get(constraint.targetBoneId);
    const sourceLocal = constraint.sourceBoneId ? locals.get(constraint.sourceBoneId) : undefined;
    if (!targetLocal || (constraint.sourceBoneId && !sourceLocal)) {
      diagnostics.push(
        diagnostic({
          code: "CONSTRAINT_TARGET_INVALID",
          severity: "ERROR",
          message: `Constraint ${constraint.id} references a missing bone.`,
          stage: "CONSTRAINT",
          recoverable: true,
          relatedIds: [constraint.id],
        }),
      );
      continue;
    }
    const influence = constraint.influence;
    const translation = mat4.getTranslation(vec3.create(), targetLocal);
    const rotation = mat4.getRotation(quat.create(), targetLocal);
    const scale = mat4.getScaling(vec3.create(), targetLocal);
    const settings = constraint.settings as Record<string, unknown>;
    if ((constraint.type === "COPY_LOCATION" || constraint.type === "COPY_TRANSFORM") && sourceLocal) {
      vec3.lerp(translation, translation, mat4.getTranslation(vec3.create(), sourceLocal), influence);
    }
    if ((constraint.type === "COPY_ROTATION" || constraint.type === "COPY_TRANSFORM") && sourceLocal) {
      quat.slerp(rotation, rotation, mat4.getRotation(quat.create(), sourceLocal), influence);
    }
    if (constraint.type === "LIMIT_LOCATION") {
      const min = (settings.min ?? {}) as Partial<Record<"x" | "y" | "z", number>>;
      const max = (settings.max ?? {}) as Partial<Record<"x" | "y" | "z", number>>;
      translation[0] = Math.min(max.x ?? Infinity, Math.max(min.x ?? -Infinity, translation[0]));
      translation[1] = Math.min(max.y ?? Infinity, Math.max(min.y ?? -Infinity, translation[1]));
      translation[2] = Math.min(max.z ?? Infinity, Math.max(min.z ?? -Infinity, translation[2]));
    }
    if (constraint.type === "LIMIT_ROTATION") {
      const euler = [0, 0, 0] as [number, number, number];
      // Bounded axis-angle limits are represented as direct XYZ quaternion component clamps.
      const min = (settings.min ?? {}) as Partial<Record<"x" | "y" | "z", number>>;
      const max = (settings.max ?? {}) as Partial<Record<"x" | "y" | "z", number>>;
      euler[0] = Math.min(max.x ?? Math.PI, Math.max(min.x ?? -Math.PI, Number(settings.x ?? 0)));
      euler[1] = Math.min(max.y ?? Math.PI, Math.max(min.y ?? -Math.PI, Number(settings.y ?? 0)));
      euler[2] = Math.min(max.z ?? Math.PI, Math.max(min.z ?? -Math.PI, Number(settings.z ?? 0)));
      quat.fromEuler(rotation, (euler[0] * 180) / Math.PI, (euler[1] * 180) / Math.PI, (euler[2] * 180) / Math.PI);
    }
    if (constraint.type === "TRACK_TO" && constraint.sourceNodeId && targetPositions?.[constraint.sourceNodeId]) {
      const worlds = evaluateWorld(ordered, locals);
      const bone = ordered.find((entry) => entry.id === constraint.targetBoneId);
      const world = worlds.get(constraint.targetBoneId);
      if (bone && world) {
        const target = targetPositions[constraint.sourceNodeId];
        if (!target) continue;
        const direction = vec3.subtract(
          vec3.create(),
          vec3.fromValues(target.x, target.y, target.z),
          matrixPosition(world),
        );
        if (vec3.length(direction) > 1e-9)
          quat.rotationTo(rotation, vec3.fromValues(0, 1, 0), vec3.normalize(direction, direction));
      }
    }
    locals.set(constraint.targetBoneId, mat4.fromRotationTranslationScale(mat4.create(), rotation, translation, scale));
    if (!boneIds.has(constraint.targetBoneId)) break;
  }
}

export function evaluatePose(input: EvaluatePoseInput): EvaluatedPose {
  const limits = input.limits ?? DEFAULT_RIG_RESOURCE_LIMITS;
  if (input.bones.length > limits.maxBones)
    throw new Error(`Rig exceeds the ${limits.maxBones} bone evaluation limit.`);
  if ((input.deltas?.length ?? 0) > limits.maxPoseOperations)
    throw new Error(`Pose exceeds the ${limits.maxPoseOperations} operation limit.`);
  const ordered = topologicalBones(input.rig, input.bones);
  if (ordered.length !== input.rig.boneIds.length) throw new Error("Rig contains missing or cyclic bone references.");
  const deltaByBone = new Map(
    (input.deltas ?? []).map((value) => {
      const parsed = PoseDeltaSchema.parse(value);
      return [parsed.boneId, parsed] as const;
    }),
  );
  const diagnostics: RigDiagnostic[] = [];
  for (const id of deltaByBone.keys())
    if (!input.rig.boneIds.includes(id))
      diagnostics.push(
        diagnostic({
          code: "POSE_BONE_NOT_FOUND",
          severity: "ERROR",
          message: `Pose references missing bone ${id}.`,
          stage: "POSE",
          recoverable: true,
          relatedIds: [id],
        }),
      );
  const restLocals = new Map(ordered.map((bone) => [bone.id, transformMatrix(bone)]));
  const restWorlds = evaluateWorld(ordered, restLocals);
  const locals = new Map(
    ordered.map((bone) => [
      bone.id,
      mat4.multiply(mat4.create(), transformMatrix(bone), deltaMatrix(deltaByBone.get(bone.id))),
    ]),
  );
  const ikResults = solveIK(input.rig, ordered, locals, input.ikTargets ?? [], limits, diagnostics);
  applyConstraints(input.rig, ordered, locals, input.targetPositions, diagnostics);
  const worlds = evaluateWorld(ordered, locals);
  const inverseMesh =
    input.meshWorldMatrix?.length === 16
      ? mat4.invert(
          mat4.create(),
          mat4.fromValues(
            ...(input.meshWorldMatrix as [
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
        )
      : mat4.create();
  if (!inverseMesh) throw new Error("Mesh world matrix is singular.");
  const bones = ordered.map((bone) => {
    const local = locals.get(bone.id) ?? mat4.create();
    const world = worlds.get(bone.id) ?? mat4.create();
    const inverseBind = bone.inverseBindMatrix
      ? mat4.fromValues(
          ...(bone.inverseBindMatrix as [
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
        )
      : mat4.invert(mat4.create(), restWorlds.get(bone.id) ?? mat4.create());
    if (!inverseBind) throw new Error(`Rest matrix for bone ${bone.id} is singular.`);
    const joint = mat4.multiply(mat4.create(), mat4.multiply(mat4.create(), inverseMesh, world), inverseBind);
    return {
      boneId: bone.id,
      parentBoneId: input.rig.boneIds.includes(bone.parentId ?? "") ? bone.parentId : null,
      localMatrix: matrixArray(local),
      worldMatrix: matrixArray(world),
      jointMatrix: matrixArray(joint),
    };
  });
  const source =
    input.source ??
    ((input.ikTargets?.length ?? 0) > 0 && deltaByBone.size > 0
      ? "MIXED"
      : (input.ikTargets?.length ?? 0) > 0
        ? "IK"
        : deltaByBone.size > 0
          ? "FK"
          : "REST");
  const body = {
    version: "1.0.0" as const,
    rigId: input.rig.id,
    time: input.time ?? 0,
    progress: input.progress ?? 0,
    source,
    bones,
    ikResults,
    diagnostics: sortDiagnostics(diagnostics),
  };
  return deepFreeze(EvaluatedPoseSchema.parse({ ...body, fingerprint: fingerprint(body) }));
}

export function resetPose(input: Omit<EvaluatePoseInput, "deltas" | "ikTargets" | "source">): EvaluatedPose {
  return evaluatePose({ ...input, deltas: [], ikTargets: [], source: "REST" });
}
