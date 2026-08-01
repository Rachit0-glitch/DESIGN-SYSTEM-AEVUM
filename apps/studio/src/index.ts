import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/studio",
  kind: "app",
  responsibility:
    "Inspection and control interface for projects, documents, previews, validation overlays, export configuration, and job status.",
  owns: "User-facing inspection workflows and expert correction surfaces.",
  mustNotOwn: "Own canonical state or bypass the Command Engine.",
  status: "PHASE_0_SHELL",
};

export const STUDIO_STATUS = packageContract.status;
