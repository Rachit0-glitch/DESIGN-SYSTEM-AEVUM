import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/mcp-protocol",
  kind: "package",
  responsibility:
    "MCP tool schemas, resources, envelopes, errors, permissions, transactions, and version negotiation contracts.",
  owns: "Model-vendor-independent MCP protocol contracts.",
  mustNotOwn: "Own UI, renderer state, or canonical project state.",
  status: "PHASE_0_SHELL",
};

export const MCP_PROTOCOL_STATUS = packageContract.status;
