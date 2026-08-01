import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/reconstruction-worker",
  kind: "app",
  responsibility:
    "Reference preprocessing, analysis, segmentation, inference, proposal creation, and command generation.",
  owns: "Reconstruction job execution and inspectable proposal artifacts.",
  mustNotOwn: "Write arbitrary document state directly.",
  status: "PHASE_0_SHELL",
};

export const RECONSTRUCTION_WORKER_STATUS = packageContract.status;
