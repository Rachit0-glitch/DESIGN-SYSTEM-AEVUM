import type { PackageContract } from "@aevum/shared";

export * from "./cache.js";
export * from "./config.js";
export * from "./dependency-graph.js";
export * from "./errors.js";
export * from "./fixtures.js";
export * from "./projector.js";
export * from "./responsive.js";
export * from "./serialization.js";
export * from "./stable.js";
export * from "./transforms.js";
export * from "./types.js";

export const packageContract: PackageContract = {
  name: "@aevum/scene-runtime",
  kind: "package",
  responsibility: "Regenerable runtime scene projection from the Canonical Design Document.",
  owns: "Graph traversal, transform resolution, responsive overrides, component resolution, and runtime diagnostics.",
  mustNotOwn: "Mutate canonical state or own renderer/exporter policy.",
  status: "IMPLEMENTED",
};

export const SCENE_RUNTIME_STATUS = packageContract.status;
