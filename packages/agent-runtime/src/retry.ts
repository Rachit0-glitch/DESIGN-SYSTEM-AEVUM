import type { McpErrorCode, McpResponseEnvelope } from "@aevum/mcp-protocol";

export type AgentFailureClass = "RETRYABLE" | "REPLAN_REQUIRED" | "NON_RETRYABLE";

const retryable = new Set<McpErrorCode>(["MCP_TIMEOUT", "MCP_RATE_LIMITED", "MCP_INTERNAL_ERROR"]);
const replan = new Set<McpErrorCode>(["MCP_DOCUMENT_VERSION_CONFLICT", "MCP_TOOL_NOT_FOUND", "MCP_TOOL_DISABLED"]);

export function classifyMcpFailure(response: McpResponseEnvelope): AgentFailureClass {
  const code = response.errors[0]?.code;
  if (code && retryable.has(code)) return "RETRYABLE";
  if (code && replan.has(code)) return "REPLAN_REQUIRED";
  return "NON_RETRYABLE";
}
