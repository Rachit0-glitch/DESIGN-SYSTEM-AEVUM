import type { PackageContract } from "@aevum/shared";

export * from "./auth.js";
export * from "./executor.js";
export * from "./ids.js";
export * from "./rate-limit.js";
export * from "./redaction.js";
export * from "./registry.js";
export * from "./runtime.js";
export * from "./server-factory.js";
export * from "./tools.js";

export const packageContract: PackageContract = {
  name: "@aevum/mcp-server",
  kind: "app",
  responsibility:
    "MCP-compatible AI control interface for tools, resources, jobs, transactions, and structured errors.",
  owns: "MCP request validation, authorization, command/job translation, and audit integration.",
  mustNotOwn: "Mutate canonical project state directly or depend on Studio UI.",
  status: "IMPLEMENTED",
};

export const MCP_SERVER_STATUS = packageContract.status;
