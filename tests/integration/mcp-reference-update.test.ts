import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createInMemoryAssetStorage, createMcpTestFixture } from "../helpers/mcp-fixture.js";

async function createSyntheticImage(color: string): Promise<Buffer> {
  const svg = `<svg width="200" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="120" fill="${color}" /></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Block D completeness: Studio's References panel has a "Replace reference" control that was a
 * dead button with no handler. This exercises the real MCP path it now drives -- registering a new
 * asset and updating the existing reference's assetId to point at it, keeping the reference's own
 * identity (and any ValidationRecords that cite it by referenceId) intact.
 */
describe("reference.update MCP tool (Block D completeness)", () => {
  it("replaces a real reference's underlying asset while preserving the reference's own id", async () => {
    const storage = createInMemoryAssetStorage();
    const fixture = createMcpTestFixture({ assetStorageAdapter: storage, toolTimeoutMs: 30_000 });

    const originalImage = await createSyntheticImage("#c23b22");
    const registeredOriginal = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: originalImage.toString("base64"),
        originalFilename: "original.png",
        mimeType: "image/png",
        width: 200,
        height: 120,
        alpha: false,
      },
      { idempotencyKey: "replace-register-original" },
    );
    expect(registeredOriginal.success, JSON.stringify(registeredOriginal.errors)).toBe(true);
    const originalData = registeredOriginal.data as { assetId: string; resultVersion: number };

    const imported = await fixture.execute(
      "reconstruction.import_reference",
      { expectedDocumentVersion: originalData.resultVersion, sourceAssetId: originalData.assetId },
      { idempotencyKey: "replace-import" },
    );
    expect(imported.success, JSON.stringify(imported.errors)).toBe(true);
    const importedData = imported.data as { resultVersion: number; referenceId: string };

    const replacementImage = await createSyntheticImage("#2a6f4b");
    const registeredReplacement = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: importedData.resultVersion,
        kind: "IMAGE",
        bytesBase64: replacementImage.toString("base64"),
        originalFilename: "replacement.png",
        mimeType: "image/png",
        width: 200,
        height: 120,
        alpha: false,
      },
      { idempotencyKey: "replace-register-replacement" },
    );
    expect(registeredReplacement.success, JSON.stringify(registeredReplacement.errors)).toBe(true);
    const replacementData = registeredReplacement.data as { assetId: string; resultVersion: number };

    const beforeUpdate = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    const originalReference = beforeUpdate?.references[importedData.referenceId];
    if (!originalReference) throw new Error("Expected the reconstruction-created reference to exist.");
    expect(originalReference.assetId).toBe(originalData.assetId);

    const dryRun = await fixture.execute(
      "reference.update",
      {
        expectedDocumentVersion: replacementData.resultVersion,
        reference: { ...originalReference, assetId: replacementData.assetId },
      },
      { dryRun: true, idempotencyKey: "replace-update-dry-run" },
    );
    expect(dryRun.success, JSON.stringify(dryRun.errors)).toBe(true);
    const stillOriginal = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(stillOriginal?.references[importedData.referenceId]?.assetId).toBe(originalData.assetId);

    const applied = await fixture.execute(
      "reference.update",
      {
        expectedDocumentVersion: replacementData.resultVersion,
        reference: { ...originalReference, assetId: replacementData.assetId },
      },
      { idempotencyKey: "replace-update-apply" },
    );
    expect(applied.success, JSON.stringify(applied.errors)).toBe(true);

    const afterUpdate = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    const updatedReference = afterUpdate?.references[importedData.referenceId];
    expect(updatedReference?.id).toBe(originalReference.id);
    expect(updatedReference?.assetId).toBe(replacementData.assetId);
    // The original asset itself is untouched -- "replace" repoints the reference, it does not
    // delete or mutate the asset that was replaced.
    expect(afterUpdate?.assets[originalData.assetId]).toBeDefined();
  });

  it("rejects replacing a reference that does not exist", async () => {
    const fixture = createMcpTestFixture({ assetStorageAdapter: createInMemoryAssetStorage() });
    const result = await fixture.execute(
      "reference.update",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        reference: {
          id: "reference_00000000-0000-4000-8000-000000000000",
          assetId: Object.keys(fixture.document.assets)[0] ?? "asset_00000000-0000-4000-8000-000000000000",
          type: "IMAGE",
          role: "PRIMARY",
          regions: [],
          metadata: {},
        },
      },
      { idempotencyKey: "replace-missing-reference" },
    );
    expect(result.success).toBe(false);
  });
});
