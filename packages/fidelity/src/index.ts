import type { PackageContract } from "@aevum/shared";

export * from "./cache.js";
export * from "./color.js";
export * from "./measurement.js";
export * from "./orchestrator.js";
export * from "./phase8.js";
export * from "./pixels.js";
export * from "./profiles.js";
export * from "./raster.js";
export * from "./reference.js";
export * from "./schemas.js";
export * from "./stable.js";
export * from "./structure.js";

export const packageContract: PackageContract = {
  name: "@aevum/fidelity",
  kind: "package",
  responsibility:
    "Maximum Fidelity raster measurement, cross-domain scoring, attribution, and bounded convergence orchestration.",
  owns: "Real 2D raster execution, pixel metrics and heatmaps, fidelity profiles, coverage/confidence scoring, reference evidence boundaries, and convergence policy.",
  mustNotOwn:
    "Canonical state, command execution, reconstruction mutation, persistent correction, browser UI, arbitrary provider credentials, or domain-specific 3D engines.",
  status: "IMPLEMENTED",
};

export const FIDELITY_STATUS = packageContract.status;
