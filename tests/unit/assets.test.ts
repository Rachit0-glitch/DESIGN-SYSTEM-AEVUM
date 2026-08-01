import {
  ASSET_METADATA_KEY,
  AssetRegistrationInputSchema,
  AssetSystemError,
  assetFixtures,
  assetIdFromHash,
  computeSha256,
  createDerivative,
  deserializeAsset,
  readAssetMetadata,
  registerAsset,
  serializeAsset,
  type AssetRegistrationInput,
} from "@aevum/assets";
import {
  CURRENT_COMMAND_VERSION,
  CommandEngineError,
  createCommandId,
  createTransactionId,
  executeCommand,
  type Command,
} from "@aevum/command-engine";
import { AssetSchema, fixtures } from "@aevum/document-model";
import { describe, expect, it } from "vitest";

const TIME = "2026-08-01T05:00:00.000Z";
const actor = { id: "phase3_asset_tester", type: "USER" as const };

function registeredImage() {
  const result = registerAsset({}, assetFixtures.image);
  if (result.kind !== "REGISTERED") throw new Error("Expected registered image fixture.");
  return result.asset;
}

describe("Asset System", () => {
  it("computes content identity and returns an immutable canonical proposal", () => {
    const result = registerAsset({}, assetFixtures.image);
    if (result.kind !== "REGISTERED") throw new Error("Expected a new asset.");

    expect(result.contentHash).toBe(computeSha256(assetFixtures.image.bytes));
    expect(result.asset.id).toBe(assetIdFromHash(result.contentHash));
    expect(result.asset.byteSize).toBe(assetFixtures.image.bytes.byteLength);
    expect(AssetSchema.parse(result.asset)).toEqual(result.asset);
    expect(readAssetMetadata(result.asset)).toMatchObject({
      originalFilename: "fixture.png",
      status: "REGISTERED",
      details: { kind: "IMAGE", alpha: true },
    });
    expect(Object.isFrozen(result.asset)).toBe(true);
    expect(Object.isFrozen(result.asset.metadata[ASSET_METADATA_KEY] as object)).toBe(true);
  });

  it("returns the existing canonical asset for identical SHA-256 content", () => {
    const existing = registeredImage();
    const registry = Object.freeze({ [existing.id]: existing });
    const result = registerAsset(registry, {
      ...assetFixtures.image,
      originalFilename: "renamed-copy.png",
      sourceUri: "memory://renamed-copy.png",
    });

    expect(result.kind).toBe("DUPLICATE");
    if (result.kind === "DUPLICATE") expect(result.asset).toBe(existing);
    expect(Object.keys(registry)).toEqual([existing.id]);
  });

  it("preserves the original while creating a traceable derivative", () => {
    const original = registeredImage();
    const originalJson = serializeAsset(original);
    const result = createDerivative(
      { [original.id]: original },
      {
        originalAssetId: original.id,
        bytes: new TextEncoder().encode("thumbnail-asset-bytes"),
        kind: "IMAGE",
        originalFilename: "fixture-thumbnail.png",
        mimeType: "image/png",
        sourceUri: "memory://fixture-thumbnail.png",
        createdAt: TIME,
        registeredAt: TIME,
        operation: "THUMBNAIL",
        operationParameters: { width: 320, height: 180 },
        actor,
        tool: "fixture-thumbnailer",
        toolVersion: "1.0.0",
        details: { kind: "IMAGE", alpha: true, exif: {} },
        dimensions: { width: 320, height: 180 },
        security: { status: "PASSED", inspectedAt: TIME, inspector: "fixture-security", issues: [] },
      },
    );
    if (result.kind !== "REGISTERED") throw new Error("Expected a derivative.");
    const metadata = readAssetMetadata(result.asset);

    expect(metadata.derivative).toMatchObject({ originalAssetId: original.id, operation: "THUMBNAIL" });
    expect(metadata.provenance.parentAssetIds).toEqual([original.id]);
    expect(metadata.provenance.processingChain[0]).toMatchObject({ inputAssetIds: [original.id] });
    expect(result.asset.source).toMatchObject({ kind: "DERIVED", originalAssetId: original.id });
    expect(serializeAsset(original)).toBe(originalJson);
  });

  it("validates media metadata and represents security quarantine without registration", () => {
    const invalidVideo = { ...assetFixtures.video, dimensions: { width: 1920, height: 1080 } };
    expect(() => registerAsset({}, invalidVideo as AssetRegistrationInput)).toThrow(AssetSystemError);
    expect(AssetRegistrationInputSchema.safeParse(invalidVideo).success).toBe(false);

    const quarantined = registerAsset(
      {},
      {
        ...assetFixtures.image,
        security: {
          status: "QUARANTINED",
          inspectedAt: TIME,
          inspector: "fixture-security",
          issues: [
            {
              code: "EMBEDDED_SCRIPT",
              severity: "CRITICAL",
              message: "Executable content detected.",
              detectedBy: "fixture",
            },
          ],
        },
      },
    );
    expect(quarantined).toMatchObject({ kind: "QUARANTINED", originalFilename: "fixture.png" });
    expect("asset" in quarantined).toBe(false);
  });

  it("serializes rich asset metadata without loss", () => {
    const asset = registeredImage();
    expect(deserializeAsset(serializeAsset(asset, true))).toEqual(asset);
  });

  it("registers through the Command Engine and prevents hash aliases", () => {
    const document = fixtures.empty();
    const asset = registeredImage();
    const transactionId = createTransactionId();
    const command: Command = {
      id: createCommandId(),
      commandVersion: CURRENT_COMMAND_VERSION,
      documentId: document.metadata.id,
      expectedDocumentVersion: document.documentVersion,
      timestamp: TIME,
      actor,
      correlationId: "corr_phase3_asset",
      transactionId,
      type: "asset.register",
      payload: { asset },
    };
    const committed = executeCommand(document, command);

    expect(document.assets).toEqual({});
    expect(committed.newDocument.assets[asset.id]).toEqual(asset);
    expect(committed.newDocument.documentVersion).toBe(document.documentVersion + 1);

    const alias = { ...asset, id: assetIdFromHash(`sha256:${"f".repeat(64)}`) };
    const aliasCommand: Command = {
      ...command,
      id: createCommandId(),
      expectedDocumentVersion: committed.newDocument.documentVersion,
      transactionId: createTransactionId(),
      payload: { asset: alias },
    };
    expect(() => executeCommand(committed.newDocument, aliasCommand)).toThrow(CommandEngineError);
  });

  it.each(["USDZ", "BINARY"] as const)("supports %s canonical asset records", (kind) => {
    const fixture: AssetRegistrationInput = {
      ...assetFixtures.model,
      bytes: new TextEncoder().encode(`fixture-${kind}`),
      kind,
      originalFilename: kind === "USDZ" ? "scene.usdz" : "payload.bin",
      mimeType: kind === "USDZ" ? "model/vnd.usdz+zip" : "application/octet-stream",
      details:
        kind === "USDZ"
          ? { kind, meshes: 1, materials: 1, textures: 0, animations: 0 }
          : { kind, description: "Opaque source payload" },
    };
    const result = registerAsset({}, fixture);
    expect(result.kind).toBe("REGISTERED");
  });
});
