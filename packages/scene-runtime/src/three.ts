import { evaluateTimeline } from "@aevum/animation-core";
import type { Bounds3D, CameraRecord, CanonicalDesignDocument } from "@aevum/document-model";
import { evaluatePose, type PoseDelta } from "@aevum/rigging";
import { resolveLighting } from "@aevum/lighting";
import { deepFreeze, immutableMap } from "./immutable.js";
import { stableHash } from "./stable.js";
import { transformBounds3D } from "./transforms.js";
import type {
  RuntimeDiagnostic,
  RuntimeMesh3D,
  RuntimeNode,
  RuntimeRig3D,
  RuntimeScene3D,
  Scene3DProjectionResult,
  SceneProjectionResult,
} from "./types.js";

function mergeBounds(bounds: readonly Bounds3D[]): Bounds3D | undefined {
  if (bounds.length === 0) return undefined;
  const min = {
    x: Math.min(...bounds.map((value) => value.min.x)),
    y: Math.min(...bounds.map((value) => value.min.y)),
    z: Math.min(...bounds.map((value) => value.min.z)),
  };
  const max = {
    x: Math.max(...bounds.map((value) => value.max.x)),
    y: Math.max(...bounds.map((value) => value.max.y)),
    z: Math.max(...bounds.map((value) => value.max.z)),
  };
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return {
    min,
    max,
    center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
    size,
    radius: Math.hypot(size.x, size.y, size.z) / 2,
  };
}

function poseDeltasForRig(
  document: CanonicalDesignDocument,
  projection: SceneProjectionResult,
  boneIds: readonly string[],
): PoseDelta[] {
  const values = new Map<string, PoseDelta>();
  for (const timelineId of projection.viewport.animation?.timelineIds ?? []) {
    const timeline = document.timelines[timelineId];
    if (!timeline) continue;
    const evaluation = evaluateTimeline(timeline, {
      time: projection.viewport.animation?.time ?? 0,
      ...(projection.viewport.animation?.progress !== undefined
        ? { progress: projection.viewport.animation.progress }
        : {}),
      reducedMotion: { behavior: projection.viewport.reducedMotion ? "DISABLE" : "PRESERVE", durationScale: 1 },
      timelineRegistry: document.timelines,
    });
    for (const boneId of boneIds) {
      const target = evaluation.targetValues[boneId];
      if (!target) continue;
      const current: Record<string, unknown> = { ...(values.get(boneId) ?? { boneId }) };
      const translation = target["transform.position"] ?? target.position;
      const rotation = target["transform.quaternion"] ?? target.quaternion;
      const scale = target["transform.scale"] ?? target.scale;
      if (translation && typeof translation === "object") current.translation = translation;
      if (rotation && typeof rotation === "object") current.rotation = rotation;
      if (scale && typeof scale === "object") current.scale = scale;
      values.set(boneId, current as PoseDelta);
    }
  }
  return [...values.values()].sort((a, b) => a.boneId.localeCompare(b.boneId));
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== "object") cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  const final = parts.at(-1);
  if (final) cursor[final] = structuredClone(value);
}

function resolvedCamera(
  document: CanonicalDesignDocument,
  projection: SceneProjectionResult,
  cameraId: string,
): CameraRecord | undefined {
  const source = document.cameras[cameraId];
  if (!source) return undefined;
  const result = structuredClone(source) as CameraRecord;
  for (const timelineId of projection.viewport.animation?.timelineIds ?? []) {
    const timeline = document.timelines[timelineId];
    if (!timeline) continue;
    const evaluation = evaluateTimeline(timeline, {
      time: projection.viewport.animation?.time ?? 0,
      ...(projection.viewport.animation?.progress !== undefined
        ? { progress: projection.viewport.animation.progress }
        : {}),
      ...(projection.viewport.animation?.active !== undefined ? { active: projection.viewport.animation.active } : {}),
      ...(projection.viewport.animation?.playbackState !== undefined
        ? { playbackState: projection.viewport.animation.playbackState }
        : {}),
      reducedMotion: {
        behavior: projection.viewport.reducedMotion ? "DISABLE" : "PRESERVE",
        durationScale: 1,
      },
      timelineRegistry: document.timelines,
    });
    for (const [path, value] of Object.entries(evaluation.targetValues[cameraId] ?? {})) {
      setPath(result as unknown as Record<string, unknown>, path, value);
    }
  }
  return result;
}

function descendants(projection: SceneProjectionResult, scene: RuntimeNode): RuntimeNode[] {
  const result: RuntimeNode[] = [];
  const stack = [...scene.childIds].reverse();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    const node = projection.nodes.get(id);
    if (!node) continue;
    result.push(node);
    stack.push(...[...node.childIds].reverse());
  }
  return result;
}

export function project3DScene(
  document: CanonicalDesignDocument,
  projection: SceneProjectionResult,
): Scene3DProjectionResult {
  const diagnostics: RuntimeDiagnostic[] = [];
  const nodes = new Map<string, RuntimeNode>();
  const meshes = new Map<string, RuntimeMesh3D>();
  const rigs = new Map<string, RuntimeRig3D>();
  const materials = new Map<string, CanonicalDesignDocument["materials"][string]>();
  const cameras = new Map<string, CameraRecord>();
  const lights = new Map<string, CanonicalDesignDocument["lights"][string]>();
  const lighting = new Map<string, ReturnType<typeof resolveLighting>>();
  const scenes: RuntimeScene3D[] = [];
  for (const sceneNode of [...projection.nodes.values()].filter((node) => node.resolvedNode.type === "SCENE_3D")) {
    const source = sceneNode.resolvedNode;
    if (source.type !== "SCENE_3D") continue;
    const children = descendants(projection, sceneNode).filter((node) =>
      ["GROUP_3D", "MODEL_3D", "MESH_3D", "RIG_3D", "BONE_3D"].includes(node.resolvedNode.type),
    );
    nodes.set(sceneNode.id, sceneNode);
    for (const child of children) nodes.set(child.id, child);
    const sceneBounds: Bounds3D[] = [];
    const sceneMeshIds: string[] = [];
    const materialIds = new Set<string>();
    for (const child of children) {
      if (child.resolvedNode.type !== "RIG_3D") continue;
      const rig = child.resolvedNode;
      const bones = rig.boneIds.flatMap((id) => {
        const candidate = document.nodes[id];
        return candidate?.type === "BONE_3D" ? [candidate] : [];
      });
      const time = projection.viewport.animation?.time ?? 0;
      const deltas = poseDeltasForRig(document, projection, rig.boneIds);
      rigs.set(rig.id, {
        rigId: rig.id,
        boneIds: [...rig.boneIds],
        pose: evaluatePose({
          rig,
          bones,
          deltas,
          time,
          progress: projection.viewport.animation?.progress ?? 0,
          source: deltas.length > 0 ? "ANIMATION" : "REST",
        }),
      });
    }
    for (const child of children) {
      if (child.resolvedNode.type !== "MESH_3D") continue;
      const mesh = child.resolvedNode;
      const worldBounds = mesh.geometry.bounds
        ? transformBounds3D(mesh.geometry.bounds, child.worldTransform.matrix)
        : undefined;
      if (worldBounds) sceneBounds.push(worldBounds);
      const rigState = mesh.skinBinding ? rigs.get(mesh.skinBinding.rigId) : undefined;
      const jointMatrices =
        rigState && mesh.skinBinding
          ? mesh.skinBinding.jointIds.flatMap((jointId) => {
              const evaluated = rigState.pose.bones.find((bone) => bone.boneId === jointId);
              return evaluated ? [evaluated.jointMatrix] : [];
            })
          : [];
      meshes.set(child.id, {
        nodeId: child.id,
        geometry: mesh.geometry,
        materialIds: [...mesh.materialIds],
        ...(mesh.geometry.bounds ? { localBounds: mesh.geometry.bounds } : {}),
        ...(worldBounds ? { worldBounds } : {}),
        ...(mesh.skinBinding && rigState
          ? {
              skinning: {
                classification: "REAL_CPU_AVAILABLE" as const,
                rigId: mesh.skinBinding.rigId,
                jointIds: [...mesh.skinBinding.jointIds],
                jointMatrices,
                maxInfluencesPerVertex: mesh.skinBinding.maxInfluencesPerVertex,
                normalized: mesh.skinBinding.normalized,
              },
            }
          : {}),
      });
      sceneMeshIds.push(child.id);
      for (const materialId of mesh.materialIds) {
        materialIds.add(materialId);
        const material = document.materials[materialId];
        if (material) materials.set(materialId, material);
      }
    }
    const activeCamera = source.activeCameraId
      ? resolvedCamera(document, projection, source.activeCameraId)
      : undefined;
    if (activeCamera) cameras.set(activeCamera.id, activeCamera);
    let resolvedLighting: ReturnType<typeof resolveLighting> | undefined;
    if (source.lightingRigId) {
      const target =
        projection.viewport.category === "MOBILE"
          ? "MOBILE"
          : (projection.viewport.qualityMode ?? source.qualityProfile ?? projection.qualityMode) === "MAXIMUM_FIDELITY"
            ? "OFFLINE"
            : "REALTIME";
      try {
        resolvedLighting = resolveLighting(document, source.id, target);
        lighting.set(source.id, resolvedLighting);
        for (const light of resolvedLighting.lights) lights.set(light.id, light);
        for (const entry of resolvedLighting.diagnostics) {
          diagnostics.push({
            code: "LIGHTING_PROFILE_DIAGNOSTIC",
            severity: entry.severity === "BLOCKING" ? "CRITICAL" : entry.severity,
            message: entry.message,
            entityId: entry.entityId ?? source.id,
            entityType: "SCENE_3D",
            recoverable: entry.recoverable,
          });
        }
      } catch (error) {
        diagnostics.push({
          code: "LIGHTING_RESOLUTION_FAILED",
          severity: "ERROR",
          message: error instanceof Error ? error.message : "Lighting resolution failed.",
          entityId: source.id,
          entityType: "SCENE_3D",
          recoverable: true,
        });
      }
    } else {
      for (const lightId of source.lightIds) {
        const light = document.lights[lightId];
        if (light) lights.set(lightId, light);
      }
    }
    if (source.activeCameraId && !activeCamera) {
      diagnostics.push({
        code: "MISSING_CAMERA",
        severity: "ERROR",
        message: `Scene ${source.id} references missing active camera ${source.activeCameraId}.`,
        entityId: source.id,
        entityType: source.type,
        relatedIds: [source.activeCameraId],
        recoverable: true,
      });
    }
    const bounds = mergeBounds(sceneBounds);
    scenes.push({
      sceneId: source.id,
      rootNodeId: sceneNode.id,
      nodeIds: children.map((node) => node.id),
      meshIds: sceneMeshIds,
      materialIds: [...materialIds].sort(),
      lightIds: resolvedLighting ? resolvedLighting.lights.map((light) => light.id) : [...source.lightIds],
      ...(resolvedLighting ? { lightingRigId: resolvedLighting.rigId, lightingTarget: resolvedLighting.target } : {}),
      ...(activeCamera ? { activeCameraId: activeCamera.id } : {}),
      ...(bounds ? { bounds } : {}),
      qualityMode: projection.viewport.qualityMode ?? source.qualityProfile ?? projection.qualityMode,
    });
  }
  const serializable = {
    version: "1.0.0" as const,
    sourceProjectionFingerprint: projection.fingerprint,
    scenes,
    nodes: [...nodes],
    meshes: [...meshes],
    rigs: [...rigs],
    materials: [...materials],
    cameras: [...cameras],
    lights: [...lights],
    lighting: [...lighting],
    diagnostics,
  };
  return deepFreeze({
    version: "1.0.0",
    sourceProjectionFingerprint: projection.fingerprint,
    scenes,
    nodes: immutableMap(nodes),
    meshes: immutableMap(meshes),
    rigs: immutableMap(rigs),
    materials: immutableMap(materials),
    cameras: immutableMap(cameras),
    lights: immutableMap(lights),
    lighting: immutableMap(lighting),
    diagnostics,
    fingerprint: `sha256:${stableHash(serializable)}`,
    complete: diagnostics.every((entry) => entry.severity !== "ERROR" && entry.severity !== "CRITICAL"),
  });
}
