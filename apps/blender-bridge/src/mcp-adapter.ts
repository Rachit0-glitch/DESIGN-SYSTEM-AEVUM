import type { TransactionCommitResult } from "@aevum/command-engine";
import type { AssetRecord, CanonicalDesignDocument } from "@aevum/document-model";
import {
  McpProtocolError,
  TOOL_SCHEMAS,
  type McpActor,
  type McpRequestEnvelope,
  type McpToolName,
  type WriteToolOutput,
} from "@aevum/mcp-protocol";
import type { BlenderBridgeConfig } from "./config.js";
import { blenderError } from "./errors.js";
import { createBlenderIdentityBindings } from "./identity.js";
import { BlenderOperationSchema, createBlenderJob, type BlenderJob, type BlenderOperation } from "./protocol.js";
import { applyBlenderReconciliation, createBlenderReconciliationProposal } from "./reconciliation.js";
import type { BlenderExecution, BlenderJobRunner } from "./runner.js";

type BlenderToolName = Extract<McpToolName, `blender.${string}`>;

export interface BlenderAssetResolverContext {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly actorId: string;
}

export interface BlenderMcpAdapterOptions {
  readonly runner: BlenderJobRunner;
  readonly config: BlenderBridgeConfig;
  resolveAsset(asset: AssetRecord, context: BlenderAssetResolverContext): Promise<Uint8Array>;
}

export interface BlenderMcpToolAdapter {
  execute(input: {
    readonly tool: BlenderToolName;
    readonly payload: unknown;
    readonly document: CanonicalDesignDocument;
    readonly actor: McpActor;
    readonly request: McpRequestEnvelope;
    readonly timestamp: string;
  }): Promise<{
    readonly data: unknown;
    readonly mutation?: { readonly commit: TransactionCommitResult; readonly sourceDocument: CanonicalDesignDocument };
  }>;
}

function sourceAsset(document: CanonicalDesignDocument, assetId: string): AssetRecord {
  const asset = document.assets[assetId];
  if (!asset || !["GLB", "GLTF"].includes(asset.type) || !asset.mimeType || !asset.byteSize) {
    throw blenderError("BLENDER_INPUT_INVALID", "The Blender source must be a registered GLB or GLTF asset.");
  }
  return asset;
}

function commandActor(actor: McpActor) {
  return {
    id: actor.id,
    type: actor.type === "USER" ? ("USER" as const) : ("MCP_AGENT" as const),
    ...(actor.email ? { displayName: actor.email } : {}),
    provider: actor.authProvider,
  };
}

function operationFor(tool: BlenderToolName, payload: Record<string, unknown>): BlenderOperation | undefined {
  const base = { operationVersion: "1.0.0" };
  switch (tool) {
    case "blender.runtime_info":
      return undefined;
    case "blender.inspect_scene":
      return BlenderOperationSchema.parse({ ...base, kind: "scene.inspect" });
    case "blender.inspect_object":
      return BlenderOperationSchema.parse({ ...base, kind: "object.inspect", objectId: payload.targetId });
    case "blender.inspect_mesh":
      return BlenderOperationSchema.parse({ ...base, kind: "mesh.inspect", objectId: payload.targetId });
    case "blender.inspect_material":
      return BlenderOperationSchema.parse({ ...base, kind: "material.inspect", materialId: payload.targetId });
    case "blender.inspect_camera":
      return BlenderOperationSchema.parse({ ...base, kind: "camera.inspect", cameraId: payload.targetId });
    case "blender.inspect_light":
      return BlenderOperationSchema.parse({ ...base, kind: "light.inspect", lightId: payload.targetId });
    case "blender.update_object_transform":
      return BlenderOperationSchema.parse({
        ...base,
        kind: "object.transform",
        objectId: payload.targetId,
        mode: payload.mode,
        coordinateSpace: payload.coordinateSpace,
        unit: payload.unit,
        ...(payload.translation ? { translation: payload.translation } : {}),
        ...(payload.rotation ? { rotation: payload.rotation } : {}),
        ...(payload.scale ? { scale: payload.scale } : {}),
      });
    case "blender.update_material":
      return BlenderOperationSchema.parse({
        ...base,
        kind: "material.update_pbr",
        materialId: payload.targetId,
        ...(payload.baseColor ? { baseColor: payload.baseColor } : {}),
        ...(payload.metallic !== undefined ? { metallic: payload.metallic } : {}),
        ...(payload.roughness !== undefined ? { roughness: payload.roughness } : {}),
        ...(payload.alpha !== undefined ? { alpha: payload.alpha } : {}),
        ...(payload.emission ? { emission: payload.emission } : {}),
      });
    case "blender.update_camera": {
      const changes = ["position", "rotation", "target", "focalLength", "fieldOfView", "nearClip", "farClip"].filter(
        (key) => payload[key] !== undefined,
      );
      if (payload.activate === true) {
        if (changes.length > 0) {
          throw blenderError(
            "BLENDER_INPUT_INVALID",
            "Camera activation must be submitted separately from camera value edits.",
          );
        }
        return BlenderOperationSchema.parse({ ...base, kind: "camera.activate", cameraId: payload.targetId });
      }
      return BlenderOperationSchema.parse({
        ...base,
        kind: "camera.update",
        cameraId: payload.targetId,
        ...Object.fromEntries(changes.map((key) => [key, payload[key]])),
      });
    }
    case "blender.update_light":
      return BlenderOperationSchema.parse({
        ...base,
        kind: "light.update",
        lightId: payload.targetId,
        ...Object.fromEntries(
          ["position", "rotation", "color", "intensity", "range", "spotSize", "spotBlend"]
            .filter((key) => payload[key] !== undefined)
            .map((key) => [key, payload[key]]),
        ),
      });
    case "blender.duplicate_object":
      return BlenderOperationSchema.parse({
        ...base,
        kind: "object.duplicate",
        objectId: payload.targetId,
        newEntityId: payload.newEntityId,
        parentPolicy: payload.parentPolicy,
      });
    case "blender.delete_object":
      return BlenderOperationSchema.parse({
        ...base,
        kind: "object.delete",
        objectId: payload.targetId,
        childPolicy: payload.childPolicy,
      });
    case "blender.export_scene":
      return BlenderOperationSchema.parse({ ...base, kind: "scene.export_glb" });
  }
}

function assertOperationTarget(document: CanonicalDesignDocument, assetId: string, operation: BlenderOperation): void {
  if ("objectId" in operation) {
    const node = document.nodes[operation.objectId];
    if (!node || node.importProvenance?.sourceAssetId !== assetId) {
      throw blenderError("BLENDER_OBJECT_NOT_FOUND", "The Blender object is not owned by the requested source asset.");
    }
    if (["object.transform", "object.duplicate", "object.delete"].includes(operation.kind) && node.locked) {
      throw blenderError("BLENDER_INPUT_INVALID", "Locked canonical objects cannot be modified through Blender.");
    }
    if (operation.kind === "object.duplicate" && document.nodes[operation.newEntityId]) {
      throw blenderError("BLENDER_INPUT_INVALID", "The requested duplicate identity already exists.");
    }
  }
  if (
    "materialId" in operation &&
    document.materials[operation.materialId]?.importProvenance?.sourceAssetId !== assetId
  ) {
    throw blenderError(
      "BLENDER_MATERIAL_NOT_FOUND",
      "The Blender material is not owned by the requested source asset.",
    );
  }
  if ("cameraId" in operation && document.cameras[operation.cameraId]?.importProvenance?.sourceAssetId !== assetId) {
    throw blenderError("BLENDER_CAMERA_NOT_FOUND", "The Blender camera is not owned by the requested source asset.");
  }
  if ("lightId" in operation && document.lights[operation.lightId]?.importProvenance?.sourceAssetId !== assetId) {
    throw blenderError("BLENDER_LIGHT_NOT_FOUND", "The Blender light is not owned by the requested source asset.");
  }
  if (operation.kind === "object.transform" && !operation.translation && !operation.rotation && !operation.scale) {
    throw blenderError("BLENDER_INPUT_INVALID", "Object transform requires translation, rotation, or scale.");
  }
  if (
    operation.kind === "material.update_pbr" &&
    !operation.baseColor &&
    operation.metallic === undefined &&
    operation.roughness === undefined &&
    operation.alpha === undefined &&
    !operation.emission
  ) {
    throw blenderError("BLENDER_INPUT_INVALID", "Material update requires at least one bounded PBR value.");
  }
  if (
    operation.kind === "camera.update" &&
    !operation.position &&
    !operation.rotation &&
    !operation.target &&
    operation.focalLength === undefined &&
    operation.fieldOfView === undefined &&
    operation.nearClip === undefined &&
    operation.farClip === undefined
  ) {
    throw blenderError("BLENDER_INPUT_INVALID", "Camera update requires at least one bounded value.");
  }
  if (
    operation.kind === "light.update" &&
    !operation.position &&
    !operation.rotation &&
    !operation.color &&
    operation.intensity === undefined &&
    operation.range === undefined &&
    operation.spotSize === undefined &&
    operation.spotBlend === undefined
  ) {
    throw blenderError("BLENDER_INPUT_INVALID", "Light update requires at least one bounded value.");
  }
}

function jobFor(
  document: CanonicalDesignDocument,
  asset: AssetRecord,
  operation: BlenderOperation,
  input: Parameters<BlenderMcpToolAdapter["execute"]>[0],
  config: BlenderBridgeConfig,
): BlenderJob {
  return createBlenderJob({
    workspaceId: input.request.workspaceId ?? "",
    actorId: input.actor.id,
    correlationId: input.request.correlationId ?? input.request.requestId,
    createdAt: input.timestamp,
    inputAsset: {
      assetId: asset.id,
      hash: asset.hash,
      mimeType: asset.mimeType as "model/gltf-binary" | "model/gltf+json",
      byteSize: asset.byteSize ?? 0,
    },
    identityBindings: [...createBlenderIdentityBindings(document, asset.id)],
    operation,
    resourceBudget: {
      maxInputBytes: config.maxFileBytes,
      maxOutputBytes: config.maxOutputBytes,
      maxObjects: config.maxObjects,
      maxMeshes: config.maxMeshes,
      maxMaterials: config.maxMaterials,
      timeoutMs: config.maxJobSeconds * 1_000,
    },
    expectedOutputs: {
      inspection: true,
      glb: !operation.kind.endsWith(".inspect") && operation.kind !== "scene.validate",
    },
  });
}

function executionOutput(execution: BlenderExecution) {
  return {
    stage: "EXECUTED" as const,
    operation: execution.result.operation,
    jobId: execution.result.jobId,
    state: execution.result.state,
    ...(execution.result.data === undefined ? {} : { data: execution.result.data }),
    artifacts: execution.result.artifacts.map(({ id, type, hash, byteSize, mimeType, logicalPath }) => ({
      id,
      type,
      hash,
      byteSize,
      mimeType,
      logicalPath,
    })),
    diagnostics: execution.result.diagnostics,
  };
}

function canonicalOutput(document: CanonicalDesignDocument, commit: TransactionCommitResult): WriteToolOutput {
  return {
    dryRun: false,
    baseVersion: document.documentVersion,
    resultVersion: commit.newDocument.documentVersion,
    transactionId: commit.changeSet.metadata.transactionId,
    commandIds: [...commit.changeSet.metadata.commandIds],
    changeSet: commit.changeSet,
  };
}

export function createBlenderMcpAdapter(options: BlenderMcpAdapterOptions): BlenderMcpToolAdapter {
  return {
    async execute(input) {
      const payload = TOOL_SCHEMAS[input.tool].input.parse(input.payload) as Record<string, unknown>;
      if (input.tool === "blender.runtime_info") {
        const runtime = await options.runner.inspectRuntime();
        return {
          data: {
            protocolVersion: runtime.protocolVersion,
            blenderVersion: runtime.blenderVersion,
            pythonVersion: runtime.pythonVersion,
            platform: runtime.platform,
            compatibility: runtime.compatibility,
            headless: runtime.headless,
            executableFingerprint: runtime.executableFingerprint,
            durationMs: runtime.durationMs,
          },
        };
      }
      const assetId = String(payload.assetId);
      const asset = sourceAsset(input.document, assetId);
      const operation = operationFor(input.tool, payload);
      if (!operation)
        throw blenderError("BLENDER_OPERATION_UNSUPPORTED", "The requested Blender operation is unsupported.");
      assertOperationTarget(input.document, asset.id, operation);
      if ("expectedDocumentVersion" in payload && payload.expectedDocumentVersion !== input.document.documentVersion) {
        throw new McpProtocolError({
          code: "MCP_DOCUMENT_VERSION_CONFLICT",
          message: "The requested document version is stale.",
          recoverable: true,
          retryable: true,
          suggestedAction: "Read the latest document version and retry with a new idempotency key.",
          requestId: input.request.requestId,
          workspaceId: input.request.workspaceId,
          projectId: input.request.projectId,
          documentId: input.document.metadata.id,
          documentVersion: input.document.documentVersion,
        });
      }
      const job = jobFor(input.document, asset, operation, input, options.config);
      const classification = input.tool.startsWith("blender.inspect_") ? "READ" : "WRITE";
      if (input.request.dryRun && classification === "WRITE") {
        return {
          data: {
            dryRun: true,
            stage: "VALIDATED",
            baseVersion: input.document.documentVersion,
            operation: operation.kind,
            manifestFingerprint: job.fingerprint,
            preview: {
              targetId:
                "objectId" in operation
                  ? operation.objectId
                  : "materialId" in operation
                    ? operation.materialId
                    : "cameraId" in operation
                      ? operation.cameraId
                      : "lightId" in operation
                        ? operation.lightId
                        : asset.id,
              operation: operation.kind,
              physicalExecution: false,
            },
          },
        };
      }
      const workspaceId = input.request.workspaceId;
      const projectId = input.request.projectId;
      if (!workspaceId || !projectId)
        throw blenderError("BLENDER_INPUT_INVALID", "Workspace and project scope are required.");
      const bytes = await options.resolveAsset(asset, {
        workspaceId,
        projectId,
        documentId: input.document.metadata.id,
        actorId: input.actor.id,
      });
      const execution = await options.runner.execute(job, bytes);
      if (execution.result.state !== "SUCCEEDED") {
        const diagnostic = execution.result.diagnostics[0];
        throw blenderError(
          diagnostic?.code ?? "BLENDER_PROCESS_FAILED",
          diagnostic?.message ?? "The controlled Blender operation failed.",
          diagnostic?.recoverable ?? false,
        );
      }
      if (classification === "READ") return { data: executionOutput(execution) };
      if (!execution.outputGlb || !execution.result.runtime) {
        throw blenderError("BLENDER_OUTPUT_MISSING", "The Blender write did not produce a reconcilable GLB artifact.");
      }
      const proposal = await createBlenderReconciliationProposal({
        document: input.document,
        job,
        runtime: execution.result.runtime,
        outputGlb: execution.outputGlb,
        actor: commandActor(input.actor),
        timestamp: input.timestamp,
      });
      const commit = applyBlenderReconciliation(input.document, proposal);
      return {
        data: {
          dryRun: false,
          stage: "EXECUTED",
          baseVersion: input.document.documentVersion,
          operation: operation.kind,
          manifestFingerprint: job.fingerprint,
          execution: executionOutput(execution),
          canonical: canonicalOutput(input.document, commit),
          reconciliation: {
            unchangedEntityIds: proposal.unchangedEntityIds,
            modifiedEntityIds: proposal.modifiedEntityIds,
            newEntityIds: proposal.newEntityIds,
            deletedEntityIds: proposal.deletedEntityIds,
            outputAssetId: proposal.outputAsset.id,
            outputAssetHash: proposal.outputAsset.hash,
          },
        },
        mutation: { commit, sourceDocument: input.document },
      };
    },
  };
}
