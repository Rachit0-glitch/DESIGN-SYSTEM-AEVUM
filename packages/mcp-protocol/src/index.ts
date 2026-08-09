import type { PackageContract } from "@aevum/shared";

export * from "./audit.js";
export * from "./envelopes.js";
export * from "./errors.js";
export * from "./foundations.js";
export * from "./permissions.js";
export * from "./tools.js";
export * from "./version.js";

export const packageContract: PackageContract = {
  name: "@aevum/mcp-protocol",
  kind: "package",
  responsibility:
    "MCP tool schemas, resources, envelopes, errors, permissions, transactions, and version negotiation contracts.",
  owns: "Model-vendor-independent MCP protocol contracts.",
  mustNotOwn: "Own UI, renderer state, or canonical project state.",
  status: "IMPLEMENTED",
};

export const MCP_PROTOCOL_STATUS = packageContract.status;
