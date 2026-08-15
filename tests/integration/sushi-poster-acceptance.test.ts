import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DesignNode } from "@aevum/document-model";
import { buildRenderGraph, render, type PaintOperation, type TextOperation } from "@aevum/renderer-2d";
import { createRuntimeViewport, projectScene } from "@aevum/scene-runtime";
import { createInMemoryAssetStorage, createMcpTestFixture } from "../helpers/mcp-fixture.js";

/**
 * D6 acceptance test: the real supplied sushi poster (`fixtures/sushi poster.jpg`, 736x920 JPEG)
 * run through the full, unmodified MCP pipeline — asset.register (analyzeForReconstruction: true,
 * no visionAdapter override, so this exercises the real local/free tesseract + color-histogram
 * pipeline, never a paid vision API) -> reconstruction.import_reference -> render.
 *
 * This codifies STEP 11's documented "partial pass" finding as a real, runnable regression test
 * rather than a one-off manual run: it asserts what genuinely, reliably works today (multiple real
 * editable nodes, the two cleanly-OCR'd address/delivery text lines, real IMAGE regions, a document
 * that renders without error) and deliberately does not assert the known-unreliable parts (the
 * stylized "SUSHI" headline is never detected as text at all — a text-region-detection gap, not a
 * threshold to tune; the price/phone OCR is sometimes garbled) — see
 * docs/STABILIZATION_KNOWN_LIMITATIONS.md STEP 5 / STEP 11 for the full, honest limitations record.
 */
describe("Real sushi poster acceptance test (Block D6)", () => {
  it("reconstructs the real sushi poster into multiple real editable nodes and renders without error", async () => {
    const bytes = await readFile(resolve(__dirname, "../../fixtures/sushi poster.jpg"));
    const storage = createInMemoryAssetStorage();
    const fixture = createMcpTestFixture({ assetStorageAdapter: storage, toolTimeoutMs: 120_000 });

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: bytes.toString("base64"),
        originalFilename: "sushi poster.jpg",
        mimeType: "image/jpeg",
        width: 736,
        height: 920,
        alpha: false,
        analyzeForReconstruction: true,
      },
      { idempotencyKey: "register-sushi-poster" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registeredData = registered.data as { assetId: string; resultVersion: number };

    const applied = await fixture.execute(
      "reconstruction.import_reference",
      { expectedDocumentVersion: registeredData.resultVersion, sourceAssetId: registeredData.assetId },
      { idempotencyKey: "import-sushi-poster" },
    );
    expect(applied.success, JSON.stringify(applied.errors)).toBe(true);
    const appliedData = applied.data as { createdNodeCount: number; textNodeCount: number; referenceId: string };
    expect(appliedData.createdNodeCount).toBeGreaterThan(2);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!stored) throw new Error("Document was not persisted.");

    const reference = stored.references[appliedData.referenceId];
    expect(reference).toBeDefined();
    expect(reference?.assetId).toBe(registeredData.assetId);

    const nodes = Object.values(stored.nodes) as DesignNode[];
    // Real decomposition into a page/frame/multiple children, not one embedded reference image.
    expect(nodes.some((node) => node.type === "PAGE")).toBe(true);
    const frame = nodes.find((node) => node.type === "FRAME");
    expect(frame).toBeDefined();

    const textContents = nodes
      .filter((node): node is Extract<DesignNode, { type: "TEXT" }> => node.type === "TEXT")
      .map((node) => node.content.toUpperCase());
    // The two lines STEP 11 documented as read essentially exactly right — a real regression lock
    // on the local OCR pipeline's known-reliable output, not the parts documented as unreliable.
    expect(
      textContents.some((content) => content.includes("PEGA PELO DELIVERY")),
      JSON.stringify(textContents),
    ).toBe(true);
    expect(
      textContents.some((content) => content.includes("DESIGNER PREMIUM")),
      JSON.stringify(textContents),
    ).toBe(true);

    // Real, independently editable IMAGE regions (the decorative photo pieces), not zero.
    const imageNodes = nodes.filter((node) => node.type === "IMAGE");
    expect(imageNodes.length, JSON.stringify(nodes.map((n) => n.type))).toBeGreaterThanOrEqual(2);

    // Every reconstructed node stays editable: not locked, has a real name.
    for (const node of nodes) {
      expect(node.locked).toBe(false);
      expect(node.name.length).toBeGreaterThan(0);
    }

    // Rendering: the reconstructed document must render through the real, unmodified Scene
    // Runtime + Renderer 2D pipeline without throwing, producing real paint/text operations for
    // the nodes reconstruction actually created — not just "the write succeeded."
    const projection = projectScene(stored, createRuntimeViewport(stored), { strictMode: false });
    const graph = buildRenderGraph(projection);
    const output = render(projection);
    expect(output.graph.operations.size).toBeGreaterThan(0);

    const operations = [...graph.operations.values()];
    const renderedTextContents = operations
      .filter((operation): operation is TextOperation => operation.kind === "TEXT")
      .map((operation) => operation.content.toUpperCase());
    expect(
      renderedTextContents.some((content) => content.includes("PEGA PELO DELIVERY")),
      JSON.stringify(renderedTextContents),
    ).toBe(true);
    const paintedRegions = operations.filter((operation): operation is PaintOperation => operation.kind === "PAINT");
    expect(paintedRegions.length).toBeGreaterThan(0);
  }, 180_000);
});
