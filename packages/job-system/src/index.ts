import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/job-system",
  kind: "package",
  responsibility:
    "Job definitions, queues, retries, progress, cancellation, leases, checkpoints, and failure classification.",
  owns: "Long-running work orchestration contracts.",
  mustNotOwn: "Own domain-specific reconstruction, render, or export logic.",
  status: "PHASE_0_SHELL",
};

export const JOB_SYSTEM_STATUS = packageContract.status;
