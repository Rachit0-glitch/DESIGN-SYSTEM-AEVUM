import { assetIdFromHash, computeSha256, findAssetByHash } from "@aevum/assets";
import {
  CURRENT_COMMAND_VERSION,
  beginTransaction,
  type Command,
  type TransactionCommitResult,
} from "@aevum/command-engine";
import {
  AssetSchema,
  CameraSchema,
  LightSchema,
  MaterialSchema,
  type CanonicalDesignDocument,
  type DesignNode,
} from "@aevum/document-model";
import { create3DImportProposal } from "@aevum/renderer-3d";
import { buildRigNodes } from "@aevum/rigging";
import { z } from "zod";
import type { BlenderJob, BlenderOperation, BlenderRuntimeInfo } from "./protocol.js";
import { blenderFingerprint, deepFreeze, deterministicBlenderId, stableSerialize } from "./stable.js";

export const BlenderReconciliationProposalSchema = z.strictObject({
  version: z.literal("1.0.0"),
  id: z.string().regex(/^blender-reconciliation:[0-9a-f]{32}$/),
  jobId: z.string().regex(/^blender-job:[0-9a-f]{32}$/),
  sourceAssetId: z.string().min(1),
  outputAsset: AssetSchema,
  unchangedEntityIds: z.array(z.string()),
  modifiedEntityIds: z.array(z.string()),
  newEntityIds: z.array(z.string()),
  deletedEntityIds: z.array(z.string()),
  commands: z.array(z.unknown()),
  diagnostics: z.array(z.string()),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});
export type BlenderReconciliationProposal = z.infer<typeof BlenderReconciliationProposalSchema> & {
  readonly commands: readonly Command[];
};

export interface CreateBlenderReconciliationInput {
  readonly document: CanonicalDesignDocument;
  readonly job: BlenderJob;
  readonly runtime: BlenderRuntimeInfo;
  readonly outputGlb: Uint8Array;
  readonly actor: Command["actor"];
  readonly timestamp: string;
}

function commandBase(input: CreateBlenderReconciliationInput, transactionId: string, index: number) {
  return {
    id: deterministicBlenderId("cmd", { jobId: input.job.id, index }),
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: input.document.metadata.id,
    expectedDocumentVersion: input.document.documentVersion,
    timestamp: input.timestamp,
    actor: input.actor,
    correlationId: input.job.correlationId,
    transactionId,
  } as const;
}

function identity(node: DesignNode): string | undefined {
  const value = node.metadata.customData["aevum.entity_id"];
  return typeof value === "string" ? value : undefined;
}

function subtree(document: CanonicalDesignDocument, rootId: string): string[] {
  const result: string[] = [];
  const visit = (id: string) => {
    const node = document.nodes[id];
    if (!node) return;
    result.push(id);
    for (const child of node.childIds) visit(child);
  };
  visit(rootId);
  return result;
}

function expectedTarget(operation: BlenderOperation): string | undefined {
  if ("objectId" in operation) return operation.objectId;
  if ("materialId" in operation) return operation.materialId;
  if ("cameraId" in operation) return operation.cameraId;
  if ("lightId" in operation) return operation.lightId;
  return undefined;
}

function normalizeTransform(transform: DesignNode["transform"]): DesignNode["transform"] {
  const normalize = (value: unknown): unknown => {
    if (typeof value === "number") return Math.round(value * 1_000_000) / 1_000_000;
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalize(child)]));
    }
    return value;
  };
  return normalize(transform) as DesignNode["transform"];
}

const GEOMETRY_OPERATION_KINDS = new Set<BlenderOperation["kind"]>([
  "mesh.extrude",
  "mesh.inset",
  "mesh.bevel",
  "mesh.loop_cut",
  "mesh.subdivide",
  "mesh.solidify",
  "mesh.mirror",
  "mesh.merge_vertices",
  "mesh.delete_vertices",
  "mesh.delete_edges",
  "mesh.delete_faces",
  "mesh.recalculate_normals",
  "mesh.flip_normals",
  "topology.decimate",
  "topology.remesh",
  "topology.delete_loose",
  "topology.fill_holes",
  "topology.triangulate",
  "topology.tris_to_quads",
  "uv.create_layer",
  "uv.delete_layer",
  "uv.set_active_layer",
  "uv.mark_seam",
  "uv.clear_seams",
  "uv.unwrap",
  "uv.pack",
  "uv.transform",
  "skin.weight_update",
  "skin.weight_normalize",
]);

function directMeshChildren(document: CanonicalDesignDocument, objectId: string): DesignNode[] {
  return (document.nodes[objectId]?.childIds ?? [])
    .map((id) => document.nodes[id])
    .filter((node): node is DesignNode => node?.type === "MESH_3D");
}

function meshDescendants(nodes: readonly DesignNode[], objectId: string): DesignNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const meshes: DesignNode[] = [];
  const visit = (id: string): void => {
    const node = byId.get(id);
    if (!node) return;
    if (node.type === "MESH_3D") meshes.push(node);
    for (const childId of node.childIds) visit(childId);
  };
  visit(objectId);
  return meshes;
}

export async function createBlenderReconciliationProposal(
  input: CreateBlenderReconciliationInput,
): Promise<BlenderReconciliationProposal> {
  const outputHash = computeSha256(input.outputGlb);
  const existingAsset = findAssetByHash(input.document.assets, outputHash);
  const outputAsset =
    existingAsset ??
    AssetSchema.parse({
      id: assetIdFromHash(outputHash),
      type: "GLB",
      name: `Blender output ${input.job.id.slice(-8)}.glb`,
      hash: outputHash,
      source: {
        kind: "DERIVED",
        uri: `blender://${input.job.id}/result.glb`,
        originalAssetId: input.job.inputAsset.assetId,
      },
      mimeType: "model/gltf-binary",
      byteSize: input.outputGlb.byteLength,
      metadata: {
        "aevum.blender": {
          protocolVersion: input.job.protocolVersion,
          jobId: input.job.id,
          blenderVersion: input.runtime.blenderVersion,
          operationFingerprint: blenderFingerprint(input.job.operation),
          sourceAssetHash: input.job.inputAsset.hash,
          outputAssetHash: outputHash,
          correlationId: input.job.correlationId,
          actorId: input.actor.id,
          ...(input.job.operation.kind === "skin.bind" ? { rigId: input.job.operation.rigObjectId } : {}),
        },
      },
    });
  const imported = await create3DImportProposal({
    canonicalDocument: input.document,
    asset: outputAsset,
    bytes: input.outputGlb,
  });
  const transactionId = deterministicBlenderId("tx", {
    jobId: input.job.id,
    documentVersion: input.document.documentVersion,
    outputHash,
  });
  const commands: Command[] = [];
  if (!existingAsset) {
    commands.push({
      ...commandBase(input, transactionId, commands.length),
      type: "asset.register",
      payload: { asset: outputAsset },
    });
  }
  const unchanged = new Set<string>();
  const modified = new Set<string>();
  const added = new Set<string>();
  const deleted = new Set<string>();
  const operation = input.job.operation;

  if (operation.kind === "object.transform") {
    const candidate = imported.nodes.find((node) => identity(node) === operation.objectId);
    const current = input.document.nodes[operation.objectId];
    if (!candidate || !current) throw new Error("Blender object identity could not be reconciled.");
    const transform = normalizeTransform(candidate.transform);
    if (stableSerialize(current.transform) === stableSerialize(transform)) unchanged.add(current.id);
    else {
      modified.add(current.id);
      commands.push({
        ...commandBase(input, transactionId, commands.length),
        type: "node.update",
        payload: { nodeId: current.id, changes: { transform } },
      });
    }
  } else if (operation.kind === "material.update_pbr") {
    const current = input.document.materials[operation.materialId];
    const candidate = imported.materials.find((value) => value.name === current?.name);
    if (!current || !candidate) throw new Error("Blender material identity could not be reconciled.");
    const material = MaterialSchema.parse({ ...candidate, id: current.id, importProvenance: current.importProvenance });
    modified.add(current.id);
    commands.push({
      ...commandBase(input, transactionId, commands.length),
      type: "material.update",
      payload: { material },
    });
  } else if (GEOMETRY_OPERATION_KINDS.has(operation.kind) && "objectId" in operation) {
    const currentObject = input.document.nodes[operation.objectId];
    const candidateObject = imported.nodes.find((node) => identity(node) === operation.objectId);
    if (!currentObject || !candidateObject) throw new Error("Blender mesh identity could not be reconciled.");
    const currentMeshes = directMeshChildren(input.document, currentObject.id);
    const candidateMeshes = operation.kind.startsWith("skin.weight_")
      ? (() => {
          const descendants = meshDescendants(imported.nodes, candidateObject.id);
          return descendants.length > 0
            ? descendants
            : imported.nodes.filter((node): node is DesignNode => node.type === "MESH_3D" && Boolean(node.skinBinding));
        })()
      : candidateObject.childIds
          .map((id) => imported.nodes.find((node) => node.id === id))
          .filter((node): node is DesignNode => node?.type === "MESH_3D");
    if (currentMeshes.length < 1 || candidateMeshes.length < 1) {
      throw new Error("Phase 16 topology reconciliation requires one canonical primitive on the edited object.");
    }
    const currentMesh = currentMeshes[0];
    const candidateMesh = operation.kind.startsWith("skin.weight_")
      ? (candidateMeshes.find((candidate) => candidate.type === "MESH_3D" && candidate.skinBinding) ??
        candidateMeshes[0])
      : candidateMeshes[0];
    if (currentMesh?.type !== "MESH_3D" || candidateMesh?.type !== "MESH_3D") {
      throw new Error("Blender mesh reconciliation candidate is invalid.");
    }
    modified.add(currentObject.id);
    modified.add(currentMesh.id);
    commands.push({
      ...commandBase(input, transactionId, commands.length),
      type: "node.update",
      payload: {
        nodeId: currentMesh.id,
        changes: {
          geometryAssetId: outputAsset.id,
          geometry: candidateMesh.geometry,
          topology: candidateMesh.topology,
        },
      },
    });
  } else if (operation.kind === "camera.update") {
    const current = input.document.cameras[operation.cameraId];
    const candidate = imported.cameras.find((value) => value.name === current?.name);
    if (!current || !candidate) throw new Error("Blender camera identity could not be reconciled.");
    const camera = CameraSchema.parse({ ...candidate, id: current.id, importProvenance: current.importProvenance });
    modified.add(current.id);
    commands.push({
      ...commandBase(input, transactionId, commands.length),
      type: "camera.update",
      payload: { camera },
    });
  } else if (operation.kind === "camera.activate") {
    const scene = Object.values(input.document.nodes).find(
      (node) => node.type === "SCENE_3D" && node.sourceAssetId === input.job.inputAsset.assetId,
    );
    if (!scene || !input.document.cameras[operation.cameraId]) {
      throw new Error("Blender active camera could not be reconciled.");
    }
    modified.add(scene.id);
    commands.push({
      ...commandBase(input, transactionId, commands.length),
      type: "node.update",
      payload: { nodeId: scene.id, changes: { activeCameraId: operation.cameraId } },
    });
  } else if (operation.kind === "light.update") {
    const current = input.document.lights[operation.lightId];
    const candidate = imported.lights.find((value) => value.name === current?.name);
    if (!current || !candidate) throw new Error("Blender light identity could not be reconciled.");
    const light = LightSchema.parse({ ...candidate, id: current.id, importProvenance: current.importProvenance });
    modified.add(current.id);
    commands.push({ ...commandBase(input, transactionId, commands.length), type: "light.update", payload: { light } });
  } else if (operation.kind === "object.delete") {
    if (!input.document.nodes[operation.objectId]) throw new Error("Deleted Blender object is not canonical.");
    const removedIds = new Set(subtree(input.document, operation.objectId));
    for (const timeline of Object.values(input.document.timelines)) {
      if (timeline.tracks.some((track) => removedIds.has(track.targetId))) {
        throw new Error("Blender deletion would invalidate a canonical animation target.");
      }
    }
    for (const model of Object.values(input.document.nodes)) {
      if (model.type !== "MODEL_3D" || !model.meshIds.some((meshId) => removedIds.has(meshId))) continue;
      commands.push({
        ...commandBase(input, transactionId, commands.length),
        type: "node.update",
        payload: { nodeId: model.id, changes: { meshIds: model.meshIds.filter((meshId) => !removedIds.has(meshId)) } },
      });
      modified.add(model.id);
    }
    for (const id of removedIds) deleted.add(id);
    commands.push({
      ...commandBase(input, transactionId, commands.length),
      type: "node.delete",
      payload: { nodeId: operation.objectId },
    });
  } else if (operation.kind === "object.duplicate") {
    const sourceIds = subtree(input.document, operation.objectId);
    const idMap = Object.fromEntries(
      sourceIds.map((sourceId, index) => [
        sourceId,
        index === 0
          ? operation.newEntityId
          : deterministicBlenderId(sourceId.split("_")[0] ?? "node", { jobId: input.job.id, sourceId }),
      ]),
    );
    for (const id of Object.values(idMap)) added.add(id);
    const source = input.document.nodes[operation.objectId];
    if (!source) throw new Error("Duplicated Blender object is not canonical.");
    const parentId = operation.parentPolicy === "SAME_PARENT" ? source.parentId : null;
    const index = parentId ? (input.document.nodes[parentId]?.childIds.length ?? 0) : input.document.rootNodeIds.length;
    commands.push({
      ...commandBase(input, transactionId, commands.length),
      type: "node.duplicate",
      payload: { sourceNodeId: source.id, parentId, index, idMap },
    });
  } else if (operation.kind === "rig.create") {
    const parentNode = input.document.nodes[operation.objectId];
    if (!parentNode) throw new Error("Blender rig target object is not canonical.");
    // Blender successfully constructing the armature (a real hierarchy/length validity proof in
    // real 3D software) is the gate for this write, but the canonical nodes are built directly
    // from the operation's own bone specs via the already-tested @aevum/rigging construction path
    // — not re-parsed from the exported GLB. glTF only marks nodes as skin "joints" once an actual
    // skin references them, which does not exist yet immediately after rig.create alone (skin.bind
    // is a separate step), so there is nothing meaningful to re-parse at this point.
    const built = buildRigNodes({
      parentId: parentNode.id,
      rigName: operation.name,
      bones: operation.bones,
      rigMethod: "MANUAL",
      scope: { jobId: input.job.id },
    });
    const rigFingerprint = blenderFingerprint(operation);
    const rigNode = {
      ...built.rig,
      metadata: {
        ...built.rig.metadata,
        customData: { ...built.rig.metadata.customData, "aevum.rig_fingerprint": rigFingerprint },
      },
    };
    commands.push({
      ...commandBase(input, transactionId, commands.length),
      type: "rig.create",
      payload: { rig: rigNode, bones: [...built.bones] },
    });
    added.add(built.rig.id);
    for (const bone of built.bones) {
      added.add(bone.id);
    }
  } else if (operation.kind === "skin.bind") {
    const currentObject = input.document.nodes[operation.objectId];
    const rig = input.document.nodes[operation.rigObjectId];
    if (!currentObject || rig?.type !== "RIG_3D") throw new Error("Blender skin target or rig is not canonical.");
    const candidateObject = imported.nodes.find((node) => identity(node) === operation.objectId);
    const currentMeshes = directMeshChildren(input.document, currentObject.id);
    const candidateMeshes = candidateObject ? meshDescendants(imported.nodes, candidateObject.id) : [];
    if (currentMeshes.length === 0 || candidateMeshes.length === 0) {
      throw new Error("Blender did not return canonical mesh descendants for skin reconciliation.");
    }
    let inverseBindUpdatesAdded = false;
    for (const currentMesh of currentMeshes) {
      if (currentMesh.type !== "MESH_3D") continue;
      const candidateMesh = candidateMeshes.find(
        (candidate) =>
          candidate.type === "MESH_3D" &&
          candidate.geometry.sourcePrimitiveIndex === currentMesh.geometry.sourcePrimitiveIndex,
      );
      if (candidateMesh?.type !== "MESH_3D" || !candidateMesh.skinBinding) {
        throw new Error("Blender did not produce reconcilable skin data for every canonical primitive.");
      }
      if (!inverseBindUpdatesAdded) {
        const candidateBones = candidateMesh.skinBinding.jointIds.map((id) =>
          imported.nodes.find((node) => node.id === id),
        );
        const matrices = candidateBones.map((bone) => (bone?.type === "BONE_3D" ? bone.inverseBindMatrix : undefined));
        if (matrices.some((matrix) => matrix !== undefined) && matrices.some((matrix) => matrix === undefined)) {
          throw new Error("Blender exported an incomplete inverse-bind matrix set.");
        }
        if (matrices.every((matrix) => matrix !== undefined) && matrices.length === rig.boneIds.length) {
          for (const [index, boneId] of rig.boneIds.entries()) {
            commands.push({
              ...commandBase(input, transactionId, commands.length),
              type: "node.update",
              payload: { nodeId: boneId, changes: { inverseBindMatrix: matrices[index] } },
            });
            modified.add(boneId);
          }
        }
        inverseBindUpdatesAdded = true;
      }
      modified.add(currentMesh.id);
      commands.push({
        ...commandBase(input, transactionId, commands.length),
        type: "node.update",
        payload: {
          nodeId: currentMesh.id,
          changes: {
            geometryAssetId: outputAsset.id,
            geometry: candidateMesh.geometry,
            topology: candidateMesh.topology,
            skinBinding: {
              ...candidateMesh.skinBinding,
              rigId: rig.id,
              jointIds: rig.boneIds,
              weightMethod: "AUTOMATIC_HEURISTIC",
            },
          },
        },
      });
    }
  }

  for (const binding of input.job.identityBindings) {
    if (binding.entityId !== expectedTarget(operation) && input.document.nodes[binding.entityId])
      unchanged.add(binding.entityId);
  }
  const content = {
    version: "1.0.0" as const,
    jobId: input.job.id,
    sourceAssetId: input.job.inputAsset.assetId,
    outputAsset,
    unchangedEntityIds: [...unchanged].sort(),
    modifiedEntityIds: [...modified].sort(),
    newEntityIds: [...added].sort(),
    deletedEntityIds: [...deleted].sort(),
    commands,
    diagnostics: [],
  };
  const fingerprint = blenderFingerprint(content);
  return deepFreeze(
    BlenderReconciliationProposalSchema.parse({
      ...content,
      id: `blender-reconciliation:${fingerprint.slice(7, 39)}`,
      fingerprint,
    }) as BlenderReconciliationProposal,
  );
}

function executeProposal(
  document: CanonicalDesignDocument,
  proposal: BlenderReconciliationProposal,
): TransactionCommitResult {
  const first = proposal.commands[0];
  if (!first) throw new Error("Blender reconciliation contains no canonical changes.");
  let transaction = beginTransaction(document, { transactionId: first.transactionId });
  for (const command of proposal.commands) transaction = transaction.execute(command);
  return transaction.commit();
}

export function dryRunBlenderReconciliation(
  document: CanonicalDesignDocument,
  proposal: BlenderReconciliationProposal,
): TransactionCommitResult {
  return executeProposal(document, proposal);
}

export function applyBlenderReconciliation(
  document: CanonicalDesignDocument,
  proposal: BlenderReconciliationProposal,
): TransactionCommitResult {
  return executeProposal(document, proposal);
}
