import type { PackageContract } from "@aevum/shared";

export * from "./types.js";
export * from "./cache.js";
export * from "./quota.js";
export * from "./google-adapter.js";
export * from "./local-adapter.js";
export * from "./manifest.js";
export * from "./provider.js";

export const packageContract: PackageContract = {
  name: "@aevum/vision",
  kind: "package",
  responsibility:
    "Provider-neutral computer-vision analysis contract, with a real Google Cloud Vision adapter and a real local/free adapter, converting either into packages/reconstruction's ReconstructionManifest.",
  owns: "VisionProvider interface, Google Cloud Vision adapter, local adapter, analysis caching, quota guardrails, and VisionAnalysis-to-manifest conversion.",
  mustNotOwn:
    "Canonical state mutation, MCP transport, Studio/browser code, or reconstruction proposal/command generation.",
  status: "IMPLEMENTED",
};

export const VISION_STATUS = packageContract.status;
