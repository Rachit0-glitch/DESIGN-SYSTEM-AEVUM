import type { AgentApprovalPolicy } from "@aevum/agent-core";
import { type AgentMcpClient, createAgentMcpClient, createInProcessMcpTransport } from "@aevum/agent-runtime/client";
import { CURRENT_COMMAND_VERSION } from "@aevum/command-engine";
import { type CanonicalDesignDocument, CURRENT_SCHEMA_VERSION, type DesignNode } from "@aevum/document-model";
import {
  MCP_PROTOCOL_VERSION,
  MCP_TOOL_VERSION,
  type McpPermission,
  McpRequestEnvelopeSchema,
  McpResponseEnvelopeSchema,
  type McpToolDescriptor,
  NodeDeleteInputSchema,
  NodeUpdateInputSchema,
  TokenRegisterInputSchema,
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
  name: "system.get_capabilities" | "document.get" | "node.update" | "node.delete" | "token.register",
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
 * available). Supports exactly the tools the deterministic node-edit, node-delete, and compound
 * multi-operation edit plans need (system.get_capabilities, document.get, node.update, node.delete,
 * token.register) — anything else fails honestly rather than being silently faked.
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
    toolDescriptor("node.delete", ["document.write"], "WRITE"),
    toolDescriptor("token.register", ["document.write"], "WRITE"),
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
      const projection = (envelope.input as { projection?: string } | undefined)?.projection;
      if (projection === "full") {
        // The compound multi-operation edit plan (Block E) reads the whole document to resolve
        // several independent targets by name/type — the same flat shape the real MCP server's
        // document.get returns for this projection (`data` IS the document, not a subtree wrapper).
        return McpResponseEnvelopeSchema.parse({
          protocolVersion: MCP_PROTOCOL_VERSION,
          success: true,
          requestId: envelope.requestId,
          correlationId: envelope.correlationId,
          tool: envelope.tool,
          data: document,
          warnings: [],
          errors: [],
          documentVersion: document.documentVersion,
          durationMs: 0,
        });
      }
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

    if (envelope.tool !== "node.update" && envelope.tool !== "node.delete" && envelope.tool !== "token.register") {
      return fail("MCP_TOOL_NOT_FOUND", `Deterministic Studio provider does not expose ${envelope.tool}.`);
    }
    const actor = { id: input.actorId, type: "MCP_AGENT" as const, displayName: "AEVUM AI" };
    let expectedDocumentVersion: number;
    if (envelope.tool === "node.update") {
      const update = NodeUpdateInputSchema.parse(envelope.input);
      expectedDocumentVersion = update.expectedDocumentVersion;
      if (!envelope.dryRun) {
        input.session.updateNode(update.nodeId, update.changes, {
          expectedDocumentVersion: update.expectedDocumentVersion,
          actor,
          ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
        });
      }
    } else if (envelope.tool === "node.delete") {
      const del = NodeDeleteInputSchema.parse(envelope.input);
      expectedDocumentVersion = del.expectedDocumentVersion;
      if (!envelope.dryRun) {
        input.session.deleteNode(del.nodeId, {
          expectedDocumentVersion: del.expectedDocumentVersion,
          actor,
          ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
        });
      }
    } else {
      const register = TokenRegisterInputSchema.parse(envelope.input);
      expectedDocumentVersion = register.expectedDocumentVersion;
      if (!envelope.dryRun) {
        input.session.registerToken(register.token, {
          expectedDocumentVersion: register.expectedDocumentVersion,
          actor,
          ...(envelope.correlationId === undefined ? {} : { correlationId: envelope.correlationId }),
        });
      }
    }
    const resultVersion = envelope.dryRun
      ? expectedDocumentVersion + 1
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
