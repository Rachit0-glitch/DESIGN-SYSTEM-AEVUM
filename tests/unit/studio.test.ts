import { describe, expect, it } from "vitest";
import { createAgentGoal, createAgentSession } from "@aevum/agent-core";
import { createDeterministicReasoningProvider } from "@aevum/agent-planner";
import {
  createAgentEngine,
  createDeterministicApprovalAdapter,
  createInMemoryAgentPersistence,
} from "@aevum/agent-runtime";
import {
  createDeterministicStudioAgentContext,
  createMemoryPersistence,
  createStudioProjectFixture,
  createStudioSession,
  snapValue,
  studioFixtureIds,
} from "@aevum/studio";

describe("AEVUM Studio canonical session", () => {
  it("projects through Scene Runtime and renderer, persists canonical commands, and restores the document", () => {
    const fixture = createStudioProjectFixture();
    const persistence = createMemoryPersistence();
    const session = createStudioSession({ ...fixture, persistence, openedAt: "2026-08-13T01:00:00.000Z" });
    const before = session.getSnapshot();
    const heading = before.document.nodes[studioFixtureIds.heading];
    expect(heading?.type).toBe("TEXT");
    expect(before.projection.complete).toBe(true);
    expect(before.renderer.complete).toBe(true);

    session.updateNode(studioFixtureIds.heading, {
      transform: { ...heading?.transform, position: { x: 160, y: 210, z: 0 } },
    });
    const after = session.getSnapshot();
    expect(after.document.documentVersion).toBe(2);
    expect(after.document.nodes[studioFixtureIds.heading]?.transform.position).toEqual({ x: 160, y: 210, z: 0 });
    expect(after.history.entries[0]?.auditRecord.commandTypes).toEqual(["node.update"]);
    expect(after.saveState).toBe("SAVED");

    const restored = createStudioSession({ ...fixture, persistence, openedAt: "2026-08-13T01:01:00.000Z" });
    expect(restored.getSnapshot().document.documentVersion).toBe(2);
    expect(restored.getSnapshot().document.nodes[studioFixtureIds.heading]?.transform.position.x).toBe(160);
  });

  it("keeps undo, redo, duplication, and optimistic conflicts inside Command Engine rules", () => {
    const fixture = createStudioProjectFixture();
    const session = createStudioSession({ ...fixture, persistence: createMemoryPersistence() });
    const duplicateId = session.duplicateNode(studioFixtureIds.card);
    expect(session.getSnapshot().document.nodes[duplicateId]?.name).toBe("Stat card copy");
    expect(session.getSnapshot().document.nodes[duplicateId]?.childIds).not.toEqual(
      session.getSnapshot().document.nodes[studioFixtureIds.card]?.childIds,
    );
    session.undo();
    expect(session.getSnapshot().document.nodes[duplicateId]).toBeUndefined();
    session.redo();
    expect(session.getSnapshot().document.nodes[duplicateId]).toBeDefined();

    expect(() =>
      session.updateNode(studioFixtureIds.heading, { name: "Stale" }, { expectedDocumentVersion: 1 }),
    ).toThrow(/version/i);
    expect(session.getSnapshot().saveState).toBe("CONFLICT");
  });

  it("snaps deterministically without mutating input targets", () => {
    const targets = Object.freeze([0, 40, 124]);
    expect(snapValue(121.4, targets)).toBe(124);
    expect(snapValue(81.2, targets)).toBe(81);
    expect(targets).toEqual([0, 40, 124]);
  });

  it("routes deterministic AI edits through the real Agent Planner and Command Engine persistence", async () => {
    const fixture = createStudioProjectFixture();
    const persistence = createMemoryPersistence();
    const session = createStudioSession({ ...fixture, persistence });
    const agentContext = createDeterministicStudioAgentContext({
      session,
      workspaceId: fixture.project.workspaceId,
      projectId: fixture.project.id,
      documentId: fixture.document.metadata.id,
      actorId: "test-agent",
    });

    const runTurn = async (changes: Record<string, unknown>, correlationId: string) => {
      const goal = createAgentGoal({
        category: "EDIT",
        request: "test edit",
        targetProjectId: agentContext.projectId,
        targetDocumentId: agentContext.documentId,
        targetNodeIds: [studioFixtureIds.heading],
        parameters: { changes },
      });
      const agentSession = createAgentSession({
        actorId: agentContext.actorId,
        workspaceId: agentContext.workspaceId,
        projectId: agentContext.projectId,
        documentId: agentContext.documentId,
        goal,
        createdAt: new Date().toISOString(),
      });
      const engine = createAgentEngine({
        reasoningProvider: createDeterministicReasoningProvider(),
        mcpClient: agentContext.createMcpClient(correlationId),
        approvalAdapter: createDeterministicApprovalAdapter(),
        persistence: createInMemoryAgentPersistence(),
      });
      return engine.execute({
        session: agentSession,
        contextRecords: [],
        actorPermissions: agentContext.actorPermissions,
      });
    };

    const result = await runTurn({ name: "Agent-reviewed heading" }, "studio-agent-test");

    expect(result.run.status).toBe("SUCCEEDED");
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Agent-reviewed heading");
    expect(session.getSnapshot().history.entries[0]?.auditRecord.actor.type).toBe("MCP_AGENT");
    expect(
      createStudioSession({ ...fixture, persistence }).getSnapshot().document.nodes[studioFixtureIds.heading]?.name,
    ).toBe("Agent-reviewed heading");

    // nodeUpdatePlan binds expectedDocumentVersion dynamically from its own document.get read, so
    // a second real turn naturally targets whatever version the first turn left behind.
    const second = await runTurn({ name: "Second AI edit" }, "studio-agent-second");
    expect(second.run.status).toBe("SUCCEEDED");
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Second AI edit");
  });

  describe("real planner reasoning from a raw prompt (Block D4)", () => {
    function runPromptScenario() {
      const fixture = createStudioProjectFixture();
      const session = createStudioSession({ ...fixture, persistence: createMemoryPersistence() });
      const agentContext = createDeterministicStudioAgentContext({
        session,
        workspaceId: fixture.project.workspaceId,
        projectId: fixture.project.id,
        documentId: fixture.document.metadata.id,
        actorId: "test-agent",
      });
      const runPrompt = async (prompt: string, correlationId: string) => {
        const goal = createAgentGoal({
          category: "EDIT",
          request: prompt,
          targetProjectId: agentContext.projectId,
          targetDocumentId: agentContext.documentId,
          targetNodeIds: [studioFixtureIds.heading],
          parameters: { prompt, viewportWidth: 1440 },
        });
        const agentSession = createAgentSession({
          actorId: agentContext.actorId,
          workspaceId: agentContext.workspaceId,
          projectId: agentContext.projectId,
          documentId: agentContext.documentId,
          goal,
          createdAt: new Date().toISOString(),
        });
        const engine = createAgentEngine({
          reasoningProvider: createDeterministicReasoningProvider(),
          mcpClient: agentContext.createMcpClient(correlationId),
          approvalAdapter: createDeterministicApprovalAdapter(),
          persistence: createInMemoryAgentPersistence(),
        });
        return engine.execute({
          session: agentSession,
          contextRecords: [],
          actorPermissions: agentContext.actorPermissions,
        });
      };
      return { session, runPrompt };
    }

    it('interprets "center it" using the node\'s real current width and the real viewport width', async () => {
      const { session, runPrompt } = runPromptScenario();
      const before = session.getSnapshot().document.nodes[studioFixtureIds.heading];
      const result = await runPrompt("center it", "d4-center");
      expect(result.run.status, JSON.stringify(result.run.outcome?.diagnostics)).toBe("SUCCEEDED");
      const width = before?.dimensions?.width.value ?? 0;
      const expectedX = Math.round((1440 - width) / 2);
      expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.transform.position.x).toBe(expectedX);
    });

    it('interprets "move right 40px" as a real, correctly-added offset to the node\'s actual current x', async () => {
      const { session, runPrompt } = runPromptScenario();
      const before = session.getSnapshot().document.nodes[studioFixtureIds.heading];
      const startX = before?.transform.position.x ?? 0;
      const result = await runPrompt("move right 40px", "d4-move");
      expect(result.run.status, JSON.stringify(result.run.outcome?.diagnostics)).toBe("SUCCEEDED");
      expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.transform.position.x).toBe(startX + 40);
    });

    it('interprets "make it bigger" as a real 1.2x resize of the node\'s actual current dimensions', async () => {
      const { session, runPrompt } = runPromptScenario();
      const before = session.getSnapshot().document.nodes[studioFixtureIds.heading];
      const startWidth = before?.dimensions?.width.value ?? 0;
      const result = await runPrompt("make it bigger", "d4-resize");
      expect(result.run.status, JSON.stringify(result.run.outcome?.diagnostics)).toBe("SUCCEEDED");
      const after = session.getSnapshot().document.nodes[studioFixtureIds.heading];
      expect(after?.dimensions?.width.value).toBe(Math.round(startWidth * 1.2));
    });

    it('interprets "rename to Launch Title" as a real name change', async () => {
      const { session, runPrompt } = runPromptScenario();
      const result = await runPrompt("rename to Launch Title", "d4-rename");
      expect(result.run.status, JSON.stringify(result.run.outcome?.diagnostics)).toBe("SUCCEEDED");
      expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Launch Title");
    });

    it("fails a genuinely unrecognized prompt with a real, honest diagnostic instead of guessing or silently no-op'ing", async () => {
      const { session, runPrompt } = runPromptScenario();
      const before = session.getSnapshot().document.nodes[studioFixtureIds.heading];
      const result = await runPrompt("frobnicate the whatsit", "d4-unrecognized");
      expect(result.run.status).not.toBe("SUCCEEDED");
      expect(result.run.outcome?.diagnostics.some((entry) => entry.message.includes("Could not map"))).toBe(true);
      // The document must be untouched by a failed interpretation.
      expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]).toEqual(before);
    });
  });

  it("keeps production edits remote-first and performs auditable undo and redo writes", async () => {
    const fixture = createStudioProjectFixture();
    const commands: string[] = [];
    const session = createStudioSession({
      ...fixture,
      persistence: createMemoryPersistence(),
      restoreFromPersistence: false,
      commandGateway: {
        async execute(command) {
          commands.push(`${command.type}@${command.expectedDocumentVersion}`);
        },
      },
    });

    await session.updateNode(studioFixtureIds.heading, { name: "Production heading" });
    expect(session.mode).toBe("REMOTE");
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Production heading");
    expect(session.getSnapshot().history.canUndo).toBe(true);

    await session.undo();
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Hero heading");
    await session.redo();
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Production heading");
    expect(commands).toEqual(["node.update@1", "node.update@2", "node.update@3"]);

    // Block D2: node.duplicate and node.move now have real MCP tools, so these no longer throw
    // "not exposed by the current MCP contract" — they route through the same remote gateway.
    const duplicateId = session.duplicateNode(studioFixtureIds.heading);
    expect(typeof duplicateId).toBe("string");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(commands.at(-1)).toBe("node.duplicate@4");
    expect(session.getSnapshot().document.nodes[duplicateId]?.name).toBe("Production heading copy");

    await session.moveNode(studioFixtureIds.heading, 0);
    expect(commands.at(-1)).toBe("node.move@5");
  });

  it("invalidates the remote undo/redo stack after any mutation it doesn't track, instead of letting Undo revert a stale, unrelated edit (Block H14)", async () => {
    const fixture = createStudioProjectFixture();
    const commands: string[] = [];
    const session = createStudioSession({
      ...fixture,
      persistence: createMemoryPersistence(),
      restoreFromPersistence: false,
      commandGateway: {
        async execute(command) {
          commands.push(command.type);
        },
      },
    });

    await session.updateNode(studioFixtureIds.heading, { name: "Tracked edit" });
    expect(session.getSnapshot().history.canUndo).toBe(true);

    // node.delete is a real remote mutation the session cannot compute a safe inverse for -- Undo
    // must not remain enabled afterward and silently revert the earlier, unrelated node.update
    // instead of doing anything about this deletion.
    const headingId = studioFixtureIds.heading;
    await session.deleteNode(headingId);
    expect(session.getSnapshot().document.nodes[headingId]).toBeUndefined();
    expect(session.getSnapshot().history.canUndo, "Undo must be disabled, not pointing at a stale entry").toBe(false);
    expect(session.getSnapshot().history.canRedo).toBe(false);
    expect(() => session.undo()).toThrow(/no remote edit to undo/i);
  });

  it("reflects an already-committed agent MCP write locally without a second remote round trip", () => {
    const fixture = createStudioProjectFixture();
    const commands: string[] = [];
    const session = createStudioSession({
      ...fixture,
      persistence: createMemoryPersistence(),
      restoreFromPersistence: false,
      commandGateway: {
        async execute(command) {
          commands.push(command.type);
        },
      },
    });

    // Simulates the AI panel's agentGateway.updateNode(), which commits through its own MCP
    // round trip and never calls session.commandGateway.execute directly.
    session.acknowledgeAgentNodeUpdate(
      studioFixtureIds.heading,
      { name: "Agent-reviewed heading" },
      { expectedDocumentVersion: 1, actor: { id: "studio-ai", type: "MCP_AGENT", displayName: "AEVUM AI" } },
    );

    expect(commands).toEqual([]);
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Agent-reviewed heading");
    expect(session.getSnapshot().document.documentVersion).toBe(2);
    expect(session.getSnapshot().history.entries[0]?.auditRecord.actor.type).toBe("MCP_AGENT");

    expect(() =>
      session.acknowledgeAgentNodeUpdate(
        studioFixtureIds.heading,
        { name: "Stale agent edit" },
        { expectedDocumentVersion: 1 },
      ),
    ).toThrow(/version/i);
  });
});
