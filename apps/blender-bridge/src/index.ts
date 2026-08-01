import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/blender-bridge",
  kind: "app",
  responsibility: "Controlled Blender operation execution for professional 3D workflows.",
  owns: "Blender operation manifests, isolated execution, output inspection, and result registration handoff.",
  mustNotOwn: "Treat Blender scenes as canonical state.",
  status: "PHASE_0_SHELL",
};

export const BLENDER_BRIDGE_STATUS = packageContract.status;
