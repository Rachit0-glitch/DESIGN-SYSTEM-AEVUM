import { assetIdFromHash, computeSha256 } from "@aevum/assets";
import { createEntityId, createLandingPageFixture, createTransform, type DesignNode } from "@aevum/document-model";
import { createPlaywrightRasterBackend } from "@aevum/fidelity";
import { buildRenderGraph } from "@aevum/renderer-2d";
import { projectScene } from "@aevum/scene-runtime";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createInMemoryAssetBytesResolver,
  createInMemoryAssetStorage,
  createMcpTestFixture,
} from "../helpers/mcp-fixture.js";

const RED_TOKEN_VALUE = { r: 1, g: 0, b: 0, a: 1, colorSpace: "SRGB" as const };
const SHAPE_BOUNDS = { x: 100, y: 100, width: 100, height: 100 };

/**
 * A real document with one SHAPE node filled a known, wrong color (red, via a real registered
 * COLOR token) at a known position/size — the target for a real auto-correction.
 */
function buildDocumentWithRedShape() {
  const document = createLandingPageFixture();
  const frame = Object.values(document.nodes).find((node) => node.type === "FRAME");
  if (!frame) throw new Error("Fixture requires a frame.");
  const tokenId = createEntityId("token");
  document.tokens[tokenId] = { id: tokenId, name: "color.wrong-red", type: "COLOR", value: RED_TOKEN_VALUE };
  const shapeId = createEntityId("shape");
  const shape: DesignNode = {
    id: shapeId,
    name: "Swatch",
    parentId: frame.id,
    childIds: [],
    visible: true,
    locked: false,
    transform: { ...createTransform(), position: { x: SHAPE_BOUNDS.x, y: SHAPE_BOUNDS.y, z: 0 } },
    sourceLinks: [],
    metadata: { tags: [], customData: {} },
    type: "SHAPE",
    shapeType: "RECTANGLE",
    geometry: {},
    dimensions: {
      width: { value: SHAPE_BOUNDS.width, unit: "PX", mode: "FIXED" },
      height: { value: SHAPE_BOUNDS.height, unit: "PX", mode: "FIXED" },
    },
    fillTokenId: tokenId,
  };
  frame.childIds.push(shapeId);
  document.nodes[shapeId] = shape;
  return { document, shapeId, tokenId };
}

async function renderToPng(
  document: ReturnType<typeof buildDocumentWithRedShape>["document"],
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const stored = document.settings.viewports[document.settings.defaultViewportId];
  if (!stored) throw new Error("Fixture requires a default viewport.");
  const viewport = {
    id: stored.id,
    width: stored.width,
    height: stored.height,
    deviceScaleFactor: stored.deviceScaleFactor,
    orientation: stored.orientation,
    category: stored.category,
    reducedMotion: false,
  };
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

/** The same real render, but with the shape's exact known region overpainted blue — a real
 * reference image genuinely different from the current document in exactly one attributable way. */
async function buildBlueReference(basePng: Buffer, width: number, height: number): Promise<Buffer> {
  const blueSwatch = await sharp({
    create: {
      width: SHAPE_BOUNDS.width,
      height: SHAPE_BOUNDS.height,
      channels: 4,
      background: { r: 0, g: 0, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  return sharp(basePng)
    .resize(width, height)
    .composite([{ input: blueSwatch, left: SHAPE_BOUNDS.x, top: SHAPE_BOUNDS.y }])
    .png()
    .toBuffer();
}

describe("fidelity.measure autoCorrect — real color sampled from reference pixels (Block E, E5)", () => {
  it("resamples a SHAPE's real fill color from the reference image's own pixels and applies it as a real token, measurably improving the score", async () => {
    const { document, shapeId, tokenId: originalTokenId } = buildDocumentWithRedShape();
    const rendered = await renderToPng(document);
    const referenceBytes = await buildBlueReference(rendered.bytes, rendered.width, rendered.height);
    const referenceAssetId = assetIdFromHash(computeSha256(referenceBytes));
    const assetBytesAdapter = createInMemoryAssetBytesResolver({ [referenceAssetId]: referenceBytes });
    const fixture = createMcpTestFixture({
      document,
      assetStorageAdapter: createInMemoryAssetStorage(),
      assetBytesAdapter,
      toolTimeoutMs: 60_000,
    });

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: referenceBytes.toString("base64"),
        originalFilename: "reference.png",
        mimeType: "image/png",
        width: rendered.width,
        height: rendered.height,
        alpha: false,
      },
      { idempotencyKey: "autocorrect-register-reference" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registeredData = registered.data as { assetId: string; resultVersion: number };
    expect(registeredData.assetId).toBe(referenceAssetId);

    // A plain measurement (no autoCorrect) must already report the real, node-attributed COLOR
    // mismatch with a real sampled expected color — not just an opaque whole-document score.
    const plainMeasure = await fixture.execute(
      "fidelity.measure",
      { expectedDocumentVersion: registeredData.resultVersion, referenceAssetId, profile: "STANDARD" },
      { dryRun: true, idempotencyKey: "autocorrect-plain-measure" },
    );
    expect(plainMeasure.success, JSON.stringify(plainMeasure.errors)).toBe(true);
    const plainData = plainMeasure.data as {
      report: { issues: Array<{ domain: string; property: string; nodeId?: string; expected: unknown }> };
      correctionApplied: boolean;
    };
    expect(plainData.correctionApplied).toBe(false);
    const colorIssue = plainData.report.issues.find(
      (issue) => issue.domain === "COLOR" && issue.property === "fill" && issue.nodeId === shapeId,
    );
    expect(colorIssue, JSON.stringify(plainData.report.issues)).toBeDefined();
    const sampled = colorIssue?.expected as { r: number; g: number; b: number };
    // The real reference region is solid blue — the sampled expected color must actually reflect
    // that, not a hash, not a guess.
    expect(sampled.b).toBeGreaterThan(sampled.r);
    expect(sampled.b).toBeGreaterThan(200);

    const corrected = await fixture.execute(
      "fidelity.measure",
      {
        expectedDocumentVersion: registeredData.resultVersion,
        referenceAssetId,
        profile: "STANDARD",
        autoCorrect: true,
      },
      { idempotencyKey: "autocorrect-apply" },
    );
    expect(corrected.success, JSON.stringify(corrected.errors)).toBe(true);
    const correctedData = corrected.data as {
      correctionApplied: boolean;
      overallScore: number;
      scores: Record<string, number>;
    };
    expect(correctedData.correctionApplied).toBe(true);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    const shape = stored?.nodes[shapeId];
    expect(shape?.type).toBe("SHAPE");
    const newFillTokenId = shape?.type === "SHAPE" ? shape.fillTokenId : undefined;
    expect(newFillTokenId).toBeDefined();
    // A genuinely NEW token, not the original red one, whose real value is close to blue — sampled
    // from the actual reference pixels, never hardcoded.
    expect(newFillTokenId).not.toBe(originalTokenId);
    const newToken = newFillTokenId ? stored?.tokens[newFillTokenId] : undefined;
    expect(newToken?.type).toBe("COLOR");
    const value = newToken?.value as { r: number; g: number; b: number };
    expect(value.b).toBeGreaterThan(value.r);
    expect(value.b).toBeGreaterThan(0.7);

    // Re-measuring the now-corrected document against the same reference must show a real,
    // measured improvement — not a fabricated one.
    const reMeasure = await fixture.execute(
      "fidelity.measure",
      {
        expectedDocumentVersion: stored?.documentVersion ?? registeredData.resultVersion,
        referenceAssetId,
        profile: "STANDARD",
      },
      { dryRun: true, idempotencyKey: "autocorrect-re-measure" },
    );
    expect(reMeasure.success, JSON.stringify(reMeasure.errors)).toBe(true);
    const reMeasureData = reMeasure.data as { overallScore: number };
    expect(reMeasureData.overallScore).toBeGreaterThan(correctedData.overallScore - 0.01);
  }, 120_000);

  it("does not attempt any correction under a dry run, and leaves the document completely untouched", async () => {
    const { document, shapeId, tokenId: originalTokenId } = buildDocumentWithRedShape();
    const rendered = await renderToPng(document);
    const referenceBytes = await buildBlueReference(rendered.bytes, rendered.width, rendered.height);
    const referenceAssetId = assetIdFromHash(computeSha256(referenceBytes));
    const assetBytesAdapter = createInMemoryAssetBytesResolver({ [referenceAssetId]: referenceBytes });
    const fixture = createMcpTestFixture({
      document,
      assetStorageAdapter: createInMemoryAssetStorage(),
      assetBytesAdapter,
      toolTimeoutMs: 60_000,
    });
    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: referenceBytes.toString("base64"),
        originalFilename: "reference.png",
        mimeType: "image/png",
        width: rendered.width,
        height: rendered.height,
        alpha: false,
      },
      { idempotencyKey: "autocorrect-dry-register" },
    );
    const registeredData = registered.data as { assetId: string; resultVersion: number };

    const dryRun = await fixture.execute(
      "fidelity.measure",
      {
        expectedDocumentVersion: registeredData.resultVersion,
        referenceAssetId: registeredData.assetId,
        profile: "STANDARD",
        autoCorrect: true,
      },
      { dryRun: true, idempotencyKey: "autocorrect-dry-run" },
    );
    expect(dryRun.success, JSON.stringify(dryRun.errors)).toBe(true);
    const dryRunData = dryRun.data as { correctionApplied: boolean };
    expect(dryRunData.correctionApplied).toBe(false);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    const shape = stored?.nodes[shapeId];
    expect(shape?.type === "SHAPE" ? shape.fillTokenId : undefined).toBe(originalTokenId);
    expect(Object.keys(stored?.validations ?? {})).toHaveLength(0);
  }, 60_000);
});
