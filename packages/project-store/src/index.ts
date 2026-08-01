import type { PackageContract } from "@aevum/shared";

export * from "./fixtures.js";
export * from "./ids.js";
export * from "./persistence.js";
export * from "./schemas.js";
export * from "./store.js";

export const packageContract: PackageContract = {
  name: "@aevum/project-store",
  kind: "package",
  responsibility:
    "Current project state, replay history, snapshots, recovery contracts, autosave contracts, and locking.",
  owns: "Durable project and version storage abstractions without a concrete persistence adapter.",
  mustNotOwn: "renderer, reconstruction, exporter, database, networking, or command execution logic.",
  status: "IMPLEMENTED",
};

export const PROJECT_STORE_STATUS = packageContract.status;
