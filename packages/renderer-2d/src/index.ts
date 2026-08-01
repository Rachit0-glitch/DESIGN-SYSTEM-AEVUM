import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/renderer-2d",
  kind: "package",
  responsibility: "Hybrid 2D rendering through DOM, CSS, SVG, Canvas, WebGL, and raster composition.",
  owns: "2D render planning and deterministic 2D capture support.",
  mustNotOwn: "Depend on exporters or own canonical state.",
  status: "PHASE_0_SHELL",
};

export const RENDERER_2D_STATUS = packageContract.status;
