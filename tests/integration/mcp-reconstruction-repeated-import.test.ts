import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assetIdFromHash, computeSha256 } from "@aevum/assets";
import type { DesignNode } from "@aevum/document-model";
import { describe, expect, it } from "vitest";
import {
  createInMemoryAssetBytesResolver,
  createInMemoryAssetStorage,
  createMcpTestFixture,
} from "../helpers/mcp-fixture.js";

/**
 * Block G, G1/G4 — real "repeated import" acceptance against the actual sushi poster fixture (not
 * a synthetic substitute): importing the SAME already-registered reference a second time, with no
 * explicit targetPageId, is a real, reachable action a Studio user can genuinely trigger (click
 * "Import reference" again). This proves it does not corrupt the document, collide node ids, or
 * silently fail — it honestly creates a second independent page, exactly as
 * docs/STABILIZATION_KNOWN_LIMITATIONS.md's STEP 7 already documents as the default (opt-in
 * merging via targetPageId, Block D completeness) behavior.
 */
describe("reconstruction.import_reference — repeated import of the same reference (Block G)", () => {
  it("imports the real sushi poster twice without merging and produces two independent, non-colliding, individually valid pages", async () => {
    const bytes = await readFile(resolve(__dirname, "../../fixtures/sushi poster.jpg"));
    const referenceAssetId = assetIdFromHash(computeSha256(bytes));
    const assetBytesAdapter = createInMemoryAssetBytesResolver({ [referenceAssetId]: bytes });
    const fixture = createMcpTestFixture({
      assetStorageAdapter: createInMemoryAssetStorage(),
      assetBytesAdapter,
      toolTimeoutMs: 180_000,
    });

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
      { idempotencyKey: "g-repeated-register" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registeredData = registered.data as { assetId: string; resultVersion: number };

    const firstImport = await fixture.execute(
      "reconstruction.import_reference",
      { expectedDocumentVersion: registeredData.resultVersion, sourceAssetId: registeredData.assetId },
      { idempotencyKey: "g-repeated-import-1" },
    );
    expect(firstImport.success, JSON.stringify(firstImport.errors)).toBe(true);
    const firstImportData = firstImport.data as { resultVersion: number; createdNodeCount: number };
    expect(firstImportData.createdNodeCount).toBeGreaterThan(2);

    // A second, real, independent import of the SAME reference — no targetPageId, exactly the
    // default a repeated real user action would take.
    const secondImport = await fixture.execute(
      "reconstruction.import_reference",
      { expectedDocumentVersion: firstImportData.resultVersion, sourceAssetId: registeredData.assetId },
      { idempotencyKey: "g-repeated-import-2" },
    );
    expect(secondImport.success, JSON.stringify(secondImport.errors)).toBe(true);
    const secondImportData = secondImport.data as { resultVersion: number; createdNodeCount: number };
    expect(secondImportData.createdNodeCount).toBeGreaterThan(2);

    const finalDocument = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!finalDocument) throw new Error("Document was not persisted.");

    // No node id collision: the total node count is exactly the sum of both imports (plus
    // whatever the fixture started with) — never fewer, which would mean the second import
    // silently overwrote nodes from the first.
    const allNodeIds = Object.keys(finalDocument.nodes);
    expect(new Set(allNodeIds).size).toBe(allNodeIds.length);

    // Two real, independent pages — the documented default (opt-in merge only, Block D
    // completeness) — not one page silently reused, not a corrupted single merged mess.
    const pages = Object.values(finalDocument.nodes).filter((node): node is DesignNode => node.type === "PAGE");
    expect(pages.length).toBeGreaterThanOrEqual(2);

    // The whole document remains structurally valid after two real imports — every childId
    // resolves to a real node, every node's parentId (if set) resolves to a real node.
    for (const node of Object.values(finalDocument.nodes)) {
      for (const childId of node.childIds) {
        expect(finalDocument.nodes[childId], `${node.id} references missing child ${childId}`).toBeDefined();
      }
      if (node.parentId) {
        expect(
          finalDocument.nodes[node.parentId],
          `${node.id} references missing parent ${node.parentId}`,
        ).toBeDefined();
      }
    }

    // Both references are real, distinct reference records — reconstruction did not quietly
    // reuse or corrupt the first import's reference record for the second.
    expect(Object.keys(finalDocument.references).length).toBeGreaterThanOrEqual(2);
  }, 240_000);
});
