import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-canva",
  kind: "exporter",
  responsibility: "Canva export adapter shell for future Multi-Stack Export implementation.",
  owns: "Canva target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_CANVA_STATUS = packageContract.status;
