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
import type { McpServerRuntimeConfig, McpToolDefinition, McpToolRegistry, ToolExecutionContext } from "./registry.js";

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
      enabled: true,
    },
    inputSchema: TOOL_SCHEMAS[name].input,
    outputSchema: TOOL_SCHEMAS[name].output,
    execute,
  };
}

export function registerInitialTools(registry: McpToolRegistry, config: McpServerRuntimeConfig): void {
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
}
