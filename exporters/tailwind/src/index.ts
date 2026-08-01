import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-tailwind",
  kind: "exporter",
  responsibility: "Tailwind CSS export adapter shell for future Multi-Stack Export implementation.",
  owns: "Tailwind CSS target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_TAILWIND_STATUS = packageContract.status;
