import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  buildPixelHeatmap,
  compareStructuralFidelity,
  comparePixels,
  createFidelityEngine,
  createFidelityTask,
  createPlaywrightRasterBackend,
  deltaE76,
  fidelityFingerprint,
  normalizeReference,
  prioritizeFidelityIssues,
  rankFontCandidates,
  resolveFidelityProfile,
  srgbToLab,
  type RasterAssetResolver,
  type RasterBackend,
  type RasterOutput,
} from "@aevum/fidelity";
import {
  createAsset,
  CanonicalDesignDocumentSchema,
  createEntityId,
  createTransform,
  fixtures,
  type CanonicalDesignDocument,
  type DesignNode,
} from "@aevum/document-model";
import { buildRenderGraph, type RenderGraph } from "@aevum/renderer-2d";
import { createRuntimeViewport, projectScene } from "@aevum/scene-runtime";
import { afterAll, describe, expect, it } from "vitest";

const px = (value: number) => ({ value, unit: "PX" as const, mode: "FIXED" as const });
const hash = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
const color = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a, colorSpace: "SRGB" as const });
const fontBytes = await readFile(new URL("../../fixtures/fonts/Basic-Regular.ttf", import.meta.url));
const imageBytes = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="#0b2342"/><circle cx="65" cy="80" r="48" fill="#ef476f"/><path d="M110 20h115v145H110z" fill="#ffd166"/></svg>',
);
let fontId = "";
let imageId = "";

const resolver: RasterAssetResolver = {
  id: "phase22-fixture-assets",
  version: "1.0.0",
  resolve(id) {
    if (id === fontId) return { id, hash: hash(fontBytes), mimeType: "font/ttf", bytes: fontBytes, family: "Basic" };
    if (id === imageId) return { id, hash: hash(imageBytes), mimeType: "image/svg+xml", bytes: imageBytes };
    return undefined;
  },
};
const rasterizer = createPlaywrightRasterBackend({ assetResolver: resolver });
afterAll(() => rasterizer.close());

function append(document: CanonicalDesignDocument, parent: DesignNode, child: DesignNode): void {
  parent.childIds.push(child.id);
  document.nodes[parent.id] = parent;
  document.nodes[child.id] = child;
}

function visualDocument(
  overrides: { cropX?: number; fontFamily?: string; shadowBlur?: number } = {},
): CanonicalDesignDocument {
  const document = fixtures.landingPage();
  const viewport = document.settings.viewports[document.settings.defaultViewportId];
  if (!viewport) throw new Error("Default viewport is missing.");
  Object.assign(viewport, {
    width: 480,
    height: 320,
    deviceScaleFactor: 1,
    orientation: "LANDSCAPE",
    category: "DESKTOP",
  });
  const page = Object.values(document.nodes).find((node) => node.type === "PAGE");
  const frame = Object.values(document.nodes).find((node) => node.type === "FRAME");
  const text = Object.values(document.nodes).find((node) => node.type === "TEXT");
  if (!page || !frame || text?.type !== "TEXT" || !text.runs[0]) throw new Error("Fidelity fixture is incomplete.");
  page.dimensions = { width: px(480), height: px(320) };
  frame.dimensions = { width: px(440), height: px(280) };
  frame.transform.position = { x: 20, y: 20, z: 0 };
  frame.transform.clipping = true;
  frame.metadata.customData["aevum.renderer2d"] = {
    cornerRadii: { topLeft: 18, topRight: 18, bottomRight: 18, bottomLeft: 18 },
    fills: [
      {
        type: "LINEAR_GRADIENT",
        angle: 0.35,
        stops: [
          { offset: 0, color: color(0.04, 0.08, 0.16) },
          { offset: 1, color: color(0.08, 0.3, 0.28) },
        ],
      },
    ],
    strokes: [
      {
        paint: { type: "SOLID", color: color(0.95, 0.95, 1, 0.7) },
        width: 2,
        alignment: "INSIDE",
        join: "ROUND",
        cap: "ROUND",
        dashArray: [],
      },
    ],
    effects: [
      {
        type: "SHADOW",
        color: color(0, 0, 0, 0.45),
        offsetX: 0,
        offsetY: 9,
        blur: overrides.shadowBlur ?? 14,
        spread: 0,
      },
    ],
  };
  fontId = createEntityId("asset");
  imageId = createEntityId("asset");
  const font = createAsset({
    type: "FONT",
    name: "Basic Regular",
    hash: hash(fontBytes),
    uri: "fixtures/fonts/Basic-Regular.ttf",
    mimeType: "font/ttf",
    byteSize: fontBytes.length,
  });
  const image = createAsset({
    type: "IMAGE",
    name: "Abstract product",
    hash: hash(imageBytes),
    uri: "memory://phase22-product.svg",
    mimeType: "image/svg+xml",
    byteSize: imageBytes.length,
  });
  fontId = font.id;
  imageId = image.id;
  document.assets[font.id] = font;
  document.assets[image.id] = image;
  text.content = "MAXIMUM\nFIDELITY";
  text.dimensions = { width: px(225), height: px(130) };
  text.transform.position = { x: 42, y: 58, z: 0 };
  text.transform.rotation = { x: 0, y: 0, z: -0.035 };
  const baseTextStyle = {
    ...text.runs[0].style,
    fontAssetId: font.id,
    fontFamily: overrides.fontFamily ?? "Basic",
    fallbackFamilies: ["sans-serif"],
    fontMatchStatus: "EXACT" as const,
    size: px(38),
    lineHeight: { multiplier: 0.95 },
    letterSpacing: px(1.2),
    weight: 400,
    variableAxes: {},
    openTypeFeatures: { kern: true, liga: true },
  };
  text.runs = [
    { start: 0, end: 8, style: baseTextStyle },
    {
      start: 8,
      end: text.content.length,
      style: { ...baseTextStyle, size: px(34), letterSpacing: px(2), style: "ITALIC" as const },
    },
  ];
  text.metadata.customData["aevum.renderer2d"] = {
    zIndex: 3,
    fills: [
      {
        type: "LINEAR_GRADIENT",
        angle: 0,
        stops: [
          { offset: 0, color: color(1, 1, 1) },
          { offset: 1, color: color(1, 0.82, 0.35) },
        ],
      },
    ],
  };
  const imageNode: DesignNode = {
    id: createEntityId("image"),
    type: "IMAGE",
    name: "Cropped product",
    parentId: frame.id,
    childIds: [],
    visible: true,
    locked: false,
    transform: { ...createTransform(), position: { x: 270, y: 48, z: 0 }, rotation: { x: 0, y: 0, z: 0.08 } },
    dimensions: { width: px(145), height: px(195) },
    sourceLinks: [],
    metadata: {
      tags: ["phase22"],
      customData: {
        "aevum.renderer2d": { zIndex: 2, cornerRadii: { topLeft: 12, topRight: 12, bottomRight: 12, bottomLeft: 12 } },
      },
    },
    assetId: image.id,
    crop: { x: overrides.cropX ?? 0.08, y: 0.05, width: 0.78, height: 0.9 },
    objectFit: "COVER",
  };
  append(document, frame, imageNode);
  const badge: DesignNode = {
    id: createEntityId("node"),
    type: "SHAPE",
    name: "Overlap badge",
    parentId: frame.id,
    childIds: [],
    visible: true,
    locked: false,
    transform: { ...createTransform(), position: { x: 56, y: 218, z: 0 } },
    dimensions: { width: px(145), height: px(34) },
    sourceLinks: [],
    metadata: {
      tags: ["phase22"],
      customData: {
        "aevum.renderer2d": {
          zIndex: 4,
          cornerRadii: { topLeft: 17, topRight: 17, bottomRight: 17, bottomLeft: 17 },
          fills: [{ type: "SOLID", color: color(0.94, 0.28, 0.43) }],
        },
      },
    },
    shapeType: "RECTANGLE",
    geometry: { width: 145, height: 34 },
  };
  append(document, frame, badge);
  return document;
}

function graph(document: CanonicalDesignDocument): RenderGraph {
  const parsed = CanonicalDesignDocumentSchema.safeParse(document);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return buildRenderGraph(projectScene(document, createRuntimeViewport(document), { strictMode: false }));
}

async function render(document: CanonicalDesignDocument): Promise<RasterOutput> {
  return rasterizer.render(graph(document), {
    width: 480,
    height: 320,
    devicePixelRatio: 1,
    background: { r: 255, g: 255, b: 255, a: 1 },
    qualityProfile: "MAXIMUM_FIDELITY",
    time: 0,
    reducedMotion: false,
    format: "RGBA8",
    maxNodes: 100,
    maxPixels: 480 * 320,
    timeoutMs: 20_000,
  });
}

describe("Maximum Fidelity integration", () => {
  it("produces deterministic real pixels with custom-font shaping, gradients, crop, clipping, overlap, borders, and shadows", async () => {
    const document = visualDocument();
    const first = await render(document);
    const second = await render(document);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.data).toEqual(second.data);
    expect(first.data.some((value, index) => index % 4 !== 3 && value < 220)).toBe(true);
    expect(first.typography).toEqual([
      expect.objectContaining({ fallbackDetected: false, loadedFontAssetIds: [fontId], lineCount: 2 }),
    ]);
    expect(first.diagnostics).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_FONT" })]));
  });

  it("measures real pixel changes, creates per-pixel heatmaps, and identifies font fallback honestly", async () => {
    const baseline = await render(visualDocument());
    const changed = await render(visualDocument({ cropX: 0.2, shadowBlur: 2 }));
    const metrics = comparePixels(baseline, changed, { channelTolerance: 3, maxPixels: 480 * 320 });
    const heatmap = buildPixelHeatmap(baseline, changed, "ASSET");
    expect(metrics.mae).toBeGreaterThan(0);
    expect(metrics.ssim).toBeLessThan(1);
    expect(heatmap.data.filter((_, index) => index % 4 === 3).some((value) => value > 0)).toBe(true);
    const missingFontRasterizer = createPlaywrightRasterBackend({
      assetResolver: {
        id: "missing-font",
        version: "1.0.0",
        resolve(id) {
          return id === imageId ? resolver.resolve(id) : undefined;
        },
      },
    });
    const missingFont = await missingFontRasterizer.render(graph(visualDocument()), {
      width: 480,
      height: 320,
      devicePixelRatio: 1,
      background: { r: 255, g: 255, b: 255, a: 1 },
      qualityProfile: "STANDARD",
      time: 0,
      reducedMotion: false,
      format: "RGBA8",
      maxNodes: 100,
      maxPixels: 480 * 320,
      timeoutMs: 20_000,
    });
    await missingFontRasterizer.close();
    expect(missingFont.typography[0]?.fallbackDetected).toBe(true);
    expect(missingFont.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "FONT_FALLBACK", severity: "ERROR" })]),
    );
  });

  it("attributes subpixel layout, crop, gradient, and line-break root causes structurally", async () => {
    const document = visualDocument();
    const renderGraph = graph(document);
    const rendered = await render(document);
    const image = Object.values(document.nodes).find((node) => node.type === "IMAGE");
    const text = Object.values(document.nodes).find((node) => node.type === "TEXT");
    const frame = Object.values(document.nodes).find((node) => node.type === "FRAME");
    if (!image || !text || !frame) throw new Error("Structural fixture nodes are missing.");
    const issues = compareStructuralFidelity({
      graph: renderGraph,
      profile: resolveFidelityProfile("MAXIMUM_FIDELITY"),
      typography: rendered.typography,
      expectations: [
        { nodeId: text.id, property: "BOUNDS", expected: { x: 42.2, y: 58, width: 225, height: 130 }, confidence: 1 },
        { nodeId: image.id, property: "CROP", expected: { x: 0.2, y: 0.05, width: 0.78, height: 0.9 }, confidence: 1 },
        { nodeId: frame.id, property: "GRADIENT", expected: [], confidence: 1 },
        {
          nodeId: text.id,
          property: "LINE_BREAKS",
          expected: { lineCount: 1, lineWidths: [50], baselines: [50] },
          confidence: 1,
        },
      ],
    });
    expect(issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "LAYOUT_BOUNDS_MISMATCH",
        "IMAGE_CROP_MISMATCH",
        "GRADIENT_STRUCTURE_MISMATCH",
        "LINE_BREAK_MISMATCH",
      ]),
    );
    expect(issues.find((entry) => entry.code === "IMAGE_CROP_MISMATCH")?.domain).toBe("CROP");
  });

  it("caches identical views and invalidates every raster for a document", async () => {
    const document = visualDocument();
    const rendered = await render(document);
    const normalized = normalizeReference({
      ...rendered,
      mimeType: "image/png",
      hash: rendered.fingerprint,
      devicePixelRatio: 1,
    });
    const task = createFidelityTask({
      projectId: document.metadata.projectId,
      documentId: document.metadata.id,
      documentVersion: document.documentVersion,
      profile: "STANDARD",
      references: [normalized.reference],
      createdAt: "2026-08-13T00:00:00.000Z",
      createdBy: { type: "SYSTEM", id: "cache-test" },
      correlationId: "cache-test",
    });
    const engine = createFidelityEngine({ rasterBackend: rasterizer });
    const views = [
      {
        reference: normalized.reference,
        referenceRaster: normalized.raster,
        graph: graph(document),
        regions: [],
        domainEvidence: [
          {
            domain: "CAMERA" as const,
            score: 0.8,
            coverage: 1,
            confidence: 0.9,
            sourceFingerprint: hash(new Uint8Array([3])),
            providerId: "camera-cinematics@1.0.0",
            issues: [],
            unsupportedFeatures: [],
          },
        ],
      },
    ];
    const measured = await engine.measure(task, views);
    expect(measured[0]?.domainScores.find((entry) => entry.domain === "CAMERA")).toMatchObject({
      score: 0.8,
      coverage: 1,
      confidence: 0.9,
    });
    await engine.measure(task, views);
    expect(engine.cacheStatistics()).toMatchObject({ hits: 1, misses: 1, entries: 1 });
    expect(engine.invalidateDocument(document.metadata.id)).toBe(1);
    expect(engine.cacheStatistics().entries).toBe(0);
  });

  it("normalizes references without stretching and reports coverage instead of treating unmeasured domains as perfect", async () => {
    const document = visualDocument();
    const rendered = await render(document);
    const normalized = normalizeReference({
      ...rendered,
      mimeType: "image/png",
      hash: rendered.fingerprint,
      devicePixelRatio: 1,
    });
    const task = createFidelityTask({
      projectId: document.metadata.projectId,
      documentId: document.metadata.id,
      documentVersion: document.documentVersion,
      profile: "MAXIMUM_FIDELITY",
      references: [normalized.reference],
      createdAt: "2026-08-13T00:00:00.000Z",
      createdBy: { type: "SYSTEM", id: "phase22-test" },
      correlationId: "phase22-test",
    });
    const engine = createFidelityEngine({ rasterBackend: rasterizer });
    const measurement = await engine.measure(task, [
      {
        reference: normalized.reference,
        referenceRaster: normalized.raster,
        graph: graph(document),
        regions: [
          {
            id: "heading",
            nodeId: Object.values(document.nodes).find((node) => node.type === "TEXT")?.id,
            region: { x: 42, y: 58, width: 225, height: 130 },
            domain: "TYPOGRAPHY",
            property: "glyphs",
            confidence: 1,
          },
        ],
      },
    ]);
    expect(measurement[0]).toMatchObject({
      overallScore: 1,
      coverage: 1,
      confidence: 1,
      pixel: { mae: 0, rmse: 0, ssim: 1 },
    });
    expect(measurement[0]?.domainScores.find((entry) => entry.domain === "COLOR")).toMatchObject({
      coverage: 0,
      score: 0,
    });
  });

  it("uses causal correction priority, perceptual color conversion, bounded font ranking, and immutable profiles", () => {
    const issues = [
      {
        id: `fidelity-issue:${"1".repeat(32)}`,
        domain: "EFFECTS" as const,
        code: "SHADOW",
        severity: "WARNING" as const,
        property: "blur",
        expected: 12,
        actual: 8,
        measurement: 0.2,
        confidence: 0.8,
        supported: true,
        message: "shadow",
      },
      {
        id: `fidelity-issue:${"2".repeat(32)}`,
        domain: "TYPOGRAPHY" as const,
        code: "FONT",
        severity: "BLOCKING" as const,
        property: "font",
        expected: "Basic",
        actual: "Arial",
        measurement: 1,
        confidence: 1,
        supported: true,
        message: "font",
      },
    ];
    expect(prioritizeFidelityIssues(issues)[0]?.domain).toBe("TYPOGRAPHY");
    expect(deltaE76(srgbToLab(255, 255, 255), srgbToLab(0, 0, 0))).toBeGreaterThan(90);
    expect(
      rankFontCandidates({
        requestedFamily: "Basic",
        referenceAdvance: 100,
        candidates: [
          { fontAssetId: fontId, family: "Basic", measuredAdvance: 100 },
          { fontAssetId: createEntityId("asset"), family: "Other", measuredAdvance: 140 },
        ],
      })[0],
    ).toMatchObject({ family: "Basic", status: "EXACT" });
    expect(Object.isFrozen(resolveFidelityProfile("MAXIMUM_FIDELITY"))).toBe(true);
    expect(fidelityFingerprint(resolveFidelityProfile("STANDARD"))).toMatch(/^sha256:/);
  });

  it("runs a bounded render-compare-correct loop and records only measured accepted state", async () => {
    const badDocument = visualDocument({ cropX: 0.3 });
    const goodDocument = structuredClone(badDocument);
    goodDocument.documentVersion += 1;
    const goodImage = Object.values(goodDocument.nodes).find((node) => node.type === "IMAGE");
    if (goodImage?.type !== "IMAGE") throw new Error("Correction fixture image is missing.");
    goodImage.crop = { x: 0.08, y: 0.05, width: 0.78, height: 0.9 };
    const badGraph = graph(badDocument);
    const goodGraph = graph(goodDocument);
    const width = 480;
    const height = 320;
    const referenceData = new Uint8ClampedArray(width * height * 4).fill(255);
    const normalized = normalizeReference({
      width,
      height,
      data: referenceData,
      colorSpace: "SRGB",
      mimeType: "image/png",
      hash: hash(referenceData),
      devicePixelRatio: 1,
    });
    const output = (renderGraph: RenderGraph, value: number): RasterOutput => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4).fill(value),
      colorSpace: "SRGB",
      backendId: "test",
      backendVersion: "1.0.0",
      rendererVersion: renderGraph.version,
      graphFingerprint: renderGraph.fingerprint,
      fingerprint: hash(new Uint8Array([value])),
      typography: [],
      diagnostics: [],
      fontAssetHashes: [],
      imageAssetHashes: [],
    });
    const backend: RasterBackend = {
      id: "bounded-test",
      version: "1.0.0",
      async render(renderGraph) {
        return output(renderGraph, renderGraph.fingerprint === goodGraph.fingerprint ? 255 : 190);
      },
      async close() {},
    };
    const task = createFidelityTask({
      projectId: badDocument.metadata.projectId,
      documentId: badDocument.metadata.id,
      documentVersion: badDocument.documentVersion,
      profile: "STANDARD",
      references: [normalized.reference],
      createdAt: "2026-08-13T00:00:00.000Z",
      createdBy: { type: "SYSTEM", id: "orchestrator-test" },
      correlationId: "orchestrator-test",
    });
    const proposalHash = hash(new Uint8Array([22]));
    const engine = createFidelityEngine({
      rasterBackend: backend,
      correctionAdapter: {
        id: "test-correction",
        version: "1.0.0",
        async propose() {
          return [
            {
              fingerprint: proposalHash,
              issueIds: [],
              affectedNodeIds: [goodImage.id],
              affectedProperties: ["CROP"],
              expectedDocumentVersion: badDocument.documentVersion,
              priority: 1,
            },
          ];
        },
        async dryRun() {
          return { valid: true, message: "valid" };
        },
        async apply() {
          return {
            status: "APPLIED",
            document: goodDocument,
            views: [
              { reference: normalized.reference, referenceRaster: normalized.raster, graph: goodGraph, regions: [] },
            ],
            correctionFingerprint: proposalHash,
            message: "applied",
          };
        },
      },
    });
    const result = await engine.run({
      task,
      document: badDocument,
      views: [{ reference: normalized.reference, referenceRaster: normalized.raster, graph: badGraph, regions: [] }],
      timestamp: "2026-08-13T00:00:00.000Z",
    });
    expect(result.report).toMatchObject({ status: "PASS", stopReason: "TARGET_REACHED", overallScore: 1 });
    expect(result.document.documentVersion).toBe(goodDocument.documentVersion);
    expect(result.report.passes[0]).toMatchObject({
      documentVersion: goodDocument.documentVersion,
      score: 1,
      correctionFingerprint: proposalHash,
    });
  });

  it("isolates raster failures in a structured report without changing canonical state", async () => {
    const document = visualDocument();
    const pixels = new Uint8ClampedArray(480 * 320 * 4).fill(255);
    const normalized = normalizeReference({
      width: 480,
      height: 320,
      data: pixels,
      colorSpace: "SRGB",
      mimeType: "image/png",
      hash: hash(pixels),
      devicePixelRatio: 1,
    });
    const task = createFidelityTask({
      projectId: document.metadata.projectId,
      documentId: document.metadata.id,
      documentVersion: document.documentVersion,
      profile: "STANDARD",
      references: [normalized.reference],
      createdAt: "2026-08-13T00:00:00.000Z",
      createdBy: { type: "SYSTEM", id: "failure-test" },
      correlationId: "failure-test",
    });
    const backend: RasterBackend = {
      id: "failure",
      version: "1.0.0",
      async render() {
        throw new Error("provider timeout");
      },
      async close() {},
    };
    const result = await createFidelityEngine({ rasterBackend: backend }).run({
      task,
      document,
      views: [
        { reference: normalized.reference, referenceRaster: normalized.raster, graph: graph(document), regions: [] },
      ],
      timestamp: "2026-08-13T00:00:00.000Z",
    });
    expect(result.document).toBe(document);
    expect(result.report).toMatchObject({ status: "FAIL", stopReason: "FAILED", overallScore: 0, coverage: 0 });
    expect(result.report.issues).toEqual([
      expect.objectContaining({ code: "FIDELITY_EXECUTION_FAILED", actual: "provider timeout" }),
    ]);
  });
});
