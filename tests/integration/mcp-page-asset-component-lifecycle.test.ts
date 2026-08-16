import { createEntityId, createFrame, createPage, ComponentSchema } from "@aevum/document-model";
import { describe, expect, it } from "vitest";
import { createInMemoryAssetStorage, createMcpTestFixture } from "../helpers/mcp-fixture.js";

/**
 * Block H2/H3 — real MCP surface for page.create/delete/rename, asset.remove, and component.register
 * (Block H1). The command-engine layer for page.create/delete/rename and asset.remove already existed
 * (and asset.remove's
 * cross-reference guard was added in Block G); this proves the exact same protections hold when
 * reached through the real MCP tool + optimistic-concurrency layer, not just executeCommand directly.
 */
describe("MCP page/asset/component lifecycle (Block H2/H3)", () => {
  it("creates, renames, and deletes a real page through MCP, honoring stale-version rejection and dry-run", async () => {
    const fixture = createMcpTestFixture();
    const page = createPage("New page");

    const staleCreate = await fixture.execute(
      "page.create",
      { expectedDocumentVersion: fixture.document.documentVersion + 1, page },
      { idempotencyKey: "h2-page-create-stale" },
    );
    expect(staleCreate.success).toBe(false);
    expect(staleCreate.errors[0]?.code).toBe("MCP_DOCUMENT_VERSION_CONFLICT");

    const dryRun = await fixture.execute(
      "page.create",
      { expectedDocumentVersion: fixture.document.documentVersion, page },
      { dryRun: true, idempotencyKey: "h2-page-create-dry-run" },
    );
    expect(dryRun.success, JSON.stringify(dryRun.errors)).toBe(true);
    const beforeCreate = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(beforeCreate?.nodes[page.id]).toBeUndefined();

    const created = await fixture.execute(
      "page.create",
      { expectedDocumentVersion: fixture.document.documentVersion, page },
      { idempotencyKey: "h2-page-create" },
    );
    expect(created.success, JSON.stringify(created.errors)).toBe(true);
    const createdData = created.data as { resultVersion: number };
    const afterCreate = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterCreate?.nodes[page.id]?.type).toBe("PAGE");
    expect(afterCreate?.pages).toContain(page.id);

    const renamed = await fixture.execute(
      "page.rename",
      { expectedDocumentVersion: createdData.resultVersion, pageId: page.id, name: "Renamed page" },
      { idempotencyKey: "h2-page-rename" },
    );
    expect(renamed.success, JSON.stringify(renamed.errors)).toBe(true);
    const renamedData = renamed.data as { resultVersion: number };
    const afterRename = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterRename?.nodes[page.id]?.name).toBe("Renamed page");

    const deleted = await fixture.execute(
      "page.delete",
      { expectedDocumentVersion: renamedData.resultVersion, pageId: page.id },
      { idempotencyKey: "h2-page-delete" },
    );
    expect(deleted.success, JSON.stringify(deleted.errors)).toBe(true);
    const afterDelete = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterDelete?.nodes[page.id]).toBeUndefined();
    expect(afterDelete?.pages).not.toContain(page.id);
  }, 60_000);

  it("removes a real unreferenced asset through MCP and rejects removal of a referenced one, with no partial write on rejection", async () => {
    const storage = createInMemoryAssetStorage();
    const fixture = createMcpTestFixture({ assetStorageAdapter: storage });
    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: Buffer.from("fake-bytes").toString("base64"),
        originalFilename: "mcp-lifecycle.png",
        mimeType: "image/png",
        width: 10,
        height: 10,
        alpha: false,
      },
      { idempotencyKey: "h3-asset-register" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registeredData = registered.data as { assetId: string; resultVersion: number };

    // Stale-version rejection.
    const stale = await fixture.execute(
      "asset.remove",
      { expectedDocumentVersion: registeredData.resultVersion + 1, assetId: registeredData.assetId },
      { idempotencyKey: "h3-asset-remove-stale" },
    );
    expect(stale.success).toBe(false);
    expect(stale.errors[0]?.code).toBe("MCP_DOCUMENT_VERSION_CONFLICT");

    // Real removal of a genuinely unreferenced asset.
    const removed = await fixture.execute(
      "asset.remove",
      { expectedDocumentVersion: registeredData.resultVersion, assetId: registeredData.assetId },
      { idempotencyKey: "h3-asset-remove" },
    );
    expect(removed.success, JSON.stringify(removed.errors)).toBe(true);
    const removedData = removed.data as { resultVersion: number };
    const afterRemove = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterRemove?.assets[registeredData.assetId]).toBeUndefined();

    // Register a second asset and attach a real Reference to it, then prove removal is rejected with
    // no partial write (the asset must still exist afterward, same document version).
    const secondRegistered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: removedData.resultVersion,
        kind: "IMAGE",
        bytesBase64: Buffer.from("fake-bytes-2").toString("base64"),
        originalFilename: "referenced.png",
        mimeType: "image/png",
        width: 10,
        height: 10,
        alpha: false,
      },
      { idempotencyKey: "h3-asset-register-2" },
    );
    expect(secondRegistered.success, JSON.stringify(secondRegistered.errors)).toBe(true);
    const secondRegisteredData = secondRegistered.data as { assetId: string; resultVersion: number };

    const page = fixture.document.pages[0];
    if (!page) throw new Error("Fixture requires a page.");
    const imageNode = {
      id: createEntityId("image"),
      name: "Uses the second asset",
      parentId: page,
      childIds: [],
      visible: true,
      locked: false,
      transform: createFrame(page).transform,
      sourceLinks: [],
      metadata: { tags: [], customData: {} },
      type: "IMAGE" as const,
      assetId: secondRegisteredData.assetId,
      objectFit: "COVER" as const,
    };
    const withReferencingNode = await fixture.execute(
      "node.create",
      { expectedDocumentVersion: secondRegisteredData.resultVersion, node: imageNode },
      { idempotencyKey: "h3-image-node-create" },
    );
    expect(withReferencingNode.success, JSON.stringify(withReferencingNode.errors)).toBe(true);
    const withReferencingNodeData = withReferencingNode.data as { resultVersion: number };

    const rejected = await fixture.execute(
      "asset.remove",
      { expectedDocumentVersion: withReferencingNodeData.resultVersion, assetId: secondRegisteredData.assetId },
      { idempotencyKey: "h3-asset-remove-referenced" },
    );
    expect(rejected.success).toBe(false);
    expect(rejected.errors[0]?.code).toBe("MCP_COMMAND_FAILED");
    const afterRejection = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterRejection?.assets[secondRegisteredData.assetId]).toBeDefined();
    expect(afterRejection?.documentVersion).toBe(withReferencingNodeData.resultVersion);
  }, 60_000);

  it("registers a real component through MCP pointing at an already-created node, honoring dry-run and duplicate rejection", async () => {
    const fixture = createMcpTestFixture();
    const page = fixture.document.pages[0];
    if (!page) throw new Error("Fixture requires a page.");
    const frame = createFrame(page, "Card");

    const createdFrame = await fixture.execute(
      "node.create",
      { expectedDocumentVersion: fixture.document.documentVersion, node: frame },
      { idempotencyKey: "h1-mcp-frame-create" },
    );
    expect(createdFrame.success, JSON.stringify(createdFrame.errors)).toBe(true);
    const createdFrameData = createdFrame.data as { resultVersion: number };

    const component = ComponentSchema.parse({
      id: createEntityId("component"),
      name: "Card",
      rootNodeId: frame.id,
      variants: [],
      slots: [],
      defaultOverrides: {},
    });

    const dryRun = await fixture.execute(
      "component.register",
      { expectedDocumentVersion: createdFrameData.resultVersion, component },
      { dryRun: true, idempotencyKey: "h1-mcp-component-dry-run" },
    );
    expect(dryRun.success, JSON.stringify(dryRun.errors)).toBe(true);
    const beforeRegister = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(beforeRegister?.components[component.id]).toBeUndefined();

    const registered = await fixture.execute(
      "component.register",
      { expectedDocumentVersion: createdFrameData.resultVersion, component },
      { idempotencyKey: "h1-mcp-component-register" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const afterRegister = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterRegister?.components[component.id]).toEqual(component);
    const registeredData = registered.data as { resultVersion: number };

    const duplicate = await fixture.execute(
      "component.register",
      { expectedDocumentVersion: registeredData.resultVersion, component },
      { idempotencyKey: "h1-mcp-component-duplicate" },
    );
    expect(duplicate.success).toBe(false);
    expect(duplicate.errors[0]?.code).toBe("MCP_COMMAND_FAILED");
  }, 60_000);
});
