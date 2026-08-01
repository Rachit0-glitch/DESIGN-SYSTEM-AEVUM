import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/sandbox",
  kind: "package",
  responsibility:
    "Execution isolation, resource limits, network restrictions, export builds, and untrusted code handling.",
  owns: "Sandbox policy and temporary workspace lifecycle contracts.",
  mustNotOwn: "Own project state or exporter target semantics.",
  status: "PHASE_0_SHELL",
};

export const SANDBOX_STATUS = packageContract.status;
