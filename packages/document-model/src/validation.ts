import type { z } from "zod";
import { hasEntityIdPrefix } from "./ids.js";
import {
  CanonicalDesignDocumentSchema,
  CURRENT_MIGRATION_VERSION,
  CURRENT_SCHEMA_VERSION,
  type CanonicalDesignDocument,
  type DesignNode,
} from "./schema.js";

export type DocumentValidationIssueCode =
  | "SCHEMA_INVALID"
  | "VERSION_INVALID"
  | "REGISTRY_KEY_MISMATCH"
  | "DUPLICATE_ID"
  | "NODE_ID_PREFIX_INVALID"
  | "MISSING_PARENT"
  | "MISSING_CHILD"
  | "HIERARCHY_MISMATCH"
  | "CIRCULAR_HIERARCHY"
  | "VALUE_INVALID"
  | "INVALID_REFERENCE";

export interface DocumentValidationIssue {
  readonly code: DocumentValidationIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface DocumentValidationResult {
  readonly success: boolean;
  readonly document?: CanonicalDesignDocument;
  readonly issues: readonly DocumentValidationIssue[];
}

export class DocumentValidationError extends Error {
  public readonly code = "DOCUMENT_VALIDATION_FAILED";
  public readonly recoverable = true;

  public constructor(public readonly issues: readonly DocumentValidationIssue[]) {
    super(`Canonical Design Document validation failed with ${issues.length} issue(s).`);
    this.name = "DocumentValidationError";
  }
}

const expectedNodePrefixes: Record<DesignNode["type"], string> = {
  PAGE: "page",
  FRAME: "frame",
  GROUP: "group",
  TEXT: "text",
  SHAPE: "shape",
  IMAGE: "image",
  VIDEO: "video",
  SVG: "svg",
  VECTOR: "vector",
  CANVAS_LAYER: "canvas",
  WEBGL_LAYER: "webgl",
  COMPONENT: "component",
  COMPONENT_INSTANCE: "component",
  SCENE_3D: "scene",
  GROUP_3D: "group",
  MODEL_3D: "model",
  MESH_3D: "mesh",
  RIG_3D: "rig",
  BONE_3D: "bone",
};

function issue(code: DocumentValidationIssueCode, path: string, message: string): DocumentValidationIssue {
  return { code, path, message };
}

function validateRegistry<T extends { id: string }>(
  registryName: string,
  registry: Record<string, T>,
  seen: Map<string, string>,
  issues: DocumentValidationIssue[],
): void {
  for (const [key, record] of Object.entries(registry)) {
    const path = `${registryName}.${key}`;
    if (key !== record.id) {
      issues.push(issue("REGISTRY_KEY_MISMATCH", path, `Registry key ${key} does not match record ID ${record.id}.`));
    }
    const previous = seen.get(record.id);
    if (previous) {
      issues.push(issue("DUPLICATE_ID", path, `ID ${record.id} is already used at ${previous}.`));
    } else {
      seen.set(record.id, path);
    }
  }
}

function validateHierarchy(document: CanonicalDesignDocument, issues: DocumentValidationIssue[]): void {
  for (const [id, node] of Object.entries(document.nodes)) {
    if (!hasEntityIdPrefix(node.id, expectedNodePrefixes[node.type] as never)) {
      issues.push(
        issue(
          "NODE_ID_PREFIX_INVALID",
          `nodes.${id}.id`,
          `${node.type} requires the ${expectedNodePrefixes[node.type]}_ prefix.`,
        ),
      );
    }
    if (node.parentId) {
      const parent = document.nodes[node.parentId];
      if (!parent) {
        issues.push(issue("MISSING_PARENT", `nodes.${id}.parentId`, `Parent ${node.parentId} does not exist.`));
      } else if (!parent.childIds.includes(id)) {
        issues.push(
          issue(
            "HIERARCHY_MISMATCH",
            `nodes.${id}.parentId`,
            `Parent ${node.parentId} does not list ${id} as a child.`,
          ),
        );
      }
    }
    for (const childId of node.childIds) {
      const child = document.nodes[childId];
      if (!child) {
        issues.push(issue("MISSING_CHILD", `nodes.${id}.childIds`, `Child ${childId} does not exist.`));
      } else if (child.parentId !== id) {
        issues.push(
          issue(
            "HIERARCHY_MISMATCH",
            `nodes.${id}.childIds`,
            `Child ${childId} points to ${child.parentId ?? "no parent"}.`,
          ),
        );
      }
    }
  }

  for (const [index, rootId] of document.rootNodeIds.entries()) {
    const root = document.nodes[rootId];
    if (!root) {
      issues.push(issue("INVALID_REFERENCE", `rootNodeIds.${index}`, `Root node ${rootId} does not exist.`));
    } else if (root.parentId !== null) {
      issues.push(
        issue("HIERARCHY_MISMATCH", `rootNodeIds.${index}`, `Root node ${rootId} has parent ${root.parentId}.`),
      );
    }
  }
  for (const [id, node] of Object.entries(document.nodes)) {
    if (node.parentId === null && !document.rootNodeIds.includes(id)) {
      issues.push(
        issue("HIERARCHY_MISMATCH", `nodes.${id}.parentId`, `Parentless node ${id} is missing from rootNodeIds.`),
      );
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, trail: string[]): void => {
    if (visiting.has(id)) {
      issues.push(issue("CIRCULAR_HIERARCHY", `nodes.${id}`, `Hierarchy cycle: ${[...trail, id].join(" -> ")}.`));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const childId of document.nodes[id]?.childIds ?? []) {
      if (document.nodes[childId]) visit(childId, [...trail, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of Object.keys(document.nodes)) visit(id, []);
}

function validateReferences(document: CanonicalDesignDocument, issues: DocumentValidationIssue[]): void {
  const requireRef = (id: string | undefined, registry: Record<string, unknown>, path: string, kind: string): void => {
    if (id && !registry[id]) issues.push(issue("INVALID_REFERENCE", path, `${kind} ${id} does not exist.`));
  };
  const requireNodeType = (id: string | undefined, type: DesignNode["type"], path: string): void => {
    if (!id) return;
    const node = document.nodes[id];
    if (!node || node.type !== type) issues.push(issue("INVALID_REFERENCE", path, `${id} is not a ${type} node.`));
  };
  const requireAssetType = (
    id: string | undefined,
    types: readonly CanonicalDesignDocument["assets"][string]["type"][],
    path: string,
  ): void => {
    if (!id) return;
    const asset = document.assets[id];
    if (!asset || !types.includes(asset.type)) {
      issues.push(issue("INVALID_REFERENCE", path, `${id} is not a ${types.join("/")} asset.`));
    }
  };
  const boneOwner = new Map<string, string>();
  for (const [rigId, node] of Object.entries(document.nodes)) {
    if (node.type !== "RIG_3D") continue;
    const uniqueBoneIds = new Set(node.boneIds);
    if (uniqueBoneIds.size !== node.boneIds.length) {
      issues.push(
        issue("INVALID_REFERENCE", `nodes.${rigId}.boneIds`, "Rig bone membership must not contain duplicates."),
      );
    }
    if (!uniqueBoneIds.has(node.rootBoneId)) {
      issues.push(
        issue("INVALID_REFERENCE", `nodes.${rigId}.rootBoneId`, "Rig root bone must be included in boneIds."),
      );
    }
    for (const [index, boneId] of node.boneIds.entries()) {
      const bone = document.nodes[boneId];
      if (bone?.type !== "BONE_3D") {
        issues.push(issue("INVALID_REFERENCE", `nodes.${rigId}.boneIds.${index}`, `${boneId} is not a BONE_3D node.`));
        continue;
      }
      const owner = boneOwner.get(boneId);
      if (owner && owner !== rigId) {
        issues.push(
          issue(
            "INVALID_REFERENCE",
            `nodes.${rigId}.boneIds.${index}`,
            `Bone ${boneId} already belongs to rig ${owner}.`,
          ),
        );
      } else {
        boneOwner.set(boneId, rigId);
      }
      const expectedParent = boneId === node.rootBoneId ? rigId : bone.parentId;
      if (boneId === node.rootBoneId && bone.parentId !== rigId) {
        issues.push(
          issue(
            "INVALID_REFERENCE",
            `nodes.${boneId}.parentId`,
            `Root bone must be parented directly to rig ${rigId}.`,
          ),
        );
      } else if (boneId !== node.rootBoneId && (!expectedParent || !uniqueBoneIds.has(expectedParent))) {
        issues.push(issue("INVALID_REFERENCE", `nodes.${boneId}.parentId`, `Bone parent must belong to rig ${rigId}.`));
      }
      if (!Number.isFinite(bone.length) || bone.length <= 0) {
        issues.push(
          issue("INVALID_REFERENCE", `nodes.${boneId}.length`, "Bone rest/bind length must be finite and positive."),
        );
      }
    }
    for (const [index, chain] of node.ikChains.entries()) {
      for (const [field, boneId] of [
        ["rootBoneId", chain.rootBoneId],
        ["endEffectorBoneId", chain.endEffectorBoneId],
      ] as const) {
        if (!uniqueBoneIds.has(boneId)) {
          issues.push(
            issue(
              "INVALID_REFERENCE",
              `nodes.${rigId}.ikChains.${index}.${field}`,
              `IK bone ${boneId} does not belong to this rig.`,
            ),
          );
        }
      }
      requireRef(chain.targetNodeId, document.nodes, `nodes.${rigId}.ikChains.${index}.targetNodeId`, "IK target");
      requireRef(
        chain.poleTargetNodeId,
        document.nodes,
        `nodes.${rigId}.ikChains.${index}.poleTargetNodeId`,
        "IK pole target",
      );
      if (chain.targetNodeId === chain.endEffectorBoneId || chain.poleTargetNodeId === chain.endEffectorBoneId) {
        issues.push(
          issue(
            "INVALID_REFERENCE",
            `nodes.${rigId}.ikChains.${index}`,
            "IK targets must not target the end-effector bone itself.",
          ),
        );
      }
      let cursor: string | null = chain.endEffectorBoneId;
      let traversed = 0;
      while (cursor !== chain.rootBoneId && traversed <= node.boneIds.length) {
        const parentId: string | null = document.nodes[cursor]?.parentId ?? null;
        cursor = parentId && uniqueBoneIds.has(parentId) ? parentId : null;
        traversed += 1;
        if (!cursor) break;
      }
      if (cursor !== chain.rootBoneId || traversed !== chain.chainLength) {
        issues.push(
          issue(
            "INVALID_REFERENCE",
            `nodes.${rigId}.ikChains.${index}.chainLength`,
            "IK chain must be a valid bone ancestry path with an exact chain length.",
          ),
        );
      }
    }
    for (const [index, constraint] of node.constraints.entries()) {
      if (!uniqueBoneIds.has(constraint.targetBoneId)) {
        issues.push(
          issue(
            "INVALID_REFERENCE",
            `nodes.${rigId}.constraints.${index}.targetBoneId`,
            "Constraint target bone must belong to this rig.",
          ),
        );
      }
      if (constraint.sourceBoneId && !uniqueBoneIds.has(constraint.sourceBoneId)) {
        issues.push(
          issue(
            "INVALID_REFERENCE",
            `nodes.${rigId}.constraints.${index}.sourceBoneId`,
            "Constraint source bone must belong to this rig.",
          ),
        );
      }
      requireRef(
        constraint.sourceNodeId,
        document.nodes,
        `nodes.${rigId}.constraints.${index}.sourceNodeId`,
        "Constraint source node",
      );
    }
  }
  for (const [index, pageId] of document.pages.entries()) {
    const page = document.nodes[pageId];
    if (page?.type !== "PAGE")
      issues.push(issue("INVALID_REFERENCE", `pages.${index}`, `${pageId} is not a page node.`));
  }
  requireRef(
    document.settings.defaultViewportId,
    document.settings.viewports,
    "settings.defaultViewportId",
    "Viewport",
  );
  for (const [id, asset] of Object.entries(document.assets)) {
    requireRef(asset.source.originalAssetId, document.assets, `assets.${id}.source.originalAssetId`, "Original asset");
  }
  for (const [id, node] of Object.entries(document.nodes)) {
    for (const maskId of node.transform.maskIds)
      requireRef(maskId, document.nodes, `nodes.${id}.transform.maskIds`, "Mask node");
    for (const [linkIndex, link] of node.sourceLinks.entries()) {
      const reference = document.references[link.referenceId];
      if (!reference) {
        issues.push(
          issue(
            "INVALID_REFERENCE",
            `nodes.${id}.sourceLinks.${linkIndex}.referenceId`,
            `Reference ${link.referenceId} does not exist.`,
          ),
        );
      } else if (link.regionId && !reference.regions.some((region) => region.id === link.regionId)) {
        issues.push(
          issue(
            "INVALID_REFERENCE",
            `nodes.${id}.sourceLinks.${linkIndex}.regionId`,
            `Region ${link.regionId} does not exist in ${link.referenceId}.`,
          ),
        );
      }
    }
    const responsiveEntries = node.responsive
      ? [
          ...Object.entries(node.responsive.breakpoints).map(([key, value]) => [`breakpoints.${key}`, value] as const),
          ...Object.entries(node.responsive.orientations ?? {}).map(
            ([key, value]) => [`orientations.${key}`, value] as const,
          ),
          ...Object.entries(node.responsive.containerQueries ?? {}).map(
            ([key, value]) => [`containerQueries.${key}`, value] as const,
          ),
          ...(node.responsive.reducedMotionOverride
            ? [["reducedMotionOverride", node.responsive.reducedMotionOverride] as const]
            : []),
          ...Object.entries(node.responsive.qualityProfileOverrides ?? {}).map(
            ([key, value]) => [`qualityProfileOverrides.${key}`, value] as const,
          ),
        ]
      : [];
    for (const [overrideKey, override] of responsiveEntries) {
      const path = `nodes.${id}.responsive.${overrideKey}`;
      if (override.childOrder) {
        const canonical = [...node.childIds].sort();
        const proposed = [...override.childOrder].sort();
        if (
          new Set(override.childOrder).size !== override.childOrder.length ||
          canonical.length !== proposed.length ||
          canonical.some((childId, index) => childId !== proposed[index])
        ) {
          issues.push(
            issue(
              "INVALID_REFERENCE",
              `${path}.childOrder`,
              "Responsive childOrder must be an exact permutation of the canonical child IDs.",
            ),
          );
        }
      }
      requireRef(override.assetId, document.assets, `${path}.assetId`, "Responsive asset");
      requireRef(override.activeCameraId, document.cameras, `${path}.activeCameraId`, "Responsive camera");
      requireAssetType(override.textStyle?.fontAssetId, ["FONT"], `${path}.textStyle.fontAssetId`);
      if ((override.textStyle || override.paragraphStyle) && node.type !== "TEXT") {
        issues.push(issue("INVALID_REFERENCE", path, "Typography overrides require a TEXT node."));
      }
      if ((override.crop || override.objectFit) && node.type !== "IMAGE" && node.type !== "VIDEO") {
        issues.push(issue("INVALID_REFERENCE", path, "Crop and fit overrides require an IMAGE or VIDEO node."));
      }
      if (override.activeCameraId && node.type !== "SCENE_3D") {
        issues.push(issue("INVALID_REFERENCE", path, "Camera overrides require a SCENE_3D node."));
      }
    }
    if (node.type === "IMAGE") requireAssetType(node.assetId, ["IMAGE"], `nodes.${id}.assetId`);
    if (node.type === "VIDEO") {
      requireAssetType(node.assetId, ["VIDEO"], `nodes.${id}.assetId`);
      requireAssetType(node.posterAssetId, ["IMAGE"], `nodes.${id}.posterAssetId`);
    }
    if (node.type === "SVG") requireAssetType(node.assetId, ["SVG"], `nodes.${id}.assetId`);
    if (node.type === "CANVAS_LAYER")
      requireRef(node.contentAssetId, document.assets, `nodes.${id}.contentAssetId`, "Asset");
    if (node.type === "WEBGL_LAYER") {
      requireNodeType(node.sceneNodeId, "SCENE_3D", `nodes.${id}.sceneNodeId`);
      requireRef(node.fallbackAssetId, document.assets, `nodes.${id}.fallbackAssetId`, "Fallback asset");
    }
    if (node.type === "COMPONENT" || node.type === "COMPONENT_INSTANCE")
      requireRef(node.componentId, document.components, `nodes.${id}.componentId`, "Component");
    if (node.type === "COMPONENT_INSTANCE" && node.variantId) {
      const component = document.components[node.componentId];
      if (!component?.variants.some((variant) => variant.id === node.variantId)) {
        issues.push(
          issue(
            "INVALID_REFERENCE",
            `nodes.${id}.variantId`,
            `Variant ${node.variantId} does not belong to ${node.componentId}.`,
          ),
        );
      }
    }
    if (node.type === "SCENE_3D") {
      requireRef(node.activeCameraId, document.cameras, `nodes.${id}.activeCameraId`, "Camera");
      requireRef(node.environmentAssetId, document.assets, `nodes.${id}.environmentAssetId`, "Environment asset");
      requireRef(node.environmentId, document.environments, `nodes.${id}.environmentId`, "Environment");
      requireRef(node.lightingRigId, document.lightingRigs, `nodes.${id}.lightingRigId`, "Lighting rig");
      for (const lightId of node.lightIds) requireRef(lightId, document.lights, `nodes.${id}.lightIds`, "Light");
      requireAssetType(node.sourceAssetId, ["GLB", "GLTF"], `nodes.${id}.sourceAssetId`);
    }
    if (node.type === "MODEL_3D") {
      requireRef(node.sourceAssetId, document.assets, `nodes.${id}.sourceAssetId`, "Source asset");
      for (const meshId of node.meshIds) requireNodeType(meshId, "MESH_3D", `nodes.${id}.meshIds`);
      requireNodeType(node.rigId, "RIG_3D", `nodes.${id}.rigId`);
      for (const meshId of node.meshIds) {
        const mesh = document.nodes[meshId];
        if (node.rigId && mesh?.type === "MESH_3D" && mesh.skinBinding && mesh.skinBinding.rigId !== node.rigId) {
          issues.push(
            issue("INVALID_REFERENCE", `nodes.${id}.rigId`, `Model rig does not match skin binding on mesh ${meshId}.`),
          );
        }
      }
    }
    if (node.type === "MESH_3D") {
      requireRef(node.geometryAssetId, document.assets, `nodes.${id}.geometryAssetId`, "Geometry asset");
      requireAssetType(node.geometry.sourceAssetId, ["GLB", "GLTF"], `nodes.${id}.geometry.sourceAssetId`);
      if (node.geometry.sourceAssetId !== node.geometryAssetId) {
        issues.push(
          issue(
            "INVALID_REFERENCE",
            `nodes.${id}.geometry.sourceAssetId`,
            "Geometry metadata must reference the same registered source asset as geometryAssetId.",
          ),
        );
      }
      for (const materialId of node.materialIds)
        requireRef(materialId, document.materials, `nodes.${id}.materialIds`, "Material");
      if (node.skinBinding) {
        const rig = document.nodes[node.skinBinding.rigId];
        if (rig?.type !== "RIG_3D") {
          issues.push(
            issue("INVALID_REFERENCE", `nodes.${id}.skinBinding.rigId`, "Skin binding rig must resolve to RIG_3D."),
          );
        } else {
          const uniqueJoints = new Set(node.skinBinding.jointIds);
          if (uniqueJoints.size !== node.skinBinding.jointIds.length) {
            issues.push(
              issue("INVALID_REFERENCE", `nodes.${id}.skinBinding.jointIds`, "Skin joint IDs must be unique."),
            );
          }
          for (const [index, jointId] of node.skinBinding.jointIds.entries()) {
            if (!rig.boneIds.includes(jointId) || document.nodes[jointId]?.type !== "BONE_3D") {
              issues.push(
                issue(
                  "INVALID_REFERENCE",
                  `nodes.${id}.skinBinding.jointIds.${index}`,
                  `Joint ${jointId} does not belong to rig ${rig.id}.`,
                ),
              );
            }
          }
          const inverseBindCount = node.skinBinding.jointIds.filter(
            (jointId) => document.nodes[jointId]?.type === "BONE_3D" && document.nodes[jointId].inverseBindMatrix,
          ).length;
          if (inverseBindCount !== 0 && inverseBindCount !== node.skinBinding.jointIds.length) {
            issues.push(
              issue(
                "INVALID_REFERENCE",
                `nodes.${id}.skinBinding.jointIds`,
                "Inverse bind matrices must be present for every joint or omitted for every joint.",
              ),
            );
          }
        }
        if (node.skinBinding.vertexCount !== node.geometry.vertexCount) {
          issues.push(
            issue(
              "INVALID_REFERENCE",
              `nodes.${id}.skinBinding.vertexCount`,
              "Skin vertex count must match canonical geometry.",
            ),
          );
        }
        if (node.skinBinding.unweightedVertexCount > node.skinBinding.vertexCount) {
          issues.push(
            issue(
              "INVALID_REFERENCE",
              `nodes.${id}.skinBinding.unweightedVertexCount`,
              "Unweighted vertex count exceeds the skin vertex count.",
            ),
          );
        }
      }
    }
    if (node.type === "TEXT") {
      for (const [runIndex, run] of node.runs.entries())
        requireAssetType(run.style.fontAssetId, ["FONT"], `nodes.${id}.runs.${runIndex}.style.fontAssetId`);
    }
    if (node.importProvenance)
      requireAssetType(node.importProvenance.sourceAssetId, ["GLB", "GLTF"], `nodes.${id}.importProvenance`);
  }
  for (const [id, component] of Object.entries(document.components))
    requireRef(component.rootNodeId, document.nodes, `components.${id}.rootNodeId`, "Root node");
  for (const [id, timeline] of Object.entries(document.timelines)) {
    const animationTargets = {
      ...document.nodes,
      ...document.cameras,
      ...document.lights,
      ...document.environments,
      ...document.materials,
    };
    for (const track of timeline.tracks)
      requireRef(track.targetId, animationTargets, `timelines.${id}.tracks.${track.id}.targetId`, "Animation target");
    requireRef(
      timeline.reducedMotionTimelineId,
      document.timelines,
      `timelines.${id}.reducedMotionTimelineId`,
      "Reduced-motion timeline",
    );
    const tracks = Object.fromEntries(timeline.tracks.map((track) => [track.id, track]));
    for (const clip of timeline.clips) {
      for (const trackId of clip.trackIds)
        requireRef(trackId, tracks, `timelines.${id}.clips.${clip.id}.trackIds`, "Clip track");
    }
  }
  for (const [id, machine] of Object.entries(document.stateMachines)) {
    const states = Object.fromEntries(machine.states.map((state) => [state.id, state]));
    const triggers = Object.fromEntries(machine.triggers.map((trigger) => [trigger.id, trigger]));
    requireRef(machine.initialStateId, states, `stateMachines.${id}.initialStateId`, "Initial state");
    for (const state of machine.states)
      requireRef(state.timelineId, document.timelines, `stateMachines.${id}.states.${state.id}.timelineId`, "Timeline");
    for (const transition of machine.transitions) {
      requireRef(
        transition.fromStateId,
        states,
        `stateMachines.${id}.transitions.${transition.id}.fromStateId`,
        "State",
      );
      requireRef(transition.toStateId, states, `stateMachines.${id}.transitions.${transition.id}.toStateId`, "State");
      requireRef(
        transition.triggerId,
        triggers,
        `stateMachines.${id}.transitions.${transition.id}.triggerId`,
        "Trigger",
      );
    }
  }
  for (const [id, material] of Object.entries(document.materials)) {
    for (const texture of material.textures)
      requireRef(texture.assetId, document.assets, `materials.${id}.textures`, "Texture asset");
    requireRef(material.shader?.sourceAssetId, document.assets, `materials.${id}.shader.sourceAssetId`, "Shader asset");
    if (material.importProvenance)
      requireAssetType(material.importProvenance.sourceAssetId, ["GLB", "GLTF"], `materials.${id}.importProvenance`);
  }
  for (const [id, reference] of Object.entries(document.references)) {
    requireRef(reference.assetId, document.assets, `references.${id}.assetId`, "Reference asset");
    requireRef(reference.viewportId, document.settings.viewports, `references.${id}.viewportId`, "Viewport");
  }
  for (const [id, camera] of Object.entries(document.cameras)) {
    requireRef(camera.targetNodeId, document.nodes, `cameras.${id}.targetNodeId`, "Target node");
    requireRef(
      camera.depthOfField.focusTargetNodeId,
      document.nodes,
      `cameras.${id}.depthOfField.focusTargetNodeId`,
      "Focus target node",
    );
    requireRef(
      camera.matchProvenance?.referenceId,
      document.references,
      `cameras.${id}.matchProvenance.referenceId`,
      "Reference",
    );
    if (camera.farClip <= camera.nearClip) {
      issues.push(issue("VALUE_INVALID", `cameras.${id}.farClip`, "Far clip must exceed near clip."));
    }
    if (camera.projection === "PERSPECTIVE" && !camera.focalLength && !camera.verticalFieldOfView) {
      issues.push(
        issue("VALUE_INVALID", `cameras.${id}`, "Perspective cameras require focalLength or verticalFieldOfView."),
      );
    }
    if (camera.projection === "ORTHOGRAPHIC" && !camera.orthographicSize && !camera.orthographicBounds) {
      issues.push(issue("VALUE_INVALID", `cameras.${id}`, "Orthographic cameras require size or explicit bounds."));
    }
    if (camera.focalLength && camera.verticalFieldOfView) {
      const derived = 2 * Math.atan(camera.sensor.height / (2 * camera.focalLength));
      if (Math.abs(derived - camera.verticalFieldOfView) > 0.001) {
        issues.push(
          issue(
            "VALUE_INVALID",
            `cameras.${id}.verticalFieldOfView`,
            "Vertical field of view conflicts with focal length and sensor height.",
          ),
        );
      }
    }
    if (["LOOK_AT_NODE", "TRACKED_NODE"].includes(camera.targetingMode) && !camera.targetNodeId) {
      issues.push(
        issue("INVALID_REFERENCE", `cameras.${id}.targetNodeId`, `${camera.targetingMode} requires a target node.`),
      );
    }
    if (camera.targetingMode === "LOOK_AT_POINT" && !camera.target) {
      issues.push(issue("INVALID_REFERENCE", `cameras.${id}.target`, "LOOK_AT_POINT requires a target point."));
    }
    if (camera.importProvenance)
      requireAssetType(camera.importProvenance.sourceAssetId, ["GLB", "GLTF"], `cameras.${id}.importProvenance`);
  }
  for (const [id, path] of Object.entries(document.cameraPaths)) {
    requireRef(path.cameraId, document.cameras, `cameraPaths.${id}.cameraId`, "Camera");
    requireRef(path.timelineId, document.timelines, `cameraPaths.${id}.timelineId`, "Timeline");
    requireRef(path.targetNodeId, document.nodes, `cameraPaths.${id}.targetNodeId`, "Path target node");
    if (path.type === "TIMELINE" && !path.timelineId) {
      issues.push(issue("INVALID_REFERENCE", `cameraPaths.${id}.timelineId`, "Timeline paths require a timeline."));
    }
    if (path.type === "ORBIT" && (!path.orbit || (!path.target && !path.targetNodeId))) {
      issues.push(
        issue("INVALID_REFERENCE", `cameraPaths.${id}.orbit`, "Orbit paths require orbit metadata and a target."),
      );
    }
    if (path.type === "DOLLY" && (!path.startPosition || !path.endPosition)) {
      issues.push(issue("INVALID_REFERENCE", `cameraPaths.${id}`, "Dolly paths require start and end positions."));
    }
  }
  for (const [id, shot] of Object.entries(document.cinematicShots)) {
    requireRef(shot.cameraId, document.cameras, `cinematicShots.${id}.cameraId`, "Camera");
    requireRef(shot.timelineId, document.timelines, `cinematicShots.${id}.timelineId`, "Timeline");
    requireRef(shot.cameraPathId, document.cameraPaths, `cinematicShots.${id}.cameraPathId`, "Camera path");
    requireRef(
      shot.composition.subjectNodeId,
      document.nodes,
      `cinematicShots.${id}.composition.subjectNodeId`,
      "Subject",
    );
    requireRef(shot.lightingRigId, document.lightingRigs, `cinematicShots.${id}.lightingRigId`, "Lighting rig");
    if (shot.transitionIn.duration > shot.duration) {
      issues.push(
        issue("VALUE_INVALID", `cinematicShots.${id}.transitionIn.duration`, "Transition cannot exceed shot duration."),
      );
    }
    const path = shot.cameraPathId ? document.cameraPaths[shot.cameraPathId] : undefined;
    if (path && path.cameraId !== shot.cameraId) {
      issues.push(
        issue("INVALID_REFERENCE", `cinematicShots.${id}.cameraPathId`, "Shot path belongs to another camera."),
      );
    }
  }
  for (const [id, sequence] of Object.entries(document.cinematicSequences)) {
    requireNodeType(sequence.sceneId, "SCENE_3D", `cinematicSequences.${id}.sceneId`);
    const shots = sequence.shotIds.flatMap((shotId, index) => {
      const shot = document.cinematicShots[shotId];
      if (!shot) {
        issues.push(
          issue("INVALID_REFERENCE", `cinematicSequences.${id}.shotIds.${index}`, `Shot ${shotId} does not exist.`),
        );
        return [];
      }
      return [shot];
    });
    if (new Set(sequence.shotIds).size !== sequence.shotIds.length) {
      issues.push(issue("DUPLICATE_ID", `cinematicSequences.${id}.shotIds`, "Sequence shot IDs must be unique."));
    }
    const ordered = [...shots].sort(
      (left, right) => left.startTime - right.startTime || left.id.localeCompare(right.id),
    );
    for (let index = 0; index < ordered.length; index += 1) {
      const shot = ordered[index];
      const previous = ordered[index - 1];
      if (!shot) continue;
      if (sequence.shotIds[index] !== shot.id) {
        issues.push(issue("VALUE_INVALID", `cinematicSequences.${id}.shotIds`, "Shots must be ordered by start time."));
        break;
      }
      if (previous && shot.startTime < previous.startTime + previous.duration) {
        issues.push(issue("VALUE_INVALID", `cinematicSequences.${id}.shotIds.${index}`, "Shots must not overlap."));
      }
      if (
        !sequence.allowGaps &&
        previous &&
        Math.abs(shot.startTime - (previous.startTime + previous.duration)) > 1e-9
      ) {
        issues.push(issue("VALUE_INVALID", `cinematicSequences.${id}.shotIds.${index}`, "Sequence contains a gap."));
      }
      if (shot.startTime + shot.duration > sequence.duration + 1e-9) {
        issues.push(issue("VALUE_INVALID", `cinematicSequences.${id}.duration`, "Shot exceeds sequence duration."));
      }
    }
  }
  for (const [id, light] of Object.entries(document.lights)) {
    requireRef(light.targetNodeId, document.nodes, `lights.${id}.targetNodeId`, "Target node");
    requireAssetType(light.assetId, ["HDRI"], `lights.${id}.assetId`);
    if (light.importProvenance)
      requireAssetType(light.importProvenance.sourceAssetId, ["GLB", "GLTF"], `lights.${id}.importProvenance`);
  }
  for (const [id, environment] of Object.entries(document.environments)) {
    requireAssetType(environment.assetId, ["HDRI"], `environments.${id}.assetId`);
    if (environment.fog && environment.fog.endDistance <= environment.fog.startDistance) {
      issues.push(
        issue("VALUE_INVALID", `environments.${id}.fog.endDistance`, "Fog end distance must exceed start distance."),
      );
    }
  }
  for (const [id, rig] of Object.entries(document.lightingRigs)) {
    for (const lightId of rig.lightIds) requireRef(lightId, document.lights, `lightingRigs.${id}.lightIds`, "Light");
    requireRef(rig.environmentId, document.environments, `lightingRigs.${id}.environmentId`, "Environment");
    for (const probeId of rig.reflectionProbeIds)
      requireRef(probeId, document.reflectionProbes, `lightingRigs.${id}.reflectionProbeIds`, "Reflection probe");
    for (const profileId of rig.profileIds)
      requireRef(profileId, document.lightingProfiles, `lightingRigs.${id}.profileIds`, "Lighting profile");
    requireRef(rig.referenceId, document.references, `lightingRigs.${id}.referenceId`, "Reference");
  }
  for (const [id, profile] of Object.entries(document.lightingProfiles)) {
    if (profile.maxShadowLights > profile.maxActiveLights) {
      issues.push(
        issue(
          "VALUE_INVALID",
          `lightingProfiles.${id}.maxShadowLights`,
          "Shadow-light budget cannot exceed active-light budget.",
        ),
      );
    }
  }
  for (const [id, probe] of Object.entries(document.reflectionProbes)) {
    requireRef(probe.assetId, document.assets, `reflectionProbes.${id}.assetId`, "Reflection probe asset");
  }
  for (const [id, bake] of Object.entries(document.lightingBakes)) {
    requireNodeType(bake.sceneId, "SCENE_3D", `lightingBakes.${id}.sceneId`);
    requireRef(bake.lightingRigId, document.lightingRigs, `lightingBakes.${id}.lightingRigId`, "Lighting rig");
    requireRef(bake.profileId, document.lightingProfiles, `lightingBakes.${id}.profileId`, "Lighting profile");
    for (const lightId of bake.sourceLightIds)
      requireRef(lightId, document.lights, `lightingBakes.${id}.sourceLightIds`, "Light");
    requireRef(bake.assetId, document.assets, `lightingBakes.${id}.assetId`, "Lighting bake asset");
  }
  for (const [id, validation] of Object.entries(document.validations)) {
    for (const referenceId of validation.referenceIds)
      requireRef(referenceId, document.references, `validations.${id}.referenceIds`, "Reference");
    for (const assetId of validation.heatmapAssetIds)
      requireRef(assetId, document.assets, `validations.${id}.heatmapAssetIds`, "Heatmap asset");
    requireRef(validation.reportAssetId, document.assets, `validations.${id}.reportAssetId`, "Report asset");
  }
  for (const [id, exportRecord] of Object.entries(document.exports)) {
    for (const artifact of exportRecord.artifacts)
      requireRef(artifact.assetId, document.assets, `exports.${id}.artifacts.${artifact.id}.assetId`, "Artifact asset");
    for (const nodeId of exportRecord.flattenedNodeIds)
      requireRef(nodeId, document.nodes, `exports.${id}.flattenedNodeIds`, "Flattened node");
  }
}

export function validateDocument(input: unknown): DocumentValidationResult {
  const parsed = CanonicalDesignDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((entry: z.core.$ZodIssue) =>
        issue("SCHEMA_INVALID", entry.path.join("."), entry.message),
      ),
    };
  }
  const document = parsed.data;
  const issues: DocumentValidationIssue[] = [];
  if (document.schemaVersion !== CURRENT_SCHEMA_VERSION || document.migrationVersion !== CURRENT_MIGRATION_VERSION) {
    issues.push(
      issue(
        "VERSION_INVALID",
        "schemaVersion",
        `Expected schema ${CURRENT_SCHEMA_VERSION} at migration ${CURRENT_MIGRATION_VERSION}.`,
      ),
    );
  }

  const seen = new Map<string, string>([
    [document.metadata.id, "metadata.id"],
    [document.metadata.projectId, "metadata.projectId"],
  ]);
  validateRegistry("nodes", document.nodes, seen, issues);
  validateRegistry("assets", document.assets, seen, issues);
  validateRegistry("components", document.components, seen, issues);
  validateRegistry("tokens", document.tokens, seen, issues);
  validateRegistry("typography", document.typography, seen, issues);
  validateRegistry("timelines", document.timelines, seen, issues);
  validateRegistry("stateMachines", document.stateMachines, seen, issues);
  validateRegistry("cameras", document.cameras, seen, issues);
  validateRegistry("cameraPaths", document.cameraPaths, seen, issues);
  validateRegistry("cinematicShots", document.cinematicShots, seen, issues);
  validateRegistry("cinematicSequences", document.cinematicSequences, seen, issues);
  validateRegistry("lights", document.lights, seen, issues);
  validateRegistry("environments", document.environments, seen, issues);
  validateRegistry("lightingRigs", document.lightingRigs, seen, issues);
  validateRegistry("lightingProfiles", document.lightingProfiles, seen, issues);
  validateRegistry("reflectionProbes", document.reflectionProbes, seen, issues);
  validateRegistry("lightingBakes", document.lightingBakes, seen, issues);
  validateRegistry("materials", document.materials, seen, issues);
  validateRegistry("references", document.references, seen, issues);
  validateRegistry("validations", document.validations, seen, issues);
  validateRegistry("exports", document.exports, seen, issues);
  validateRegistry("settings.viewports", document.settings.viewports, seen, issues);
  for (const [timelineId, timeline] of Object.entries(document.timelines)) {
    validateRegistry(
      `timelines.${timelineId}.tracks`,
      Object.fromEntries(timeline.tracks.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );
    for (const track of timeline.tracks)
      validateRegistry(
        `timelines.${timelineId}.tracks.${track.id}.keyframes`,
        Object.fromEntries(track.keyframes.map((entry) => [entry.id, entry])),
        seen,
        issues,
      );
    validateRegistry(
      `timelines.${timelineId}.clips`,
      Object.fromEntries(timeline.clips.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );
    validateRegistry(
      `timelines.${timelineId}.markers`,
      Object.fromEntries(timeline.markers.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );
    validateRegistry(
      `timelines.${timelineId}.triggers`,
      Object.fromEntries(timeline.triggers.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );
    validateRegistry(
      `timelines.${timelineId}.events`,
      Object.fromEntries(timeline.events.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );
  }
  for (const [machineId, machine] of Object.entries(document.stateMachines)) {
    validateRegistry(
      `stateMachines.${machineId}.states`,
      Object.fromEntries(machine.states.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );
    validateRegistry(
      `stateMachines.${machineId}.transitions`,
      Object.fromEntries(machine.transitions.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );
    validateRegistry(
      `stateMachines.${machineId}.triggers`,
      Object.fromEntries(machine.triggers.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );
  }
  for (const [componentId, component] of Object.entries(document.components)) {
    validateRegistry(
      `components.${componentId}.variants`,
      Object.fromEntries(component.variants.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );
    validateRegistry(
      `components.${componentId}.slots`,
      Object.fromEntries(component.slots.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );
  }
  for (const [exportId, exportRecord] of Object.entries(document.exports))
    validateRegistry(
      `exports.${exportId}.artifacts`,
      Object.fromEntries(exportRecord.artifacts.map((entry) => [entry.id, entry])),
      seen,
      issues,
    );

  validateHierarchy(document, issues);
  validateReferences(document, issues);
  return issues.length === 0 ? { success: true, document, issues } : { success: false, issues };
}

export function assertValidDocument(input: unknown): CanonicalDesignDocument {
  const result = validateDocument(input);
  if (!result.success || !result.document) throw new DocumentValidationError(result.issues);
  return result.document;
}
