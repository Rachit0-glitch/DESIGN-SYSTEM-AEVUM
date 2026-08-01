import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/asset-worker",
  kind: "app",
  responsibility:
    "Asset hashing, extraction, derivative generation, optimization, texture-map tasks, and preservation checks.",
  owns: "Asset processing jobs and derivative traceability.",
  mustNotOwn: "Overwrite original assets or own project state.",
  status: "PHASE_0_SHELL",
};

export const ASSET_WORKER_STATUS = packageContract.status;
