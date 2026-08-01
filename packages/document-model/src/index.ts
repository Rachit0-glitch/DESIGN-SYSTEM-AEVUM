import type { PackageContract } from "@aevum/shared";

export * from "./factory.js";
export * from "./fixtures.js";
export * from "./ids.js";
export * from "./migrations.js";
export * from "./schema.js";
export * from "./serialization.js";
export * from "./validation.js";

export const packageContract: PackageContract = {
  name: "@aevum/document-model",
  kind: "package",
  responsibility: "Canonical Design Document schemas, IDs, serialization contracts, validation, and migrations.",
  owns: "Renderer-independent canonical project representation.",
  mustNotOwn: "renderers, exporters, Studio, MCP server, project persistence, runtime state, or command execution.",
  status: "IMPLEMENTED",
};

export const DOCUMENT_MODEL_STATUS = packageContract.status;
