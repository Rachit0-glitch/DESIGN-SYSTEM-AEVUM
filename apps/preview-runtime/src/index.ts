import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/preview-runtime",
  kind: "app",
  responsibility:
    "Isolated interactive and deterministic preview runtime for validation, export preview, and browser checks.",
  owns: "Preview bootstrapping and runtime hosting.",
  mustNotOwn: "Own canonical state, command execution, or export adapter policy.",
  status: "PHASE_0_SHELL",
};

export const PREVIEW_RUNTIME_STATUS = packageContract.status;
