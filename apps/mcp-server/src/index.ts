import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/mcp-server",
  kind: "app",
  responsibility:
    "MCP-compatible AI control interface for tools, resources, jobs, transactions, and structured errors.",
  owns: "MCP request validation, authorization, command/job translation, and audit integration.",
  mustNotOwn: "Mutate canonical project state directly or depend on Studio UI.",
  status: "PHASE_0_SHELL",
};

export const MCP_SERVER_STATUS = packageContract.status;
