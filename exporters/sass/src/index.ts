import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-sass",
  kind: "exporter",
  responsibility: "Sass export adapter shell for future Multi-Stack Export implementation.",
  owns: "Sass target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_SASS_STATUS = packageContract.status;
