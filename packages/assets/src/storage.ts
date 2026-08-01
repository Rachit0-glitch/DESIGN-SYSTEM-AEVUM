import type { AssetRecord } from "@aevum/document-model";

export type AssetStorageKind = "SUPABASE" | "LOCAL_FILESYSTEM" | "S3" | "CLOUDFLARE_R2" | "MINIO";

export interface StoredAssetObject {
  readonly assetId: string;
  readonly uri: string;
  readonly contentHash: string;
  readonly byteSize: number;
  readonly immutable: true;
}

export interface StoreAssetRequest {
  readonly asset: AssetRecord;
  readonly bytes: Uint8Array;
  readonly expectedHash: string;
}

export interface AssetStorageAdapter {
  readonly id: string;
  readonly kind: AssetStorageKind;
  storeOriginal(request: StoreAssetRequest): Promise<StoredAssetObject>;
  storeDerivative(request: StoreAssetRequest): Promise<StoredAssetObject>;
  read(asset: AssetRecord): Promise<Uint8Array>;
  exists(asset: AssetRecord): Promise<boolean>;
}

export interface QuarantineStore {
  isolate(contentHash: string, bytes: Uint8Array, reasonCodes: readonly string[]): Promise<void>;
  purge(contentHash: string): Promise<void>;
}
