import { AssetSchema, type AssetRecord } from "@aevum/document-model";
import { AevumAssetMetadataSchema, ASSET_METADATA_KEY } from "./schemas.js";

export function serializeAsset(asset: AssetRecord, pretty = false): string {
  const validated = deserializeAsset(JSON.stringify(asset));
  return JSON.stringify(validated, null, pretty ? 2 : undefined);
}

export function deserializeAsset(serialized: string): AssetRecord {
  const asset = AssetSchema.parse(JSON.parse(serialized));
  AevumAssetMetadataSchema.parse(asset.metadata[ASSET_METADATA_KEY]);
  return immutable(asset);
}

function immutable<T>(value: T): T {
  if (value && typeof value === "object" && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
