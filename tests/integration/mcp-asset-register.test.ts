import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  analyzeReference,
  createAssetRegistryResolver,
  createReconstructionTask,
  RECONSTRUCTION_MANIFEST_KEY,
} from "@aevum/reconstruction";
import { createGoogleVisionProvider, type GoogleVisionAnnotateResponse, type GoogleVisionClient } from "@aevum/vision";
import { createInMemoryAssetStorage, createMcpTestFixture } from "../helpers/mcp-fixture.js";

function pngBytesBase64(seed: number): string {
  const bytes = new Uint8Array(64).map((_, index) => (index + seed) % 256);
  return Buffer.from(bytes).toString("base64");
}

describe("asset.register MCP tool", () => {
  it("is honestly disabled when no asset storage adapter is configured", async () => {
    const fixture = createMcpTestFixture();
    const result = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: pngBytesBase64(1),
        originalFilename: "reference.png",
        mimeType: "image/png",
        width: 64,
        height: 64,
        alpha: false,
      },
      { idempotencyKey: "register-disabled-check" },
    );
    expect(result.success).toBe(false);
    expect(result.errors[0]?.code).toBe("MCP_TOOL_DISABLED");
  });

  it("registers a new IMAGE asset through Command Engine when a storage adapter is configured", async () => {
    const storage = createInMemoryAssetStorage();
    const fixture = createMcpTestFixture({ assetStorageAdapter: storage });
    const input = {
      expectedDocumentVersion: fixture.document.documentVersion,
      kind: "IMAGE" as const,
      bytesBase64: pngBytesBase64(2),
      originalFilename: "reference.png",
      mimeType: "image/png",
      width: 128,
      height: 96,
      alpha: false,
    };

    const dryRun = await fixture.execute("asset.register", input, {
      dryRun: true,
      idempotencyKey: "register-dry-run",
    });
    expect(dryRun.success).toBe(true);
    expect((dryRun.data as { dryRun: boolean; outcome: string }).dryRun).toBe(true);
    expect((dryRun.data as { outcome: string }).outcome).toBe("REGISTERED");
    // A dry run must not persist anything.
    expect(storage.objects.size).toBe(0);

    const applied = await fixture.execute("asset.register", input, { idempotencyKey: "register-once" });
    expect(applied.success).toBe(true);
    const data = applied.data as { outcome: string; assetId: string; assetHash: string; resultVersion: number };
    expect(data.outcome).toBe("REGISTERED");
    expect(data.resultVersion).toBe(fixture.document.documentVersion + 1);
    expect(storage.objects.size).toBe(1);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    const asset = stored?.assets[data.assetId];
    expect(asset).toMatchObject({ type: "IMAGE", hash: data.assetHash, mimeType: "image/png" });
    expect(asset?.dimensions).toMatchObject({ width: 128, height: 96 });

    const duplicate = await fixture.execute(
      "asset.register",
      { ...input, expectedDocumentVersion: data.resultVersion },
      { idempotencyKey: "register-twice" },
    );
    expect(duplicate.success).toBe(true);
    const duplicateData = duplicate.data as { outcome: string; assetId: string };
    expect(duplicateData.outcome).toBe("DUPLICATE");
    expect(duplicateData.assetId).toBe(data.assetId);
    expect(storage.objects.size).toBe(1);
  });

  it(
    "skips vision analysis on a content-duplicate (real cost guardrail: never pay for a Vision " +
      "call whose result would be discarded), and reconstruction still succeeds via the real whole-" +
      "reference fallback manifest instead of crashing on the asset's missing analysis",
    async () => {
      const storage = createInMemoryAssetStorage();
      const fixture = createMcpTestFixture({ assetStorageAdapter: storage });
      const input = {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE" as const,
        bytesBase64: pngBytesBase64(7),
        originalFilename: "reference.png",
        mimeType: "image/png",
        width: 128,
        height: 96,
        alpha: false,
      };

      const first = await fixture.execute("asset.register", input, { idempotencyKey: "guardrail-register-once" });
      expect(first.success, JSON.stringify(first.errors)).toBe(true);
      const firstData = first.data as { assetId: string; resultVersion: number };

      // Same bytes again, this time asking for analysis — real duplicate detection happens purely
      // from already-canonical content, before any vision call, so this must never run analysis.
      const second = await fixture.execute(
        "asset.register",
        { ...input, expectedDocumentVersion: firstData.resultVersion, analyzeForReconstruction: true },
        { idempotencyKey: "guardrail-register-duplicate-with-analysis" },
      );
      expect(second.success, JSON.stringify(second.errors)).toBe(true);
      const secondData = second.data as {
        outcome: string;
        assetId: string;
        reconstructionAnalysis?: { regionCount: number };
      };
      expect(secondData.outcome).toBe("DUPLICATE");
      expect(secondData.assetId).toBe(firstData.assetId);
      expect(secondData.reconstructionAnalysis).toBeUndefined();

      const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
      if (!stored) throw new Error("Document was not persisted.");
      const asset = stored.assets[secondData.assetId];
      expect(asset?.metadata[RECONSTRUCTION_MANIFEST_KEY]).toBeUndefined();

      // The reconstruction engine must not fail on a manifest-less asset — it falls back to a
      // real, honest whole-reference embedded-image manifest rather than crashing.
      const task = createReconstructionTask({
        projectId: fixture.projectId,
        sourceAssetId: secondData.assetId,
        qualityMode: "DRAFT",
        targetViewport: { width: 128, height: 96, category: "CUSTOM", orientation: "LANDSCAPE" },
        preserveEditability: true,
        allowRasterFallbacks: true,
        requestedCapabilities: ["REGION_DETECTION"],
        deterministicSeed: 0,
        createdAt: new Date().toISOString(),
        createdBy: { id: "test-actor", type: "USER" },
      });
      const resolver = createAssetRegistryResolver(stored.assets);
      const result = analyzeReference(task, resolver);

      expect(result.success, JSON.stringify(!result.success ? result.diagnostics : undefined)).toBe(true);
      if (!result.success) return;
      const imageRegion = result.analysis.regions.find((region) => region.category === "IMAGE");
      expect(imageRegion?.semanticHints).toContain("full-reference-raster-fallback");
    },
  );

  it("registers with real vision analysis, and packages/reconstruction's unmodified analyzeReference() consumes real OCR text from it", async () => {
    const storage = createInMemoryAssetStorage();
    const fixture = createMcpTestFixture({ assetStorageAdapter: storage, toolTimeoutMs: 30_000 });

    const svg = `
        <svg width="400" height="150" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="150" fill="#ffffff" />
          <text x="20" y="90" font-family="Arial" font-size="48" fill="#000000">HELLO WORLD</text>
        </svg>
      `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: image.toString("base64"),
        originalFilename: "reference.png",
        mimeType: "image/png",
        width: 400,
        height: 150,
        alpha: false,
        analyzeForReconstruction: true,
      },
      { idempotencyKey: "register-with-vision" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const data = registered.data as {
      assetId: string;
      reconstructionAnalysis?: { regionCount: number; textRegionCount: number };
    };
    expect(data.reconstructionAnalysis?.textRegionCount).toBeGreaterThanOrEqual(1);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!stored) throw new Error("Document was not persisted.");

    // From here on this is packages/reconstruction's real, UNMODIFIED analyzeReference() and
    // createAssetRegistryResolver() — the same code every fixture-driven reconstruction already
    // uses. The only thing that changed is that the manifest it reads is now genuinely computed
    // from pixels instead of hand-authored.
    const task = createReconstructionTask({
      projectId: fixture.projectId,
      sourceAssetId: data.assetId,
      qualityMode: "DRAFT",
      targetViewport: { width: 400, height: 150, category: "CUSTOM", orientation: "LANDSCAPE" },
      preserveEditability: true,
      allowRasterFallbacks: true,
      requestedCapabilities: ["REGION_DETECTION", "TEXT_DETECTION"],
      deterministicSeed: 0,
      createdAt: new Date().toISOString(),
      createdBy: { id: "test-actor", type: "USER" },
    });
    const resolver = createAssetRegistryResolver(stored.assets);
    const result = analyzeReference(task, resolver);

    expect(result.success, JSON.stringify(!result.success ? result.diagnostics : undefined)).toBe(true);
    if (!result.success) return;
    expect(result.analysis.regions.length).toBeGreaterThan(1);
    const textCandidate = result.analysis.textCandidates.find((candidate) => !candidate.unresolved);
    expect(textCandidate?.content?.toUpperCase()).toContain("HELLO");
  }, 60_000);

  it("routes analyzeForReconstruction through an injected Google Cloud Vision provider end to end", async () => {
    const storage = createInMemoryAssetStorage();

    // A mocked GoogleVisionClient shaped exactly like the real @google-cloud/vision SDK's
    // annotateImage() response — this is what proves the apps/mcp-server adapters.vision wiring
    // (not just the @aevum/vision package in isolation) consumes Google-shaped analysis correctly.
    const googleClient: GoogleVisionClient = {
      annotateImage: async () => {
        const response: GoogleVisionAnnotateResponse = {
          fullTextAnnotation: {
            pages: [
              {
                width: 400,
                height: 150,
                confidence: 0.95,
                blocks: [
                  {
                    boundingBox: {
                      vertices: [
                        { x: 20, y: 55 },
                        { x: 363, y: 55 },
                        { x: 363, y: 91 },
                        { x: 20, y: 91 },
                      ],
                    },
                    confidence: 0.92,
                    blockType: "TEXT",
                    paragraphs: [
                      {
                        boundingBox: {
                          vertices: [
                            { x: 20, y: 55 },
                            { x: 363, y: 55 },
                            { x: 363, y: 91 },
                            { x: 20, y: 91 },
                          ],
                        },
                        confidence: 0.92,
                        words: [
                          {
                            boundingBox: {
                              vertices: [
                                { x: 20, y: 55 },
                                { x: 363, y: 55 },
                                { x: 363, y: 91 },
                                { x: 20, y: 91 },
                              ],
                            },
                            confidence: 0.93,
                            symbols: [
                              { text: "G", confidence: 0.94, boundingBox: { vertices: [] } },
                              { text: "O", confidence: 0.94, boundingBox: { vertices: [] } },
                              { text: "O", confidence: 0.94, boundingBox: { vertices: [] } },
                              { text: "G", confidence: 0.94, boundingBox: { vertices: [] } },
                              { text: "L", confidence: 0.94, boundingBox: { vertices: [] } },
                              { text: "E", confidence: 0.94, boundingBox: { vertices: [] } },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            text: "GOOGLE",
          },
          labelAnnotations: [{ description: "Poster", score: 0.88, topicality: 0.88 }],
          localizedObjectAnnotations: [],
          imagePropertiesAnnotation: {
            dominantColors: { colors: [{ color: { red: 1, green: 1, blue: 1 }, score: 0.9, pixelFraction: 0.8 }] },
          },
        };
        return [response, undefined, undefined];
      },
    };
    const visionProvider = createGoogleVisionProvider({ client: googleClient });
    const fixture = createMcpTestFixture({
      assetStorageAdapter: storage,
      toolTimeoutMs: 30_000,
      visionAdapter: () => visionProvider,
    });

    const flatImage = await sharp({
      create: { width: 400, height: 150, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
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
        width: 400,
        height: 150,
        alpha: false,
        analyzeForReconstruction: true,
      },
      { idempotencyKey: "register-with-google-vision" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const data = registered.data as {
      assetId: string;
      reconstructionAnalysis?: { regionCount: number; textRegionCount: number; diagnostics: readonly string[] };
    };
    // The mocked Google response has exactly one paragraph-level text block ("GOOGLE"), proving the
    // manifest was built from the injected Google-shaped analysis and not the LOCAL OCR fallback,
    // which would never produce this exact content against a blank white image.
    expect(data.reconstructionAnalysis?.textRegionCount).toBe(1);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!stored) throw new Error("Document was not persisted.");

    const task = createReconstructionTask({
      projectId: fixture.projectId,
      sourceAssetId: data.assetId,
      qualityMode: "DRAFT",
      targetViewport: { width: 400, height: 150, category: "CUSTOM", orientation: "LANDSCAPE" },
      preserveEditability: true,
      allowRasterFallbacks: true,
      requestedCapabilities: ["REGION_DETECTION", "TEXT_DETECTION"],
      deterministicSeed: 0,
      createdAt: new Date().toISOString(),
      createdBy: { id: "test-actor", type: "USER" },
    });
    const resolver = createAssetRegistryResolver(stored.assets);
    const result = analyzeReference(task, resolver);

    expect(result.success, JSON.stringify(!result.success ? result.diagnostics : undefined)).toBe(true);
    if (!result.success) return;
    const textCandidate = result.analysis.textCandidates.find((candidate) => !candidate.unresolved);
    expect(textCandidate?.content?.toUpperCase()).toContain("GOOGLE");
  }, 60_000);
});
