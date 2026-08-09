import type { BlenderToolAdapter } from "@aevum/mcp-server";
import { describe, expect, it, vi } from "vitest";
import { createMcpTestFixture, MCP_OTHER_WORKSPACE_ID } from "../helpers/mcp-fixture.js";

const adapter: BlenderToolAdapter = {
  execute: vi.fn(async ({ tool, document }) => {
    if (tool === "blender.runtime_info") {
      return {
        data: {
          protocolVersion: "1.0.0",
          blenderVersion: "5.1.2",
          pythonVersion: "3.13.9",
          platform: "win32",
          compatibility: "SUPPORTED",
          headless: true,
          executableFingerprint: `sha256:${"a".repeat(64)}`,
          durationMs: 10,
        },
      };
    }
    return {
      data: {
        dryRun: true,
        stage: "VALIDATED",
        baseVersion: document.documentVersion,
        operation: "object.transform",
        manifestFingerprint: `sha256:${"b".repeat(64)}`,
        preview: { physicalExecution: false },
      },
    };
  }),
};

describe("MCP Blender authorization boundary", () => {
  it("keeps Blender tools disabled when no local adapter is configured", async () => {
    const fixture = createMcpTestFixture();
    const response = await fixture.execute("blender.runtime_info", {});
    expect(response).toMatchObject({ success: false, errors: [{ code: "MCP_TOOL_DISABLED" }] });
  });

  it("allows scoped reads but denies Viewer writes before adapter execution", async () => {
    const fixture = createMcpTestFixture({ role: "VIEWER", blenderAdapter: adapter });
    const runtime = await fixture.execute("blender.runtime_info", {});
    expect(runtime).toMatchObject({ success: true, data: { blenderVersion: "5.1.2" } });
    const write = await fixture.execute(
      "blender.update_object_transform",
      {
        assetId: "asset_11111111-1111-4111-8111-111111111111",
        targetId: "group_11111111-1111-4111-8111-111111111111",
        expectedDocumentVersion: fixture.document.documentVersion,
        mode: "DELTA",
        coordinateSpace: "LOCAL",
        unit: "M",
        translation: { x: 0.02, y: 0, z: 0 },
      },
      { dryRun: true, idempotencyKey: "blender-viewer-denied" },
    );
    expect(write).toMatchObject({ success: false, errors: [{ code: "MCP_AUTHORIZATION_DENIED" }] });
  });

  it("enforces workspace isolation before dispatching an enabled Blender tool", async () => {
    const fixture = createMcpTestFixture({ blenderAdapter: adapter });
    const before = vi.mocked(adapter.execute).mock.calls.length;
    const response = await fixture.executor.execute(
      {
        protocolVersion: "1.0.0",
        requestId: "mcp_req_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        workspaceId: MCP_OTHER_WORKSPACE_ID,
        projectId: fixture.projectId,
        documentId: fixture.document.metadata.id,
        tool: "blender.runtime_info",
        input: {},
      },
      { ip: "127.0.0.1" },
    );
    expect(response).toMatchObject({ success: false, errors: [{ code: "MCP_WORKSPACE_ACCESS_DENIED" }] });
    expect(vi.mocked(adapter.execute).mock.calls.length).toBe(before);
  });
});
