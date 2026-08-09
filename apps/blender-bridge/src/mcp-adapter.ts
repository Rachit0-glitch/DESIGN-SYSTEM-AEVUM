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
import { estimateTopologyGrowth, validateGrowthEstimate } from "./professional.js";
import { BlenderOperationSchema, createBlenderJob, type BlenderJob, type BlenderOperation } from "./protocol.js";
import { applyBlenderReconciliation, createBlenderReconciliationProposal } from "./reconciliation.js";
import type { BlenderExecution, BlenderJobRunner } from "./runner.js";

type BlenderToolName = Extract<
  McpToolName,
  | `blender.${string}`
  | "three.inspect_topology"
  | "three.inspect_uv"
  | "three.validate_mesh"
  | "three.validate_material"
  | "three.analyze_web_quality"
  | "three.bevel_mesh"
  | "three.unwrap_uv"
  | "three.update_pbr_material"
>;

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
  persistArtifact?(asset: AssetRecord, bytes: Uint8Array, context: BlenderAssetResolverContext): Promise<void>;
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
    case "three.inspect_topology":
      return BlenderOperationSchema.parse({
        ...base,
        kind: "mesh.topology_inspect",
        objectId: payload.targetId,
        profile: payload.profile,
      });
    case "three.inspect_uv":
      return BlenderOperationSchema.parse({ ...base, kind: "uv.inspect", objectId: payload.targetId });
    case "three.validate_mesh":
      return BlenderOperationSchema.parse({
        ...base,
        kind: "mesh.validate",
        objectId: payload.targetId,
        profile: payload.profile,
        requireUv: payload.requireUv,
        requireMaterial: payload.requireMaterial,
      });
    case "three.validate_material":
      return BlenderOperationSchema.parse({ ...base, kind: "material.validate_pbr", materialId: payload.targetId });
    case "three.analyze_web_quality":
      return BlenderOperationSchema.parse({ ...base, kind: "optimization.analyze", profile: payload.profile });
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
    case "three.update_pbr_material":
      return BlenderOperationSchema.parse({
        ...base,
        kind: "material.update_pbr",
        materialId: payload.targetId,
        ...(payload.baseColor ? { baseColor: payload.baseColor } : {}),
        ...(payload.metallic !== undefined ? { metallic: payload.metallic } : {}),
        ...(payload.roughness !== undefined ? { roughness: payload.roughness } : {}),
        ...(payload.alpha !== undefined ? { alpha: payload.alpha } : {}),
        ...(payload.emission ? { emission: payload.emission } : {}),
        ...(payload.normalStrength !== undefined ? { normalStrength: payload.normalStrength } : {}),
      });
    case "three.bevel_mesh":
      return BlenderOperationSchema.parse({
        ...base,
        kind: "mesh.bevel",
        objectId: payload.targetId,
        selection: payload.selection,
        width: payload.width,
        segments: payload.segments,
        profile: payload.profile,
        affect: payload.affect,
      });
    case "three.unwrap_uv":
      return BlenderOperationSchema.parse({
        ...base,
        kind: "uv.unwrap",
        objectId: payload.targetId,
        selection: payload.selection,
        method: payload.method,
        margin: payload.margin,
        packAfter: payload.packAfter,
        rotate: payload.rotate,
        scaleToFit: payload.scaleToFit,
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

const READ_OPERATION_KINDS = new Set<BlenderOperation["kind"]>([
  "scene.inspect",
  "object.inspect",
  "mesh.inspect",
  "mesh.topology_inspect",
  "mesh.validate",
  "uv.inspect",
  "uv.texel_density",
  "uv.udim_inspect",
  "material.inspect",
  "material.validate_pbr",
  "camera.inspect",
  "light.inspect",
  "optimization.analyze",
]);

function selectionCount(operation: BlenderOperation, vertices: number, faces: number): number {
  if (!("selection" in operation)) return faces;
  const selection = operation.selection;
  if ("indices" in selection) return selection.indices.length;
  if (selection.kind === "ALL") return selection.domain === "VERTEX" ? vertices : faces;
  return Math.min(faces, 1_000);
}

function assertProfessionalBudget(
  document: CanonicalDesignDocument,
  operation: BlenderOperation,
  config: BlenderBridgeConfig,
): void {
  if (!("objectId" in operation) || !operation.kind.startsWith("mesh.")) return;
  const object = document.nodes[operation.objectId];
  const mesh = object?.childIds.map((id) => document.nodes[id]).find((node) => node?.type === "MESH_3D");
  if (mesh?.type !== "MESH_3D") return;
  const selectedCount = selectionCount(operation, mesh.topology.vertices, mesh.topology.faces);
  if (selectedCount > config.professional.maxSelectedElements) {
    throw blenderError("MESH_LIMIT_EXCEEDED", "Mesh selection exceeds the configured resource budget.");
  }
  if (operation.kind === "mesh.bevel" && operation.segments > config.professional.maxBevelSegments) {
    throw blenderError("BEVEL_GROWTH_EXCEEDED", "Bevel segments exceed the configured resource budget.");
  }
  if (operation.kind === "mesh.subdivide" && operation.level > config.professional.maxSubdivisionLevel) {
    throw blenderError("SUBDIVISION_GROWTH_EXCEEDED", "Subdivision level exceeds the configured resource budget.");
  }
  if (operation.kind === "mesh.loop_cut" && operation.cutCount > config.professional.maxLoopCuts) {
    throw blenderError("MESH_LIMIT_EXCEEDED", "Loop-cut count exceeds the configured resource budget.");
  }
  const estimate = estimateTopologyGrowth({
    kind: operation.kind,
    vertexCount: mesh.topology.vertices,
    faceCount: mesh.topology.faces,
    selectedCount,
    ...(operation.kind === "mesh.subdivide" ? { subdivisionLevel: operation.level } : {}),
    ...(operation.kind === "mesh.bevel" ? { bevelSegments: operation.segments } : {}),
    ...(operation.kind === "mesh.loop_cut" ? { loopCuts: operation.cutCount } : {}),
  });
  try {
    validateGrowthEstimate(estimate, config.professional);
  } catch {
    throw blenderError("MESH_OPERATION_BUDGET_EXCEEDED", "Predicted topology growth exceeds the job budget.");
  }
}

function assetLineage(document: CanonicalDesignDocument, assetId: string): ReadonlySet<string> {
  const ids = new Set<string>();
  let current: string | undefined = assetId;
  while (current && !ids.has(current)) {
    ids.add(current);
    current = document.assets[current]?.source.originalAssetId;
  }
  return ids;
}

function assertOperationTarget(document: CanonicalDesignDocument, assetId: string, operation: BlenderOperation): void {
  const lineage = assetLineage(document, assetId);
  if ("objectId" in operation) {
    const node = document.nodes[operation.objectId];
    if (!node || !lineage.has(node.importProvenance?.sourceAssetId ?? "")) {
      throw blenderError("BLENDER_OBJECT_NOT_FOUND", "The Blender object is not owned by the requested source asset.");
    }
    if (!READ_OPERATION_KINDS.has(operation.kind) && node.locked) {
      throw blenderError("BLENDER_INPUT_INVALID", "Locked canonical objects cannot be modified through Blender.");
    }
    if (operation.kind === "object.duplicate" && document.nodes[operation.newEntityId]) {
      throw blenderError("BLENDER_INPUT_INVALID", "The requested duplicate identity already exists.");
    }
  }
  if (
    "materialId" in operation &&
    !lineage.has(document.materials[operation.materialId]?.importProvenance?.sourceAssetId ?? "")
  ) {
    throw blenderError(
      "BLENDER_MATERIAL_NOT_FOUND",
      "The Blender material is not owned by the requested source asset.",
    );
  }
  if (
    "cameraId" in operation &&
    !lineage.has(document.cameras[operation.cameraId]?.importProvenance?.sourceAssetId ?? "")
  ) {
    throw blenderError("BLENDER_CAMERA_NOT_FOUND", "The Blender camera is not owned by the requested source asset.");
  }
  if (
    "lightId" in operation &&
    !lineage.has(document.lights[operation.lightId]?.importProvenance?.sourceAssetId ?? "")
  ) {
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
    !operation.emission &&
    operation.normalStrength === undefined
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
      professional: config.professional,
    },
    expectedOutputs: {
      inspection: true,
      glb: !READ_OPERATION_KINDS.has(operation.kind),
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
      assertProfessionalBudget(input.document, operation, options.config);
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
      const classification = READ_OPERATION_KINDS.has(operation.kind) ? "READ" : "WRITE";
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
      if (options.persistArtifact) {
        await options.persistArtifact(proposal.outputAsset, execution.outputGlb, {
          workspaceId,
          projectId,
          documentId: input.document.metadata.id,
          actorId: input.actor.id,
        });
      }
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
