import { assetIdFromHash, computeSha256 } from "@aevum/assets";
import { createEntityId, type DesignNode } from "@aevum/document-model";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createInMemoryAssetBytesResolver,
  createInMemoryAssetStorage,
  createMcpTestFixture,
} from "../helpers/mcp-fixture.js";

interface FidelityIssueLike {
  readonly code: string;
  readonly domain: string;
  readonly property: string;
  readonly nodeId?: string;
}

/**
 * Block H7 — real, attributed gradient-mismatch detection, driven by the real linear-gradient
 * detection reconstruction already performs (Block C4b) and the real, already-tested GRADIENT
 * comparison logic in packages/fidelity/src/structure.ts (previously unreachable because
 * buildStructuralExpectations, apps/mcp-server/src/tools.ts, never supplied it an expectation — the
 * same class of gap Block F closed for BOUNDS). A synthetic image is used here (not the sushi
 * poster) specifically because it needs a real, reliably-detectable linear gradient fill, which
 * isn't a property of the existing sushi poster fixture.
 */
async function createGradientPoster(): Promise<Buffer> {
  const svg = `
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ff2d55" />
          <stop offset="100%" stop-color="#1f6feb" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="#f5f5f7" />
      <rect x="40" y="40" width="320" height="220" fill="url(#g)" />
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("Real, attributed gradient-mismatch fidelity detection (Block H7)", () => {
  it("detects a real GRADIENT_STRUCTURE_MISMATCH when a genuinely reconstructed gradient shape's fill is changed to a solid color", async () => {
    const bytes = await createGradientPoster();
    const storage = createInMemoryAssetStorage();
    const referenceAssetId = assetIdFromHash(computeSha256(bytes));
    const assetBytesAdapter = createInMemoryAssetBytesResolver({ [referenceAssetId]: bytes });
    const fixture = createMcpTestFixture({
      assetStorageAdapter: storage,
      assetBytesAdapter,
      toolTimeoutMs: 60_000,
    });

    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: bytes.toString("base64"),
        originalFilename: "gradient-poster.png",
        mimeType: "image/png",
        width: 400,
        height: 300,
        alpha: false,
        analyzeForReconstruction: true,
      },
      { idempotencyKey: "h7-gradient-register" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registeredData = registered.data as { assetId: string; resultVersion: number };

    const imported = await fixture.execute(
      "reconstruction.import_reference",
      { expectedDocumentVersion: registeredData.resultVersion, sourceAssetId: registeredData.assetId },
      { idempotencyKey: "h7-gradient-import" },
    );
    expect(imported.success, JSON.stringify(imported.errors)).toBe(true);
    const importedData = imported.data as { resultVersion: number };

    let document = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!document) throw new Error("Document was not persisted.");
    const gradientShape = Object.values(document.nodes).find(
      (node): node is Extract<DesignNode, { type: "SHAPE" }> =>
        node.type === "SHAPE" &&
        node.fillTokenId !== undefined &&
        document?.tokens[node.fillTokenId]?.type === "GRADIENT",
    );
    expect(gradientShape, "expected reconstruction to genuinely detect the real linear gradient fill").toBeDefined();
    if (!gradientShape) return;

    // A confidence, real baseline measurement first — the untouched reconstruction should not
    // report a gradient mismatch against itself.
    const baseline = await fixture.execute(
      "fidelity.measure",
      {
        expectedDocumentVersion: importedData.resultVersion,
        referenceAssetId: registeredData.assetId,
        profile: "DRAFT",
      },
      { idempotencyKey: "h7-gradient-measure-baseline" },
    );
    expect(baseline.success, JSON.stringify(baseline.errors)).toBe(true);
    const baselineData = baseline.data as { report: { issues: FidelityIssueLike[] } };
    expect(baselineData.report.issues.some((issue) => issue.code === "GRADIENT_STRUCTURE_MISMATCH")).toBe(false);

    // fidelity.measure itself committed a real validation.record, advancing the document version —
    // re-read the real current version rather than reusing the pre-measurement one.
    document = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    if (!document) throw new Error("Document was not persisted after baseline measurement.");
    const versionAfterBaseline = document.documentVersion;

    // Register a plain solid-color token and repoint the shape's fill at it — a real, deliberate
    // paint change away from what reconstruction actually detected.
    const solidToken = {
      id: createEntityId("token"),
      name: "color.override.flat",
      type: "COLOR" as const,
      value: { r: 0.2, g: 0.8, b: 0.3, a: 1, colorSpace: "SRGB" as const },
    };
    const registerToken = await fixture.execute(
      "token.register",
      { expectedDocumentVersion: versionAfterBaseline, token: solidToken },
      { idempotencyKey: "h7-token-register" },
    );
    expect(registerToken.success, JSON.stringify(registerToken.errors)).toBe(true);
    const registerTokenData = registerToken.data as { resultVersion: number };

    const updated = await fixture.execute(
      "node.update",
      {
        expectedDocumentVersion: registerTokenData.resultVersion,
        nodeId: gradientShape.id,
        changes: { fillTokenId: solidToken.id },
      },
      { idempotencyKey: "h7-node-update" },
    );
    expect(updated.success, JSON.stringify(updated.errors)).toBe(true);
    const updatedData = updated.data as { resultVersion: number };

    const measured = await fixture.execute(
      "fidelity.measure",
      {
        expectedDocumentVersion: updatedData.resultVersion,
        referenceAssetId: registeredData.assetId,
        profile: "DRAFT",
      },
      { idempotencyKey: "h7-gradient-measure-after" },
    );
    expect(measured.success, JSON.stringify(measured.errors)).toBe(true);
    const measuredData = measured.data as { report: { issues: FidelityIssueLike[] } };
    const gradientIssue = measuredData.report.issues.find(
      (issue) => issue.code === "GRADIENT_STRUCTURE_MISMATCH" && issue.nodeId === gradientShape.id,
    );
    expect(
      gradientIssue,
      JSON.stringify(measuredData.report.issues.map((entry) => ({ code: entry.code, nodeId: entry.nodeId }))),
    ).toBeDefined();
  }, 120_000);
});
