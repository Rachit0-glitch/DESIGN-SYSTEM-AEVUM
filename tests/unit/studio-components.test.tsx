// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  __setStudioAgentContextForTesting,
  __setStudioSessionForTesting,
  ReferencesPanel,
} from "../../apps/studio/src/main.js";
import { createMemoryPersistence, createStudioSession } from "../../apps/studio/src/core/session.js";
import { createStudioProjectFixture } from "../../apps/studio/src/core/fixture.js";
import type { StudioAgentContext } from "../../apps/studio/src/core/agent.js";
import type { AgentMcpClient } from "@aevum/agent-runtime/client";
import type { McpResponseEnvelope } from "@aevum/mcp-protocol";

/**
 * Real React component tests (Block D3) — renders the actual ReferencesPanel component with a
 * real Studio session/document and a real DOM (jsdom), simulating a genuine file-selection user
 * interaction rather than asserting on props/mocks that merely prove the component was wired
 * correctly. jsdom has no createImageBitmap (a real browser Canvas API, not part of DOM
 * emulation), so that one browser API is stubbed — nothing about the component or its MCP call
 * sequence is faked.
 */

function envelope(tool: string, overrides: Partial<McpResponseEnvelope> = {}): McpResponseEnvelope {
  return {
    protocolVersion: "1.0.0",
    success: true,
    requestId: `mcp_req_${crypto.randomUUID()}`,
    tool,
    data: {},
    warnings: [],
    errors: [],
    durationMs: 1,
    ...overrides,
  };
}

function buildSession() {
  const fixture = createStudioProjectFixture();
  return createStudioSession({ ...fixture, persistence: createMemoryPersistence() });
}

function fakeAgentContext(invoke: AgentMcpClient["invoke"]): StudioAgentContext {
  return {
    createMcpClient: () => ({ invoke, discoverCapabilities: async () => ({}) }) as unknown as AgentMcpClient,
    actorPermissions: [],
    workspaceId: "workspace_11111111-1111-4111-8111-111111111111",
    projectId: "project_22222222-2222-4222-8222-222222222222",
    documentId: "doc_33333333-3333-4333-8333-333333333333",
    actorId: "test-actor",
  };
}

function pngFile(): File {
  return new File([new Uint8Array([137, 80, 78, 71])], "reference.png", { type: "image/png" });
}

describe("ReferencesPanel (Block D3 — real component tests)", () => {
  beforeEach(() => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 400, height: 300, close: () => undefined }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("imports a reference through a real asset.register -> reconstruction.import_reference -> document.get MCP sequence and shows the real success message", async () => {
    const session = buildSession();
    const calls: string[] = [];
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(
      fakeAgentContext(async (tool) => {
        calls.push(tool);
        if (tool === "asset.register") return envelope(tool, { data: { assetId: "asset_new", resultVersion: 2 } });
        if (tool === "reconstruction.import_reference")
          return envelope(tool, { data: { createdNodeCount: 4, textNodeCount: 1 } });
        if (tool === "document.get") return envelope(tool, { data: session.getSnapshot().document });
        throw new Error(`Unexpected tool invoked in this test: ${tool}`);
      }),
    );

    render(<ReferencesPanel snapshot={session.getSnapshot()} />);
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) throw new Error("File input not found in rendered ReferencesPanel.");
    fireEvent.change(fileInput, { target: { files: [pngFile()] } });

    await waitFor(() => expect(screen.getByText(/imported 4 layers, 1 with recognized text/i)).toBeInTheDocument());
    expect(calls).toEqual(["asset.register", "reconstruction.import_reference", "document.get"]);
  });

  it("surfaces a real MCP failure as a real, visible error message instead of failing silently", async () => {
    const session = buildSession();
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(
      fakeAgentContext(async (tool) => {
        if (tool === "asset.register")
          return envelope(tool, {
            success: false,
            data: undefined,
            errors: [
              {
                code: "MCP_TOOL_DISABLED",
                message: "Asset storage is not configured for this workspace.",
                recoverable: true,
                retryable: false,
                requestId: "mcp_req_test",
              },
            ],
          });
        throw new Error(`Unexpected tool invoked in this test: ${tool}`);
      }),
    );

    render(<ReferencesPanel snapshot={session.getSnapshot()} />);
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) throw new Error("File input not found in rendered ReferencesPanel.");
    fireEvent.change(fileInput, { target: { files: [pngFile()] } });

    await waitFor(() =>
      expect(screen.getByText(/asset storage is not configured for this workspace/i)).toBeInTheDocument(),
    );
  });
});
