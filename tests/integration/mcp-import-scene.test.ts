import { computeSha256 } from "@aevum/assets";
import { createAsset, fixtures, type CanonicalDesignDocument } from "@aevum/document-model";
import { createThreeFixture } from "@aevum/test-fixtures";
import { describe, expect, it } from "vitest";
import {
  createInMemoryAssetBytesResolver,
  createMcpTestFixture,
  MCP_OTHER_WORKSPACE_ID,
} from "../helpers/mcp-fixture.js";

async function buildDocumentWithGlbAsset(): Promise<{
  document: CanonicalDesignDocument;
  assetId: string;
  bytes: Uint8Array;
}> {
  const binary = await createThreeFixture();
  const asset = createAsset({
    type: "GLB",
    name: "Phase 19A import fixture",
    hash: computeSha256(binary.glb),
    uri: "generated://phase19a/import-fixture.glb",
    mimeType: "model/gltf-binary",
    byteSize: binary.glb.byteLength,
  });
  const base = fixtures.assetDemo();
  const document: CanonicalDesignDocument = { ...base, assets: { ...base.assets, [asset.id]: asset } };
  return { document, assetId: asset.id, bytes: binary.glb };
}

describe("MCP three.import_scene (Phase 19A)", () => {
  it("is honestly disabled without a configured asset-byte storage adapter", async () => {
    const { document, assetId } = await buildDocumentWithGlbAsset();
    const fixture = createMcpTestFixture({ document });

    const capabilities = await fixture.execute("system.get_capabilities", {});
    expect((capabilities.data as { enabledTools: string[] }).enabledTools).not.toContain("three.import_scene");

    const result = await fixture.execute(
      "three.import_scene",
      { assetId, expectedDocumentVersion: 1 },
      { idempotencyKey: "import-disabled-0001" },
    );
    expect(result.success).toBe(false);
    expect(result.errors[0]?.code).toBe("MCP_TOOL_DISABLED");
  });

  it("dry-runs, then commits a canonical import: document version increments, real mesh nodes appear, and an audit record is written", async () => {
    const { document, assetId, bytes } = await buildDocumentWithGlbAsset();
    const resolver = createInMemoryAssetBytesResolver({ [assetId]: bytes });
    const fixture = createMcpTestFixture({ document, assetBytesAdapter: resolver });

    const capabilities = await fixture.execute("system.get_capabilities", {});
    expect((capabilities.data as { enabledTools: string[] }).enabledTools).toContain("three.import_scene");

    const dryRun = await fixture.execute(
      "three.import_scene",
      { assetId, expectedDocumentVersion: 1 },
      { dryRun: true, idempotencyKey: "import-dry-run-0001" },
    );
    expect(dryRun.success).toBe(true);
    expect(dryRun.data).toMatchObject({ dryRun: true, baseVersion: 1, resultVersion: 1, predictedDocumentVersion: 2 });
    const afterDryRun = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterDryRun?.documentVersion).toBe(1);

    const commit = await fixture.execute(
      "three.import_scene",
      { assetId, expectedDocumentVersion: 1 },
      { idempotencyKey: "import-commit-0001" },
    );
    expect(commit.success).toBe(true);
    const data = commit.data as {
      dryRun: boolean;
      resultVersion: number;
      importedNodeIds: string[];
      rootNodeIds: string[];
      counts: { nodes: number; meshes: number };
    };
    expect(data.dryRun).toBe(false);
    expect(data.resultVersion).toBe(2);
    expect(data.importedNodeIds.length).toBeGreaterThan(0);
    expect(data.counts.meshes).toBeGreaterThan(0);

    const current = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(current?.documentVersion).toBe(2);
    expect(Object.values(current?.nodes ?? {}).some((node) => node.type === "MESH_3D")).toBe(true);
    expect(
      fixture.audits.some(
        (entry) =>
          (entry as { tool?: string; status?: string }).tool === "three.import_scene" && entry.status === "SUCCEEDED",
      ),
    ).toBe(true);
  });

  it("replays an idempotent commit without importing the scene twice", async () => {
    const { document, assetId, bytes } = await buildDocumentWithGlbAsset();
    const resolver = createInMemoryAssetBytesResolver({ [assetId]: bytes });
    const fixture = createMcpTestFixture({ document, assetBytesAdapter: resolver });

    const first = await fixture.execute(
      "three.import_scene",
      { assetId, expectedDocumentVersion: 1 },
      { idempotencyKey: "import-idempotent-0001" },
    );
    const replay = await fixture.execute(
      "three.import_scene",
      { assetId, expectedDocumentVersion: 1 },
      { idempotencyKey: "import-idempotent-0001" },
    );
    const current = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);

    expect(first.success).toBe(true);
    expect(replay.success).toBe(true);
    expect(replay.transactionId).toBe(first.transactionId);
    expect(current?.documentVersion).toBe(2);
  });

  it("rejects a stale expectedDocumentVersion with MCP_DOCUMENT_VERSION_CONFLICT", async () => {
    const { document, assetId, bytes } = await buildDocumentWithGlbAsset();
    const resolver = createInMemoryAssetBytesResolver({ [assetId]: bytes });
    const fixture = createMcpTestFixture({ document, assetBytesAdapter: resolver });

    await fixture.execute(
      "three.import_scene",
      { assetId, expectedDocumentVersion: 1 },
      { idempotencyKey: "import-version-a" },
    );
    const stale = await fixture.execute(
      "three.import_scene",
      { assetId, expectedDocumentVersion: 1 },
      { idempotencyKey: "import-version-b" },
    );
    expect(stale.success).toBe(false);
    expect(stale.errors[0]?.code).toBe("MCP_DOCUMENT_VERSION_CONFLICT");
  });

  it("never resolves an asset registered in a different workspace's document", async () => {
    const { document, assetId, bytes } = await buildDocumentWithGlbAsset();
    const resolver = createInMemoryAssetBytesResolver({ [assetId]: bytes });
    const fixture = createMcpTestFixture({ document, assetBytesAdapter: resolver });

    const deniedWorkspace = await fixture.execute(
      "three.import_scene",
      { assetId, expectedDocumentVersion: 1 },
      { workspaceId: MCP_OTHER_WORKSPACE_ID, idempotencyKey: "import-cross-workspace-0001" },
    );
    expect(deniedWorkspace.success).toBe(false);
    expect(deniedWorkspace.errors[0]?.code).toBe("MCP_WORKSPACE_ACCESS_DENIED");
  });

  it("rejects an assetId that does not exist and one that is not a GLB/GLTF type", async () => {
    const { document, bytes } = await buildDocumentWithGlbAsset();
    const resolver = createInMemoryAssetBytesResolver({ missing_asset_bytes: bytes });
    const fixture = createMcpTestFixture({ document, assetBytesAdapter: resolver });

    const missing = await fixture.execute(
      "three.import_scene",
      { assetId: "asset_00000000-0000-4000-8000-000000000099", expectedDocumentVersion: 1 },
      { idempotencyKey: "import-missing-asset-0001" },
    );
    expect(missing.success).toBe(false);
    expect(missing.errors[0]?.code).toBe("MCP_DOCUMENT_NOT_FOUND");

    const imageAssetId = Object.values(document.assets).find((asset) => asset.type === "IMAGE")?.id;
    if (!imageAssetId) throw new Error("Expected an IMAGE asset in the demo fixture.");
    const wrongType = await fixture.execute(
      "three.import_scene",
      { assetId: imageAssetId, expectedDocumentVersion: 1 },
      { idempotencyKey: "import-wrong-type-0001" },
    );
    expect(wrongType.success).toBe(false);
    expect(wrongType.errors[0]?.code).toBe("MCP_INPUT_INVALID");
  });
});
