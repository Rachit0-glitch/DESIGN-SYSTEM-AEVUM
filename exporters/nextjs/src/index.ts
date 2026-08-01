import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-nextjs",
  kind: "exporter",
  responsibility: "Next.js export adapter shell for future Multi-Stack Export implementation.",
  owns: "Next.js target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_NEXTJS_STATUS = packageContract.status;
