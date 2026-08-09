import { createFrame, fixtures } from "@aevum/document-model";
import { describe, expect, it } from "vitest";
import { MCP_OTHER_WORKSPACE_ID, createMcpTestFixture } from "../helpers/mcp-fixture.js";

describe("MCP server integration", () => {
  it("serves canonical capabilities, project, document, hierarchy, asset, and version reads", async () => {
    const fixture = createMcpTestFixture();
    const capabilities = await fixture.execute("system.get_capabilities", {});
    const project = await fixture.execute("project.get", {});
    const document = await fixture.execute("document.get", { projection: "summary" });
    const hierarchy = await fixture.execute("document.inspect_hierarchy", { maxDepth: 10 });
    const assetId = Object.keys(fixture.document.assets)[0];
    if (!assetId) throw new Error("Asset fixture must contain an asset.");
    const asset = await fixture.execute("asset.get", { assetId });
    const version = await fixture.execute("document.get_version", { version: 1, projection: "summary" });

    expect(capabilities.success).toBe(true);
    expect((capabilities.data as { enabledTools: string[] }).enabledTools).toHaveLength(12);
    expect(project.data).toMatchObject({ projectId: fixture.projectId, currentDocumentVersion: 1 });
    expect(document.data).toMatchObject({ id: fixture.document.metadata.id, documentVersion: 1 });
    expect((hierarchy.data as { nodes: unknown[] }).nodes.length).toBe(Object.keys(fixture.document.nodes).length);
    expect(asset.data).toMatchObject({ id: assetId });
    expect(version.data).toMatchObject({ documentVersion: 1 });
    expect(fixture.audits).toHaveLength(6);
    expect(fixture.audits.every((entry) => entry.status === "SUCCEEDED")).toBe(true);
  });

  it("dry-runs, atomically commits, versions, and idempotently replays a document rename", async () => {
    const fixture = createMcpTestFixture();
    const dryRun = await fixture.execute(
      "document.rename",
      {
        expectedDocumentVersion: 1,
        name: "Dry Run Name",
      },
      { dryRun: true, idempotencyKey: "rename-dry-run-0001" },
    );
    const afterDryRun = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(dryRun.data).toMatchObject({ dryRun: true, baseVersion: 1, resultVersion: 1, predictedDocumentVersion: 2 });
    expect(afterDryRun?.metadata.name).toBe(fixture.document.metadata.name);

    const first = await fixture.execute(
      "document.rename",
      {
        expectedDocumentVersion: 1,
        name: "Production MCP Name",
      },
      { idempotencyKey: "rename-commit-0001" },
    );
    const replay = await fixture.execute(
      "document.rename",
      {
        expectedDocumentVersion: 1,
        name: "Production MCP Name",
      },
      { idempotencyKey: "rename-commit-0001" },
    );
    const current = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    const versions = await fixture.execute("document.list_versions", { limit: 10 });

    expect(first.success).toBe(true);
    expect(replay.success).toBe(true);
    expect(replay.requestId).not.toBe(first.requestId);
    expect(replay.transactionId).toBe(first.transactionId);
    expect(current).toMatchObject({ documentVersion: 2, metadata: { name: "Production MCP Name" } });
    expect((versions.data as { versions: Array<{ version: number }> }).versions.map((entry) => entry.version)).toEqual([
      2, 1,
    ]);
    expect(fixture.audits).toHaveLength(4);
  });

  it("detects stale versions, idempotency collisions, and concurrent writes", async () => {
    const fixture = createMcpTestFixture();
    await fixture.execute(
      "document.rename",
      { expectedDocumentVersion: 1, name: "First" },
      {
        idempotencyKey: "version-write-0001",
      },
    );
    const stale = await fixture.execute(
      "document.rename",
      { expectedDocumentVersion: 1, name: "Stale" },
      {
        idempotencyKey: "version-write-0002",
      },
    );
    const collision = await fixture.execute(
      "document.rename",
      { expectedDocumentVersion: 1, name: "Different" },
      {
        idempotencyKey: "version-write-0001",
      },
    );
    expect(stale.errors[0]?.code).toBe("MCP_DOCUMENT_VERSION_CONFLICT");
    expect(collision.errors[0]?.code).toBe("MCP_IDEMPOTENCY_CONFLICT");

    const concurrent = createMcpTestFixture();
    const results = await Promise.all([
      concurrent.execute(
        "document.rename",
        { expectedDocumentVersion: 1, name: "A" },
        { idempotencyKey: "concurrent-write-a" },
      ),
      concurrent.execute(
        "document.rename",
        { expectedDocumentVersion: 1, name: "B" },
        { idempotencyKey: "concurrent-write-b" },
      ),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.find((result) => !result.success)?.errors[0]?.code).toBe("MCP_DOCUMENT_VERSION_CONFLICT");
  });

  it("enforces role permissions and workspace isolation without revealing project existence", async () => {
    const viewer = createMcpTestFixture({ role: "VIEWER" });
    const deniedWrite = await viewer.execute(
      "document.rename",
      {
        expectedDocumentVersion: 1,
        name: "Forbidden",
      },
      { idempotencyKey: "viewer-write-0001" },
    );
    const deniedWorkspace = await viewer.execute("project.get", {}, { workspaceId: MCP_OTHER_WORKSPACE_ID });

    expect(deniedWrite.errors[0]?.code).toBe("MCP_AUTHORIZATION_DENIED");
    expect(deniedWorkspace.errors[0]?.code).toBe("MCP_WORKSPACE_ACCESS_DENIED");
    expect(viewer.audits.map((entry) => entry.status)).toEqual(["DENIED", "DENIED"]);
  });

  it("creates, updates, and deletes nodes only through versioned Command Engine writes", async () => {
    const fixture = createMcpTestFixture();
    const pageId = fixture.document.pages[0];
    if (!pageId) throw new Error("Asset fixture must contain a page.");
    const node = createFrame(pageId, "MCP Frame");
    const created = await fixture.execute(
      "node.create",
      { expectedDocumentVersion: 1, node },
      {
        idempotencyKey: "node-create-0001",
      },
    );
    const updated = await fixture.execute(
      "node.update",
      {
        expectedDocumentVersion: 2,
        nodeId: node.id,
        changes: { name: "Updated MCP Frame", visible: false },
      },
      { idempotencyKey: "node-update-0001" },
    );
    const deleted = await fixture.execute(
      "node.delete",
      { expectedDocumentVersion: 3, nodeId: node.id },
      {
        idempotencyKey: "node-delete-0001",
      },
    );
    const current = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);

    expect([created.documentVersion, updated.documentVersion, deleted.documentVersion]).toEqual([2, 3, 4]);
    expect(current?.nodes[node.id]).toBeUndefined();
    expect(current?.documentVersion).toBe(4);
    expect(fixture.document.nodes[node.id]).toBeUndefined();
  });

  it("rejects MCP writes against locked canonical nodes", async () => {
    const document = structuredClone(fixtures.landingPage());
    const text = Object.values(document.nodes).find((node) => node.type === "TEXT");
    if (!text) throw new Error("Landing fixture requires text.");
    text.locked = true;
    const fixture = createMcpTestFixture({ document });
    const response = await fixture.execute(
      "node.update",
      {
        expectedDocumentVersion: 1,
        nodeId: text.id,
        changes: { name: "Forbidden" },
      },
      { idempotencyKey: "locked-node-0001" },
    );

    expect(response.errors[0]?.code).toBe("MCP_COMMAND_FAILED");
    expect((await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId))?.documentVersion).toBe(
      1,
    );
  });

  it("returns structured timeout and rate-limit failures and audits both", async () => {
    const slow = createMcpTestFixture({ toolTimeoutMs: 5, projectReadDelayMs: 30 });
    const timedOut = await slow.execute("project.get", {});
    expect(timedOut.errors[0]?.code).toBe("MCP_TIMEOUT");
    expect(slow.audits[0]?.errorCode).toBe("MCP_TIMEOUT");

    const limited = createMcpTestFixture({
      rateLimit: { enabled: true, readPerMinute: 1, writePerMinute: 1 },
    });
    expect((await limited.execute("project.get", {})).success).toBe(true);
    const rejected = await limited.execute("project.get", {});
    expect(rejected.errors[0]?.code).toBe("MCP_RATE_LIMITED");
    expect(limited.audits.at(-1)?.errorCode).toBe("MCP_RATE_LIMITED");
  });
});
