import {
  beginTransaction,
  CURRENT_COMMAND_VERSION,
  createCommandId,
  createTransactionId,
  dryRunCommand,
  executeCommand,
  type Command,
} from "@aevum/command-engine";
import { evaluateCamera, validateCinematics } from "@aevum/camera-cinematics";
import {
  CURRENT_SCHEMA_VERSION,
  type AssetRecord,
  type CanonicalDesignDocument,
  type DesignNode,
} from "@aevum/document-model";
import { prioritizeFidelityIssues, resolveFidelityProfile } from "@aevum/fidelity";
import {
  MCP_PROTOCOL_VERSION,
  MCP_TOOL_VERSION,
  McpProtocolError,
  TOOL_SCHEMAS,
  type McpErrorCode,
  type McpPermission,
  type McpToolName,
} from "@aevum/mcp-protocol";
import {
  LOCAL_BASELINE_PROVIDER_VERSION,
  registerCandidateAsset,
  runReconstructionSession,
} from "@aevum/geometry-reconstruction";
import { analyzeMultiView, createMultiViewTask } from "@aevum/multiview-reconstruction";
import { analyzeReferenceLighting, resolveLighting, validateLighting } from "@aevum/lighting";
import { compile3DImportTransaction, create3DImportProposal, create3DRenderPlan } from "@aevum/renderer-3d";
import { createRuntimeViewport, project3DScene, projectScene, type RuntimeViewport } from "@aevum/scene-runtime";
import {
  createHumanoidSemanticMapping,
  evaluatePose,
  retargetPose,
  type PoseDelta,
  type RetargetMapping,
} from "@aevum/rigging";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { assetIdFromHash, computeSha256, createDerivative, findAssetByHash, registerAsset } from "@aevum/assets";
import {
  createAssetRegistryResolver,
  createReconstructionEngine,
  RECONSTRUCTION_MANIFEST_KEY,
  type ReconstructionManifest,
  type ReconstructionManifestRegion,
} from "@aevum/reconstruction";
import { buildManifestFromImage } from "@aevum/reconstruction-vision";
import { VisionProviderError, visionAnalysisToManifest, type VisionProvider } from "@aevum/vision";

// A stable, explicit path (not tesseract.js's cwd-relative default) so the OCR trained-data file
// downloads once per deployment instead of once per request, and never lands in the repo/cwd.
function reconstructionVisionOcrCacheDir(): string {
  return join(tmpdir(), "aevum-reconstruction-vision-ocr-cache");
}
import type {
  AssetBytesResolver,
  AssetStorageAdapter,
  BlenderToolAdapter,
  McpServerRuntimeConfig,
  McpToolDefinition,
  McpToolRegistry,
  ToolExecutionContext,
} from "./registry.js";

function fail(context: ToolExecutionContext, code: McpErrorCode, message: string, suggestedAction?: string): never {
  throw new McpProtocolError({
    code,
    message,
    recoverable: code !== "MCP_INTERNAL_ERROR",
    retryable: ["MCP_TIMEOUT", "MCP_RATE_LIMITED", "MCP_DOCUMENT_VERSION_CONFLICT"].includes(code),
    ...(suggestedAction ? { suggestedAction } : {}),
    requestId: context.request.requestId,
    ...(context.request.workspaceId ? { workspaceId: context.request.workspaceId } : {}),
    ...(context.request.projectId ? { projectId: context.request.projectId } : {}),
    ...(context.request.documentId ? { documentId: context.request.documentId } : {}),
  });
}

function requireScope(context: ToolExecutionContext): { workspaceId: string; projectId: string } {
  const workspaceId = context.request.workspaceId;
  const projectId = context.request.projectId;
  if (!workspaceId || !projectId) fail(context, "MCP_INPUT_INVALID", "workspaceId and projectId are required.");
  return { workspaceId, projectId };
}

async function currentDocument(context: ToolExecutionContext): Promise<CanonicalDesignDocument> {
  const { workspaceId, projectId } = requireScope(context);
  const document = await context.repository.getCurrentDocument(workspaceId, projectId);
  if (!document) fail(context, "MCP_DOCUMENT_NOT_FOUND", "The requested canonical document does not exist.");
  if (context.request.documentId && context.request.documentId !== document.metadata.id) {
    fail(context, "MCP_DOCUMENT_NOT_FOUND", "The requested document is not current for this project.");
  }
  return document;
}

function documentSummary(document: CanonicalDesignDocument) {
  return {
    id: document.metadata.id,
    projectId: document.metadata.projectId,
    name: document.metadata.name,
    schemaVersion: document.schemaVersion,
    documentVersion: document.documentVersion,
    rootNodeIds: document.rootNodeIds,
    nodeCount: Object.keys(document.nodes).length,
    assetCount: Object.keys(document.assets).length,
    timelineCount: Object.keys(document.timelines).length,
    updatedAt: document.metadata.updatedAt,
    updatedBy: document.metadata.updatedBy.id,
  };
}

function collectSubtree(document: CanonicalDesignDocument, rootId: string): DesignNode[] {
  const result: DesignNode[] = [];
  const visit = (id: string) => {
    const node = document.nodes[id];
    if (!node) return;
    result.push(node);
    for (const childId of node.childIds) visit(childId);
  };
  visit(rootId);
  return result;
}

function hierarchy(document: CanonicalDesignDocument, rootId: string | undefined, maxDepth: number) {
  const roots = rootId ? [rootId] : document.rootNodeIds;
  const entries: Array<{
    id: string;
    parentId: string | null;
    childIds: string[];
    type: string;
    name: string;
    depth: number;
    locked: boolean;
    visible: boolean;
  }> = [];
  const visit = (id: string, depth: number) => {
    const node = document.nodes[id];
    if (!node || depth > maxDepth) return;
    entries.push({
      id: node.id,
      parentId: node.parentId,
      childIds: node.childIds,
      type: node.type,
      name: node.name,
      depth,
      locked: node.locked,
      visible: node.visible,
    });
    for (const childId of node.childIds) visit(childId, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  return { rootIds: roots, nodes: entries };
}

function actorForCommand(context: ToolExecutionContext) {
  return {
    id: context.actor.id,
    type: context.actor.type === "USER" ? ("USER" as const) : ("MCP_AGENT" as const),
    ...(context.actor.email ? { displayName: context.actor.email } : {}),
    provider: context.actor.authProvider,
  };
}

// A region below this size in either dimension is treated as noise, not a real photographic
// subject worth an independent asset. A region covering almost the entire source frame is left
// as a source crop instead of "extracted" — cropping the whole poster and calling it an
// independent extraction would misrepresent what actually happened.
const EXTRACTABLE_REGION_MIN_DIMENSION_PX = 8;
const EXTRACTABLE_REGION_MAX_AREA_FRACTION = 0.98;

interface ExtractedImageAssetsResult {
  readonly manifest: ReconstructionManifest;
  readonly derivedAssets: readonly AssetRecord[];
  readonly extractedCount: number;
}

/**
 * Crops a real, independently stored derived asset out of the source reference bytes for each
 * eligible IMAGE-category manifest region, with full DERIVED lineage back to the source asset
 * (AssetSchema.source.originalAssetId + provenance.processingChain). Without this, every
 * reconstructed IMAGE node would just reference a crop of the original reference asset forever —
 * editable in position/size, but never independently replaceable or exportable on its own.
 */
async function extractIndependentImageAssets(params: {
  readonly manifest: ReconstructionManifest;
  readonly sourceBytes: Uint8Array;
  readonly sourceAssetId: string;
  readonly sourceDimensions: { readonly width: number; readonly height: number };
  readonly documentAssets: Readonly<Record<string, AssetRecord>>;
  readonly context: ToolExecutionContext;
  readonly assetStorage: AssetStorageAdapter | undefined;
  readonly dryRun: boolean;
}): Promise<ExtractedImageAssetsResult> {
  const { manifest, sourceBytes, sourceAssetId, sourceDimensions, documentAssets, context, assetStorage, dryRun } =
    params;
  const sourceWidth = sourceDimensions.width;
  const sourceHeight = sourceDimensions.height;
  const sourceArea = sourceWidth * sourceHeight;
  if (!assetStorage || sourceArea === 0) {
    return { manifest, derivedAssets: [], extractedCount: 0 };
  }

  // createDerivative() only checks that the original asset id exists in the registry it's given;
  // the source asset may not be committed to the document yet (it's being registered in this same
  // MCP call), so a minimal placeholder stands in for it when there's no committed asset already.
  // Its hash is the real source content hash — not a dummy value — so findAssetByHash() correctly
  // recognizes a would-be "extraction" that's byte-identical to the whole source as the source
  // itself rather than crashing on a missing field or minting a pointless duplicate.
  const workingRegistry: Record<string, AssetRecord> = {
    ...documentAssets,
    [sourceAssetId]:
      documentAssets[sourceAssetId] ?? ({ id: sourceAssetId, hash: computeSha256(sourceBytes) } as AssetRecord),
  };
  const derivedAssets: AssetRecord[] = [];
  const updatedRegions: ReconstructionManifestRegion[] = [];
  const actor = actorForCommand(context);

  for (const region of manifest.regions) {
    if (region.category !== "IMAGE" || !region.image || region.image.extracted) {
      updatedRegions.push(region);
      continue;
    }
    const { x, y, width, height } = region.bounds;
    const left = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y));
    const cropWidth = Math.min(Math.round(width), sourceWidth - left);
    const cropHeight = Math.min(Math.round(height), sourceHeight - top);
    const areaFraction = sourceArea > 0 ? (cropWidth * cropHeight) / sourceArea : 1;
    if (
      cropWidth < EXTRACTABLE_REGION_MIN_DIMENSION_PX ||
      cropHeight < EXTRACTABLE_REGION_MIN_DIMENSION_PX ||
      areaFraction > EXTRACTABLE_REGION_MAX_AREA_FRACTION
    ) {
      updatedRegions.push(region);
      continue;
    }

    const cropBytes = new Uint8Array(
      await sharp(Buffer.from(sourceBytes))
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .png()
        .toBuffer(),
    );
    const contentHash = computeSha256(cropBytes);
    const existing = findAssetByHash(workingRegistry, contentHash);
    let derivedAsset: AssetRecord;
    if (existing) {
      derivedAsset = existing;
    } else {
      const sourceUri = dryRun
        ? `pending:${contentHash}`
        : (
            await assetStorage.storeDerivative({
              asset: {
                id: assetIdFromHash(contentHash),
                type: "IMAGE",
                name: `${region.key} (extracted)`,
                hash: contentHash,
                source: { kind: "DERIVED", uri: `pending:${contentHash}`, originalAssetId: sourceAssetId },
                mimeType: "image/png",
                byteSize: cropBytes.byteLength,
                dimensions: { width: cropWidth, height: cropHeight },
                metadata: {},
              },
              bytes: cropBytes,
              expectedHash: contentHash,
            })
          ).uri;

      const registration = createDerivative(workingRegistry, {
        originalAssetId: sourceAssetId,
        bytes: cropBytes,
        kind: "IMAGE",
        originalFilename: `${region.key}.png`,
        displayName: `${region.key} (extracted)`,
        mimeType: "image/png",
        sourceUri,
        createdAt: context.timestamp,
        registeredAt: context.timestamp,
        operation: "SEGMENTED",
        operationParameters: { regionKey: region.key, x: left, y: top, width: cropWidth, height: cropHeight },
        actor,
        tool: "@aevum/mcp-server:asset.register:image-extraction",
        toolVersion: MCP_TOOL_VERSION,
        details: { kind: "IMAGE", alpha: true, exif: {} },
        dimensions: { width: cropWidth, height: cropHeight },
        security: { status: "PASSED", inspectedAt: context.timestamp, inspector: "NONE", issues: [] },
      });
      if (registration.kind !== "REGISTERED") {
        // A hash collision against a quarantined asset is the only other outcome here; fall back
        // to the source crop rather than fail the whole registration for one region.
        updatedRegions.push(region);
        continue;
      }
      derivedAsset = registration.asset;
      derivedAssets.push(derivedAsset);
    }

    workingRegistry[derivedAsset.id] = derivedAsset;
    updatedRegions.push({
      ...region,
      image: { assetId: derivedAsset.id, fit: region.image.fit, extracted: true },
    });
  }

  return {
    manifest: { ...manifest, regions: updatedRegions },
    derivedAssets,
    extractedCount: derivedAssets.length,
  };
}

function threeViewport(document: CanonicalDesignDocument, input: unknown): RuntimeViewport {
  const override = input as
    | {
        width: number;
        height: number;
        deviceScaleFactor: number;
        orientation: "PORTRAIT" | "LANDSCAPE";
        category: "DESKTOP" | "TABLET" | "MOBILE" | "CUSTOM";
        reducedMotion: boolean;
        breakpointId?: string;
      }
    | undefined;
  if (!override) return createRuntimeViewport(document);
  return {
    id: `mcp-three-${override.width}x${override.height}`,
    width: override.width,
    height: override.height,
    deviceScaleFactor: override.deviceScaleFactor,
    orientation: override.orientation,
    category: override.category,
    reducedMotion: override.reducedMotion,
    ...(override.breakpointId ? { breakpointId: override.breakpointId } : {}),
  };
}

function commandBase(context: ToolExecutionContext, document: CanonicalDesignDocument) {
  const transactionId = createTransactionId();
  return {
    id: createCommandId(),
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: document.metadata.id,
    expectedDocumentVersion: document.documentVersion,
    timestamp: context.timestamp,
    actor: actorForCommand(context),
    correlationId: context.request.correlationId ?? context.request.requestId,
    transactionId,
  } as const;
}

async function executeWrite(
  context: ToolExecutionContext,
  input: { expectedDocumentVersion: number },
  build: (base: ReturnType<typeof commandBase>) => Command,
) {
  const source = await currentDocument(context);
  if (source.documentVersion !== input.expectedDocumentVersion) {
    throw new McpProtocolError({
      code: "MCP_DOCUMENT_VERSION_CONFLICT",
      message: "The requested document version is stale.",
      recoverable: true,
      retryable: true,
      suggestedAction: "Read the latest document version and retry with a new idempotency key.",
      requestId: context.request.requestId,
      workspaceId: context.request.workspaceId,
      projectId: context.request.projectId,
      documentId: source.metadata.id,
      documentVersion: source.documentVersion,
      details: { expectedVersion: input.expectedDocumentVersion, currentVersion: source.documentVersion },
    });
  }
  const command = build(commandBase(context, source));
  const commit = context.request.dryRun ? dryRunCommand(source, command) : executeCommand(source, command);
  return {
    data: {
      dryRun: context.request.dryRun,
      baseVersion: source.documentVersion,
      resultVersion: context.request.dryRun ? source.documentVersion : commit.newDocument.documentVersion,
      ...(context.request.dryRun ? { predictedDocumentVersion: commit.newDocument.documentVersion } : {}),
      transactionId: command.transactionId,
      commandIds: [command.id],
      changeSet: commit.changeSet,
    },
    mutation: { commit, sourceDocument: source },
  };
}

function definition(
  name: McpToolName,
  description: string,
  permissions: readonly McpPermission[],
  classification: "READ" | "WRITE",
  execute: McpToolDefinition["execute"],
  config: McpServerRuntimeConfig,
  enabled = true,
): McpToolDefinition {
  return {
    descriptor: {
      name,
      version: MCP_TOOL_VERSION,
      description,
      requiredPermissions: [...permissions],
      classification,
      supportsDryRun: classification === "WRITE" && config.features.dryRun,
      supportsTransactions: classification === "WRITE" && config.features.transactions,
      supportsIdempotency: classification === "WRITE" && config.features.idempotency,
      timeoutMs: config.toolTimeoutMs,
      payloadLimitBytes: config.limits.toolInputBytes,
      auditPolicy: "ALWAYS",
      enabled,
    },
    inputSchema: TOOL_SCHEMAS[name].input,
    outputSchema: TOOL_SCHEMAS[name].output,
    execute,
  };
}

export function registerInitialTools(
  registry: McpToolRegistry,
  config: McpServerRuntimeConfig,
  adapters: {
    readonly blender?: BlenderToolAdapter;
    readonly assetBytes?: AssetBytesResolver;
    readonly assetStorage?: AssetStorageAdapter;
    /** Workspace-scoped so per-workspace quota (see @aevum/vision) is enforced per caller, not globally. */
    readonly vision?: (workspaceId: string) => VisionProvider;
  } = {},
): void {
  registry.registerTool(
    definition(
      "fidelity.inspect",
      "Inspect canonical Maximum Fidelity readiness, assets, viewports, and bounded profile capabilities.",
      ["document.read", "asset.read", "fidelity.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["fidelity.inspect"].input.parse(raw);
        const document = await currentDocument(context);
        const fontAssetIds = Object.values(document.assets)
          .filter((asset) => asset.type === "FONT")
          .map((asset) => asset.id)
          .sort();
        const imageAssetIds = Object.values(document.assets)
          .filter((asset) => asset.type === "IMAGE")
          .map((asset) => asset.id)
          .sort();
        const blockers = Object.values(document.nodes).flatMap((node) =>
          node.type === "TEXT"
            ? node.runs
                .filter((run) => run.style.fontAssetId && !document.assets[run.style.fontAssetId])
                .map((run) => `Missing font asset ${run.style.fontAssetId} for ${node.id}.`)
            : node.type === "IMAGE" && !document.assets[node.assetId]
              ? [`Missing image asset ${node.assetId} for ${node.id}.`]
              : [],
        );
        const profile = resolveFidelityProfile(input.profile);
        return {
          data: {
            profile: profile.name,
            documentVersion: document.documentVersion,
            nodeCount: Object.keys(document.nodes).length,
            imageAssetIds,
            fontAssetIds,
            viewportIds: Object.keys(document.settings.viewports).sort(),
            capabilities: [
              "REAL_RGBA_RASTER",
              "BROWSER_NATIVE_TEXT_SHAPING",
              "CUSTOM_FONT_LOADING",
              "PIXEL_HEATMAPS",
              "DOMAIN_SCORING",
              "BOUNDED_CORRECTION",
            ],
            blockers,
          },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "fidelity.validate_report",
      "Validate an immutable fidelity report and reject false-success coverage or unsupported-feature claims.",
      ["validation.read", "fidelity.read"],
      "READ",
      async (raw) => {
        const input = TOOL_SCHEMAS["fidelity.validate_report"].input.parse(raw);
        const blockingIssueIds = input.report.issues
          .filter((issue) => issue.severity === "BLOCKING")
          .map((issue) => issue.id)
          .sort();
        const meetsDeclaredStatus =
          input.report.status !== "PASS" ||
          (input.report.coverage >= 0.95 &&
            input.report.confidence >= 0.9 &&
            blockingIssueIds.length === 0 &&
            input.report.unsupportedFeatures.length === 0);
        return {
          data: {
            valid: true,
            meetsDeclaredStatus,
            blockingIssueIds,
            unsupportedFeatures: input.report.unsupportedFeatures,
            reportFingerprint: input.report.fingerprint,
          },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "fidelity.propose_corrections",
      "Prioritize attributed fidelity issues by causal domain without mutating canonical state.",
      ["validation.read", "correction.read", "fidelity.read"],
      "READ",
      async (raw) => {
        const input = TOOL_SCHEMAS["fidelity.propose_corrections"].input.parse(raw);
        const proposals = prioritizeFidelityIssues(input.report.issues)
          .slice(0, input.limit)
          .map((issue, index) => ({
            issueId: issue.id,
            ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
            domain: issue.domain,
            property: issue.property,
            priority: index,
            confidence: issue.confidence,
            supported: issue.supported,
          }));
        return { data: { reportFingerprint: input.report.fingerprint, proposals } };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "fidelity.apply_correction",
      "Apply one attributed, protected, expected-version fidelity correction through Command Engine.",
      ["document.write", "correction.read", "fidelity.write"],
      "WRITE",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["fidelity.apply_correction"].input.parse(raw);
        const document = await currentDocument(context);
        const node = document.nodes[input.nodeId];
        if (!node) fail(context, "MCP_INPUT_INVALID", "The attributed correction target does not exist.");
        if (node.locked)
          fail(context, "MCP_AUTHORIZATION_DENIED", "Locked nodes are protected from fidelity correction.");
        for (const [property, expected] of Object.entries(input.expectedBefore ?? {})) {
          if (JSON.stringify((node as unknown as Record<string, unknown>)[property]) !== JSON.stringify(expected))
            fail(
              context,
              "MCP_DOCUMENT_VERSION_CONFLICT",
              `The expected value for ${property} changed before correction.`,
            );
        }
        return executeWrite(context, input, (base) => ({
          ...base,
          type: "node.update",
          payload: { nodeId: input.nodeId, changes: input.changes },
        }));
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "lighting.analyze_reference",
      "Analyze bounded reference pixels into a deterministic structured lighting estimate.",
      ["lighting.read"],
      "READ",
      async (raw) => ({ data: analyzeReferenceLighting(TOOL_SCHEMAS["lighting.analyze_reference"].input.parse(raw)) }),
      config,
    ),
  );

  registry.registerTool(
    definition(
      "lighting.resolve_profile",
      "Resolve a canonical lighting rig for realtime, offline, or mobile delivery.",
      ["document.read", "lighting.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["lighting.resolve_profile"].input.parse(raw);
        return { data: resolveLighting(await currentDocument(context), input.sceneId, input.target) };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "lighting.validate",
      "Validate canonical lighting, shadows, reflections, and environment separately from materials.",
      ["document.read", "lighting.read", "validation.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["lighting.validate"].input.parse(raw);
        const document = await currentDocument(context);
        if (!document.assets[input.assetId])
          fail(context, "MCP_INPUT_INVALID", "The lighting source asset is not registered.");
        const resolved = resolveLighting(document, input.sceneId, input.target);
        const expected = input.reference ? analyzeReferenceLighting(input.reference) : undefined;
        return { data: validateLighting({ resolved, ...(expected ? { expected } : {}) }) };
      },
      config,
    ),
  );
  registry.registerTool(
    definition(
      "camera.inspect",
      "Inspect one canonical professional camera without invoking a renderer or Blender.",
      ["document.read", "camera.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["camera.inspect"].input.parse(raw);
        const camera = (await currentDocument(context)).cameras[input.cameraId];
        if (!camera) fail(context, "MCP_INPUT_INVALID", "The requested canonical camera does not exist.");
        return { data: camera };
      },
      config,
    ),
  );
  registry.registerTool(
    definition(
      "camera.evaluate",
      "Resolve canonical camera, shot, path, target, lens, and depth-of-field state at a fixed time.",
      ["document.read", "camera.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["camera.evaluate"].input.parse(raw);
        const document = await currentDocument(context);
        try {
          return {
            data: evaluateCamera({
              document,
              time: input.time,
              ...(input.cameraId ? { cameraId: input.cameraId } : {}),
              ...(input.sequenceId ? { sequenceId: input.sequenceId } : {}),
              ...(input.viewportAspectRatio ? { viewportAspectRatio: input.viewportAspectRatio } : {}),
              nodePositions: Object.fromEntries(
                Object.values(document.nodes).map((node) => [node.id, node.transform.position]),
              ),
            }),
          };
        } catch (error) {
          fail(context, "MCP_INPUT_INVALID", error instanceof Error ? error.message : "Camera evaluation failed.");
        }
      },
      config,
    ),
  );
  registry.registerTool(
    definition(
      "camera.validate",
      "Validate deterministic camera evaluation, composition, lens, clipping, and cinematic continuity.",
      ["document.read", "camera.read", "validation.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["camera.validate"].input.parse(raw);
        const document = await currentDocument(context);
        const nodePositions = Object.fromEntries(
          Object.values(document.nodes).map((node) => [node.id, node.transform.position]),
        );
        try {
          const resolvedCameras = (input.sampleTimes ?? [input.time]).map((time) =>
            evaluateCamera({
              document,
              time,
              ...(input.cameraId ? { cameraId: input.cameraId } : {}),
              ...(input.sequenceId ? { sequenceId: input.sequenceId } : {}),
              ...(input.viewportAspectRatio ? { viewportAspectRatio: input.viewportAspectRatio } : {}),
              nodePositions,
            }),
          );
          return {
            data: validateCinematics({
              document,
              resolvedCameras,
              ...(input.sequenceId ? { sequenceId: input.sequenceId } : {}),
            }),
          };
        } catch (error) {
          fail(context, "MCP_INPUT_INVALID", error instanceof Error ? error.message : "Camera validation failed.");
        }
      },
      config,
    ),
  );
  registry.registerTool(
    definition(
      "cinematic.inspect",
      "Inspect a canonical cinematic sequence with its ordered shots and camera paths.",
      ["document.read", "camera.read", "timeline.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["cinematic.inspect"].input.parse(raw);
        const document = await currentDocument(context);
        const sequence = document.cinematicSequences[input.sequenceId];
        if (!sequence) fail(context, "MCP_INPUT_INVALID", "The requested cinematic sequence does not exist.");
        const shots = sequence.shotIds.map((id) => document.cinematicShots[id]).filter((shot) => shot !== undefined);
        const pathIds = [...new Set(shots.flatMap((shot) => (shot.cameraPathId ? [shot.cameraPathId] : [])))];
        return {
          data: {
            sequence,
            shots,
            paths: pathIds.map((id) => document.cameraPaths[id]).filter((path) => path !== undefined),
          },
        };
      },
      config,
    ),
  );
  registry.registerTool(
    definition(
      "system.get_capabilities",
      "List actor-visible MCP capabilities.",
      ["mcp.tool.execute"],
      "READ",
      async (_input, context) => {
        const tools = context.registry
          .listTools()
          .filter(
            (tool) =>
              tool.enabled &&
              tool.requiredPermissions.every((permission) => context.actor.permissions.includes(permission)),
          );
        return {
          data: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            tools,
            enabledTools: tools.map((tool) => tool.name),
            supportedSchemaVersion: CURRENT_SCHEMA_VERSION,
            supportedCommandVersion: CURRENT_COMMAND_VERSION,
            authMode: config.authMode,
            dryRunSupport: config.features.dryRun,
            transactionSupport: config.features.transactions,
            limits: config.limits,
            deploymentVersion: config.deploymentVersion,
            environment: config.nodeEnv,
          },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "three.retarget",
      "Build a deterministic semantic pose-transfer proposal between two compatible canonical rigs.",
      ["document.read", "three.read"],
      "READ",
      async (raw, context) => {
        const input = raw as {
          sourceRigId: string;
          targetRigId: string;
          sourcePoseDeltas: PoseDelta[];
          mappings?: RetargetMapping[];
        };
        const document = await currentDocument(context);
        const sourceRig = document.nodes[input.sourceRigId];
        const targetRig = document.nodes[input.targetRigId];
        if (sourceRig?.type !== "RIG_3D" || targetRig?.type !== "RIG_3D")
          fail(context, "MCP_INPUT_INVALID", "Source and target rigs must be canonical RIG_3D nodes.");
        const sourceBones = sourceRig.boneIds.flatMap((id) =>
          document.nodes[id]?.type === "BONE_3D"
            ? [document.nodes[id] as Extract<DesignNode, { type: "BONE_3D" }>]
            : [],
        );
        const targetBones = targetRig.boneIds.flatMap((id) =>
          document.nodes[id]?.type === "BONE_3D"
            ? [document.nodes[id] as Extract<DesignNode, { type: "BONE_3D" }>]
            : [],
        );
        const sourcePose = evaluatePose({ rig: sourceRig, bones: sourceBones, deltas: input.sourcePoseDeltas });
        const mappings = input.mappings ?? createHumanoidSemanticMapping(sourceBones, targetBones);
        return { data: retargetPose({ sourcePose, sourceBones, targetBones, mappings }) };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "project.get",
      "Read a workspace-scoped project summary.",
      ["project.read"],
      "READ",
      async (_input, context) => {
        const { workspaceId, projectId } = requireScope(context);
        const project = await context.repository.getProject(workspaceId, projectId);
        if (!project) fail(context, "MCP_PROJECT_NOT_FOUND", "The requested project does not exist in this workspace.");
        const document = await currentDocument(context);
        return {
          data: {
            projectId: project.id,
            workspaceId: project.workspaceId,
            name: project.name,
            currentDocumentId: project.currentDocumentId,
            currentDocumentVersion: project.currentDocumentVersion,
            status: project.status,
            nodeCount: Object.keys(document.nodes).length,
            assetCount: Object.keys(document.assets).length,
            timelineCount: Object.keys(document.timelines).length,
            openWarnings: 0,
            lastModifiedAt: project.updatedAt,
            lastModifiedBy: document.metadata.updatedBy.id,
          },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "document.get",
      "Read the latest canonical document or a bounded projection.",
      ["document.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["document.get"].input.parse(raw);
        const document = await currentDocument(context);
        if (input.projection === "full") return { data: document };
        if (input.projection === "node-subtree") {
          if (!input.nodeId || !document.nodes[input.nodeId])
            fail(context, "MCP_INPUT_INVALID", "A valid nodeId is required.");
          return {
            data: {
              document: documentSummary(document),
              rootNodeId: input.nodeId,
              nodes: collectSubtree(document, input.nodeId),
            },
          };
        }
        return { data: documentSummary(document) };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "document.get_version",
      "Read one explicit canonical document version.",
      ["document.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["document.get_version"].input.parse(raw);
        const { workspaceId, projectId } = requireScope(context);
        const documentId = context.request.documentId;
        if (!documentId) fail(context, "MCP_INPUT_INVALID", "documentId is required.");
        const document = await context.repository.getDocumentVersion(workspaceId, projectId, documentId, input.version);
        if (!document) fail(context, "MCP_DOCUMENT_NOT_FOUND", "The requested document version does not exist.");
        return { data: input.projection === "full" ? document : documentSummary(document) };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "document.list_versions",
      "List bounded document version metadata.",
      ["document.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["document.list_versions"].input.parse(raw);
        const { workspaceId, projectId } = requireScope(context);
        const document = await currentDocument(context);
        const versions = await context.repository.listDocumentVersions(workspaceId, projectId, document.metadata.id, {
          limit: input.limit,
          ...(input.beforeVersion === undefined ? {} : { beforeVersion: input.beforeVersion }),
        });
        const nextBeforeVersion = versions.at(-1)?.version;
        return {
          data: {
            versions,
            ...(versions.length === input.limit && nextBeforeVersion !== undefined ? { nextBeforeVersion } : {}),
          },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "document.inspect_hierarchy",
      "Inspect canonical node hierarchy metadata.",
      ["document.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["document.inspect_hierarchy"].input.parse(raw);
        const document = await currentDocument(context);
        if (input.rootNodeId && !document.nodes[input.rootNodeId])
          fail(context, "MCP_INPUT_INVALID", "Hierarchy root does not exist.");
        return { data: hierarchy(document, input.rootNodeId, input.maxDepth) };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "asset.get",
      "Read one canonical asset record.",
      ["asset.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["asset.get"].input.parse(raw);
        const asset = (await currentDocument(context)).assets[input.assetId];
        if (!asset) fail(context, "MCP_DOCUMENT_NOT_FOUND", "The requested asset does not exist.");
        return { data: asset };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "asset.register",
      "Upload and register a new IMAGE asset, storing its bytes and adding it to the canonical document.",
      ["document.write", "asset.write"],
      "WRITE",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["asset.register"].input.parse(raw);
        if (!adapters.assetStorage) {
          fail(context, "MCP_TOOL_DISABLED", "No asset storage adapter is configured for this deployment.");
        }
        const document = await currentDocument(context);
        if (document.documentVersion !== input.expectedDocumentVersion) {
          fail(context, "MCP_DOCUMENT_VERSION_CONFLICT", "The requested document version is stale.");
        }
        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(Buffer.from(input.bytesBase64, "base64"));
        } catch {
          fail(context, "MCP_INPUT_INVALID", "bytesBase64 is not valid base64.");
        }
        if (bytes.byteLength === 0) fail(context, "MCP_INPUT_INVALID", "Decoded asset bytes are empty.");

        const contentHash = computeSha256(bytes);

        // Duplicate content is detected purely from already-canonical data, before any storage
        // write OR vision analysis is attempted — this keeps a dry run free of side effects, avoids
        // a redundant upload on a real commit when the bytes are already registered, and (per the
        // vision-provider cost guardrails) never pays for a Vision API call whose result would be
        // discarded a moment later for an asset that already exists.
        const existingDuplicate = Object.values(document.assets).find(
          (candidate) => candidate.hash.toLowerCase() === contentHash.toLowerCase(),
        );
        if (existingDuplicate) {
          return {
            data: {
              dryRun: context.request.dryRun,
              baseVersion: document.documentVersion,
              resultVersion: document.documentVersion,
              commandIds: [],
              outcome: "DUPLICATE",
              assetId: existingDuplicate.id,
              assetHash: existingDuplicate.hash,
            },
          };
        }

        // Real pixel/vision analysis (via the configured VisionProvider — Google Cloud Vision or
        // the local pixel-math fallback, never a hardcoded choice here) — skipped on a dry run
        // since it costs real CPU/provider cost for a result that would be discarded, and the
        // caller requested it, not the platform, so a dry run cannot silently make it free.
        let reconstructionManifest: ReconstructionManifest | undefined;
        let reconstructionAnalysis:
          | { regionCount: number; textRegionCount: number; extractedImageCount: number; diagnostics: string[] }
          | undefined;
        let extractedAssets: readonly AssetRecord[] = [];
        if (input.analyzeForReconstruction && !context.request.dryRun) {
          const { workspaceId } = requireScope(context);
          const visionProvider = adapters.vision?.(workspaceId);
          let built: { manifest: ReconstructionManifest; diagnostics: readonly string[] };
          if (visionProvider) {
            try {
              const analysis = await visionProvider.analyzeImage(bytes, { sourceHash: contentHash });
              built = await visionAnalysisToManifest(analysis, bytes);
            } catch (error) {
              if (error instanceof VisionProviderError && error.code === "VISION_PROVIDER_QUOTA_EXCEEDED") {
                fail(
                  context,
                  "MCP_RATE_LIMITED",
                  error.message,
                  "Retry after your workspace's vision quota window resets.",
                );
              }
              if (error instanceof VisionProviderError) {
                fail(context, "MCP_INTERNAL_ERROR", `Vision analysis failed: ${error.message}`);
              }
              throw error;
            }
          } else {
            built = await buildManifestFromImage(bytes, { ocrCacheDir: reconstructionVisionOcrCacheDir() });
          }

          // Independent image extraction: crop real, individually-editable derived assets out of
          // IMAGE-category regions (with full DERIVED lineage back to this source asset) before the
          // manifest is embedded on the source — so downstream reconstruction never has to reduce
          // an eligible region to "IMAGE node = a crop of the whole reference." assetIdFromHash() is
          // a pure function of content hash, so the prospective source id computed here is exactly
          // the id registerAsset() below will produce — no manifest patch-up needed afterward.
          const extraction = await extractIndependentImageAssets({
            manifest: built.manifest,
            sourceBytes: bytes,
            sourceAssetId: assetIdFromHash(contentHash),
            sourceDimensions: { width: input.width, height: input.height },
            documentAssets: document.assets,
            context,
            assetStorage: adapters.assetStorage,
            dryRun: context.request.dryRun,
          });

          reconstructionManifest = extraction.manifest;
          extractedAssets = extraction.derivedAssets;
          reconstructionAnalysis = {
            regionCount: extraction.manifest.regions.length,
            textRegionCount: extraction.manifest.regions.filter((region) => region.category === "TEXT").length,
            extractedImageCount: extraction.extractedCount,
            diagnostics: [...built.diagnostics],
          };
        }

        // A dry run must not persist bytes: use a placeholder uri and skip the real upload so the
        // outcome can still be predicted (and validated against the same schemas) without a side
        // effect. Only a real commit calls the storage adapter.
        const sourceUri = context.request.dryRun
          ? `pending:${contentHash}`
          : (
              await adapters.assetStorage.storeOriginal({
                asset: {
                  id: assetIdFromHash(contentHash),
                  type: "IMAGE",
                  name: input.displayName ?? input.originalFilename,
                  hash: contentHash,
                  source: { kind: "UPLOAD", uri: `pending:${contentHash}` },
                  mimeType: input.mimeType,
                  byteSize: bytes.byteLength,
                  dimensions: { width: input.width, height: input.height },
                  metadata: {},
                },
                bytes,
                expectedHash: contentHash,
              })
            ).uri;

        const importer = actorForCommand(context);
        const registration = registerAsset(document.assets, {
          bytes,
          kind: "IMAGE",
          originalFilename: input.originalFilename,
          ...(input.displayName ? { displayName: input.displayName } : {}),
          mimeType: input.mimeType,
          sourceUri,
          createdAt: context.timestamp,
          registeredAt: context.timestamp,
          status: "REGISTERED",
          provenance: {
            origin: { kind: "UPLOAD" },
            importer,
            processingChain: [],
            parentAssetIds: [],
          },
          dimensions: { width: input.width, height: input.height },
          details: { kind: "IMAGE", alpha: input.alpha, exif: {} },
          extensions: reconstructionManifest ? { [RECONSTRUCTION_MANIFEST_KEY]: reconstructionManifest } : {},
          security: { status: "PASSED", inspectedAt: context.timestamp, inspector: "NONE", issues: [] },
        });

        if (registration.kind !== "REGISTERED") {
          fail(context, "MCP_INTERNAL_ERROR", "Asset registration was unexpectedly quarantined or duplicate.");
        }

        // The source asset must be registered before any derived asset that declares it as
        // source.originalAssetId — document-model validation checks that reference on every
        // command application, so command order within the transaction is not interchangeable.
        const asset = registration.asset;
        const base = commandBase(context, document);
        const sourceCommand: Command = { ...base, type: "asset.register", payload: { asset } };
        const derivedCommands: Command[] = extractedAssets.map((derived) => ({
          ...base,
          id: createCommandId(),
          type: "asset.register" as const,
          payload: { asset: derived },
        }));
        let transaction = beginTransaction(document, { transactionId: base.transactionId }).execute(sourceCommand);
        for (const derivedCommand of derivedCommands) transaction = transaction.execute(derivedCommand);
        const commit = transaction.commit();
        const commandIds = [sourceCommand.id, ...derivedCommands.map((command) => command.id)];
        return {
          data: {
            dryRun: context.request.dryRun,
            baseVersion: document.documentVersion,
            resultVersion: context.request.dryRun ? document.documentVersion : commit.newDocument.documentVersion,
            ...(context.request.dryRun ? { predictedDocumentVersion: commit.newDocument.documentVersion } : {}),
            transactionId: base.transactionId,
            commandIds,
            outcome: "REGISTERED",
            assetId: asset.id,
            assetHash: asset.hash,
            ...(reconstructionAnalysis ? { reconstructionAnalysis } : {}),
          },
          mutation: { commit, sourceDocument: document },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "reconstruction.import_reference",
      "Import an analyzed reference image into the canonical document as real, individually-editable layers.",
      ["document.write", "asset.read"],
      "WRITE",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["reconstruction.import_reference"].input.parse(raw);
        const document = await currentDocument(context);
        if (document.documentVersion !== input.expectedDocumentVersion) {
          fail(context, "MCP_DOCUMENT_VERSION_CONFLICT", "The requested document version is stale.");
        }
        const sourceAsset = document.assets[input.sourceAssetId];
        if (!sourceAsset) fail(context, "MCP_INPUT_INVALID", "The source asset does not exist in this document.");
        if (!sourceAsset.dimensions) {
          fail(context, "MCP_INPUT_INVALID", "The source asset has no recorded dimensions.");
        }

        const { projectId } = requireScope(context);
        const engine = createReconstructionEngine({ assetResolver: createAssetRegistryResolver(document.assets) });
        const task = engine.createTask({
          projectId,
          sourceAssetId: input.sourceAssetId,
          targetDocumentId: document.metadata.id,
          expectedDocumentVersion: document.documentVersion,
          ...(input.requestedPageName ? { requestedPageName: input.requestedPageName } : {}),
          qualityMode: input.qualityMode,
          targetViewport: {
            width: sourceAsset.dimensions.width,
            height: sourceAsset.dimensions.height,
            deviceScaleFactor: 1,
            category: "CUSTOM",
            orientation: sourceAsset.dimensions.width >= sourceAsset.dimensions.height ? "LANDSCAPE" : "PORTRAIT",
          },
          preserveEditability: true,
          allowRasterFallbacks: true,
          requestedCapabilities: [
            "REGION_DETECTION",
            "TEXT_DETECTION",
            "ASSET_LINKING",
            "SHAPE_INFERENCE",
            "LAYOUT_INFERENCE",
          ],
          deterministicSeed: 0,
          createdAt: context.timestamp,
          createdBy: actorForCommand(context),
        });

        const analysisResult = engine.analyze(task);
        if (!analysisResult.success) {
          fail(context, "MCP_COMMAND_FAILED", analysisResult.diagnostics[0]?.message ?? "Reference analysis failed.");
        }
        const proposalResult = engine.createProposal(task, analysisResult.analysis, document);
        if (!proposalResult.success) {
          fail(
            context,
            "MCP_COMMAND_FAILED",
            proposalResult.diagnostics[0]?.message ?? "Reconstruction proposal failed.",
          );
        }
        const proposal = proposalResult.proposal;
        const textNodeCount = proposal.proposedNodes.filter((entry) => entry.node.type === "TEXT").length;

        if (context.request.dryRun) {
          const predicted = engine.dryRun(proposal, document);
          if (!predicted.success) {
            fail(context, "MCP_DRY_RUN_FAILED", predicted.diagnostics[0]?.message ?? "Reconstruction dry run failed.");
          }
          return {
            data: {
              dryRun: true,
              baseVersion: document.documentVersion,
              resultVersion: document.documentVersion,
              predictedDocumentVersion: predicted.resultingDocument?.documentVersion ?? document.documentVersion,
              transactionId: proposal.commandPlan.transactionId,
              commandIds: proposal.commandPlan.commands.map((command) => command.id),
              createdNodeCount: proposal.proposedNodes.length,
              textNodeCount,
              referenceId: proposal.proposedDocumentMetadata.reference.id,
            },
          };
        }

        const transaction = beginTransaction(document, { transactionId: proposal.commandPlan.transactionId });
        try {
          for (const command of proposal.commandPlan.commands) transaction.execute(command);
        } catch (error) {
          if (transaction.state !== "COMMITTED") transaction.rollback();
          fail(
            context,
            "MCP_TRANSACTION_FAILED",
            error instanceof Error ? error.message : "Reconstruction transaction failed.",
          );
        }
        const commit = transaction.commit();
        return {
          data: {
            dryRun: false,
            baseVersion: document.documentVersion,
            resultVersion: commit.newDocument.documentVersion,
            transactionId: commit.auditRecord.transactionId,
            commandIds: commit.commands.map((command) => command.id),
            createdNodeCount: proposal.proposedNodes.length,
            textNodeCount,
            referenceId: proposal.proposedDocumentMetadata.reference.id,
          },
          mutation: { commit, sourceDocument: document },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "timeline.get",
      "Read one canonical timeline.",
      ["timeline.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["timeline.get"].input.parse(raw);
        const timeline = (await currentDocument(context)).timelines[input.timelineId];
        if (!timeline) fail(context, "MCP_DOCUMENT_NOT_FOUND", "The requested timeline does not exist.");
        return { data: timeline };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "three.inspect_asset",
      "Inspect canonical entities derived from one registered GLB or GLTF asset.",
      ["asset.read", "three.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["three.inspect_asset"].input.parse(raw);
        const document = await currentDocument(context);
        const asset = document.assets[input.assetId];
        if (!asset || (asset.type !== "GLB" && asset.type !== "GLTF")) {
          fail(context, "MCP_DOCUMENT_NOT_FOUND", "The requested registered GLB or GLTF asset does not exist.");
        }
        const sourceNodes = Object.values(document.nodes).filter(
          (node) =>
            node.importProvenance?.sourceAssetId === asset.id ||
            (node.type === "SCENE_3D" && node.sourceAssetId === asset.id),
        );
        const sourceMaterials = Object.values(document.materials).filter(
          (material) => material.importProvenance?.sourceAssetId === asset.id,
        );
        const sourceCameras = Object.values(document.cameras).filter(
          (camera) => camera.importProvenance?.sourceAssetId === asset.id,
        );
        const sourceLights = Object.values(document.lights).filter(
          (light) => light.importProvenance?.sourceAssetId === asset.id,
        );
        return {
          data: {
            asset,
            sourceAssetHash: asset.hash,
            rootSceneIds: sourceNodes
              .filter((node) => node.type === "SCENE_3D")
              .map((node) => node.id)
              .sort(),
            nodeIds: sourceNodes.map((node) => node.id).sort(),
            meshIds: sourceNodes
              .filter((node) => node.type === "MESH_3D")
              .map((node) => node.id)
              .sort(),
            materialIds: sourceMaterials.map((material) => material.id).sort(),
            cameraIds: sourceCameras.map((camera) => camera.id).sort(),
            lightIds: sourceLights.map((light) => light.id).sort(),
          },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "three.inspect_scene",
      "Project one canonical 3D scene and return renderer-neutral plan metadata.",
      ["document.read", "three.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["three.inspect_scene"].input.parse(raw);
        const document = await currentDocument(context);
        const source = document.nodes[input.sceneId];
        if (source?.type !== "SCENE_3D") {
          fail(context, "MCP_DOCUMENT_NOT_FOUND", "The requested canonical 3D scene does not exist.");
        }
        const projection = projectScene(document, threeViewport(document, input.viewport));
        const threeProjection = project3DScene(document, projection);
        const scene = threeProjection.scenes.find((value) => value.sceneId === source.id);
        if (!scene) fail(context, "MCP_INTERNAL_ERROR", "The canonical 3D scene could not be projected.");
        const plan = create3DRenderPlan(threeProjection, source.id);
        return {
          data: {
            sceneId: source.id,
            ...(source.sourceAssetId ? { sourceAssetId: source.sourceAssetId } : {}),
            coordinateSystem: source.coordinateSystem,
            ...(scene.activeCameraId ? { activeCameraId: scene.activeCameraId } : {}),
            nodeIds: scene.nodeIds,
            meshIds: scene.meshIds,
            materialIds: scene.materialIds,
            lightIds: scene.lightIds,
            ...(scene.bounds ? { bounds: scene.bounds } : {}),
            projectionFingerprint: threeProjection.fingerprint,
            renderPlanFingerprint: plan.fingerprint,
            renderOperationCount: plan.operations.length,
            diagnostics: threeProjection.diagnostics.map((diagnostic) => diagnostic.code),
          },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "three.multiview_analyze",
      "Analyze several registered images of one object as a deterministic multi-view reconstruction reference set.",
      ["asset.read", "three.read"],
      "READ",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["three.multiview_analyze"].input.parse(raw);
        const document = await currentDocument(context);

        for (const view of input.views) {
          const asset = document.assets[view.assetId];
          if (!asset) fail(context, "MCP_DOCUMENT_NOT_FOUND", `Referenced asset ${view.assetId} does not exist.`);
          if (asset.type !== "IMAGE") {
            fail(context, "MCP_INPUT_INVALID", `Referenced asset ${view.assetId} must be a registered IMAGE asset.`);
          }
        }

        const task = createMultiViewTask({
          projectId: document.metadata.projectId,
          ...(input.subjectLabel ? { subjectLabel: input.subjectLabel } : {}),
          ...(input.subjectCategory ? { subjectCategory: input.subjectCategory } : {}),
          views: input.views.map((view) => ({
            assetId: view.assetId,
            imageWidth: view.imageWidth,
            imageHeight: view.imageHeight,
            ...(view.silhouetteContour ? { silhouetteContour: view.silhouetteContour } : {}),
          })),
          roleHints: input.views
            .map((view) => (view.role ? { assetId: view.assetId, role: view.role, userProvided: true } : undefined))
            .filter((hint): hint is NonNullable<typeof hint> => hint !== undefined),
          landmarkHints: input.landmarkHints,
          partHints: input.partHints,
          scaleHints: input.scaleHints,
          config: {},
          deterministicSeed: 0,
          createdAt: context.timestamp,
          createdBy: actorForCommand(context),
        });

        const { report } = analyzeMultiView(task, {
          createdAt: context.timestamp,
          ...(input.targetQuality ? { targetQuality: input.targetQuality } : {}),
        });

        return {
          data: {
            taskId: report.taskId,
            referenceSetId: report.referenceSetId,
            viewSummaries: report.viewSummaries.map((summary) => ({
              assetId: summary.assetId,
              role: summary.role,
              roleConfidence: summary.roleConfidence,
            })),
            coverage: report.coverage.directions,
            readiness: { classification: report.readiness.classification, score: report.readiness.score },
            validationStatus: report.validation.status,
            reportStatus: report.status,
            diagnostics: report.diagnostics.map((entry) => ({
              code: entry.code,
              severity: entry.severity,
              message: entry.message,
            })),
            reportFingerprint: report.reportFingerprint,
          },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "three.reconstruction_generate_candidate",
      "Generate, score, and (on success) register a real candidate 3D mesh from multi-view evidence.",
      ["asset.read", "asset.write", "three.write", "document.write"],
      "WRITE",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["three.reconstruction_generate_candidate"].input.parse(raw);
        const document = await currentDocument(context);

        for (const view of input.views) {
          const asset = document.assets[view.assetId];
          if (!asset) fail(context, "MCP_DOCUMENT_NOT_FOUND", `Referenced asset ${view.assetId} does not exist.`);
          if (asset.type !== "IMAGE") {
            fail(context, "MCP_INPUT_INVALID", `Referenced asset ${view.assetId} must be a registered IMAGE asset.`);
          }
        }

        if (document.documentVersion !== input.expectedDocumentVersion) {
          throw new McpProtocolError({
            code: "MCP_DOCUMENT_VERSION_CONFLICT",
            message: "The requested document version is stale.",
            recoverable: true,
            retryable: true,
            suggestedAction: "Read the latest document version and retry with a new idempotency key.",
            requestId: context.request.requestId,
            workspaceId: context.request.workspaceId,
            projectId: context.request.projectId,
            documentId: document.metadata.id,
            documentVersion: document.documentVersion,
            details: { expectedVersion: input.expectedDocumentVersion, currentVersion: document.documentVersion },
          });
        }

        const task = createMultiViewTask({
          projectId: document.metadata.projectId,
          ...(input.subjectLabel ? { subjectLabel: input.subjectLabel } : {}),
          ...(input.subjectCategory ? { subjectCategory: input.subjectCategory } : {}),
          views: input.views.map((view) => ({
            assetId: view.assetId,
            imageWidth: view.imageWidth,
            imageHeight: view.imageHeight,
            ...(view.silhouetteContour ? { silhouetteContour: view.silhouetteContour } : {}),
          })),
          roleHints: input.views
            .map((view) => (view.role ? { assetId: view.assetId, role: view.role, userProvided: true } : undefined))
            .filter((hint): hint is NonNullable<typeof hint> => hint !== undefined),
          landmarkHints: input.landmarkHints,
          partHints: input.partHints,
          scaleHints: input.scaleHints,
          config: {},
          deterministicSeed: 0,
          createdAt: context.timestamp,
          createdBy: actorForCommand(context),
        });

        const { referenceSet, proposal } = analyzeMultiView(task, {
          createdAt: context.timestamp,
          ...(input.targetQuality ? { targetQuality: input.targetQuality } : {}),
        });

        const sessionResult = await runReconstructionSession({
          referenceSet,
          proposal,
          providerId: "LOCAL_BASELINE",
          providerVersion: LOCAL_BASELINE_PROVIDER_VERSION,
          ...(input.qualityMode ? { config: { qualityMode: input.qualityMode } } : {}),
          createdAt: context.timestamp,
        });

        const reconstruction = {
          status: sessionResult.report.status,
          stopReason: sessionResult.report.stopReason,
          providerId: sessionResult.report.providerId,
          providerVersion: sessionResult.report.providerVersion,
          qualityMode: sessionResult.report.qualityMode,
          passCount: sessionResult.report.passes.length,
          candidateSummaries: sessionResult.report.candidates.map((candidate) => ({
            generationMethod: candidate.generationMethod,
            partCount: candidate.partCount,
            triangleCount: candidate.triangleCount,
            overallScore: candidate.score.overall,
          })),
          ...(sessionResult.report.finalScore ? { selectedScore: sessionResult.report.finalScore } : {}),
          diagnostics: sessionResult.report.diagnostics.map((entry) => ({
            code: entry.code,
            severity: entry.severity,
            message: entry.message,
          })),
        };

        if (sessionResult.report.status === "BLOCKED" || !sessionResult.selectedGlb) {
          return {
            data: {
              dryRun: context.request.dryRun,
              baseVersion: document.documentVersion,
              resultVersion: document.documentVersion,
              reconstruction,
            },
          };
        }

        const selectedCandidate = sessionResult.report.candidates.find(
          (candidate) => candidate.id === sessionResult.report.selectedCandidateId,
        );
        const registration = registerCandidateAsset({
          registry: document.assets,
          referenceSet,
          bytes: sessionResult.selectedGlb,
          candidateId: sessionResult.report.selectedCandidateId ?? sessionResult.report.id,
          generationMethod: selectedCandidate?.generationMethod ?? "BOX_PRIMITIVE",
          providerId: sessionResult.report.providerId,
          providerVersion: sessionResult.report.providerVersion,
          timestamp: context.timestamp,
        });

        if (registration.kind === "QUARANTINED") {
          fail(context, "MCP_INTERNAL_ERROR", "The generated candidate asset failed security inspection.");
        }

        if (registration.kind === "DUPLICATE") {
          return {
            data: {
              dryRun: context.request.dryRun,
              baseVersion: document.documentVersion,
              resultVersion: document.documentVersion,
              reconstruction,
              assetId: registration.asset.id,
              assetHash: registration.asset.hash,
            },
          };
        }

        const asset = registration.asset;
        const command: Command = {
          ...commandBase(context, document),
          type: "asset.register",
          payload: { asset },
        };
        const commit = context.request.dryRun ? dryRunCommand(document, command) : executeCommand(document, command);

        return {
          data: {
            dryRun: context.request.dryRun,
            baseVersion: document.documentVersion,
            resultVersion: context.request.dryRun ? document.documentVersion : commit.newDocument.documentVersion,
            ...(context.request.dryRun ? { predictedDocumentVersion: commit.newDocument.documentVersion } : {}),
            transactionId: command.transactionId,
            commandIds: [command.id],
            reconstruction,
            assetId: asset.id,
            assetHash: asset.hash,
            changeSet: commit.changeSet,
          },
          mutation: { commit, sourceDocument: document },
        };
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "three.import_scene",
      "Import a registered GLB/GLTF asset into the canonical document through the existing Phase 14 scene3d.import path.",
      ["asset.read", "document.write", "three.write"],
      "WRITE",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["three.import_scene"].input.parse(raw);
        const document = await currentDocument(context);

        const asset = document.assets[input.assetId];
        if (!asset) fail(context, "MCP_DOCUMENT_NOT_FOUND", `Referenced asset ${input.assetId} does not exist.`);
        if (asset.type !== "GLB" && asset.type !== "GLTF") {
          fail(context, "MCP_INPUT_INVALID", `Asset ${input.assetId} must be a registered GLB or GLTF asset.`);
        }

        if (document.documentVersion !== input.expectedDocumentVersion) {
          throw new McpProtocolError({
            code: "MCP_DOCUMENT_VERSION_CONFLICT",
            message: "The requested document version is stale.",
            recoverable: true,
            retryable: true,
            suggestedAction: "Read the latest document version and retry with a new idempotency key.",
            requestId: context.request.requestId,
            workspaceId: context.request.workspaceId,
            projectId: context.request.projectId,
            documentId: document.metadata.id,
            documentVersion: document.documentVersion,
            details: { expectedVersion: input.expectedDocumentVersion, currentVersion: document.documentVersion },
          });
        }

        if (!adapters.assetBytes) {
          fail(context, "MCP_TOOL_DISABLED", "No asset-byte storage adapter is configured for this deployment.");
        }
        const bytes = await adapters.assetBytes.resolve(asset.id);
        if (!bytes) fail(context, "MCP_DOCUMENT_NOT_FOUND", `Bytes for asset ${asset.id} could not be resolved.`);

        const proposal = await create3DImportProposal({ canonicalDocument: document, asset, bytes });
        const command = compile3DImportTransaction({
          proposal,
          document,
          actor: actorForCommand(context),
          timestamp: context.timestamp,
          correlationId: context.request.correlationId ?? context.request.requestId,
        });
        const commit = context.request.dryRun ? dryRunCommand(document, command) : executeCommand(document, command);

        return {
          data: {
            dryRun: context.request.dryRun,
            baseVersion: document.documentVersion,
            resultVersion: context.request.dryRun ? document.documentVersion : commit.newDocument.documentVersion,
            ...(context.request.dryRun ? { predictedDocumentVersion: commit.newDocument.documentVersion } : {}),
            transactionId: command.transactionId,
            commandIds: [command.id],
            assetId: asset.id,
            rootNodeIds: [...proposal.rootNodeIds],
            importedNodeIds: proposal.nodes.map((node) => node.id),
            counts: {
              nodes: proposal.nodes.length,
              meshes: proposal.nodes.filter((node) => node.type === "MESH_3D").length,
              materials: proposal.materials.length,
              cameras: proposal.cameras.length,
              lights: proposal.lights.length,
            },
            diagnostics: proposal.diagnostics.map((entry) => ({
              code: entry.code,
              severity: entry.severity,
              message: entry.message,
            })),
            changeSet: commit.changeSet,
          },
          mutation: { commit, sourceDocument: document },
        };
      },
      config,
      Boolean(adapters.assetBytes),
    ),
  );

  registry.registerTool(
    definition(
      "document.rename",
      "Rename the canonical document.",
      ["document.write"],
      "WRITE",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["document.rename"].input.parse(raw);
        return executeWrite(context, input, (base) => ({
          ...base,
          type: "document.rename",
          payload: { name: input.name },
        }));
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "node.create",
      "Create one validated canonical node.",
      ["document.write"],
      "WRITE",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["node.create"].input.parse(raw);
        return executeWrite(context, input, (base) => ({
          ...base,
          type: "node.create",
          payload: { node: input.node, ...(input.index !== undefined ? { index: input.index } : {}) },
        }));
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "node.update",
      "Update non-structural canonical node properties.",
      ["document.write"],
      "WRITE",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["node.update"].input.parse(raw);
        return executeWrite(context, input, (base) => ({
          ...base,
          type: "node.update",
          payload: { nodeId: input.nodeId, changes: input.changes },
        }));
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "node.delete",
      "Delete one canonical non-page node subtree.",
      ["document.write"],
      "WRITE",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["node.delete"].input.parse(raw);
        return executeWrite(context, input, (base) => ({
          ...base,
          type: "node.delete",
          payload: { nodeId: input.nodeId },
        }));
      },
      config,
    ),
  );

  registry.registerTool(
    definition(
      "three.update_node_transform",
      "Update one canonical 3D node transform in local meter space.",
      ["document.write", "three.write"],
      "WRITE",
      async (raw, context) => {
        const input = TOOL_SCHEMAS["three.update_node_transform"].input.parse(raw);
        const document = await currentDocument(context);
        const node = document.nodes[input.nodeId];
        if (!node || !["SCENE_3D", "GROUP_3D", "MODEL_3D", "MESH_3D"].includes(node.type)) {
          fail(context, "MCP_INPUT_INVALID", "The target must be a canonical 3D node.");
        }
        return executeWrite(context, input, (base) => ({
          ...base,
          type: "node.update",
          payload: { nodeId: input.nodeId, changes: { transform: input.transform } },
        }));
      },
      config,
    ),
  );

  const blenderTools = [
    [
      "camera.create",
      "Create and verify a professional canonical camera through Blender before atomic reconciliation.",
      ["document.write", "camera.write", "blender.write"],
      "WRITE",
    ],
    [
      "camera.update",
      "Update and verify a professional canonical camera through Blender before atomic reconciliation.",
      ["document.write", "camera.write", "blender.write"],
      "WRITE",
    ],
    [
      "cinematic.apply_sequence",
      "Apply a bounded cinematic sequence and sampled camera animation through Blender before atomic reconciliation.",
      ["document.write", "timeline.write", "camera.write", "blender.write"],
      "WRITE",
    ],
    [
      "lighting.inspect",
      "Inspect real Blender lights, shadows, environment, and render engine state.",
      ["asset.read", "lighting.read", "blender.read"],
      "READ",
    ],
    [
      "lighting.create_rig",
      "Create and verify a bounded canonical lighting rig through Blender before atomic reconciliation.",
      ["document.write", "lighting.write", "blender.write"],
      "WRITE",
    ],
    [
      "lighting.bake",
      "Render and register a bounded Blender lighting bake derivative with canonical provenance.",
      ["document.write", "asset.write", "lighting.write", "blender.write"],
      "WRITE",
    ],
    ["blender.runtime_info", "Inspect the configured Blender runtime and compatibility.", ["blender.read"], "READ"],
    [
      "blender.inspect_scene",
      "Inspect a registered 3D asset through the real Blender runtime.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "blender.inspect_object",
      "Inspect one canonical object through the real Blender runtime.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "blender.inspect_mesh",
      "Inspect bounded mesh topology metadata through Blender.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "blender.inspect_material",
      "Inspect one canonical material through Blender.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    ["blender.inspect_camera", "Inspect one canonical camera through Blender.", ["asset.read", "blender.read"], "READ"],
    ["blender.inspect_light", "Inspect one canonical light through Blender.", ["asset.read", "blender.read"], "READ"],
    [
      "blender.update_object_transform",
      "Apply one bounded object transform and reconcile it canonically.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "blender.update_material",
      "Apply bounded PBR material values and reconcile them canonically.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "blender.update_camera",
      "Apply bounded camera values and reconcile them canonically.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "blender.update_light",
      "Apply bounded light values and reconcile them canonically.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "blender.duplicate_object",
      "Duplicate one canonical object through Blender and reconciliation.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "blender.delete_object",
      "Delete one canonical object through an explicitly destructive Blender operation.",
      ["document.write", "blender.write", "blender.destructive"],
      "WRITE",
    ],
    [
      "blender.export_scene",
      "Export and register a controlled Blender GLB derivative.",
      ["document.write", "blender.export"],
      "WRITE",
    ],
    [
      "three.inspect_topology",
      "Inspect professional topology metrics through the controlled Blender runtime.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "three.inspect_uv",
      "Inspect UV layers, islands, bounds, and packing diagnostics through Blender.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "three.validate_mesh",
      "Validate topology, UV, and material readiness for one canonical mesh object.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "three.validate_material",
      "Validate one canonical Principled PBR material and its texture-channel semantics.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "three.analyze_web_quality",
      "Analyze scene geometry, materials, textures, and draw calls against a web profile.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "three.bevel_mesh",
      "Apply one bounded semantic bevel and reconcile its derivative geometry canonically.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.unwrap_uv",
      "Apply one bounded unwrap and pack workflow and reconcile the geometry derivative.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.update_pbr_material",
      "Apply canonically supported PBR values and reconcile the material transaction.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.rig_create",
      "Create a real Blender armature from a bounded bone specification and reconcile it canonically.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.rig_inspect",
      "Inspect a canonical armature's real bone hierarchy through the controlled Blender runtime.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "three.skin_bind",
      "Bind a canonical mesh to a canonical armature using Blender's real automatic-weight heuristic.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.skin_inspect",
      "Inspect a canonical mesh's real skin binding and vertex-weight state through Blender.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "three.pose_inspect",
      "Inspect evaluated bone transforms and optional real mesh deformation.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "three.pose_update",
      "Apply a bounded FK pose to a Blender derivative and reconcile it canonically.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.pose_reset",
      "Reset a Blender rig derivative to its canonical rest pose.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.weight_inspect",
      "Inspect bounded per-vertex skin weights and normalization statistics.",
      ["asset.read", "blender.read"],
      "READ",
    ],
    [
      "three.weight_update",
      "Edit a bounded vertex selection's skin weights and reconcile the derivative.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.weight_normalize",
      "Normalize bounded Blender skin weights and reconcile the derivative.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.ik_update",
      "Solve one bounded Blender IK chain and reconcile the derivative.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.constraint_update",
      "Apply one supported bounded bone constraint and reconcile the derivative.",
      ["document.write", "blender.write"],
      "WRITE",
    ],
    [
      "three.deformation_validate",
      "Measure real evaluated Blender deformation quality.",
      ["asset.read", "blender.read"],
      "READ",
    ],
  ] as const satisfies readonly (readonly [McpToolName, string, readonly McpPermission[], "READ" | "WRITE"])[];

  for (const [name, description, permissions, classification] of blenderTools) {
    registry.registerTool(
      definition(
        name,
        description,
        permissions,
        classification,
        async (payload, context) => {
          if (!adapters.blender) {
            fail(context, "MCP_TOOL_DISABLED", "The local Blender Bridge adapter is not configured.");
          }
          const document = await currentDocument(context);
          return adapters.blender.execute({
            tool: name,
            payload,
            document,
            actor: context.actor,
            request: context.request,
            timestamp: context.timestamp,
          });
        },
        config,
        Boolean(adapters.blender),
      ),
    );
  }
}
