import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { DesignNode } from "@aevum/document-model";
import { createGoogleVisionProvider, type GoogleVisionAnnotateResponse, type GoogleVisionClient } from "@aevum/vision";
import { createInMemoryAssetStorage, createMcpTestFixture } from "../helpers/mcp-fixture.js";

// Real, high-contrast dark text on a light background so ink-color sampling has a genuine
// minority cluster to find, and a distinct solid-colored rect for fill sampling. Region *bounds*
// come from a mocked Google Vision client (below) so this test is immune to the LOCAL OCR
// pipeline's real, pre-existing false-positive risk on solid rectangles — but the *color* sampled
// for each region is always real pixel math over these actual bytes, regardless of provider.
async function buildFixtureImage(): Promise<Buffer> {
  const svg = `
    <svg width="300" height="150" xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="150" fill="#ffffff" />
      <text x="20" y="60" font-family="Arial" font-size="36" font-weight="bold" fill="#1a1a1a">HELLO</text>
    </svg>
  `;
  const rect = await sharp({ create: { width: 80, height: 40, channels: 3, background: { r: 34, g: 85, b: 170 } } })
    .png()
    .toBuffer();
  return sharp(Buffer.from(svg))
    .composite([{ input: rect, left: 180, top: 90 }])
    .png()
    .toBuffer();
}

function mockGoogleVisionClient(): GoogleVisionClient {
  const response: GoogleVisionAnnotateResponse = {
    fullTextAnnotation: {
      pages: [
        {
          width: 300,
          height: 150,
          confidence: 0.95,
          blocks: [
            {
              boundingBox: {
                vertices: [
                  { x: 20, y: 30 },
                  { x: 145, y: 30 },
                  { x: 145, y: 65 },
                  { x: 20, y: 65 },
                ],
              },
              confidence: 0.93,
              blockType: "TEXT",
              paragraphs: [
                {
                  boundingBox: {
                    vertices: [
                      { x: 20, y: 30 },
                      { x: 145, y: 30 },
                      { x: 145, y: 65 },
                      { x: 20, y: 65 },
                    ],
                  },
                  confidence: 0.93,
                  words: [
                    {
                      boundingBox: {
                        vertices: [
                          { x: 20, y: 30 },
                          { x: 145, y: 30 },
                          { x: 145, y: 65 },
                          { x: 20, y: 65 },
                        ],
                      },
                      confidence: 0.93,
                      symbols: [
                        { text: "H", confidence: 0.95, boundingBox: { vertices: [] } },
                        { text: "E", confidence: 0.95, boundingBox: { vertices: [] } },
                        { text: "L", confidence: 0.95, boundingBox: { vertices: [] } },
                        { text: "L", confidence: 0.95, boundingBox: { vertices: [] } },
                        { text: "O", confidence: 0.95, boundingBox: { vertices: [] } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      text: "HELLO",
    },
    labelAnnotations: [],
    localizedObjectAnnotations: [
      {
        name: "Rectangle",
        score: 0.7,
        boundingPoly: {
          normalizedVertices: [
            { x: 180 / 300, y: 90 / 150 },
            { x: 260 / 300, y: 90 / 150 },
            { x: 260 / 300, y: 130 / 150 },
            { x: 180 / 300, y: 130 / 150 },
          ],
        },
      },
    ],
    imagePropertiesAnnotation: {
      dominantColors: { colors: [{ color: { red: 1, green: 1, blue: 1 }, score: 0.8, pixelFraction: 0.7 }] },
    },
  };
  return { annotateImage: async () => [response] };
}

/** A real gradient rectangle and a real stroked rectangle, side by side. */
async function buildGradientStrokeFixtureImage(): Promise<Buffer> {
  const svg = `
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ff0000" />
          <stop offset="100%" stop-color="#0000ff" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="#ffffff" />
      <rect x="40" y="40" width="150" height="100" fill="url(#g)" />
      <rect x="220" y="40" width="120" height="100" fill="#2255aa" stroke="#000000" stroke-width="6" />
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function mockGoogleVisionClientForGradientStroke(): GoogleVisionClient {
  const response: GoogleVisionAnnotateResponse = {
    fullTextAnnotation: { pages: [{ width: 400, height: 300, confidence: 1, blocks: [] }], text: "" },
    labelAnnotations: [],
    localizedObjectAnnotations: [
      {
        name: "gradient-rect",
        score: 0.7,
        boundingPoly: {
          normalizedVertices: [
            { x: 40 / 400, y: 40 / 300 },
            { x: 190 / 400, y: 40 / 300 },
            { x: 190 / 400, y: 140 / 300 },
            { x: 40 / 400, y: 140 / 300 },
          ],
        },
      },
      {
        // Object detection covers the whole visible object, stroke included — the true visible
        // extent is 6px outside the nominal rect edge on every side (stroke-width=6 straddles it).
        name: "stroked-rect",
        score: 0.7,
        boundingPoly: {
          normalizedVertices: [
            { x: 217 / 400, y: 37 / 300 },
            { x: 343 / 400, y: 37 / 300 },
            { x: 343 / 400, y: 143 / 300 },
            { x: 217 / 400, y: 143 / 300 },
          ],
        },
      },
    ],
    imagePropertiesAnnotation: {
      dominantColors: { colors: [{ color: { red: 1, green: 1, blue: 1 }, score: 0.8, pixelFraction: 0.5 }] },
    },
  };
  return { annotateImage: async () => [response] };
}

describe("Paint model: real color tokens (Block C)", () => {
  it("registers real, resolvable COLOR tokens for TEXT ink and SHAPE fill — not dangling fillTokenId references", async () => {
    const storage = createInMemoryAssetStorage();
    const visionProvider = createGoogleVisionProvider({ client: mockGoogleVisionClient() });
    const fixture = createMcpTestFixture({
      assetStorageAdapter: storage,
      toolTimeoutMs: 30_000,
      visionAdapter: () => visionProvider,
    });
    const image = await buildFixtureImage();

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: image.toString("base64"),
        originalFilename: "reference.png",
        mimeType: "image/png",
        width: 300,
        height: 150,
        alpha: false,
        analyzeForReconstruction: true,
      },
      { idempotencyKey: "register-for-color-tokens" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registerData = registered.data as { assetId: string };

    const afterRegister = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!afterRegister) throw new Error("Document was not persisted after registration.");
    const imported = await fixture.execute(
      "reconstruction.import_reference",
      {
        expectedDocumentVersion: afterRegister.documentVersion,
        sourceAssetId: registerData.assetId,
        qualityMode: "DRAFT",
      },
      { idempotencyKey: "import-for-color-tokens" },
    );
    expect(imported.success, JSON.stringify(imported.errors)).toBe(true);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!stored) throw new Error("Document was not persisted.");

    const textNode = Object.values(stored.nodes).find(
      (node) => node.type === "TEXT" && node.runs[0]?.style.fillTokenId,
    );
    expect(textNode, JSON.stringify(Object.values(stored.nodes).map((n) => n.type))).toBeDefined();
    const textFillTokenId = (textNode as { runs: { style: { fillTokenId?: string } }[] }).runs[0]?.style.fillTokenId;
    expect(textFillTokenId).toBeDefined();
    // The critical assertion: the token this node references must actually exist in the document,
    // not just be a plausible-looking id that was never committed.
    const textToken = textFillTokenId ? stored.tokens[textFillTokenId] : undefined;
    expect(textToken, `fillTokenId ${textFillTokenId} must resolve to a real token in the document`).toBeDefined();
    expect(textToken?.type).toBe("COLOR");
    // #1a1a1a is a dark, near-black color.
    const textColor = textToken?.value as { r: number; g: number; b: number };
    expect(textColor.r).toBeLessThan(0.3);
    expect(textColor.g).toBeLessThan(0.3);
    expect(textColor.b).toBeLessThan(0.3);

    const shapeFillTokenIds = Object.values(stored.nodes)
      .filter((node) => node.type === "SHAPE")
      .map((node) => (node as { fillTokenId?: string }).fillTokenId)
      .filter((tokenId): tokenId is string => tokenId !== undefined);
    expect(shapeFillTokenIds.length, JSON.stringify(Object.values(stored.nodes).map((n) => n.type))).toBeGreaterThan(0);
    const shapeColors = shapeFillTokenIds.map((tokenId) => {
      const token = stored.tokens[tokenId];
      expect(token, `fillTokenId ${tokenId} must resolve to a real token in the document`).toBeDefined();
      return token?.value as { r: number; g: number; b: number };
    });
    // #2255aa -> roughly (0.13, 0.33, 0.67) in the 0-1 ColorSchema range.
    const blueFill = shapeColors.find((color) => color.r < 0.25 && color.r > 0.03 && color.b > 0.5);
    expect(blueFill, JSON.stringify(shapeColors)).toBeDefined();
  }, 60_000);

  it("registers real, resolvable GRADIENT and stroke COLOR tokens from a detected gradient shape and a stroked shape (Block C4d)", async () => {
    const storage = createInMemoryAssetStorage();
    const visionProvider = createGoogleVisionProvider({ client: mockGoogleVisionClientForGradientStroke() });
    const fixture = createMcpTestFixture({
      assetStorageAdapter: storage,
      toolTimeoutMs: 30_000,
      visionAdapter: () => visionProvider,
    });
    const image = await buildGradientStrokeFixtureImage();

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: image.toString("base64"),
        originalFilename: "gradient-stroke-reference.png",
        mimeType: "image/png",
        width: 400,
        height: 300,
        alpha: false,
        analyzeForReconstruction: true,
      },
      { idempotencyKey: "register-for-gradient-stroke-tokens" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registerData = registered.data as { assetId: string };

    const afterRegister = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!afterRegister) throw new Error("Document was not persisted after registration.");
    const imported = await fixture.execute(
      "reconstruction.import_reference",
      {
        expectedDocumentVersion: afterRegister.documentVersion,
        sourceAssetId: registerData.assetId,
        qualityMode: "DRAFT",
      },
      { idempotencyKey: "import-for-gradient-stroke-tokens" },
    );
    expect(imported.success, JSON.stringify(imported.errors)).toBe(true);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!stored) throw new Error("Document was not persisted.");

    const shapeNodes = Object.values(stored.nodes).filter((node) => node.type === "SHAPE") as (DesignNode & {
      type: "SHAPE";
      fillTokenId?: string;
      strokeTokenId?: string;
    })[];

    const gradientNode = shapeNodes.find(
      (node) => node.fillTokenId && stored.tokens[node.fillTokenId]?.type === "GRADIENT",
    );
    expect(gradientNode, JSON.stringify(shapeNodes.map((node) => node.fillTokenId))).toBeDefined();
    const gradientToken = gradientNode?.fillTokenId ? stored.tokens[gradientNode.fillTokenId] : undefined;
    expect(gradientToken, "fillTokenId must resolve to a real GRADIENT token in the document").toBeDefined();
    const gradientValue = gradientToken?.value as {
      type: string;
      stops: readonly { offset: number; color: { r: number; g: number; b: number } }[];
    };
    expect(gradientValue.type).toBe("LINEAR_GRADIENT");
    expect(gradientValue.stops.length).toBeGreaterThanOrEqual(2);
    const hasReddish = gradientValue.stops.some((stop) => stop.color.r > 0.7 && stop.color.b < 0.25);
    const hasBluish = gradientValue.stops.some((stop) => stop.color.b > 0.7 && stop.color.r < 0.25);
    expect(hasReddish, JSON.stringify(gradientValue.stops)).toBe(true);
    expect(hasBluish, JSON.stringify(gradientValue.stops)).toBe(true);

    const strokedNode = shapeNodes.find((node) => node.strokeTokenId);
    expect(strokedNode, JSON.stringify(shapeNodes.map((node) => node.strokeTokenId))).toBeDefined();
    const strokeToken = strokedNode?.strokeTokenId ? stored.tokens[strokedNode.strokeTokenId] : undefined;
    expect(strokeToken, "strokeTokenId must resolve to a real COLOR token in the document").toBeDefined();
    expect(strokeToken?.type).toBe("COLOR");
    const strokeColor = strokeToken?.value as { r: number; g: number; b: number };
    // The real SVG stroke was #000000 (black).
    expect(strokeColor.r).toBeLessThan(0.15);
    expect(strokeColor.g).toBeLessThan(0.15);
    expect(strokeColor.b).toBeLessThan(0.15);
  }, 60_000);
});
