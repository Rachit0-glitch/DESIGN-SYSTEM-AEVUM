import type { PackageContract } from "@aevum/shared";

export { assembleAgentContext } from "./context.js";
export type { AssembleAgentContextInput } from "./context.js";
export { createWorkingMemory, updateWorkingMemory } from "./memory.js";
export * from "./schemas.js";

export const packageContract: PackageContract = {
  name: "@aevum/agent-context",
  kind: "package",
  responsibility:
    "Relevance-driven, budgeted agent context assembly with explicit trust boundaries and working memory.",
  owns: "Context selection, omission reporting, prompt-injection separation, and per-run working memory.",
  mustNotOwn: "Intent planning, MCP execution, persistent canonical state, or provider-specific prompts.",
  status: "IMPLEMENTED",
};

export const AGENT_CONTEXT_STATUS = packageContract.status;
