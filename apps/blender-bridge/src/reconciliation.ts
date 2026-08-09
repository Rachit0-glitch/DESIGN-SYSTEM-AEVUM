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
