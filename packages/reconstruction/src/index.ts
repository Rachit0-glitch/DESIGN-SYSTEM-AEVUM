import type { PackageContract } from "@aevum/shared";

export * from "./adapters.js";
export * from "./analyzer.js";
export * from "./commands.js";
export * from "./confidence.js";
export * from "./engine.js";
export * from "./fixtures.js";
export * from "./proposal.js";
export * from "./report.js";
export * from "./schemas.js";
export * from "./serialization.js";
export * from "./task.js";

export const packageContract: PackageContract = {
  name: "@aevum/reconstruction",
  kind: "package",
  responsibility: "Deterministic reference analysis, immutable reconstruction proposals, command plans, and reports.",
  owns: "Reconstruction contracts, provider-neutral adapters, confidence, diagnostics, and command generation.",
  mustNotOwn: "Canonical state mutation, renderer execution, storage adapters, or provider-specific processing.",
  status: "IMPLEMENTED",
};

export const RECONSTRUCTION_STATUS = packageContract.status;
