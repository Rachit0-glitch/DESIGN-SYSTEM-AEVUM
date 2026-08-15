import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  createGoogleVisionProvider,
  createInMemoryVisionAnalysisCache,
  createInMemoryVisionQuotaTracker,
  createLocalVisionProvider,
  requestFingerprint,
  visionAnalysisToManifest,
  withVisionAnalysisCache,
  withVisionQuota,
  VisionProviderError,
  type GoogleVisionAnnotateResponse,
  type GoogleVisionClient,
  type VisionAnalysis,
  type VisionAnalyzeOptions,
  type VisionProvider,
} from "@aevum/vision";

const OCR_CACHE_DIR = fileURLToPath(new URL("../../packages/reconstruction-vision/.tesseract-cache/", import.meta.url));

function fakeGoogleResponse(overrides: Record<string, unknown> = {}) {
  return {
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
                          { x: 150, y: 55 },
                          { x: 150, y: 91 },
                          { x: 20, y: 91 },
                        ],
                      },
                      confidence: 0.95,
                      symbols: [
                        { text: "H", confidence: 0.96, boundingBox: { vertices: [] } },
                        {
                          text: "I",
                          confidence: 0.94,
                          boundingBox: { vertices: [] },
                          property: { detectedBreak: { type: "SPACE" } },
                        },
                      ],
                    },
                    {
                      boundingBox: {
                        vertices: [
                          { x: 160, y: 55 },
                          { x: 363, y: 55 },
                          { x: 363, y: 91 },
                          { x: 160, y: 91 },
                        ],
                      },
                      confidence: 0.9,
                      symbols: [{ text: "THERE", confidence: 0.9, boundingBox: { vertices: [] } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      text: "HI THERE",
    },
    labelAnnotations: [{ description: "Poster", score: 0.88, topicality: 0.88 }],
    localizedObjectAnnotations: [
      {
        name: "Food",
        score: 0.81,
        boundingPoly: {
          normalizedVertices: [
            { x: 0.1, y: 0.1 },
            { x: 0.5, y: 0.1 },
            { x: 0.5, y: 0.5 },
            { x: 0.1, y: 0.5 },
          ],
        },
      },
    ],
    imagePropertiesAnnotation: {
      dominantColors: { colors: [{ color: { red: 1, green: 0, blue: 0 }, score: 0.7, pixelFraction: 0.3 }] },
    },
    ...overrides,
  };
}

describe("@aevum/vision Google Cloud Vision adapter (mocked SDK client — no network)", () => {
  it("normalizes a realistic annotateImage response into provider-neutral VisionAnalysis", async () => {
    const client: GoogleVisionClient = {
      annotateImage: vi.fn(
        async (): Promise<[GoogleVisionAnnotateResponse, ...unknown[]]> => [
          fakeGoogleResponse() as GoogleVisionAnnotateResponse,
        ],
      ),
    };
    const provider = createGoogleVisionProvider({ client });
    const analysis = await provider.analyzeImage(new Uint8Array([1, 2, 3]), { sourceHash: "sha256:abc" });

    expect(analysis.provider.providerId).toBe("GOOGLE_CLOUD");
    expect(analysis.imageWidth).toBe(400);
    expect(analysis.imageHeight).toBe(150);
    expect(analysis.labels).toEqual([{ description: "Poster", score: 0.88, topicality: 0.88 }]);
    expect(analysis.objects).toHaveLength(1);
    expect(analysis.objects[0]?.name).toBe("Food");
    // normalizedVertices (0-1) must be converted to absolute source pixels.
    expect(analysis.objects[0]?.boundingPoly.vertices[0]).toEqual({ x: 40, y: 15 });
    expect(analysis.imageProperties?.dominantColors[0]).toEqual({ r: 255, g: 0, b: 0, score: 0.7, pixelFraction: 0.3 });

    // Text hierarchy: PAGE -> BLOCK -> PARAGRAPH -> WORD -> SYMBOL, with real concatenated text.
    const page = analysis.textBlocks[0];
    expect(page?.level).toBe("PAGE");
    const block = page?.children[0];
    expect(block?.level).toBe("BLOCK");
    const paragraph = block?.children[0];
    expect(paragraph?.level).toBe("PARAGRAPH");
    expect(paragraph?.text.toUpperCase()).toContain("HI");
    expect(paragraph?.text.toUpperCase()).toContain("THERE");
  });

  it("classifies quota errors honestly instead of a generic failure", async () => {
    const client: GoogleVisionClient = {
      annotateImage: vi.fn(async () => {
        throw new Error("8 RESOURCE_EXHAUSTED: Quota exceeded");
      }),
    };
    const provider = createGoogleVisionProvider({ client });
    await expect(provider.analyzeImage(new Uint8Array([1]), { sourceHash: "sha256:abc" })).rejects.toMatchObject({
      code: "VISION_PROVIDER_QUOTA_EXCEEDED",
    });
  });

  it("classifies auth errors honestly", async () => {
    const client: GoogleVisionClient = {
      annotateImage: vi.fn(async () => {
        throw new Error("16 UNAUTHENTICATED: Request had invalid credential");
      }),
    };
    const provider = createGoogleVisionProvider({ client });
    await expect(provider.analyzeImage(new Uint8Array([1]), { sourceHash: "sha256:abc" })).rejects.toBeInstanceOf(
      VisionProviderError,
    );
    await expect(provider.analyzeImage(new Uint8Array([1]), { sourceHash: "sha256:abc" })).rejects.toMatchObject({
      code: "VISION_PROVIDER_AUTH_FAILED",
    });
  });
});

describe("@aevum/vision local adapter (real pixel math, no network)", () => {
  it("produces a real VisionAnalysis with actual detected objects and OCR text", async () => {
    const svg = `
        <svg width="400" height="150" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="150" fill="#ffffff" />
          <rect x="30" y="30" width="80" height="60" fill="#1d4ed8" />
          <text x="150" y="90" font-family="Arial" font-size="36" fill="#000000">HELLO</text>
        </svg>
      `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const provider = createLocalVisionProvider({ ocrCacheDir: OCR_CACHE_DIR });
    const analysis = await provider.analyzeImage(image, { sourceHash: "sha256:local-test" });

    expect(analysis.provider.providerId).toBe("LOCAL");
    expect(analysis.objects.length).toBeGreaterThanOrEqual(1);
    const textPage = analysis.textBlocks[0];
    const paragraph = textPage?.children[0];
    expect(paragraph?.text.toUpperCase()).toContain("HELLO");
  }, 60_000);
});

describe("@aevum/vision manifest conversion", () => {
  function fixtureAnalysis(overrides: Partial<VisionAnalysis> = {}): VisionAnalysis {
    return {
      provider: {
        providerId: "LOCAL",
        providerVersion: "1.0.0",
        sourceHash: "sha256:test",
        requestFingerprint: "sha256:fingerprint",
        analyzedAt: "2026-08-15T00:00:00.000Z",
        cached: false,
      },
      imageWidth: 200,
      imageHeight: 100,
      textBlocks: [
        {
          id: "page0",
          level: "PAGE",
          text: "PRICE",
          boundingPoly: { vertices: [] },
          confidence: 1,
          languageHints: [],
          children: [
            {
              id: "p0",
              level: "PARAGRAPH",
              text: "PRICE",
              boundingPoly: {
                vertices: [
                  { x: 10, y: 10 },
                  { x: 60, y: 10 },
                  { x: 60, y: 30 },
                  { x: 10, y: 30 },
                ],
              },
              confidence: 0.9,
              languageHints: [],
              children: [],
            },
          ],
        },
      ],
      labels: [],
      objects: [
        {
          name: "background",
          score: 0.5,
          boundingPoly: {
            vertices: [
              { x: 0, y: 0 },
              { x: 200, y: 0 },
              { x: 200, y: 100 },
              { x: 0, y: 100 },
            ],
          },
        },
      ],
      warnings: [],
      ...overrides,
    };
  }

  it("builds a schema-valid manifest with real text and object regions, keyed by real content", async () => {
    const flatImage = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();
    const { manifest, diagnostics } = await visionAnalysisToManifest(fixtureAnalysis(), flatImage);

    expect(manifest.regions[0]).toMatchObject({ key: "page", category: "PAGE" });
    const textRegion = manifest.regions.find((region) => region.category === "TEXT");
    expect(textRegion?.text?.content).toBe("PRICE");
    const backgroundRegion = manifest.regions.find((region) => region.category === "BACKGROUND");
    expect(backgroundRegion).toBeDefined();
    // The fixture image is a uniform flat color, so real ink-color sampling honestly finds no
    // minority cluster to sample a text fill from — a genuine diagnostic, not a fabricated color.
    expect(diagnostics).toEqual(["Could not sample ink color for text region text-0; no fill color was set."]);
  });

  it("skips an object region that a text region already accounts for most of", async () => {
    const flatImage = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();
    const analysis = fixtureAnalysis({
      objects: [
        {
          name: "text-shaped-object",
          score: 0.4,
          boundingPoly: {
            vertices: [
              { x: 10, y: 10 },
              { x: 60, y: 10 },
              { x: 60, y: 30 },
              { x: 10, y: 30 },
            ],
          },
        },
      ],
    });
    const { manifest } = await visionAnalysisToManifest(analysis, flatImage);
    const nonTextRegions = manifest.regions.filter(
      (region) => region.category !== "PAGE" && region.category !== "TEXT",
    );
    expect(nonTextRegions).toHaveLength(0);
  });
});

describe("@aevum/vision cache and quota guardrails", () => {
  it("requestFingerprint is deterministic and sensitive to real request differences", () => {
    const base: VisionAnalyzeOptions = { sourceHash: "sha256:aaa" };
    expect(requestFingerprint("GOOGLE_CLOUD", base)).toBe(requestFingerprint("GOOGLE_CLOUD", base));
    expect(requestFingerprint("GOOGLE_CLOUD", base)).not.toBe(requestFingerprint("LOCAL", base));
    expect(requestFingerprint("GOOGLE_CLOUD", base)).not.toBe(
      requestFingerprint("GOOGLE_CLOUD", { sourceHash: "sha256:bbb" }),
    );
  });

  it("never calls the underlying provider twice for the same fingerprint", async () => {
    let calls = 0;
    const inner: VisionProvider = {
      id: "LOCAL",
      version: "1.0.0",
      async analyzeImage(_bytes, options) {
        calls += 1;
        return {
          provider: {
            providerId: "LOCAL",
            providerVersion: "1.0.0",
            sourceHash: options.sourceHash,
            requestFingerprint: requestFingerprint("LOCAL", options),
            analyzedAt: "2026-08-15T00:00:00.000Z",
            cached: false,
          },
          imageWidth: 10,
          imageHeight: 10,
          textBlocks: [],
          labels: [],
          objects: [],
          warnings: [],
        };
      },
    };
    const cached = withVisionAnalysisCache(inner, createInMemoryVisionAnalysisCache());
    const options = { sourceHash: "sha256:same" };
    await cached.analyzeImage(new Uint8Array(), options);
    const second = await cached.analyzeImage(new Uint8Array(), options);
    expect(calls).toBe(1);
    expect(second.provider.cached).toBe(true);
  });

  it("rejects a workspace's call once it exceeds its configured quota", async () => {
    const inner: VisionProvider = {
      id: "LOCAL",
      version: "1.0.0",
      async analyzeImage(_bytes, options) {
        return {
          provider: {
            providerId: "LOCAL",
            providerVersion: "1.0.0",
            sourceHash: options.sourceHash,
            requestFingerprint: "sha256:x",
            analyzedAt: "2026-08-15T00:00:00.000Z",
            cached: false,
          },
          imageWidth: 1,
          imageHeight: 1,
          textBlocks: [],
          labels: [],
          objects: [],
          warnings: [],
        };
      },
    };
    const forWorkspace = withVisionQuota(inner, createInMemoryVisionQuotaTracker(), 2);
    const workspaceProvider = forWorkspace("workspace-1");
    await workspaceProvider.analyzeImage(new Uint8Array(), { sourceHash: "sha256:1" });
    await workspaceProvider.analyzeImage(new Uint8Array(), { sourceHash: "sha256:2" });
    await expect(workspaceProvider.analyzeImage(new Uint8Array(), { sourceHash: "sha256:3" })).rejects.toMatchObject({
      code: "VISION_PROVIDER_QUOTA_EXCEEDED",
    });

    // A different workspace has its own independent budget.
    const otherWorkspace = forWorkspace("workspace-2");
    await expect(otherWorkspace.analyzeImage(new Uint8Array(), { sourceHash: "sha256:4" })).resolves.toBeDefined();
  });
});
