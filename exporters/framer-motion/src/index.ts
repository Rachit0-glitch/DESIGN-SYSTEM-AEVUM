import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-framer-motion",
  kind: "exporter",
  responsibility: "Framer Motion export adapter shell for future Multi-Stack Export implementation.",
  owns: "Framer Motion target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_FRAMER_MOTION_STATUS = packageContract.status;
