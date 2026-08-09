import type { PackageContract } from "@aevum/shared";

export {
  createAgentCapabilities,
  createDeterministicReasoningProvider,
  generateDeterministicPlan,
} from "./deterministic.js";
export { analyzeIntent } from "./intent.js";
export type { AgentReasoningProvider } from "./provider.js";
export { classifyTool, isDestructiveTool, requiresApproval } from "./safety.js";
export * from "./schemas.js";
export { validatePlan } from "./validation.js";

export const packageContract: PackageContract = {
  name: "@aevum/agent-planner",
  kind: "package",
  responsibility:
    "Provider-neutral intent analysis, explicit capability-aware planning, safety classification, and validation.",
  owns: "Agent intents, inspectable plans, dependency ordering, capability gaps, deterministic planning, and replanning contracts.",
  mustNotOwn: "MCP transport, canonical state mutation, context retrieval, or hidden provider reasoning.",
  status: "IMPLEMENTED",
};

export const AGENT_PLANNER_STATUS = packageContract.status;
