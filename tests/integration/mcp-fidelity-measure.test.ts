import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { assetIdFromHash, computeSha256 } from "@aevum/assets";
import { fixtures } from "@aevum/document-model";
import { createPlaywrightRasterBackend } from "@aevum/fidelity";
import { buildRenderGraph } from "@aevum/renderer-2d";
import { createRuntimeViewport, projectScene } from "@aevum/scene-runtime";
import {
  createInMemoryAssetBytesResolver,
  createInMemoryAssetStorage,
  createMcpTestFixture,
} from "../helpers/mcp-fixture.js";

/**
 * D8: fidelity.measure computes a real ValidationRecord from an actual headless-browser render
 * compared against a real reference image — no fabricated scores anywhere in this path. The
 * reference here is a real render of the SAME document (via the exact pipeline fidelity.measure
 * itself uses internally), so a near-perfect score is a genuine, expected result, not a rigged one.
 */
async function renderDocumentToPng(document: ReturnType<typeof fixtures.assetDemo>): Promise<{
  bytes: Buffer;
  width: number;
  height: number;
}> {
  const viewport = createRuntimeViewport(document);
  const projection = projectScene(document, viewport, { strictMode: false });
  const graph = buildRenderGraph(projection);
  const backend = createPlaywrightRasterBackend({
    assetResolver: { id: "test-empty-resolver", version: "1.0.0", resolve: async () => undefined },
  });
  try {
    const raster = await backend.render(graph, {
      width: viewport.width,
      height: viewport.height,
      devicePixelRatio: 1,
      background: { r: 255, g: 255, b: 255, a: 1 },
      qualityProfile: "STANDARD",
      time: 0,
      reducedMotion: false,
      format: "RGBA8",
      maxNodes: 20_000,
      maxPixels: 16_777_216,
      timeoutMs: 30_000,
    });
    const bytes = await sharp(Buffer.from(raster.data), {
      raw: { width: raster.width, height: raster.height, channels: 4 },
    })
      .png()
      .toBuffer();
    return { bytes, width: raster.width, height: raster.height };
  } finally {
    await backend.close();
  }
}

describe("fidelity.measure MCP tool (Block D8)", () => {
  it("computes a real ValidationRecord from an actual headless-browser render vs. a real reference image, and persists it", async () => {
    const document = fixtures.assetDemo();
    const storage = createInMemoryAssetStorage();
    const rendered = await renderDocumentToPng(document);
    // The registered asset's id is a deterministic function of its content hash
    // (assetIdFromHash), so the resolver can be built before registration ever happens.
    const referenceAssetId = assetIdFromHash(computeSha256(rendered.bytes));
    const assetBytesAdapter = createInMemoryAssetBytesResolver({ [referenceAssetId]: rendered.bytes });
    const fixture = createMcpTestFixture({
      document,
      assetStorageAdapter: storage,
      assetBytesAdapter,
      toolTimeoutMs: 60_000,
    });

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: rendered.bytes.toString("base64"),
        originalFilename: "reference.png",
        mimeType: "image/png",
        width: rendered.width,
        height: rendered.height,
        alpha: false,
      },
      { idempotencyKey: "measure-register-reference" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registeredData = registered.data as { assetId: string; resultVersion: number };
    expect(registeredData.assetId).toBe(referenceAssetId);

    const dryRun = await fixture.execute(
      "fidelity.measure",
      {
        expectedDocumentVersion: registeredData.resultVersion,
        referenceAssetId: registeredData.assetId,
        profile: "STANDARD",
      },
      { dryRun: true, idempotencyKey: "measure-dry-run" },
    );
    expect(dryRun.success, JSON.stringify(dryRun.errors)).toBe(true);
    const dryRunData = dryRun.data as { dryRun: boolean; overallScore: number };
    expect(dryRunData.dryRun).toBe(true);
    expect(dryRunData.overallScore).toBeGreaterThan(0);
    const beforeMeasure = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(Object.keys(beforeMeasure?.validations ?? {})).toHaveLength(0);

    const applied = await fixture.execute(
      "fidelity.measure",
      {
        expectedDocumentVersion: registeredData.resultVersion,
        referenceAssetId: registeredData.assetId,
        profile: "STANDARD",
      },
      { idempotencyKey: "measure-apply" },
    );
    expect(applied.success, JSON.stringify(applied.errors)).toBe(true);
    const appliedData = applied.data as {
      validationRecordId: string;
      status: string;
      scores: Record<string, number>;
      overallScore: number;
      coverage: number;
      confidence: number;
    };
    // The reference is a real render of the exact same document — a genuinely high real score
    // is the expected, honest outcome here, not a fabricated one.
    expect(appliedData.overallScore).toBeGreaterThan(0.9);
    expect(appliedData.scores.RASTER).toBeGreaterThan(0.9);
    expect(["PASSED", "WARNING"]).toContain(appliedData.status);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    const record = stored?.validations[appliedData.validationRecordId];
    expect(record).toBeDefined();
    expect(record?.status).toBe(appliedData.status);
    expect(record?.scores.RASTER).toBeCloseTo(appliedData.scores.RASTER ?? 0, 5);
  }, 120_000);

  it("is honestly disabled when no asset-byte resolver is configured", async () => {
    const fixture = createMcpTestFixture();
    const result = await fixture.execute(
      "fidelity.measure",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        referenceAssetId: Object.keys(fixture.document.assets)[0] ?? "asset_00000000-0000-4000-8000-000000000000",
        profile: "STANDARD",
      },
      { idempotencyKey: "measure-disabled-check" },
    );
    expect(result.success).toBe(false);
    expect(result.errors[0]?.code).toBe("MCP_TOOL_DISABLED");
  });
});
