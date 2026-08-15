import { createAgentMcpClient, createInProcessMcpTransport, type AgentMcpClient } from "@aevum/agent-runtime/client";
import type { AgentApprovalPolicy } from "@aevum/agent-core";
import { CURRENT_COMMAND_VERSION } from "@aevum/command-engine";
import { CURRENT_SCHEMA_VERSION, type CanonicalDesignDocument, type DesignNode } from "@aevum/document-model";
import {
  MCP_PROTOCOL_VERSION,
  MCP_TOOL_VERSION,
  McpRequestEnvelopeSchema,
  McpResponseEnvelopeSchema,
  NodeUpdateInputSchema,
  type McpPermission,
  type McpToolDescriptor,
} from "@aevum/mcp-protocol";
import type { StudioSession } from "./session.js";

/**
 * The raw materials the real Agent Planner / agent-runtime engine (createAgentEngine, in
 * @aevum/agent-runtime) needs to run a turn against this Studio project: an MCP client scoped to
 * this workspace/project/document, and the actor's permission set (derived the same way the
 * capability-aware command gateway in core/production.ts derives it — from system.get_capabilities,
 * never invented client-side). Replaces the old single-method StudioAgentGateway, which could only
 * ever call node.update and never went through the real Agent Planner at all.
 */
export interface StudioAgentContext {
  /** Correlation id scoped to one AI panel turn; each turn gets its own client and audit trail. */
  createMcpClient(correlationId: string): AgentMcpClient;
  readonly actorPermissions: readonly McpPermission[];
  readonly workspaceId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly actorId: string;
  /** Wired from AGENT_APPROVAL_POLICY (Block D5) — real deployment configuration, not invented
   * client-side. Defaults to AUTO_SAFE_WRITE, the same default the server-side schema uses. */
  readonly approvalPolicy: AgentApprovalPolicy;
}

function subtreeNodes(document: CanonicalDesignDocument, rootId: string): DesignNode[] {
  const result: DesignNode[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) continue;
    const node = document.nodes[currentId];
    if (!node) continue;
    result.push(node);
    stack.push(...node.childIds);
  }
  return result;
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
  };
}

function toolDescriptor(
  name: "system.get_capabilities" | "document.get" | "node.update",
  permissions: readonly McpPermission[],
  classification: "READ" | "WRITE",
): McpToolDescriptor {
  return {
    name,
    version: MCP_TOOL_VERSION,
    description: `Deterministic Studio fixture implementation of ${name}.`,
    requiredPermissions: [...permissions],
    classification,
    supportsDryRun: classification === "WRITE",
    supportsTransactions: classification === "WRITE",
    supportsIdempotency: classification === "WRITE",
    timeoutMs: 5_000,
    payloadLimitBytes: 262_144,
    auditPolicy: "ALWAYS",
    enabled: true,
  };
}

/**
 * A local, in-process StudioAgentContext for Studio's dev fixture (no production MCP server
 * available). Supports exactly the tools the deterministic node-edit plan needs
 * (system.get_capabilities, document.get, node.update) — anything else fails honestly rather than
 * being silently faked.
 */
export function createDeterministicStudioAgentContext(input: {
  readonly session: StudioSession;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly actorId: string;
  readonly approvalPolicy?: AgentApprovalPolicy;
}): StudioAgentContext {
  const capabilities: McpToolDescriptor[] = [
    toolDescriptor("system.get_capabilities", ["mcp.tool.execute"], "READ"),
    toolDescriptor("document.get", ["document.read"], "READ"),
    toolDescriptor("node.update", ["document.write"], "WRITE"),
  ];
  const transport = createInProcessMcpTransport(async ({ request }) => {
    const envelope = McpRequestEnvelopeSchema.parse(request);
    const scopeMismatch =
      envelope.workspaceId !== input.workspaceId ||
      envelope.projectId !== input.projectId ||
      envelope.documentId !== input.documentId;
    const fail = (code: "MCP_WORKSPACE_ACCESS_DENIED" | "MCP_INPUT_INVALID" | "MCP_TOOL_NOT_FOUND", message: string) =>
      McpResponseEnvelopeSchema.parse({
        protocolVersion: MCP_PROTOCOL_VERSION,
        success: false,
        requestId: envelope.requestId,
        correlationId: envelope.correlationId,
        tool: envelope.tool,
        warnings: [],
        errors: [{ code, message, recoverable: false, retryable: false, requestId: envelope.requestId }],
        durationMs: 0,
      });
    if (scopeMismatch) {
      return fail("MCP_WORKSPACE_ACCESS_DENIED", "The deterministic Studio provider is scoped to one project.");
    }

    if (envelope.tool === "system.get_capabilities") {
      return McpResponseEnvelopeSchema.parse({
        protocolVersion: MCP_PROTOCOL_VERSION,
        success: true,
        requestId: envelope.requestId,
        correlationId: envelope.correlationId,
        tool: envelope.tool,
        data: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          tools: capabilities,
          enabledTools: capabilities.map((tool) => tool.name),
          supportedSchemaVersion: CURRENT_SCHEMA_VERSION,
          supportedCommandVersion: CURRENT_COMMAND_VERSION,
          authMode: "development",
          dryRunSupport: true,
          transactionSupport: true,
          limits: {
            requestBodyBytes: 1_048_576,
            toolInputBytes: 262_144,
            responseBytes: 1_048_576,
            metadataBytes: 16_384,
            batchSize: 50,
            nodePayloadBytes: 262_144,
            auditPayloadBytes: 65_536,
          },
          deploymentVersion: "studio-dev-fixture",
          environment: "development",
        },
        warnings: [],
        errors: [],
        durationMs: 0,
      });
    }

    if (envelope.tool === "document.get") {
      const document = input.session.getSnapshot().document;
      const nodeId = (envelope.input as { nodeId?: string } | undefined)?.nodeId;
      if (!nodeId || !document.nodes[nodeId]) return fail("MCP_INPUT_INVALID", "A valid nodeId is required.");
      return McpResponseEnvelopeSchema.parse({
        protocolVersion: MCP_PROTOCOL_VERSION,
        success: true,
        requestId: envelope.requestId,
        correlationId: envelope.correlationId,
        tool: envelope.tool,
        data: { document: documentSummary(document), rootNodeId: nodeId, nodes: subtreeNodes(document, nodeId) },
        warnings: [],
        errors: [],
        documentVersion: document.documentVersion,
        durationMs: 0,
      });
    }

    if (envelope.tool !== "node.update") {
      return fail("MCP_TOOL_NOT_FOUND", `Deterministic Studio provider does not expose ${envelope.tool}.`);
    }
    const update = NodeUpdateInputSchema.parse(envelope.input);
    if (!envelope.dryRun) {
      input.session.updateNode(update.nodeId, update.changes, {
        expectedDocumentVersion: update.expectedDocumentVersion,
        actor: { id: input.actorId, type: "MCP_AGENT", displayName: "AEVUM AI" },
        ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
      });
    }
    const resultVersion = envelope.dryRun
      ? update.expectedDocumentVersion + 1
      : input.session.getSnapshot().document.documentVersion;
    return McpResponseEnvelopeSchema.parse({
      protocolVersion: MCP_PROTOCOL_VERSION,
      success: true,
      requestId: envelope.requestId,
      correlationId: envelope.correlationId,
      tool: envelope.tool,
      data: { dryRun: envelope.dryRun, resultVersion },
      warnings: [],
      errors: [],
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      documentId: input.documentId,
      documentVersion: resultVersion,
      durationMs: 0,
    });
  });

  return Object.freeze({
    createMcpClient: (correlationId: string) =>
      createAgentMcpClient({
        transport,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        documentId: input.documentId,
        correlationId,
        timeoutMs: 5_000,
      }),
    actorPermissions: ["document.read", "document.write", "mcp.tool.execute"] as const,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    documentId: input.documentId,
    actorId: input.actorId,
    approvalPolicy: input.approvalPolicy ?? "AUTO_SAFE_WRITE",
  });
}
