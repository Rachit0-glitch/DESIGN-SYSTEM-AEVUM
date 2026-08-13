import { createAgentMcpClient, createInProcessMcpTransport } from "@aevum/agent-runtime/client";
import {
  MCP_PROTOCOL_VERSION,
  McpRequestEnvelopeSchema,
  McpResponseEnvelopeSchema,
  NodeUpdateInputSchema,
} from "@aevum/mcp-protocol";
import type { StudioSession } from "./session.js";

export interface StudioAgentGateway {
  updateNode(input: {
    readonly nodeId: string;
    readonly changes: Record<string, unknown>;
    readonly expectedDocumentVersion: number;
    readonly correlationId: string;
  }): Promise<{ readonly dryRunRequestId: string; readonly applyRequestId: string; readonly resultVersion: number }>;
}

export function createDeterministicStudioAgentGateway(input: {
  readonly session: StudioSession;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly documentId: string;
}): StudioAgentGateway {
  const transport = createInProcessMcpTransport(async ({ request }) => {
    const envelope = McpRequestEnvelopeSchema.parse(request);
    if (
      envelope.workspaceId !== input.workspaceId ||
      envelope.projectId !== input.projectId ||
      envelope.documentId !== input.documentId
    ) {
      return McpResponseEnvelopeSchema.parse({
        protocolVersion: MCP_PROTOCOL_VERSION,
        success: false,
        requestId: envelope.requestId,
        correlationId: envelope.correlationId,
        tool: envelope.tool,
        warnings: [],
        errors: [
          {
            code: "MCP_WORKSPACE_ACCESS_DENIED",
            message: "The deterministic Studio provider is scoped to one acceptance workspace.",
            recoverable: false,
            retryable: false,
            requestId: envelope.requestId,
          },
        ],
        durationMs: 0,
      });
    }
    if (envelope.tool !== "node.update") {
      throw new Error(`Deterministic Studio provider does not expose ${envelope.tool}.`);
    }
    const update = NodeUpdateInputSchema.parse(envelope.input);
    if (!envelope.dryRun) {
      input.session.updateNode(update.nodeId, update.changes, {
        expectedDocumentVersion: update.expectedDocumentVersion,
        actor: { id: "deterministic-agent", type: "MCP_AGENT", displayName: "AEVUM AI" },
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

  const gateway: StudioAgentGateway = {
    async updateNode(update) {
      const client = createAgentMcpClient({
        transport,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        documentId: input.documentId,
        correlationId: update.correlationId,
        timeoutMs: 5_000,
      });
      const payload = {
        nodeId: update.nodeId,
        changes: update.changes,
        expectedDocumentVersion: update.expectedDocumentVersion,
      };
      const dryRun = await client.invoke("node.update", payload, { dryRun: true });
      if (!dryRun.success) throw new Error(dryRun.errors[0]?.message ?? "Agent dry run failed.");
      const applied = await client.invoke("node.update", payload, {
        idempotencyKey: `studio-ai-${update.correlationId}`,
      });
      if (!applied.success) throw new Error(applied.errors[0]?.message ?? "Agent update failed.");
      return {
        dryRunRequestId: dryRun.requestId,
        applyRequestId: applied.requestId,
        resultVersion: applied.documentVersion ?? update.expectedDocumentVersion + 1,
      };
    },
  };
  return Object.freeze(gateway);
}
