export * from "./derivatives.js";
export * from "./errors.js";
export * from "./fixtures.js";
export * from "./identity.js";
export * from "./registry.js";
export * from "./schemas.js";
export * from "./serialization.js";
export * from "./storage.js";

export const packageContract = {
  name: "@aevum/assets",
  kind: "package",
  responsibility:
    "Immutable content identity, asset registration proposals, provenance, derivatives, quarantine, and storage contracts.",
  owns: "Asset identity, typed metadata, original-preservation rules, and storage abstraction.",
  mustNotOwn: "Canonical project state, uploads, renderers, processing implementations, or source-asset mutation.",
  status: "IMPLEMENTED",
} as const;

export const ASSETS_STATUS = packageContract.status;
