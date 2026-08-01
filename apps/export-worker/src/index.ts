import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/export-worker",
  kind: "app",
  responsibility:
    "Export planning, adapter execution, build verification, render verification, packaging, and export reports.",
  owns: "Export job orchestration and sandboxed target generation.",
  mustNotOwn: "Invent target-specific source of truth or mutate documents outside commands.",
  status: "PHASE_0_SHELL",
};

export const EXPORT_WORKER_STATUS = packageContract.status;
