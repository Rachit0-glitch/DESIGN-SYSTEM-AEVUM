import { AssetSchema, type AssetRecord } from "@aevum/document-model";
import { AssetSystemError } from "./errors.js";
import { assetIdFromHash, computeSha256 } from "./identity.js";
import {
  ASSET_METADATA_KEY,
  ASSET_METADATA_VERSION,
  AevumAssetMetadataSchema,
  AssetRegistrationInputSchema,
  type AevumAssetMetadata,
  type AssetRegistrationInput,
  type QuarantineIssue,
} from "./schemas.js";

export type AssetRegistry = Readonly<Record<string, AssetRecord>>;

export type AssetRegistrationResult =
  | { readonly kind: "REGISTERED"; readonly asset: AssetRecord; readonly contentHash: string }
  | { readonly kind: "DUPLICATE"; readonly asset: AssetRecord; readonly contentHash: string }
  | {
      readonly kind: "QUARANTINED";
      readonly contentHash: string;
      readonly originalFilename: string;
      readonly issues: readonly QuarantineIssue[];
    };

function immutable<T>(value: T): T {
  if (value && typeof value === "object" && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

export function findAssetByHash(registry: AssetRegistry, hash: string): AssetRecord | undefined {
  return Object.values(registry).find((asset) => asset.hash.toLowerCase() === hash.toLowerCase());
}

export function readAssetMetadata(asset: AssetRecord): AevumAssetMetadata {
  const metadata = asset.metadata[ASSET_METADATA_KEY];
  const complete = AevumAssetMetadataSchema.safeParse(metadata);
  if (!complete.success) {
    throw new AssetSystemError("ASSET_METADATA_INVALID", `Asset ${asset.id} has invalid Phase 3 metadata.`, {
      issues: complete.error.issues,
    });
  }
  return immutable(complete.data);
}

export function registerAsset(registry: AssetRegistry, rawInput: AssetRegistrationInput): AssetRegistrationResult {
  const parsed = AssetRegistrationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AssetSystemError("ASSET_INPUT_INVALID", "Asset registration input is invalid.", {
      issues: parsed.error.issues,
    });
  }
  const input = parsed.data;
  const contentHash = computeSha256(input.bytes);

  if (input.security.status === "QUARANTINED") {
    return immutable({
      kind: "QUARANTINED",
      contentHash,
      originalFilename: input.originalFilename,
      issues: input.security.issues,
    });
  }

  const duplicate = findAssetByHash(registry, contentHash);
  if (duplicate) return immutable({ kind: "DUPLICATE", asset: duplicate, contentHash });

  const phaseMetadata: AevumAssetMetadata = {
    schemaVersion: ASSET_METADATA_VERSION,
    originalFilename: input.originalFilename,
    createdAt: input.createdAt,
    registeredAt: input.registeredAt,
    status: input.status,
    provenance: input.provenance,
    ...(input.license ? { license: input.license } : {}),
    details: input.details,
    ...(input.derivative ? { derivative: input.derivative } : {}),
  };
  const sourceKind = input.derivative
    ? "DERIVED"
    : input.provenance.origin.kind === "GENERATED"
      ? "GENERATED"
      : input.provenance.origin.kind === "REMOTE"
        ? "REMOTE"
        : "UPLOAD";

  const asset = AssetSchema.parse({
    id: assetIdFromHash(contentHash),
    type: input.kind,
    name: input.displayName ?? input.originalFilename,
    hash: contentHash,
    source: {
      kind: sourceKind,
      uri: input.sourceUri,
      ...(input.derivative ? { originalAssetId: input.derivative.originalAssetId } : {}),
    },
    mimeType: input.mimeType,
    byteSize: input.bytes.byteLength,
    ...(input.dimensions ? { dimensions: input.dimensions } : {}),
    metadata: { ...input.extensions, [ASSET_METADATA_KEY]: phaseMetadata },
  });

  return immutable({ kind: "REGISTERED", asset, contentHash });
}
