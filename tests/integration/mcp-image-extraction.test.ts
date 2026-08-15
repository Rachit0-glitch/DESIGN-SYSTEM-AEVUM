import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  analyzeReference,
  createAssetRegistryResolver,
  createReconstructionTask,
  RECONSTRUCTION_MANIFEST_KEY,
  type ReconstructionManifest,
} from "@aevum/reconstruction";
import { createInMemoryAssetStorage, createMcpTestFixture } from "../helpers/mcp-fixture.js";

// Deterministic pseudo-random noise: real per-pixel color variance (not a solid fill) is what the
// LOCAL segmentation pipeline uses to classify a region as IMAGE rather than SHAPE, so the photo
// region in this fixture must actually vary, not just occupy space.
function noisyPhotoRegionSvg(x: number, y: number, width: number, height: number): string {
  let seed = 42;
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const cell = 6;
  const rects: string[] = [];
  for (let cy = 0; cy < height; cy += cell) {
    for (let cx = 0; cx < width; cx += cell) {
      const r = Math.round(next() * 255);
      const g = Math.round(next() * 255);
      const b = Math.round(next() * 255);
      rects.push(`<rect x="${x + cx}" y="${y + cy}" width="${cell}" height="${cell}" fill="rgb(${r},${g},${b})" />`);
    }
  }
  return rects.join("\n");
}

async function buildFixtureImage(): Promise<Buffer> {
  const width = 320;
  const height = 200;
  const photoX = 40;
  const photoY = 40;
  const photoWidth = 120;
  const photoHeight = 90;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#ffffff" />
      ${noisyPhotoRegionSvg(photoX, photoY, photoWidth, photoHeight)}
      <rect x="200" y="120" width="60" height="40" fill="#2255aa" />
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("asset.register independent image extraction (Block C)", () => {
  it("extracts a real, independently stored derived asset for a genuine photographic region, with full DERIVED lineage", async () => {
    const storage = createInMemoryAssetStorage();
    const fixture = createMcpTestFixture({ assetStorageAdapter: storage, toolTimeoutMs: 30_000 });
    const image = await buildFixtureImage();

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: image.toString("base64"),
        originalFilename: "reference.png",
        mimeType: "image/png",
        width: 320,
        height: 200,
        alpha: false,
        analyzeForReconstruction: true,
      },
      { idempotencyKey: "register-with-extraction" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const data = registered.data as {
      assetId: string;
      commandIds: string[];
      reconstructionAnalysis?: { regionCount: number; textRegionCount: number; extractedImageCount: number };
    };
    expect(data.reconstructionAnalysis?.extractedImageCount).toBeGreaterThanOrEqual(1);
    // One command for the source asset, plus one per extracted derived asset.
    expect(data.commandIds.length).toBeGreaterThanOrEqual(2);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!stored) throw new Error("Document was not persisted.");

    // More assets exist now than just the source: real independent extraction, not just analysis.
    expect(Object.keys(stored.assets).length).toBeGreaterThanOrEqual(2);

    const sourceAsset = stored.assets[data.assetId];
    if (!sourceAsset) throw new Error("Source asset missing from persisted document.");
    const manifest = sourceAsset.metadata[RECONSTRUCTION_MANIFEST_KEY] as ReconstructionManifest;
    const extractedRegion = manifest.regions.find(
      (region) => region.category === "IMAGE" && region.image?.extracted === true,
    );
    expect(extractedRegion, JSON.stringify(manifest.regions)).toBeDefined();
    const derivedAssetId = extractedRegion?.image?.assetId;
    expect(derivedAssetId).toBeDefined();
    expect(derivedAssetId).not.toBe(data.assetId);

    const derivedAsset = derivedAssetId ? stored.assets[derivedAssetId] : undefined;
    if (!derivedAsset) throw new Error("Derived asset missing from persisted document.");
    // Real, independent bytes were written to storage — not just a schema-level record.
    expect(storage.objects.size).toBeGreaterThanOrEqual(2);
    expect(derivedAsset.source.kind).toBe("DERIVED");
    expect(derivedAsset.source.originalAssetId).toBe(data.assetId);
    expect(derivedAsset.hash).not.toBe(sourceAsset.hash);

    // packages/reconstruction's unmodified proposal pipeline must build an IMAGE node that
    // references the independently extracted asset, not a crop of the whole source reference.
    const task = createReconstructionTask({
      projectId: fixture.projectId,
      sourceAssetId: data.assetId,
      qualityMode: "DRAFT",
      targetViewport: { width: 320, height: 200, category: "CUSTOM", orientation: "LANDSCAPE" },
      preserveEditability: true,
      allowRasterFallbacks: true,
      requestedCapabilities: ["REGION_DETECTION", "ASSET_LINKING"],
      deterministicSeed: 0,
      createdAt: new Date().toISOString(),
      createdBy: { id: "test-actor", type: "USER" },
    });
    const resolver = createAssetRegistryResolver(stored.assets);
    const result = analyzeReference(task, resolver);
    expect(result.success, JSON.stringify(!result.success ? result.diagnostics : undefined)).toBe(true);
    if (!result.success) return;
    const extractedCandidate = result.analysis.assetCandidates.find(
      (candidate) => candidate.assetId === derivedAssetId,
    );
    expect(extractedCandidate?.extracted).toBe(true);
  }, 60_000);

  it("leaves a flat-color SHAPE region alone: extraction only applies to real IMAGE-category regions", async () => {
    const storage = createInMemoryAssetStorage();
    const fixture = createMcpTestFixture({ assetStorageAdapter: storage, toolTimeoutMs: 30_000 });
    const flatImage = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 60, height: 40, channels: 3, background: { r: 34, g: 85, b: 170 } },
          })
            .png()
            .toBuffer(),
          left: 60,
          top: 55,
        },
      ])
      .png()
      .toBuffer();

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: flatImage.toString("base64"),
        originalFilename: "reference.png",
        mimeType: "image/png",
        width: 200,
        height: 150,
        alpha: false,
        analyzeForReconstruction: true,
      },
      { idempotencyKey: "register-no-extraction" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const data = registered.data as {
      extractedImageCount?: number;
      reconstructionAnalysis?: { extractedImageCount: number };
    };
    expect(data.reconstructionAnalysis?.extractedImageCount).toBe(0);
    expect(storage.objects.size).toBe(1);
  }, 60_000);
});
