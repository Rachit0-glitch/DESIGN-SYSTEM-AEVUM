import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/render-worker",
  kind: "app",
  responsibility: "Deterministic 2D, 3D, region, layer, animation-frame, sequence, and validation renders.",
  owns: "Render job execution and reproducible render settings.",
  mustNotOwn: "Own canonical state or validation scoring.",
  status: "PHASE_0_SHELL",
};

export const RENDER_WORKER_STATUS = packageContract.status;
