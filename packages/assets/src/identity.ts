import { createHash } from "node:crypto";
import { EntityIdSchema, type AssetRecord } from "@aevum/document-model";

export const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/i;

export function computeSha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function assetIdFromHash(hash: AssetRecord["hash"]): AssetRecord["id"] {
  if (!SHA256_PATTERN.test(hash)) throw new TypeError("Expected a sha256 content hash.");
  const hex = hash.slice("sha256:".length).toLowerCase();
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return EntityIdSchema.parse(`asset_${uuid}`);
}
