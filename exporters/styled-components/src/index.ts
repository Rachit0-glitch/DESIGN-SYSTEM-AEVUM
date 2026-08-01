import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-styled-components",
  kind: "exporter",
  responsibility: "Styled Components export adapter shell for future Multi-Stack Export implementation.",
  owns: "Styled Components target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_STYLED_COMPONENTS_STATUS = packageContract.status;
