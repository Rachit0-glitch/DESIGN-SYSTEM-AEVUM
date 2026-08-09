import type { CanonicalDesignDocument, DesignNode } from "@aevum/document-model";
import type { RuntimeDependencyEdge, RuntimeDiagnostic, RuntimeReference, RuntimeResolvedReferences } from "./types.js";

function unique(ids: readonly (string | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== undefined))];
}

function reference<T>(id: string, value: T | undefined): RuntimeReference<T> {
  return value === undefined ? { id, resolved: false } : { id, resolved: true, value };
}

function missing(
  diagnostics: RuntimeDiagnostic[],
  code: RuntimeDiagnostic["code"],
  entityId: string,
  entityType: string,
  targetId: string,
  path: string,
): void {
  diagnostics.push({
    code,
    severity: "ERROR",
    message: `${entityType} ${entityId} references missing ${targetId}.`,
    entityId,
    entityType,
    relatedIds: [targetId],
    path,
    recoverable: true,
    suggestedAction: `Register or replace ${targetId}, then project again.`,
  });
}

export function resolveNodeReferences(
  document: CanonicalDesignDocument,
  node: DesignNode,
  runtimeNodeId: string,
  diagnostics: RuntimeDiagnostic[],
  edges: RuntimeDependencyEdge[],
): RuntimeResolvedReferences {
  const assetIds: string[] = [];
  const fontIds: string[] = [];
  const tokenIds: string[] = [];
  const componentIds: string[] = [];
  const materialIds: string[] = [];
  const cameraIds: string[] = [];
  const lightIds: string[] = [];

  switch (node.type) {
    case "IMAGE":
      assetIds.push(node.assetId);
      break;
    case "VIDEO":
      assetIds.push(node.assetId);
      if (node.posterAssetId) assetIds.push(node.posterAssetId);
      break;
    case "SVG":
      if (node.assetId) assetIds.push(node.assetId);
      break;
    case "CANVAS_LAYER":
      if (node.contentAssetId) assetIds.push(node.contentAssetId);
      break;
    case "WEBGL_LAYER":
      if (node.fallbackAssetId) assetIds.push(node.fallbackAssetId);
      break;
    case "TEXT":
      for (const run of node.runs) if (run.style.fontAssetId) fontIds.push(run.style.fontAssetId);
      break;
    case "SHAPE":
      if (node.fillTokenId) tokenIds.push(node.fillTokenId);
      if (node.strokeTokenId) tokenIds.push(node.strokeTokenId);
      break;
    case "COMPONENT":
    case "COMPONENT_INSTANCE":
      componentIds.push(node.componentId);
      break;
    case "SCENE_3D":
      if (node.environmentAssetId) assetIds.push(node.environmentAssetId);
      if (node.activeCameraId) cameraIds.push(node.activeCameraId);
      lightIds.push(...node.lightIds);
      break;
    case "MODEL_3D":
      if (node.sourceAssetId) assetIds.push(node.sourceAssetId);
      break;
    case "MESH_3D":
      assetIds.push(node.geometryAssetId);
      materialIds.push(...node.materialIds);
      break;
    default:
      break;
  }

  const assets = unique(assetIds).map((id) => {
    const value = document.assets[id];
    edges.push({ fromId: runtimeNodeId, toId: id, type: "USES_ASSET" });
    if (!value) missing(diagnostics, "MISSING_ASSET", node.id, node.type, id, `nodes.${node.id}`);
    return reference(id, value);
  });
  const fonts = unique(fontIds).map((id) => {
    const value = document.assets[id];
    edges.push({ fromId: runtimeNodeId, toId: id, type: "USES_FONT" });
    if (!value) missing(diagnostics, "MISSING_ASSET", node.id, node.type, id, `nodes.${node.id}.runs`);
    return reference(id, value);
  });
  const tokens = unique(tokenIds).map((id) => {
    const value = document.tokens[id];
    edges.push({ fromId: runtimeNodeId, toId: id, type: "USES_TOKEN" });
    if (!value) missing(diagnostics, "MISSING_TOKEN", node.id, node.type, id, `nodes.${node.id}`);
    return reference(id, value);
  });
  const components = unique(componentIds).map((id) => {
    const value = document.components[id];
    edges.push({ fromId: runtimeNodeId, toId: id, type: "USES_COMPONENT" });
    if (!value) missing(diagnostics, "MISSING_COMPONENT", node.id, node.type, id, `nodes.${node.id}.componentId`);
    return reference(id, value);
  });
  const timelines = Object.keys(document.timelines)
    .sort()
    .filter((id) => document.timelines[id]?.tracks.some((track) => track.targetId === node.id))
    .map((id) => {
      edges.push({ fromId: runtimeNodeId, toId: id, type: "USES_TIMELINE" });
      return reference(id, document.timelines[id]);
    });
  const materials = unique(materialIds).map((id) => {
    const value = document.materials[id];
    edges.push({ fromId: runtimeNodeId, toId: id, type: "USES_MATERIAL" });
    if (!value) missing(diagnostics, "MISSING_MATERIAL", node.id, node.type, id, `nodes.${node.id}.materialIds`);
    if (value) {
      for (const texture of value.textures) {
        edges.push({ fromId: id, toId: texture.assetId, type: "USES_TEXTURE" });
        if (!document.assets[texture.assetId])
          missing(diagnostics, "MISSING_ASSET", value.id, "MATERIAL", texture.assetId, `materials.${id}.textures`);
      }
    }
    return reference(id, value);
  });
  const cameras = unique(cameraIds).map((id) => {
    const value = document.cameras[id];
    edges.push({ fromId: runtimeNodeId, toId: id, type: "USES_CAMERA" });
    if (!value) missing(diagnostics, "MISSING_CAMERA", node.id, node.type, id, `nodes.${node.id}.activeCameraId`);
    return reference(id, value);
  });
  const lights = unique(lightIds).map((id) => {
    const value = document.lights[id];
    edges.push({ fromId: runtimeNodeId, toId: id, type: "USES_LIGHT" });
    if (!value) missing(diagnostics, "MISSING_LIGHT", node.id, node.type, id, `nodes.${node.id}.lightIds`);
    return reference(id, value);
  });

  return { assets, fonts, tokens, components, timelines, materials, cameras, lights };
}

export function resolveDocumentReferences(
  document: CanonicalDesignDocument,
  diagnostics: RuntimeDiagnostic[],
  edges: RuntimeDependencyEdge[],
): void {
  for (const timelineId of Object.keys(document.timelines).sort()) {
    const timeline = document.timelines[timelineId];
    if (!timeline) continue;
    for (const track of timeline.tracks) {
      const targetsCamera = Boolean(document.cameras[track.targetId]);
      edges.push({
        fromId: timelineId,
        toId: track.targetId,
        type: targetsCamera ? "TARGETS_CAMERA" : "TARGETS_NODE",
      });
      if (!document.nodes[track.targetId] && !targetsCamera)
        missing(
          diagnostics,
          "TIMELINE_TARGET_MISSING",
          timelineId,
          "TIMELINE",
          track.targetId,
          `timelines.${timelineId}`,
        );
      for (let index = 1; index < track.keyframes.length; index += 1) {
        if ((track.keyframes[index - 1]?.time ?? 0) <= (track.keyframes[index]?.time ?? 0)) continue;
        diagnostics.push({
          code: "UNSORTED_KEYFRAMES",
          severity: "WARNING",
          message: `Timeline ${timelineId} track ${track.id} has unsorted keyframes.`,
          entityId: track.id,
          entityType: "TIMELINE_TRACK",
          path: `timelines.${timelineId}.tracks.${track.id}.keyframes`,
          recoverable: true,
          suggestedAction: "Sort canonical keyframes through the Command Engine.",
        });
        break;
      }
    }
  }
  for (const cameraId of Object.keys(document.cameras).sort()) {
    const camera = document.cameras[cameraId];
    if (!camera?.targetNodeId) continue;
    edges.push({ fromId: cameraId, toId: camera.targetNodeId, type: "TARGETS_NODE" });
    if (!document.nodes[camera.targetNodeId])
      missing(diagnostics, "MISSING_NODE", cameraId, "CAMERA", camera.targetNodeId, `cameras.${cameraId}.targetNodeId`);
  }
  for (const lightId of Object.keys(document.lights).sort()) {
    const light = document.lights[lightId];
    if (!light?.targetNodeId) continue;
    edges.push({ fromId: lightId, toId: light.targetNodeId, type: "TARGETS_NODE" });
    if (!document.nodes[light.targetNodeId])
      missing(diagnostics, "MISSING_NODE", lightId, "LIGHT", light.targetNodeId, `lights.${lightId}.targetNodeId`);
  }
}
