import type { AgentApprovalPolicy, AgentToolSafety } from "@aevum/agent-core";
import type { McpToolDescriptor } from "@aevum/mcp-protocol";

const destructiveTools = new Set([
  "node.delete",
  "project.delete",
  "document.delete",
  "asset.delete",
  "timeline.delete",
]);

export function classifyTool(tool: McpToolDescriptor): AgentToolSafety {
  if (destructiveTools.has(tool.name) || tool.name.endsWith(".delete")) return "DESTRUCTIVE_WRITE";
  if (tool.classification === "WRITE") return "SAFE_WRITE";
  return "READ_ONLY";
}

export function requiresApproval(policy: AgentApprovalPolicy, safety: AgentToolSafety): boolean {
  if (safety === "READ_ONLY") return false;
  if (safety === "DESTRUCTIVE_WRITE") return true;
  if (policy === "REQUIRE_ALL_WRITE_APPROVAL" || policy === "AUTO_READ") return true;
  return false;
}

export function isDestructiveTool(tool: string): boolean {
  return destructiveTools.has(tool) || tool.endsWith(".delete");
}
