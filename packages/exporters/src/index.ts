import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporters",
  kind: "package",
  responsibility:
    "Common exporter interfaces, capability reports, export plans, fallback reporting, and adapter registration.",
  owns: "Shared exporter contracts and validation hooks.",
  mustNotOwn: "Hard-code one target stack as the document model.",
  status: "PHASE_0_SHELL",
};

export const EXPORTERS_STATUS = packageContract.status;
