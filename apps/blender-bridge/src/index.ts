import type { PackageContract } from "@aevum/shared";

export * from "./config.js";
export * from "./errors.js";
export * from "./identity.js";
export * from "./health.js";
export * from "./mcp-adapter.js";
export * from "./process.js";
export * from "./protocol.js";
export * from "./reconciliation.js";
export * from "./runner.js";
export * from "./runtime.js";
export * from "./stable.js";
export * from "./workspace.js";

export const packageContract: PackageContract = {
  name: "@aevum/blender-bridge",
  kind: "app",
  responsibility: "Controlled Blender operation execution for professional 3D workflows.",
  owns: "Blender operation manifests, isolated execution, output inspection, and result registration handoff.",
  mustNotOwn: "Treat Blender scenes as canonical state.",
  status: "IMPLEMENTED",
};

export const BLENDER_BRIDGE_STATUS = packageContract.status;
