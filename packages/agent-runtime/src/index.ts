import type { PackageContract } from "@aevum/shared";

export { createDeterministicApprovalAdapter } from "./approval.js";
export type { AgentApprovalAdapter } from "./approval.js";
export { createAgentCancellationController } from "./cancellation.js";
export type { AgentCancellationController } from "./cancellation.js";
export { createAgentMcpClient, createHttpMcpTransport, createInProcessMcpTransport } from "./client.js";
export type {
  AgentMcpClient,
  AgentMcpClientOptions,
  AgentMcpInvokeOptions,
  AgentMcpTransport,
  McpTransportInput,
} from "./client.js";
export { createAgentEngine } from "./engine.js";
export type { AgentEngine, AgentEngineOptions, AgentExecutionResult, ExecuteAgentInput } from "./engine.js";
export { createInMemoryAgentPersistence } from "./persistence.js";
export type { AgentPersistenceAdapter } from "./persistence.js";
export { classifyMcpFailure } from "./retry.js";
export type { AgentFailureClass } from "./retry.js";

export const packageContract: PackageContract = {
  name: "@aevum/agent-runtime",
  kind: "package",
  responsibility: "Bounded execution of explicit agent plans through authenticated typed MCP transports.",
  owns: "MCP client, approval execution, retries, replanning, verification, cancellation, agent persistence, and audit composition.",
  mustNotOwn:
    "Canonical state, Command Engine execution, Supabase writes, server handlers, filesystem access, or shell execution.",
  status: "IMPLEMENTED",
};

export const AGENT_RUNTIME_STATUS = packageContract.status;
