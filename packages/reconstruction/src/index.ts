import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/reconstruction",
  kind: "package",
  responsibility:
    "Reference analysis contracts, reconstruction proposals, inference outputs, confidence scoring, and correction proposals.",
  owns: "Structured proposals and command-generation contracts.",
  mustNotOwn: "Mutate canonical state directly.",
  status: "PHASE_0_SHELL",
};

export const RECONSTRUCTION_STATUS = packageContract.status;
