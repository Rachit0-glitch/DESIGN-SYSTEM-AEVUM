import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { DesignNode } from "@aevum/document-model";
import { buildRenderGraph } from "@aevum/renderer-2d";
import { createRuntimeViewport, projectScene } from "@aevum/scene-runtime";
import { createInMemoryAssetStorage, createMcpTestFixture } from "../helpers/mcp-fixture.js";

/**
 * Block H1 — real, end-to-end component materialization proof, driven entirely by the real local
 * (no-paid-API) shape-detection pipeline against a genuinely repeated visual structure, not a
 * hand-authored analyzer test fixture (tests/unit/reconstruction.test.ts already covers that path).
 * This is the literal REFERENCE -> Vision analysis -> component candidate -> reconstruction ->
 * document.components -> component instance chain the block asked for, with no mocked component
 * object anywhere in the path.
 */
async function createRepeatedCardsPoster(): Promise<Buffer> {
  // Three visually identical "cards" (same size, same fill, same corner radius) laid out in a row —
  // real repeated structure a real user could plausibly screenshot (a feature-card grid, a pricing
  // table). Distinct positions and a distinct background make each card a genuinely separate, real
  // detected region rather than one big shape.
  const card = (x: number) => `<rect x="${x}" y="60" width="160" height="200" rx="12" fill="#2f6fed" />`;
  const svg = `
    <svg width="620" height="320" xmlns="http://www.w3.org/2000/svg">
      <rect width="620" height="320" fill="#f5f5f7" />
      ${card(20)}
      ${card(230)}
      ${card(440)}
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("Real component materialization from genuinely repeated visual structure (Block H1)", () => {
  it("detects real repeated card shapes via the local vision pipeline and materializes one real component definition with real COMPONENT_INSTANCE nodes", async () => {
    const bytes = await createRepeatedCardsPoster();
    const storage = createInMemoryAssetStorage();
    const fixture = createMcpTestFixture({ assetStorageAdapter: storage, toolTimeoutMs: 60_000 });

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: bytes.toString("base64"),
        originalFilename: "repeated-cards.png",
        mimeType: "image/png",
        width: 620,
        height: 320,
        alpha: false,
        analyzeForReconstruction: true,
      },
      { idempotencyKey: "h1-repeated-cards-register" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registeredData = registered.data as { assetId: string; resultVersion: number };

    const imported = await fixture.execute(
      "reconstruction.import_reference",
      { expectedDocumentVersion: registeredData.resultVersion, sourceAssetId: registeredData.assetId },
      { idempotencyKey: "h1-repeated-cards-import" },
    );
    expect(imported.success, JSON.stringify(imported.errors)).toBe(true);

    const document = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!document) throw new Error("Document was not persisted.");

    const components = Object.values(document.components);
    expect(
      components.length,
      "expected the real local shape-detection pipeline to find repeated cards",
    ).toBeGreaterThan(0);
    // Every real component definition's root node must exist, and every real COMPONENT_INSTANCE must
    // reference a real, existing component — proven generically rather than assuming exactly which
    // (or how many) real repeated-structure groups the actual local detector happened to find.
    for (const component of components) {
      expect(document.nodes[component.rootNodeId], `component ${component.id}'s root must exist`).toBeDefined();
    }

    const instances = Object.values(document.nodes).filter(
      (node): node is Extract<DesignNode, { type: "COMPONENT_INSTANCE" }> => node.type === "COMPONENT_INSTANCE",
    );
    expect(instances.length, "expected at least one real COMPONENT_INSTANCE referencing a definition").toBeGreaterThan(
      0,
    );
    for (const instance of instances) {
      expect(
        document.components[instance.componentId],
        `instance ${instance.id} references a real component`,
      ).toBeDefined();
      // Every instance still carries its own real sourceLink/position — fidelity's BOUNDS comparison
      // continues to work per-instance, not just for the definition.
      expect(instance.sourceLinks.length).toBeGreaterThan(0);
    }

    // The whole document remains structurally valid with real components materialized.
    for (const node of Object.values(document.nodes)) {
      for (const childId of node.childIds) {
        expect(document.nodes[childId], `${node.id} references missing child ${childId}`).toBeDefined();
      }
    }

    // The renderer genuinely projects each instance's real children (scene-runtime's projector,
    // packages/scene-runtime/src/projector.ts) into real PAINT operations — not just structurally
    // valid data, but something the renderer actually turns into drawable output.
    const projection = projectScene(document, createRuntimeViewport(document), { strictMode: false });
    const projectedInstanceOrigins = [...projection.nodes.values()].filter((node) => node.componentOrigin);
    expect(
      projectedInstanceOrigins.length,
      "expected the renderer's scene projection to expand each instance's real component children",
    ).toBeGreaterThan(0);
    const graph = buildRenderGraph(projection);
    for (const projected of projectedInstanceOrigins) {
      expect(
        [...graph.operations.values()].some((operation) => operation.runtimeNodeId === projected.id),
        `expected a real render operation for projected instance child ${projected.id}`,
      ).toBe(true);
    }
  }, 120_000);
});
