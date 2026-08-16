import { createAgentGoal, createAgentSession } from "@aevum/agent-core";
import { createDeterministicReasoningProvider } from "@aevum/agent-planner";
import { createAgentEngine, createInMemoryAgentPersistence } from "@aevum/agent-runtime";
import {
  createDeterministicStudioAgentContext,
  createMemoryPersistence,
  createStudioProjectFixture,
  createStudioSession,
  studioFixtureIds,
} from "@aevum/studio";
import { describe, expect, it } from "vitest";
import { createInteractiveApprovalAdapter } from "../../apps/studio/src/core/approval.js";

/**
 * Real, end-to-end tests of the compound multi-operation edit planner (Block E, E1-E4) through the
 * actual createAgentEngine, exercising the real deterministic planner, the real RESOLVE_COMPOUND_EDIT
 * analyze step, and the real Studio dev-fixture in-process MCP transport (document.get full
 * projection, node.update, token.register) — the same infrastructure Studio's AiPanel uses when
 * nothing is selected.
 */

function compoundEditScenario(
  prompt: string,
  approvalPolicy: "AUTO_SAFE_WRITE" | "REQUIRE_ALL_WRITE_APPROVAL" = "AUTO_SAFE_WRITE",
) {
  const fixture = createStudioProjectFixture();
  const session = createStudioSession({ ...fixture, persistence: createMemoryPersistence() });
  const agentContext = createDeterministicStudioAgentContext({
    session,
    workspaceId: fixture.project.workspaceId,
    projectId: fixture.project.id,
    documentId: fixture.document.metadata.id,
    actorId: "test-agent",
    approvalPolicy,
  });
  const goal = createAgentGoal({
    category: "EDIT",
    request: prompt,
    targetProjectId: agentContext.projectId,
    targetDocumentId: agentContext.documentId,
    parameters: { operation: "compound_edit", prompt },
  });
  const agentSession = createAgentSession({
    actorId: agentContext.actorId,
    workspaceId: agentContext.workspaceId,
    projectId: agentContext.projectId,
    documentId: agentContext.documentId,
    goal,
    createdAt: new Date().toISOString(),
  });
  const controller = createInteractiveApprovalAdapter();
  const engine = createAgentEngine({
    reasoningProvider: createDeterministicReasoningProvider({ approvalPolicy: agentContext.approvalPolicy }),
    mcpClient: agentContext.createMcpClient(`compound-edit-test-${crypto.randomUUID()}`),
    approvalAdapter: controller.adapter,
    persistence: createInMemoryAgentPersistence(),
  });
  return { session, agentSession, engine, controller };
}

describe("Compound multi-operation edit — real document-aware resolution and execution (Block E, E1-E4)", () => {
  it("resolves distinct real targets by document-aware name/type matching and commits a real multi-clause edit, including a fresh color token dependency chain", async () => {
    const { session, agentSession, engine } = compoundEditScenario(
      "make the headline bigger and change the text to orange",
    );
    const result = await engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: ["document.read", "document.write", "mcp.tool.execute"],
    });

    expect(result.run.status, JSON.stringify(result.run.outcome?.diagnostics)).toBe("SUCCEEDED");
    const document = session.getSnapshot().document;
    // "headline" resolves to the real TEXT node with the largest font size in the actual
    // document (Hero heading, 86px) — not a hardcoded id, not the first root node.
    const heading = document.nodes[studioFixtureIds.heading];
    expect(heading?.dimensions).toEqual({
      width: { value: 912, unit: "PX", mode: "FIXED" },
      height: { value: 250, unit: "PX", mode: "FIXED" },
    });
    // "text" (no name match) resolves via the real TEXT/smallest-font fallback to Eyebrow (16px)
    // — a genuinely different node than "headline" resolved to.
    const eyebrow = document.nodes[studioFixtureIds.eyebrow];
    expect(eyebrow?.id).not.toBe(heading?.id);
    const fillTokenId = eyebrow?.type === "TEXT" ? eyebrow.runs[0]?.style.fillTokenId : undefined;
    expect(fillTokenId).toBeDefined();
    const token = fillTokenId ? document.tokens[fillTokenId] : undefined;
    expect(token?.type).toBe("COLOR");
    expect(token?.value).toMatchObject({ r: expect.closeTo(234 / 255, 3), g: expect.closeTo(88 / 255, 3) });

    // Real, observed dependency ordering: the token was registered BEFORE the recolor write that
    // depends on it, and every write step actually committed (not just dry-ran).
    const committedTools = result.audits
      .filter((entry) => entry.writeStatus === "COMMITTED")
      .map((entry) => entry.tool);
    expect(committedTools).toEqual(["node.update", "token.register", "node.update"]);
  });

  it("threads expectedDocumentVersion sequentially across clauses so a second clause's write does not fail on a stale version the moment the first clause's write commits", async () => {
    const { session, agentSession, engine } = compoundEditScenario(
      "make the headline bigger and make the card label smaller",
    );
    const startVersion = session.getSnapshot().document.documentVersion;
    const result = await engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: ["document.read", "document.write", "mcp.tool.execute"],
    });

    expect(result.run.status, JSON.stringify(result.run.outcome?.diagnostics)).toBe("SUCCEEDED");
    expect(result.run.outcome?.diagnostics.some((entry) => entry.code === "AGENT_VERSION_CONFLICT")).toBe(false);
    // Two real, committed writes against the same document, sequential version increments.
    expect(session.getSnapshot().document.documentVersion).toBe(startVersion + 2);
  });

  it("makes no partial writes when one clause's real target cannot support the requested operation — the whole run fails honestly before any write", async () => {
    const { session, agentSession, engine } = compoundEditScenario(
      "make the headline bigger and change the card to orange",
    );
    const startVersion = session.getSnapshot().document.documentVersion;
    const result = await engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: ["document.read", "document.write", "mcp.tool.execute"],
    });

    expect(result.run.status).not.toBe("SUCCEEDED");
    // "card" name-matches "Stat card" (a FRAME) before it can match anything else — a FRAME has
    // no fill to recolor, so the shared analyze step throws before any clause's write runs.
    expect(
      result.run.outcome?.diagnostics.some(
        (entry) => entry.message.includes("FRAME") && entry.message.includes("fill"),
      ),
    ).toBe(true);
    expect(session.getSnapshot().document.documentVersion).toBe(startVersion);
    expect(result.audits.some((entry) => entry.writeStatus === "COMMITTED")).toBe(false);
    // The headline's real dimensions are untouched — not resized despite being a valid, resolvable
    // clause — because the failure was detected before any write in this run was attempted.
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.dimensions).toEqual({
      width: { value: 760, unit: "PX", mode: "FIXED" },
      height: { value: 208, unit: "PX", mode: "FIXED" },
    });
  });

  it("requires and honors real approval for a compound edit under REQUIRE_ALL_WRITE_APPROVAL, and only commits after approve()", async () => {
    const { session, agentSession, engine, controller } = compoundEditScenario(
      "make the headline bigger",
      "REQUIRE_ALL_WRITE_APPROVAL",
    );
    const runPromise = engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: ["document.read", "document.write", "mcp.tool.execute"],
    });
    let pendingSeen = false;
    for (let attempt = 0; attempt < 50 && !pendingSeen; attempt += 1) {
      await Promise.resolve();
      if (controller.getPending()) pendingSeen = true;
    }
    expect(pendingSeen, "a compound edit's write must genuinely pause for real approval").toBe(true);
    expect(controller.getPending()?.request.tool).toBe("node.update");
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.dimensions).toEqual({
      width: { value: 760, unit: "PX", mode: "FIXED" },
      height: { value: 208, unit: "PX", mode: "FIXED" },
    });

    controller.approve();
    const result = await runPromise;
    expect(result.run.status, JSON.stringify(result.run.outcome?.diagnostics)).toBe("SUCCEEDED");
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.dimensions).toEqual({
      width: { value: 912, unit: "PX", mode: "FIXED" },
      height: { value: 250, unit: "PX", mode: "FIXED" },
    });
  });
});
