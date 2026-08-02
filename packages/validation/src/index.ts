import type { PackageContract } from "@aevum/shared";

export * from "./adapters.js";
export * from "./compare.js";
export * from "./correction.js";
export * from "./engine.js";
export * from "./heatmap.js";
export * from "./reference.js";
export * from "./report.js";
export * from "./schemas.js";
export * from "./serialization.js";
export * from "./task.js";
export * from "./thresholds.js";

export const packageContract: PackageContract = {
  name: "@aevum/validation",
  kind: "package",
  responsibility:
    "Deterministic region-aware Visual Validation, difference attribution, heatmaps, reports, and correction-ready proposals.",
  owns: "Validation tasks, thresholds, comparison metrics, immutable evidence, and non-executable correction plans.",
  mustNotOwn: "Canonical state mutation, Command Engine execution, renderer state, provider SDKs, or correction loops.",
  status: "IMPLEMENTED",
};

export const VALIDATION_STATUS = packageContract.status;
