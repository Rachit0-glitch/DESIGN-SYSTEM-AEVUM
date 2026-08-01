import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import {
  RegisterAssetCommandSchema,
  RemoveAssetCommandSchema,
  type RegisterAssetCommand,
  type RemoveAssetCommand,
} from "../schemas.js";

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
