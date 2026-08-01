import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-css-modules",
  kind: "exporter",
  responsibility: "CSS Modules export adapter shell for future Multi-Stack Export implementation.",
  owns: "CSS Modules target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_CSS_MODULES_STATUS = packageContract.status;
