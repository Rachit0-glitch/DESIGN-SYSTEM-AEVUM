import type { CanonicalDesignDocument } from "@aevum/document-model";
import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import {
  type RegisterAssetCommand,
  RegisterAssetCommandSchema,
  type RemoveAssetCommand,
  RemoveAssetCommandSchema,
} from "../schemas.js";

// A best-effort, structural scan rather than an enumerated field list: assets are referenced from
// many places (IMAGE.assetId, SVG.assetId, Reference.assetId, 3D geometry/material/rig fields, ...)
// and a hand-maintained list would silently go stale as new node types are added. Any occurrence of
// the literal asset id anywhere under document.nodes or document.references is treated as "in use".
function assetIsReferenced(document: CanonicalDesignDocument, assetId: string): boolean {
  const seen = new Set<unknown>();
  const scan = (value: unknown): boolean => {
    if (value === assetId) return true;
    if (value === null || typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some(scan);
    return Object.values(value as Record<string, unknown>).some(scan);
  };
  return (
    Object.values(document.nodes).some((node) => scan(node)) ||
    Object.values(document.references).some((reference) => scan(reference))
  );
}

registerCommand<RegisterAssetCommand>({
  type: "asset.register",
  schema: RegisterAssetCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    if (source.assets[command.payload.asset.id]) {
      throw commandError("DUPLICATE_ID", `Asset ${command.payload.asset.id} already exists.`, {
        assetId: command.payload.asset.id,
      });
    }
    const duplicate = Object.values(source.assets).find(
      (asset) => asset.hash.toLowerCase() === command.payload.asset.hash.toLowerCase(),
    );
    if (duplicate) {
      throw commandError("DUPLICATE_ID", `Asset content already exists as ${duplicate.id}.`, {
        assetId: command.payload.asset.id,
        duplicateAssetId: duplicate.id,
        contentHash: duplicate.hash,
      });
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const asset = command.payload.asset;
    return {
      document: { ...source, assets: { ...source.assets, [asset.id]: asset } },
      changes: { added: [asset.id] },
      event: { type: "AssetRegistered", entityIds: [asset.id] },
    };
  },
});

registerCommand<RemoveAssetCommand>({
  type: "asset.remove",
  schema: RemoveAssetCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    if (!source.assets[command.payload.assetId]) {
      throw commandError("REFERENCE_MISSING", `Asset ${command.payload.assetId} does not exist.`, {
        assetId: command.payload.assetId,
      });
    }
    if (assetIsReferenced(source, command.payload.assetId)) {
      throw commandError(
        "CONFLICT_ERROR",
        `Asset ${command.payload.assetId} is still referenced by at least one node or reference and cannot be removed.`,
        { assetId: command.payload.assetId },
      );
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const assets = { ...source.assets };
    delete assets[command.payload.assetId];
    return {
      document: { ...source, assets },
      changes: { removed: [command.payload.assetId] },
      event: { type: "AssetRemoved", entityIds: [command.payload.assetId] },
    };
  },
});
