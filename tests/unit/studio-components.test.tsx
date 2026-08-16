// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  __setStudioAgentContextForTesting,
  __setStudioSessionForTesting,
  PropertiesPanel,
  ReferencesPanel,
} from "../../apps/studio/src/main.js";
import { createEntityId } from "@aevum/document-model";
import {
  createMemoryPersistence,
  createStudioSession,
  type StudioCommandGateway,
} from "../../apps/studio/src/core/session.js";
import { createStudioProjectFixture } from "../../apps/studio/src/core/fixture.js";
import type { StudioAgentContext } from "../../apps/studio/src/core/agent.js";
import type { Command } from "@aevum/command-engine";
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

  it(
    "replaces a reference's asset through the real command gateway (session.updateReference), " +
      "not a direct reference.update MCP call bypassing it (Block H9 fix regression test)",
    async () => {
      const fixture = createStudioProjectFixture();
      const originalAssetId = Object.keys(fixture.document.assets)[0];
      if (!originalAssetId) throw new Error("Fixture must contain at least one asset.");
      const referenceId = createEntityId("reference");
      const newAssetId = createEntityId("asset");
      const documentWithReference = {
        ...fixture.document,
        references: {
          [referenceId]: {
            id: referenceId,
            assetId: originalAssetId,
            type: "IMAGE" as const,
            role: "PRIMARY" as const,
            regions: [],
            metadata: {},
          },
        },
      };
      const gatewayCalls: Command["type"][] = [];
      const commandGateway: StudioCommandGateway = {
        execute: async (command) => {
          gatewayCalls.push(command.type);
        },
      };
      const session = createStudioSession({
        ...fixture,
        document: documentWithReference,
        persistence: createMemoryPersistence(),
        commandGateway,
      });
      __setStudioSessionForTesting(session);

      const calls: string[] = [];
      __setStudioAgentContextForTesting(
        fakeAgentContext(async (tool) => {
          calls.push(tool);
          if (tool === "asset.register") return envelope(tool, { data: { assetId: newAssetId, resultVersion: 2 } });
          if (tool === "document.get") {
            // Simulates the server having really persisted the newly registered asset -- the local
            // session's store never applied asset.register itself (it was invoked directly, not
            // through the gateway), so the resync response must carry it for the subsequent
            // session.updateReference's local optimistic apply to find a real assets[newAssetId].
            const current = session.getSnapshot().document;
            return envelope(tool, {
              data: {
                ...current,
                assets: {
                  ...current.assets,
                  [newAssetId]: {
                    id: newAssetId,
                    type: "IMAGE",
                    name: "reference.png",
                    hash: `sha256:${"b".repeat(64)}`,
                    source: { kind: "UPLOAD", uri: "reference.png" },
                    mimeType: "image/png",
                    byteSize: 4,
                    metadata: {},
                  },
                },
              },
            });
          }
          throw new Error(`Unexpected tool invoked in this test: ${tool}`);
        }),
      );

      render(<ReferencesPanel snapshot={session.getSnapshot()} />);
      fireEvent.click(screen.getByText(/replace reference/i));
      const fileInputs = document.querySelectorAll('input[type="file"]');
      const replaceInput = fileInputs[1];
      if (!replaceInput) throw new Error("Replace-reference file input not found in rendered ReferencesPanel.");
      fireEvent.change(replaceInput, { target: { files: [pngFile()] } });

      await waitFor(() => expect(gatewayCalls).toContain("reference.update"));
      // The gateway (production.ts's real dry-run-then-commit execute()) is the only thing that
      // issues reference.update -- ReferencesPanel itself never calls client.invoke("reference.update",
      // ...) directly anymore, unlike before the Block H9 fix.
      expect(calls).toEqual(["asset.register", "document.get"]);
      expect(session.getSnapshot().document.references[referenceId]?.assetId).toBe(newAssetId);
    },
  );
});

describe("PropertiesPanel numeric fields (Block H16 live-verification regression test)", () => {
  afterEach(() => cleanup());

  function findNumericInput(label: string): HTMLInputElement {
    const field = Array.from(document.querySelectorAll(".numeric-field")).find(
      (candidate) => candidate.querySelector("span")?.textContent === label,
    );
    const input = field?.querySelector("input");
    if (!input) throw new Error(`Numeric field "${label}" not found in rendered PropertiesPanel.`);
    return input;
  }

  it(
    "reverts a numeric field to the real committed value (instead of leaving the rejected " +
      "input on screen) when the underlying commit is rejected, e.g. by a locked node -- found " +
      "live in Studio during the Block H16 verification pass: editing a locked node's position " +
      'field threw a real, uncaught LOCKED_ENTITY error and left "200" showing even though the ' +
      "document's real x stayed unchanged",
    () => {
      const session = buildSession();
      const heading = Object.values(session.getSnapshot().document.nodes).find(
        (candidate) => candidate.name === "Hero heading",
      );
      if (!heading) throw new Error("Fixture must contain a 'Hero heading' node.");
      const originalX = heading.transform.position.x;

      session.updateNode(heading.id, { locked: true });
      __setStudioSessionForTesting(session);
      render(<PropertiesPanel snapshot={session.getSnapshot()} selected={[heading.id]} />);

      const xInput = findNumericInput("X");
      expect(xInput.value).toBe(String(Math.round(originalX * 100) / 100));

      fireEvent.change(xInput, { target: { value: "200" } });
      // A rejected commit must not escape the field's blur handler as an uncaught exception.
      expect(() => fireEvent.blur(xInput)).not.toThrow();

      expect(xInput.value).toBe(String(Math.round(originalX * 100) / 100));
      expect(session.getSnapshot().document.nodes[heading.id]?.transform.position.x).toBe(originalX);
      expect(session.getSnapshot().lastError).toMatch(/locked/i);
    },
  );
});
