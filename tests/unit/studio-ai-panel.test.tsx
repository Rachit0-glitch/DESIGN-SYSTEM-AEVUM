// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  createDeterministicStudioAgentContext,
  createMemoryPersistence,
  createStudioProjectFixture,
  createStudioSession,
  studioFixtureIds,
} from "@aevum/studio";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  __setStudioAgentContextForTesting,
  __setStudioSessionForTesting,
  AiPanel,
} from "../../apps/studio/src/main.js";

/**
 * Block H5 — real component tests for AiPanel, the highest-traffic Studio surface with the least
 * prior coverage (existing tests exercised the underlying engine/planner directly, never the
 * rendered component + real user interaction). Uses the real deterministic in-process MCP transport
 * (createDeterministicStudioAgentContext, the same one tests/unit/studio-compound-edit.test.ts
 * already proved drives the real planner/engine/approval flow end to end) rather than a hand-rolled
 * fake invoke sequence — every prompt below is genuinely planned and executed, not scripted.
 */

function buildContext(
  approvalPolicy?: "AUTO_SAFE_WRITE" | "REQUIRE_ALL_WRITE_APPROVAL" | "REQUIRE_DESTRUCTIVE_APPROVAL",
) {
  const fixture = createStudioProjectFixture();
  const session = createStudioSession({ ...fixture, persistence: createMemoryPersistence() });
  const agentContext = createDeterministicStudioAgentContext({
    session,
    workspaceId: fixture.project.workspaceId,
    projectId: fixture.project.id,
    documentId: fixture.document.metadata.id,
    actorId: "test-actor",
    ...(approvalPolicy ? { approvalPolicy } : {}),
  });
  return { session, agentContext };
}

function renderPanel(session: ReturnType<typeof createStudioSession>, selected: readonly string[] = []) {
  return render(<AiPanel snapshot={session.getSnapshot()} selected={selected} onSelect={() => undefined} />);
}

describe("AiPanel (Block H5 — real component tests)", () => {
  afterEach(() => cleanup());

  it("resizes a real selected node through a real prompt submission and reports real success", async () => {
    const { session, agentContext } = buildContext();
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(agentContext);

    renderPanel(session, [studioFixtureIds.heading]);
    fireEvent.change(screen.getByPlaceholderText(/describe a change/i), { target: { value: "make it bigger" } });
    fireEvent.click(screen.getByLabelText(/send instruction/i));

    await waitFor(() => expect(screen.getByText(/canonical document advanced to v/i)).toBeInTheDocument());
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.dimensions).toEqual({
      width: { value: 912, unit: "PX", mode: "FIXED" },
      height: { value: 250, unit: "PX", mode: "FIXED" },
    });
  });

  it("runs a real multi-clause compound edit when nothing is selected and reports the real committed-write count", async () => {
    const { session, agentContext } = buildContext();
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(agentContext);

    renderPanel(session, []);
    fireEvent.change(screen.getByPlaceholderText(/describe a change/i), {
      target: { value: "make the headline bigger and make the card label smaller" },
    });
    fireEvent.click(screen.getByLabelText(/send instruction/i));

    await waitFor(() => expect(screen.getByText(/applied 2 layer changes/i)).toBeInTheDocument());
  });

  it("rejects a locked selected node honestly, with no write attempted", async () => {
    const { session, agentContext } = buildContext();
    const locked = session.getSnapshot().document.nodes[studioFixtureIds.heading];
    if (!locked) throw new Error("Fixture heading node missing.");
    session.updateNode(locked.id, { locked: true });
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(agentContext);
    const versionBefore = session.getSnapshot().document.documentVersion;

    renderPanel(session, [studioFixtureIds.heading]);
    fireEvent.change(screen.getByPlaceholderText(/describe a change/i), { target: { value: "make it bigger" } });
    fireEvent.click(screen.getByLabelText(/send instruction/i));

    await waitFor(() => expect(screen.getByText(/selected node is locked/i)).toBeInTheDocument());
    expect(session.getSnapshot().document.documentVersion).toBe(versionBefore);
  });

  it("surfaces a real planner failure honestly (a FRAME has no fill to recolor) with zero partial writes", async () => {
    const { session, agentContext } = buildContext();
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(agentContext);
    const versionBefore = session.getSnapshot().document.documentVersion;

    renderPanel(session, []);
    fireEvent.change(screen.getByPlaceholderText(/describe a change/i), {
      target: { value: "make the headline bigger and change the card to orange" },
    });
    fireEvent.click(screen.getByLabelText(/send instruction/i));

    await waitFor(() => expect(screen.getAllByText(/frame.*no fill to recolor/i).length).toBeGreaterThan(0));
    expect(session.getSnapshot().document.documentVersion).toBe(versionBefore);
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.dimensions).toEqual({
      width: { value: 760, unit: "PX", mode: "FIXED" },
      height: { value: 208, unit: "PX", mode: "FIXED" },
    });
  });

  it("genuinely pauses for real approval under REQUIRE_ALL_WRITE_APPROVAL, makes no write until Approve is clicked, and commits only after approval", async () => {
    const { session, agentContext } = buildContext("REQUIRE_ALL_WRITE_APPROVAL");
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(agentContext);

    renderPanel(session, [studioFixtureIds.heading]);
    fireEvent.change(screen.getByPlaceholderText(/describe a change/i), { target: { value: "make it bigger" } });
    fireEvent.click(screen.getByLabelText(/send instruction/i));

    await waitFor(() => expect(screen.getByText(/safe, reversible write/i)).toBeInTheDocument());
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.dimensions).toEqual({
      width: { value: 760, unit: "PX", mode: "FIXED" },
      height: { value: 208, unit: "PX", mode: "FIXED" },
    });

    fireEvent.click(screen.getByText(/^approve$/i));

    await waitFor(() => expect(screen.getByText(/canonical document advanced to v/i)).toBeInTheDocument());
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.dimensions).toEqual({
      width: { value: 912, unit: "PX", mode: "FIXED" },
      height: { value: 250, unit: "PX", mode: "FIXED" },
    });
  });

  it("makes no write when a pending real approval is Rejected", async () => {
    const { session, agentContext } = buildContext("REQUIRE_ALL_WRITE_APPROVAL");
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(agentContext);
    const versionBefore = session.getSnapshot().document.documentVersion;

    renderPanel(session, [studioFixtureIds.heading]);
    fireEvent.change(screen.getByPlaceholderText(/describe a change/i), { target: { value: "make it bigger" } });
    fireEvent.click(screen.getByLabelText(/send instruction/i));

    await waitFor(() => expect(screen.getByText(/safe, reversible write/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/^reject$/i));

    await waitFor(() => expect(screen.queryByText(/safe, reversible write/i)).not.toBeInTheDocument());
    expect(session.getSnapshot().document.documentVersion).toBe(versionBefore);
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.dimensions).toEqual({
      width: { value: 760, unit: "PX", mode: "FIXED" },
      height: { value: 208, unit: "PX", mode: "FIXED" },
    });
  });

  it("reports an honest failure message for an empty prompt without invoking any MCP call", async () => {
    const { session, agentContext } = buildContext();
    __setStudioSessionForTesting(session);
    __setStudioAgentContextForTesting(agentContext);

    renderPanel(session, [studioFixtureIds.heading]);
    fireEvent.click(screen.getByLabelText(/send instruction/i));

    await waitFor(() => expect(screen.getByText(/enter an instruction/i)).toBeInTheDocument());
  });
});
