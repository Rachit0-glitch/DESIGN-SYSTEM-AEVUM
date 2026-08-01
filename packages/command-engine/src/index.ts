import type { PackageContract } from "@aevum/shared";
import "./builtins.js";

export * from "./changes.js";
export * from "./errors.js";
export * from "./events.js";
export * from "./freeze.js";
export * from "./history.js";
export * from "./registry.js";
export * from "./schemas.js";
export * from "./serialization.js";
export * from "./transaction.js";

export const packageContract: PackageContract = {
  name: "@aevum/command-engine",
  kind: "package",
  responsibility:
    "Versioned commands, validation, immutable transactions, change sets, history replay, events, and audit records.",
  owns: "The only meaningful mutation path for canonical state.",
  mustNotOwn: "Studio, renderer, exporter, MCP server, persistence, or networking implementations.",
  status: "IMPLEMENTED",
};

export const COMMAND_ENGINE_STATUS = packageContract.status;
