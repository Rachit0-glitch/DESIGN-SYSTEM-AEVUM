import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-html-css",
  kind: "exporter",
  responsibility: "HTML/CSS export adapter shell for future Multi-Stack Export implementation.",
  owns: "HTML/CSS target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_HTML_CSS_STATUS = packageContract.status;
