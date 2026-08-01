import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-gltf",
  kind: "exporter",
  responsibility: "GLTF/GLB export adapter shell for future Multi-Stack Export implementation.",
  owns: "GLTF/GLB target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_GLTF_STATUS = packageContract.status;
