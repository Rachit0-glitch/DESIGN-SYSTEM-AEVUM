import type { AssetRecord } from "@aevum/document-model";
import { AssetSystemError } from "./errors.js";
import { registerAsset, type AssetRegistrationResult, type AssetRegistry } from "./registry.js";
import type {
  AssetDetails,
  AssetLicense,
  AssetSecurityAssessment,
  DerivativeOperation,
  JsonObjectSchema,
} from "./schemas.js";
import type { z } from "zod";

type JsonObject = z.infer<typeof JsonObjectSchema>;

export interface CreateDerivativeInput {
  readonly originalAssetId: string;
  readonly bytes: Uint8Array;
  readonly kind: AssetRecord["type"];
  readonly originalFilename: string;
  readonly displayName?: string;
  readonly mimeType: string;
  readonly sourceUri: string;
  readonly createdAt: string;
  readonly registeredAt: string;
  readonly operation: DerivativeOperation;
  readonly operationParameters: JsonObject;
  readonly actor: { readonly id: string; readonly type: "USER" | "MCP_AGENT" | "SYSTEM" | "WORKER" | "PLUGIN" };
  readonly tool: string;
  readonly toolVersion: string;
  readonly details: AssetDetails;
  readonly dimensions?: AssetRecord["dimensions"];
  readonly license?: AssetLicense;
  readonly security: AssetSecurityAssessment;
  readonly extensions?: JsonObject;
  readonly seed?: number;
}

export function createDerivative(registry: AssetRegistry, input: CreateDerivativeInput): AssetRegistrationResult {
  const original = registry[input.originalAssetId];
  if (!original) {
    throw new AssetSystemError("ORIGINAL_ASSET_MISSING", `Original asset ${input.originalAssetId} does not exist.`, {
      originalAssetId: input.originalAssetId,
    });
  }

  return registerAsset(registry, {
    bytes: input.bytes,
    kind: input.kind,
    originalFilename: input.originalFilename,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    mimeType: input.mimeType,
    sourceUri: input.sourceUri,
    createdAt: input.createdAt,
    registeredAt: input.registeredAt,
    provenance: {
      origin: { kind: "DERIVED", uri: input.sourceUri },
      importer: input.actor,
      creator: input.actor,
      parentAssetIds: [original.id],
      processingChain: [
        {
          operation: input.operation,
          createdAt: input.createdAt,
          actor: input.actor,
          tool: input.tool,
          toolVersion: input.toolVersion,
          inputAssetIds: [original.id],
          parameters: input.operationParameters,
          ...(input.seed === undefined ? {} : { seed: input.seed }),
        },
      ],
    },
    ...(input.license ? { license: input.license } : {}),
    ...(input.dimensions ? { dimensions: input.dimensions } : {}),
    details: input.details,
    derivative: {
      originalAssetId: original.id,
      operation: input.operation,
      createdAt: input.createdAt,
      parameters: input.operationParameters,
    },
    extensions: input.extensions ?? {},
    security: input.security,
  });
}
