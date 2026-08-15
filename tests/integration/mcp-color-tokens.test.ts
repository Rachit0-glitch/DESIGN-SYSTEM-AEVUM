import sharp from "sharp";
import { describe, expect, it } from "vitest";
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
});
