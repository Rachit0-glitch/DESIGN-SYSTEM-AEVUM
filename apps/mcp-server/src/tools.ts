import {
  CURRENT_COMMAND_VERSION,
  createCommandId,
  createTransactionId,
  dryRunCommand,
  executeCommand,
  type Command,
} from "@aevum/command-engine";
import { CURRENT_SCHEMA_VERSION, type CanonicalDesignDocument, type DesignNode } from "@aevum/document-model";
import {
  MCP_PROTOCOL_VERSION,
  MCP_TOOL_VERSION,
  McpProtocolError,
  TOOL_SCHEMAS,
  type McpErrorCode,
  type McpPermission,
  type McpToolName,
} from "@aevum/mcp-protocol";
import { create3DRenderPlan } from "@aevum/renderer-3d";
import { createRuntimeViewport, project3DScene, projectScene, type RuntimeViewport } from "@aevum/scene-runtime";
import type {
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
  adapters: { readonly blender?: BlenderToolAdapter } = {},
): void {
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
