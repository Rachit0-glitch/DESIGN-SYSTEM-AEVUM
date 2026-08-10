import type { AgentContextRecord } from "@aevum/agent-context";
import {
  createAgentGoal,
  createAgentSession,
  type AgentBudget,
  type AgentConstraints,
  type AgentGoalCategory,
} from "@aevum/agent-core";
import { createDeterministicReasoningProvider } from "@aevum/agent-planner";
import {
  createAgentEngine,
  createAgentMcpClient,
  createDeterministicApprovalAdapter,
  createInMemoryAgentPersistence,
  createInProcessMcpTransport,
  type McpTransportInput,
} from "@aevum/agent-runtime";
import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { AssetBytesResolver, BlenderToolAdapter } from "@aevum/mcp-server";
import { ROLE_PERMISSIONS, type McpPermission, type McpRole } from "@aevum/mcp-protocol";
import { createMcpTestFixture, MCP_TEST_TIME } from "./mcp-fixture.js";

export interface AgentFixtureOptions {
  readonly role?: McpRole;
  readonly category?: AgentGoalCategory;
  readonly request?: string;
  readonly requestedOutcome?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly targetNodeIds?: readonly string[];
  readonly requiredCapabilities?: readonly string[];
  readonly budget?: Partial<AgentBudget>;
  readonly constraints?: Partial<AgentConstraints>;
  readonly document?: CanonicalDesignDocument;
  readonly actorPermissions?: readonly McpPermission[];
  readonly contextRecords?: readonly AgentContextRecord[];
  readonly approvedTools?: readonly string[];
  readonly clientTimeoutMs?: number;
  readonly mcpToolTimeoutMs?: number;
  readonly blenderAdapter?: BlenderToolAdapter;
  readonly assetBytesAdapter?: AssetBytesResolver;
  readonly intercept?: (
    input: McpTransportInput,
    execute: () => Promise<unknown>,
    mcp: ReturnType<typeof createMcpTestFixture>,
  ) => Promise<unknown>;
}

export function createAgentTestFixture(options: AgentFixtureOptions = {}) {
  const role = options.role ?? "OWNER";
  const mcp = createMcpTestFixture({
    role,
    ...(options.document ? { document: options.document } : {}),
    ...(options.mcpToolTimeoutMs ? { toolTimeoutMs: options.mcpToolTimeoutMs } : {}),
    ...(options.blenderAdapter ? { blenderAdapter: options.blenderAdapter } : {}),
    ...(options.assetBytesAdapter ? { assetBytesAdapter: options.assetBytesAdapter } : {}),
  });
  const calls: McpTransportInput[] = [];
  const transport = createInProcessMcpTransport(async (input) => {
    calls.push(input);
    const execute = () =>
      mcp.executor.execute(input.request, {
        ...(input.authorization ? { authorization: input.authorization } : {}),
        ip: "127.0.0.1",
      });
    return options.intercept ? options.intercept(input, execute, mcp) : execute();
  });
  const goal = createAgentGoal({
    category: options.category ?? "INSPECT",
    request: options.request ?? "Inspect the current project and document hierarchy.",
    requestedOutcome: options.requestedOutcome,
    targetProjectId: mcp.projectId,
    targetDocumentId: mcp.document.metadata.id,
    targetNodeIds: options.targetNodeIds,
    parameters: options.parameters,
    requiredCapabilities: options.requiredCapabilities,
  });
  const session = createAgentSession({
    actorId: mcp.actorSubject,
    workspaceId: mcp.workspaceId,
    projectId: mcp.projectId,
    documentId: mcp.document.metadata.id,
    goal,
    constraints: options.constraints,
    budget: options.budget,
    createdAt: MCP_TEST_TIME,
  });
  const client = createAgentMcpClient({
    transport,
    workspaceId: mcp.workspaceId,
    projectId: mcp.projectId,
    documentId: mcp.document.metadata.id,
    authorization: "Bearer phase-13-test-token",
    correlationId: `correlation-${session.id.slice(-16)}`,
    timeoutMs: options.clientTimeoutMs ?? 2_000,
  });
  const persistence = createInMemoryAgentPersistence();
  const engine = createAgentEngine({
    reasoningProvider: createDeterministicReasoningProvider(),
    mcpClient: client,
    approvalAdapter: createDeterministicApprovalAdapter({
      approvedTools: options.approvedTools,
      timestamp: MCP_TEST_TIME,
    }),
    persistence,
    now: () => Date.parse(MCP_TEST_TIME),
  });
  const contextRecords: readonly AgentContextRecord[] = options.contextRecords ?? [
    {
      id: "project-summary",
      kind: "PROJECT",
      entityId: mcp.projectId,
      relatedEntityIds: [mcp.document.metadata.id],
      keywords: ["project", "document"],
      data: { projectId: mcp.projectId, documentId: mcp.document.metadata.id },
      relevance: 1,
      critical: true,
    },
  ];
  const actorPermissions = [...(options.actorPermissions ?? ROLE_PERMISSIONS[role])];

  return {
    actorPermissions,
    calls,
    client,
    contextRecords,
    engine,
    goal,
    mcp,
    persistence,
    session,
    run(cancellationSignal?: AbortSignal) {
      return engine.execute({
        session,
        contextRecords,
        actorPermissions,
        ...(cancellationSignal ? { cancellationSignal } : {}),
      });
    },
  };
}
