import type { PackageContract } from "@aevum/shared";

export * from "./camera.js";
export * from "./commands.js";
export * from "./errors.js";
export { inspect3DAsset, type Inspect3DAssetInput } from "./inspection.js";
export * from "./proposal.js";
export * from "./render-plan.js";
export * from "./types.js";

export const packageContract: PackageContract = {
  name: "@aevum/renderer-3d",
  kind: "package",
  responsibility: "Registered GLB/GLTF inspection, canonical 3D import proposals, and renderer-neutral 3D plans.",
  owns: "Safe 3D asset normalization and deterministic runtime interpretation of canonical scene data.",
  mustNotOwn: "GPU rendering, browser APIs, exporters, uploads, or canonical project state.",
  status: "IMPLEMENTED",
};

export const RENDERER_3D_STATUS = packageContract.status;
