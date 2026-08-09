import type { PackageContract } from "@aevum/shared";

export * from "./fixtures.js";
export * from "./ids.js";
export * from "./persistence.js";
export * from "./repository.js";
export * from "./schemas.js";
export * from "./store.js";
export * from "./supabase.js";

export const packageContract: PackageContract = {
  name: "@aevum/project-store",
  kind: "package",
  responsibility:
    "Current project state, replay history, snapshots, recovery contracts, autosave contracts, locking, and approved persistence adapters.",
  owns: "Durable project/version storage abstractions and the Supabase project repository adapter.",
  mustNotOwn: "renderer, reconstruction, exporter, authentication policy, or domain command execution logic.",
  status: "IMPLEMENTED",
};

export const PROJECT_STORE_STATUS = packageContract.status;
