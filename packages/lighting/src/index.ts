import type { PackageContract } from "@aevum/shared";

export { analyzeReferenceLighting } from "./analysis.js";
export { createLightingProfiles } from "./profiles.js";
export { buildLightingRig, type BuildLightingRigInput } from "./rig.js";
export { resolveLighting } from "./runtime.js";
export * from "./schemas.js";
export { deepFreeze, lightingEntityId, lightingFingerprint } from "./stable.js";
export { validateLighting } from "./validation.js";

export const packageContract: PackageContract = {
  name: "@aevum/lighting",
  kind: "package",
  responsibility:
    "Canonical lighting-rig construction, reference-light estimation, delivery-profile resolution, and lighting-specific validation.",
  owns: "Deterministic lighting presets, raster-sample analysis, real-time/offline/mobile profile resolution, shadow/reflection quality metrics, and lighting correction proposals.",
  mustNotOwn:
    "Canonical persistence, MCP transport, Agent orchestration, arbitrary Blender execution, camera cinematography, material authoring, or renderer-specific live objects.",
  status: "IMPLEMENTED",
};

export const LIGHTING_STATUS = packageContract.status;
