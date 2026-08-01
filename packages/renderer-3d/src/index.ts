import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/renderer-3d",
  kind: "package",
  responsibility:
    "Browser 3D runtime contracts, scene loading, camera/lighting/material runtime, and deterministic 3D capture support.",
  owns: "3D runtime interpretation of canonical scene data.",
  mustNotOwn: "Depend on exporters or treat runtime scenes as source of truth.",
  status: "PHASE_0_SHELL",
};

export const RENDERER_3D_STATUS = packageContract.status;
