import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { DesignNode } from "@aevum/document-model";
import { createInMemoryAssetStorage, createMcpTestFixture } from "../helpers/mcp-fixture.js";

/**
 * A controlled, known-answer "poster": a colored background, a solid red rectangle, and real
 * text — close enough to the sushi-poster acceptance shape (background + shapes + real text)
 * without depending on an actual external image file.
 */
async function createSyntheticPoster(): Promise<Buffer> {
  const svg = `
    <svg width="480" height="320" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="320" fill="#f4ede1" />
      <rect x="40" y="40" width="160" height="120" fill="#c23b22" />
      <text x="230" y="110" font-family="Arial" font-size="40" fill="#1a1a1a">DELICIOUS</text>
      <text x="230" y="160" font-family="Arial" font-size="24" fill="#1a1a1a">Order now</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("reconstruction.import_reference MCP tool", () => {
  it("turns a real analyzed reference image into multiple real, individually-editable nodes — not an embedded image", async () => {
    const storage = createInMemoryAssetStorage();
    const fixture = createMcpTestFixture({ assetStorageAdapter: storage, toolTimeoutMs: 30_000 });
    const image = await createSyntheticPoster();

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: image.toString("base64"),
        originalFilename: "poster.png",
        mimeType: "image/png",
        width: 480,
        height: 320,
        alpha: false,
        analyzeForReconstruction: true,
      },
      { idempotencyKey: "register-poster" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registeredData = registered.data as { assetId: string; resultVersion: number };

    // Dry run must not mutate the document.
    const dryRun = await fixture.execute(
      "reconstruction.import_reference",
      { expectedDocumentVersion: registeredData.resultVersion, sourceAssetId: registeredData.assetId },
      { dryRun: true, idempotencyKey: "import-dry-run" },
    );
    expect(dryRun.success, JSON.stringify(dryRun.errors)).toBe(true);
    const dryRunData = dryRun.data as { dryRun: boolean; createdNodeCount: number; textNodeCount: number };
    expect(dryRunData.dryRun).toBe(true);
    expect(dryRunData.createdNodeCount).toBeGreaterThan(2);
    expect(dryRunData.textNodeCount).toBeGreaterThanOrEqual(1);
    const beforeImport = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(Object.keys(beforeImport?.nodes ?? {}).length).toBe(Object.keys(fixture.document.nodes).length);

    const applied = await fixture.execute(
      "reconstruction.import_reference",
      { expectedDocumentVersion: registeredData.resultVersion, sourceAssetId: registeredData.assetId },
      { idempotencyKey: "import-apply" },
    );
    expect(applied.success, JSON.stringify(applied.errors)).toBe(true);
    const appliedData = applied.data as {
      resultVersion: number;
      createdNodeCount: number;
      textNodeCount: number;
      referenceId: string;
    };
    expect(appliedData.createdNodeCount).toBeGreaterThan(2);

    const stored = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!stored) throw new Error("Document was not persisted.");

    // The reference record is real backend state — this is exactly what the Studio References
    // panel (which reads document.references) will render, honestly, once wired to upload.
    const reference = stored.references[appliedData.referenceId];
    expect(reference).toBeDefined();
    expect(reference?.assetId).toBe(registeredData.assetId);
    expect(reference?.regions.length).toBeGreaterThanOrEqual(2);

    const nodes = Object.values(stored.nodes) as DesignNode[];
    // Real decomposition, not "one node that is the whole embedded reference image": there must
    // be a real PAGE, a real FRAME, and multiple distinct child layers underneath them.
    expect(nodes.some((node) => node.type === "PAGE")).toBe(true);
    expect(nodes.some((node) => node.type === "FRAME")).toBe(true);
    const textNode = nodes.find((node) => node.type === "TEXT" && node.content?.toUpperCase().includes("DELICIOUS"));
    expect(
      textNode,
      JSON.stringify(nodes.filter((n) => n.type === "TEXT").map((n) => (n as { content?: string }).content)),
    ).toBeDefined();
    const geometryNode = nodes.find((node) => node.type === "SHAPE" || node.type === "IMAGE");
    expect(geometryNode, JSON.stringify(nodes.map((n) => ({ type: n.type, name: n.name })))).toBeDefined();

    // Every reconstructed node stays editable: not locked, has a real name and geometry.
    for (const node of nodes) {
      expect(node.locked).toBe(false);
      expect(node.name.length).toBeGreaterThan(0);
    }
  }, 60_000);
});
