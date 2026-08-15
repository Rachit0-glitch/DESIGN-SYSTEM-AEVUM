import { describe, expect, it } from "vitest";
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
import { createInteractiveApprovalAdapter } from "../../apps/studio/src/core/approval.js";

describe("Interactive approval adapter (Block D5)", () => {
  it("genuinely suspends decide() until approve() is called, then resolves a real USER-sourced approval", async () => {
    const controller = createInteractiveApprovalAdapter();
    expect(controller.getPending()).toBeUndefined();

    let settled = false;
    const decision = controller.adapter
      .decide({
        sessionId: "agent-session_11111111-1111-4111-8111-111111111111",
        runId: "agent-run_11111111-1111-4111-8111-111111111111",
        stepId: "step-1",
        tool: "node.update",
        classification: "SAFE_WRITE",
        policy: "REQUIRE_ALL_WRITE_APPROVAL",
        inputFingerprint: "sha256:test",
      })
      .then((value) => {
        settled = true;
        return value;
      });

    // A real, observable pending state — not resolved yet, exactly what a UI would render.
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(controller.getPending()?.request.tool).toBe("node.update");

    controller.approve();
    const result = await decision;
    expect(result.approved).toBe(true);
    expect(result.source).toBe("USER");
    expect(controller.getPending()).toBeUndefined();
  });

  it("resolves a real rejection with the given reason when reject() is called", async () => {
    const controller = createInteractiveApprovalAdapter();
    const decision = controller.adapter.decide({
      sessionId: "agent-session_11111111-1111-4111-8111-111111111111",
      runId: "agent-run_11111111-1111-4111-8111-111111111111",
      stepId: "step-1",
      tool: "node.delete",
      classification: "DESTRUCTIVE_WRITE",
      policy: "REQUIRE_ALL_WRITE_APPROVAL",
      inputFingerprint: "sha256:test",
    });
    await Promise.resolve();
    controller.reject("Not now.");
    const result = await decision;
    expect(result.approved).toBe(false);
    expect(result.reason).toBe("Not now.");
  });

  it("notifies subscribers exactly when a request becomes pending and when it's resolved", async () => {
    const controller = createInteractiveApprovalAdapter();
    const events: (boolean | undefined)[] = [];
    controller.subscribe(() => events.push(Boolean(controller.getPending())));

    const decision = controller.adapter.decide({
      sessionId: "agent-session_11111111-1111-4111-8111-111111111111",
      runId: "agent-run_11111111-1111-4111-8111-111111111111",
      stepId: "step-1",
      tool: "node.update",
      classification: "SAFE_WRITE",
      policy: "REQUIRE_ALL_WRITE_APPROVAL",
      inputFingerprint: "sha256:test",
    });
    await Promise.resolve();
    controller.approve();
    await decision;

    expect(events).toEqual([true, false]);
  });
});

describe("Real approval flow through the Agent Planner engine (Block D5)", () => {
  function realTurnScenario(approvalPolicy: "AUTO_SAFE_WRITE" | "REQUIRE_ALL_WRITE_APPROVAL") {
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
    return { session, agentContext };
  }

  it("requires and honors real approval for a normal safe-write edit under REQUIRE_ALL_WRITE_APPROVAL, and only commits after approve()", async () => {
    const { session, agentContext } = realTurnScenario("REQUIRE_ALL_WRITE_APPROVAL");
    const controller = createInteractiveApprovalAdapter();
    const goal = createAgentGoal({
      category: "EDIT",
      request: "test edit",
      targetProjectId: agentContext.projectId,
      targetDocumentId: agentContext.documentId,
      targetNodeIds: [studioFixtureIds.heading],
      parameters: { changes: { name: "Approved edit" } },
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
      reasoningProvider: createDeterministicReasoningProvider({ approvalPolicy: agentContext.approvalPolicy }),
      mcpClient: agentContext.createMcpClient("d5-approval-test"),
      approvalAdapter: controller.adapter,
      persistence: createInMemoryAgentPersistence(),
    });

    const runPromise = engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: agentContext.actorPermissions,
    });

    // Give the engine a real chance to reach the approval-gated step before we assert on it.
    let pendingSeen = false;
    for (let attempt = 0; attempt < 50 && !pendingSeen; attempt += 1) {
      await Promise.resolve();
      if (controller.getPending()) pendingSeen = true;
    }
    expect(pendingSeen, "the engine must genuinely pause and request real approval, not skip it").toBe(true);
    expect(controller.getPending()?.request.tool).toBe("node.update");
    // The document must not be mutated yet — approval hasn't been granted.
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Hero heading");

    controller.approve();
    const result = await runPromise;

    expect(result.run.status, JSON.stringify(result.run.outcome?.diagnostics)).toBe("SUCCEEDED");
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Approved edit");
  });

  it("blocks the write and leaves the document untouched when the user rejects", async () => {
    const { session, agentContext } = realTurnScenario("REQUIRE_ALL_WRITE_APPROVAL");
    const controller = createInteractiveApprovalAdapter();
    const goal = createAgentGoal({
      category: "EDIT",
      request: "test edit",
      targetProjectId: agentContext.projectId,
      targetDocumentId: agentContext.documentId,
      targetNodeIds: [studioFixtureIds.heading],
      parameters: { changes: { name: "Should not apply" } },
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
      reasoningProvider: createDeterministicReasoningProvider({ approvalPolicy: agentContext.approvalPolicy }),
      mcpClient: agentContext.createMcpClient("d5-rejection-test"),
      approvalAdapter: controller.adapter,
      persistence: createInMemoryAgentPersistence(),
    });

    const runPromise = engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: agentContext.actorPermissions,
    });
    for (let attempt = 0; attempt < 50 && !controller.getPending(); attempt += 1) await Promise.resolve();
    controller.reject("Rejected by user in Studio.");
    const result = await runPromise;

    expect(result.run.status).not.toBe("SUCCEEDED");
    expect(result.run.outcome?.diagnostics.some((entry) => entry.code === "AGENT_APPROVAL_REJECTED")).toBe(true);
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Hero heading");
  });

  it("proceeds automatically without any approval prompt for a normal safe write under the default AUTO_SAFE_WRITE policy", async () => {
    const { session, agentContext } = realTurnScenario("AUTO_SAFE_WRITE");
    const controller = createInteractiveApprovalAdapter();
    const goal = createAgentGoal({
      category: "EDIT",
      request: "test edit",
      targetProjectId: agentContext.projectId,
      targetDocumentId: agentContext.documentId,
      targetNodeIds: [studioFixtureIds.heading],
      parameters: { changes: { name: "Auto-approved edit" } },
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
      reasoningProvider: createDeterministicReasoningProvider({ approvalPolicy: agentContext.approvalPolicy }),
      mcpClient: agentContext.createMcpClient("d5-auto-safe-test"),
      approvalAdapter: controller.adapter,
      persistence: createInMemoryAgentPersistence(),
    });

    const result = await engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: agentContext.actorPermissions,
    });

    expect(result.run.status, JSON.stringify(result.run.outcome?.diagnostics)).toBe("SUCCEEDED");
    // The adapter's decide() must never even have been called for a safe write under this policy.
    expect(controller.getPending()).toBeUndefined();
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Auto-approved edit");
  });

  it("populates real rich approval context (nodeId/operation/before/after/summary) derived from actual plan data, not fabricated", async () => {
    const { session, agentContext } = realTurnScenario("REQUIRE_ALL_WRITE_APPROVAL");
    const controller = createInteractiveApprovalAdapter();
    const goal = createAgentGoal({
      category: "EDIT",
      request: "test edit",
      targetProjectId: agentContext.projectId,
      targetDocumentId: agentContext.documentId,
      targetNodeIds: [studioFixtureIds.heading],
      parameters: { changes: { name: "Rich context edit" } },
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
      reasoningProvider: createDeterministicReasoningProvider({ approvalPolicy: agentContext.approvalPolicy }),
      mcpClient: agentContext.createMcpClient("d-cleanup-rich-context-test"),
      approvalAdapter: controller.adapter,
      persistence: createInMemoryAgentPersistence(),
    });

    const runPromise = engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: agentContext.actorPermissions,
    });
    for (let attempt = 0; attempt < 50 && !controller.getPending(); attempt += 1) await Promise.resolve();
    const request = controller.getPending()?.request;
    expect(request?.nodeId).toBe(studioFixtureIds.heading);
    expect(request?.operation).toBe("Commit node update");
    expect(request?.before?.name).toBe("Hero heading");
    expect(request?.after?.name).toBe("Rich context edit");
    expect(request?.summary).toBe('Rename "Hero heading" -> "Rich context edit".');

    controller.approve();
    await runPromise;
  });
});

describe("Delete support through the real deterministic planner and Studio dev-fixture agent context (Block D cleanup, Issue 2)", () => {
  function deleteScenario(policy: "AUTO_SAFE_WRITE" | "REQUIRE_ALL_WRITE_APPROVAL", allowDestructive: boolean) {
    const fixture = createStudioProjectFixture();
    const session = createStudioSession({ ...fixture, persistence: createMemoryPersistence() });
    const agentContext = createDeterministicStudioAgentContext({
      session,
      workspaceId: fixture.project.workspaceId,
      projectId: fixture.project.id,
      documentId: fixture.document.metadata.id,
      actorId: "test-agent",
      approvalPolicy: policy,
    });
    const goal = createAgentGoal({
      category: "EDIT",
      request: "delete this layer",
      targetProjectId: agentContext.projectId,
      targetDocumentId: agentContext.documentId,
      targetNodeIds: [studioFixtureIds.heading],
      parameters: { operation: "delete" },
    });
    const agentSession = createAgentSession({
      actorId: agentContext.actorId,
      workspaceId: agentContext.workspaceId,
      projectId: agentContext.projectId,
      documentId: agentContext.documentId,
      goal,
      constraints: { allowDestructiveOperations: allowDestructive },
      createdAt: new Date().toISOString(),
    });
    const controller = createInteractiveApprovalAdapter();
    const engine = createAgentEngine({
      reasoningProvider: createDeterministicReasoningProvider({ approvalPolicy: agentContext.approvalPolicy }),
      mcpClient: agentContext.createMcpClient(`d-cleanup-delete-test-${policy}-${allowDestructive}`),
      approvalAdapter: controller.adapter,
      persistence: createInMemoryAgentPersistence(),
    });
    return { session, agentSession, engine, controller };
  }

  it("a) a delete-shaped goal builds a real plan whose write step targets node.delete, never node.update", async () => {
    const { agentSession, engine, controller } = deleteScenario("REQUIRE_ALL_WRITE_APPROVAL", true);
    const runPromise = engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: ["document.read", "document.write", "mcp.tool.execute"],
    });
    for (let attempt = 0; attempt < 50 && !controller.getPending(); attempt += 1) await Promise.resolve();
    expect(controller.getPending()?.request.tool).toBe("node.delete");
    expect(controller.getPending()?.request.classification).toBe("DESTRUCTIVE_WRITE");
    expect(controller.getPending()?.request.summary).toBe('Delete "Hero heading".');
    controller.approve();
    const result = await runPromise;
    expect(result.plan?.steps.some((step) => step.tool === "node.delete")).toBe(true);
    expect(result.plan?.steps.some((step) => step.tool === "node.update")).toBe(false);
  });

  it("b) a destructive delete genuinely suspends and requests real UI approval before touching the document", async () => {
    const { session, agentSession, engine, controller } = deleteScenario("REQUIRE_ALL_WRITE_APPROVAL", true);
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
    expect(pendingSeen, "a destructive delete must genuinely pause for real approval").toBe(true);
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]).toBeDefined();
    controller.approve();
    await runPromise;
  });

  it("c) rejecting a delete approval leaves the document completely untouched", async () => {
    const { session, agentSession, engine, controller } = deleteScenario("REQUIRE_ALL_WRITE_APPROVAL", true);
    const runPromise = engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: ["document.read", "document.write", "mcp.tool.execute"],
    });
    for (let attempt = 0; attempt < 50 && !controller.getPending(); attempt += 1) await Promise.resolve();
    controller.reject("Not now.");
    const result = await runPromise;

    expect(result.run.status).not.toBe("SUCCEEDED");
    expect(result.run.outcome?.diagnostics.some((entry) => entry.code === "AGENT_APPROVAL_REJECTED")).toBe(true);
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]).toBeDefined();
  });

  it("d) approving a delete actually removes the node from the canonical document", async () => {
    const { session, agentSession, engine, controller } = deleteScenario("REQUIRE_ALL_WRITE_APPROVAL", true);
    const runPromise = engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: ["document.read", "document.write", "mcp.tool.execute"],
    });
    for (let attempt = 0; attempt < 50 && !controller.getPending(); attempt += 1) await Promise.resolve();
    controller.approve();
    const result = await runPromise;

    expect(result.run.status, JSON.stringify(result.run.outcome?.diagnostics)).toBe("SUCCEEDED");
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]).toBeUndefined();
  });

  it("auto-denies a destructive delete without ever prompting when the session forbids destructive operations", async () => {
    const { session, agentSession, engine, controller } = deleteScenario("REQUIRE_ALL_WRITE_APPROVAL", false);
    const result = await engine.execute({
      session: agentSession,
      contextRecords: [],
      actorPermissions: ["document.read", "document.write", "mcp.tool.execute"],
    });

    expect(result.run.status).not.toBe("SUCCEEDED");
    expect(controller.getPending()).toBeUndefined();
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]).toBeDefined();
  });
});
