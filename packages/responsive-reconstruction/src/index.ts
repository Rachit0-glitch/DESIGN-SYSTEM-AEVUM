import type { PackageContract } from "@aevum/shared";

export * from "./engine.js";
export * from "./inference.js";
export * from "./report.js";
export * from "./schemas.js";
export * from "./serialization.js";
export * from "./task.js";
export * from "./transaction.js";
export * from "./validation.js";

export const packageContract: PackageContract = {
  name: "@aevum/responsive-reconstruction",
  kind: "package",
  responsibility: "Deterministic, validated, Command Engine controlled responsive reconstruction.",
  owns: "Responsive tasks, reference evidence, local intent inference, canonical override proposals, multi-viewport verification, and reports.",
  mustNotOwn:
    "Canonical state, direct mutation, browser layout, creative content generation, exporters, Studio, MCP, or deployment.",
  status: "IMPLEMENTED",
};

export const RESPONSIVE_RECONSTRUCTION_STATUS = packageContract.status;
