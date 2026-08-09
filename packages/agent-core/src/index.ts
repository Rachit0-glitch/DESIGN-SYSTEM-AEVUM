import type { PackageContract } from "@aevum/shared";

export * from "./factories.js";
export * from "./schemas.js";
export { deepFreeze } from "./immutable.js";
export { deterministicAgentId, deterministicIdempotencyKey, fingerprint, stableStringify } from "./stable.js";

export const packageContract: PackageContract = {
  name: "@aevum/agent-core",
  kind: "package",
  responsibility: "Immutable, versioned agent session, run, observation, safety, budget, outcome, and audit contracts.",
  owns: "Agent lifecycle records and deterministic agent identity primitives.",
  mustNotOwn: "Planning, context retrieval, MCP transport, provider implementations, or canonical project mutation.",
  status: "IMPLEMENTED",
};

export const AGENT_CORE_STATUS = packageContract.status;
