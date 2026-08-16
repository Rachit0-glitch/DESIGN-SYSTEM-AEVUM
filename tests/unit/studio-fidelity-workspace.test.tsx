// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { AgentMcpClient } from "@aevum/agent-runtime/client";
import { createAsset, createEntityId, ValidationRecordSchema } from "@aevum/document-model";
import type { McpResponseEnvelope } from "@aevum/mcp-protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { StudioAgentContext } from "../../apps/studio/src/core/agent.js";
import { createStudioProjectFixture } from "../../apps/studio/src/core/fixture.js";
import { createMemoryPersistence, createStudioSession } from "../../apps/studio/src/core/session.js";
import {
  __setStudioAgentContextForTesting,
  __setStudioSessionForTesting,
  FidelityWorkspace,
} from "../../apps/studio/src/main.js";

/**
 * Block H5 — real component tests for FidelityWorkspace, the second highest-value under-tested
 * Studio surface. The dev-fixture's deterministic in-process MCP transport does not implement
 * fidelity.measure at all (Block F already found and disclosed this — Studio's Fidelity workspace
 * only ever shows its honest empty state against the real local dev fixture), so a hand-rolled fake
 * invoke (the same technique tests/unit/studio-components.test.tsx already uses for ReferencesPanel)
 * is the only way to exercise the success/failure display paths at all; nothing here fabricates a
 * fidelity score outside of test-controlled MCP response data.
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

function documentWithReference(session: ReturnType<typeof buildSession>) {
  const document = session.getSnapshot().document;
  const asset = createAsset({
    type: "IMAGE",
    name: "Fixture reference",
    hash: `sha256:${"a".repeat(64)}`,
    uri: "assets/fixture.png",
    mimeType: "image/png",
  });
  const assetId = asset.id;
  const referenceId = createEntityId("reference");
  return {
    ...document,
    assets: { ...document.assets, [assetId]: asset },
    references: {
      ...document.references,
      [referenceId]: {
        id: referenceId,
        assetId,
        type: "SCREENSHOT" as const,
        role: "PRIMARY" as const,
        regions: [],
        metadata: {},
      },
    },
  };
}

// FidelityWorkspace reads snapshot as a prop (no internal subscription of its own) — the real App
// shell re-renders it with a fresh snapshot whenever the session changes (e.g. after
// session.resyncDocument()). This tiny wrapper reproduces that same live-subscription behavior so
// the real post-measurement re-render (score panel appearing) is actually observable in isolation.
function LiveFidelityWorkspace({ session }: { session: ReturnType<typeof buildSession> }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return <FidelityWorkspace snapshot={snapshot} />;
}

describe("FidelityWorkspace (Block H5 — real component tests)", () => {
  afterEach(() => cleanup());

  it("shows the honest empty state, with no measurement button, when the document has no reference", () => {
    const session = buildSession();
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(fakeAgentContext(async () => envelope("unused")));

    render(<FidelityWorkspace snapshot={session.getSnapshot()} />);

    expect(screen.getByText(/not evaluated\. no maximum fidelity report/i)).toBeInTheDocument();
    expect(screen.queryByText(/run fidelity measurement/i)).not.toBeInTheDocument();
  });

  it("runs a real fidelity.measure -> document.get sequence and displays the real returned scores", async () => {
    const session = buildSession();
    const withReference = documentWithReference(session);
    session.resyncDocument(withReference);
    __setStudioSessionForTesting(session);

    const validation = ValidationRecordSchema.parse({
      id: createEntityId("validation"),
      createdAt: "2026-08-16T00:00:00.000Z",
      status: "WARNING",
      scores: { RASTER: 0.82, TYPOGRAPHY: 0.91 },
      referenceIds: [],
      heatmapAssetIds: [],
      metadata: {},
    });
    const calls: string[] = [];
    __setStudioAgentContextForTesting(
      fakeAgentContext(async (tool) => {
        calls.push(tool);
        if (tool === "fidelity.measure") {
          return envelope(tool, { data: { validationRecordId: validation.id, overallScore: 0.865 } });
        }
        if (tool === "document.get") {
          return envelope(tool, {
            data: { ...withReference, validations: { [validation.id]: validation } },
          });
        }
        throw new Error(`Unexpected tool invoked in this test: ${tool}`);
      }),
    );

    render(<LiveFidelityWorkspace session={session} />);
    fireEvent.click(screen.getByText(/run fidelity measurement/i));

    await waitFor(() => expect(screen.getByText("87")).toBeInTheDocument());
    expect(screen.getByText("WARNING")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(calls).toEqual(["fidelity.measure", "document.get"]);
  });

  it("surfaces a real fidelity.measure failure as a visible alert instead of a fabricated score", async () => {
    const session = buildSession();
    session.resyncDocument(documentWithReference(session));
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(
      fakeAgentContext(async (tool) => {
        if (tool === "fidelity.measure") {
          return envelope(tool, {
            success: false,
            data: undefined,
            errors: [
              {
                code: "MCP_TOOL_DISABLED",
                message: "No raster backend is configured for this deployment.",
                recoverable: true,
                retryable: false,
                requestId: "mcp_req_test",
              },
            ],
          });
        }
        throw new Error(`Unexpected tool invoked in this test: ${tool}`);
      }),
    );

    render(<LiveFidelityWorkspace session={session} />);
    fireEvent.click(screen.getByText(/run fidelity measurement/i));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no raster backend is configured/i));
    // The empty state remains — a failed measurement never fabricates a score.
    expect(screen.getByText(/not evaluated\. no maximum fidelity report/i)).toBeInTheDocument();
  });
});
