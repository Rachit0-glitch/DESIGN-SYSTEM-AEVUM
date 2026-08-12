import type { Scene3DProjectionResult } from "@aevum/scene-runtime";
import { deepFreeze, threeFingerprint } from "./stable.js";
import {
  THREE_FOUNDATION_VERSION,
  ThreeRenderOperationSchema,
  ThreeRenderPlanSchema,
  type ThreeRenderOperation,
  type ThreeRenderPlan,
} from "./types.js";

export function create3DRenderPlan(projection: Scene3DProjectionResult, sceneId?: string): ThreeRenderPlan {
  const scene = sceneId
    ? projection.scenes.find((value) => value.sceneId === sceneId)
    : [...projection.scenes].sort((left, right) => left.sceneId.localeCompare(right.sceneId))[0];
  if (!scene) throw new Error("A projected 3D scene is required to create a render plan.");
  const operations: ThreeRenderOperation[] = [];
  const push = (
    kind: ThreeRenderOperation["kind"],
    entityId: string,
    dependencies: readonly string[],
    payload: Record<string, unknown>,
  ): string => {
    const index = operations.length;
    const content = { index, kind, entityId, dependencies: [...dependencies], payload };
    const id = `three-op:${threeFingerprint(content).slice(7, 39)}`;
    operations.push(ThreeRenderOperationSchema.parse({ id, ...content }));
    return id;
  };
  const beginId = push("SCENE_BEGIN", scene.sceneId, [], {
    qualityMode: scene.qualityMode,
    bounds: scene.bounds ?? null,
  });
  let cameraId = beginId;
  if (scene.activeCameraId) {
    const camera = projection.cameras.get(scene.activeCameraId);
    const state = projection.cameraStates.get(scene.activeCameraId);
    if (camera) {
      cameraId = push("CAMERA_BIND", camera.id, [beginId], { cameraId: camera.id });
      const transformId = push("CAMERA_TRANSFORM", camera.id, [cameraId], {
        transform: camera.transform,
        target: state?.target ?? null,
      });
      const projectionId = push("CAMERA_PROJECTION", camera.id, [transformId], {
        projection: camera.projection,
        aspectRatio: camera.aspectRatio ?? null,
        orthographicSize: camera.orthographicSize ?? null,
        orthographicBounds: camera.orthographicBounds ?? null,
      });
      const lensId = push("CAMERA_LENS", camera.id, [projectionId], {
        focalLength: camera.focalLength ?? null,
        verticalFieldOfView: state?.effectiveVerticalFieldOfView ?? camera.verticalFieldOfView ?? null,
        sensor: camera.sensor,
        lensShift: camera.lensShift,
        anamorphicRatio: camera.anamorphicRatio,
        nearClip: camera.nearClip,
        farClip: camera.farClip,
      });
      cameraId = push("CAMERA_DOF", camera.id, [lensId], {
        depthOfField: camera.depthOfField,
        focusDistance: state?.focusDistance ?? camera.depthOfField.focusDistance,
      });
      if (scene.activeShotId)
        cameraId = push("SHOT_ACTIVATE", scene.activeShotId, [cameraId], {
          sequenceId: scene.cinematicSequenceId ?? null,
          cameraId: camera.id,
          transition: state?.transition ?? { type: "CUT", progress: 1 },
          localTime: state?.localTime ?? 0,
        });
    }
  }
  const lightOperations = scene.lightIds
    .map((lightId) => projection.lights.get(lightId))
    .filter((light) => light !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((light) => push("LIGHT_BIND", light.id, [beginId], { light }));
  const resolvedLighting = projection.lighting.get(scene.sceneId);
  const lightingProfileId = resolvedLighting
    ? push("LIGHTING_PROFILE_BIND", resolvedLighting.profile.id, [beginId], {
        target: resolvedLighting.target,
        profile: resolvedLighting.profile,
        shadowLightIds: resolvedLighting.shadowLightIds,
      })
    : beginId;
  const environmentId = resolvedLighting?.environment
    ? push("ENVIRONMENT_BIND", resolvedLighting.environment.id, [lightingProfileId], {
        environment: resolvedLighting.environment,
      })
    : lightingProfileId;
  const reflectionOperations = (resolvedLighting?.reflectionProbes ?? []).map((probe) =>
    push("REFLECTION_PROBE_BIND", probe.id, [environmentId], { probe }),
  );
  for (const nodeId of scene.nodeIds) {
    const node = projection.nodes.get(nodeId);
    if (!node?.visible) continue;
    const transformId = push("NODE_TRANSFORM", node.id, [beginId], {
      parentId: node.parentId ?? null,
      matrix: node.worldTransform.matrix,
      renderOrder: node.traversalIndex,
    });
    const mesh = projection.meshes.get(node.id);
    if (!mesh) continue;
    const meshId = push("MESH_BIND", mesh.nodeId, [transformId], { geometry: mesh.geometry });
    const skinId = mesh.skinning
      ? push("SKIN_BIND", mesh.nodeId, [meshId], {
          classification: mesh.skinning.classification,
          rigId: mesh.skinning.rigId,
          jointIds: mesh.skinning.jointIds,
          jointMatrices: mesh.skinning.jointMatrices,
          maxInfluencesPerVertex: mesh.skinning.maxInfluencesPerVertex,
          normalized: mesh.skinning.normalized,
        })
      : meshId;
    const materialOperations = mesh.materialIds
      .map((materialId) => projection.materials.get(materialId))
      .filter((material) => material !== undefined)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((material) => push("MATERIAL_BIND", material.id, [meshId], { material }));
    push(
      "DRAW_PRIMITIVE",
      mesh.nodeId,
      [
        meshId,
        skinId,
        ...materialOperations,
        cameraId,
        lightingProfileId,
        environmentId,
        ...reflectionOperations,
        ...lightOperations,
      ],
      {
        sourceAssetId: mesh.geometry.sourceAssetId,
        sourceMeshIndex: mesh.geometry.sourceMeshIndex,
        sourcePrimitiveIndex: mesh.geometry.sourcePrimitiveIndex,
        primitiveMode: mesh.geometry.primitiveMode,
        vertexCount: mesh.geometry.vertexCount,
        indexCount: mesh.geometry.indexCount,
      },
    );
  }
  const drawIds = operations
    .filter((operation) => operation.kind === "DRAW_PRIMITIVE")
    .map((operation) => operation.id);
  push("SCENE_END", scene.sceneId, drawIds.length > 0 ? drawIds : [beginId], {});
  const body = {
    version: THREE_FOUNDATION_VERSION,
    projectionFingerprint: projection.fingerprint,
    sceneId: scene.sceneId,
    ...(scene.activeCameraId ? { activeCameraId: scene.activeCameraId } : {}),
    operations,
    diagnostics: [],
  };
  return deepFreeze(ThreeRenderPlanSchema.parse({ ...body, fingerprint: threeFingerprint(body) }));
}
