import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-rive",
  kind: "exporter",
  responsibility: "Rive export adapter shell for future Multi-Stack Export implementation.",
  owns: "Rive target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_RIVE_STATUS = packageContract.status;
