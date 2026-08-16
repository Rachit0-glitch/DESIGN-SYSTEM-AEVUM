import { assembleAgentContext } from "@aevum/agent-context";
import { createAgentGoal, createAgentSession } from "@aevum/agent-core";
import { createAgentCapabilities, createDeterministicReasoningProvider, validatePlan } from "@aevum/agent-planner";
import { ROLE_PERMISSIONS } from "@aevum/mcp-protocol";
import { createToolRegistry, registerInitialTools } from "@aevum/mcp-server";
import { describe, expect, it } from "vitest";
import { mcpTestConfig } from "../helpers/mcp-fixture.js";

const NOW = "2026-08-09T12:00:00.000Z";

function plannerFixture() {
  const goal = createAgentGoal({
    category: "EDIT",
    request: "Rename the document.",
    requestedOutcome: "AEVUM Production",
    parameters: { name: "AEVUM Production" },
  });
  const session = createAgentSession({
    actorId: "actor",
    workspaceId: "workspace",
    projectId: "project",
    documentId: "document",
    goal,
    createdAt: NOW,
  });
  const context = assembleAgentContext({ goal, records: [] });
  const registry = createToolRegistry();
  registerInitialTools(registry, mcpTestConfig);
  const capabilities = createAgentCapabilities(registry.listTools(), [...ROLE_PERMISSIONS.OWNER]);
  return { capabilities, context, goal, session };
}

describe("agent planner", () => {
  it("plans bounded Maximum Fidelity correction with dry-run and exactly one terminal VERIFY", () => {
    const fixture = plannerFixture();
    const nodeId = "node_11111111-1111-4111-8111-111111111111";
    const goal = createAgentGoal({
      category: "CORRECT",
      request: "Improve typography fidelity without regressing protected regions.",
      targetNodeIds: [nodeId],
      parameters: {
        operation: "fidelity_improve",
        profile: "MAXIMUM_FIDELITY",
        reportFingerprint: `sha256:${"a".repeat(64)}`,
        issueId: `fidelity-issue:${"b".repeat(32)}`,
        nodeId,
        changes: { name: "Corrected heading" },
      },
    });
    const session = createAgentSession({
      actorId: "actor",
      workspaceId: "workspace",
      projectId: "project",
      documentId: "document",
      goal,
      createdAt: NOW,
    });
    const provider = createDeterministicReasoningProvider();
    const intent = provider.analyzeIntent({ session, context: fixture.context });
    const plan = provider.generatePlan({
      session,
      intent,
      context: fixture.context,
      capabilities: fixture.capabilities,
    });
    expect(intent.requiredPermissions).toEqual(
      expect.arrayContaining([
        "fidelity.read",
        "fidelity.write",
        "document.write",
        "validation.read",
        "correction.read",
      ]),
    );
    expect(plan.capabilityGaps).toEqual([]);
    expect(plan.steps.map((entry) => entry.tool).filter(Boolean)).toEqual([
      "fidelity.inspect",
      "document.get",
      "fidelity.apply_correction",
      "fidelity.apply_correction",
      "fidelity.inspect",
    ]);
    expect(plan.steps.filter((entry) => entry.type === "VERIFY")).toHaveLength(1);
    expect(plan.steps.at(-1)?.type).toBe("VERIFY");
    expect(validatePlan(plan).valid).toBe(true);
  });

  it("builds bounded mechanical and humanoid rigging plans with one terminal VERIFY", () => {
    for (const operation of ["rig_mechanical_workflow", "rig_humanoid_workflow"] as const) {
      const fixture = plannerFixture();
      const goal = createAgentGoal({
        category: "EDIT",
        request: "Rig this model",
        targetNodeIds: ["model_11111111-1111-4111-8111-111111111111"],
        parameters: {
          operation,
          assetId: "asset_11111111-1111-4111-8111-111111111111",
          targetId: "model_11111111-1111-4111-8111-111111111111",
        },
      });
      const session = createAgentSession({
        actorId: "actor",
        workspaceId: "workspace",
        projectId: "project",
        documentId: "document",
        goal,
        createdAt: NOW,
      });
      const provider = createDeterministicReasoningProvider();
      const intent = provider.analyzeIntent({ session, context: fixture.context });
      const capabilities = createAgentCapabilities(
        fixture.capabilities.tools.map((tool) =>
          intent.requiredCapabilities.includes(tool.name) ? { ...tool, enabled: true } : tool,
        ),
        fixture.capabilities.actorPermissions,
      );
      const plan = provider.generatePlan({ session, intent, context: fixture.context, capabilities });
      expect(plan.capabilityGaps).toEqual([]);
      expect(plan.steps.filter((entry) => entry.type === "VERIFY")).toHaveLength(1);
      expect(plan.steps.at(-1)?.type).toBe("VERIFY");
      for (const write of plan.steps.filter((entry) => entry.type === "WRITE"))
        expect(write.dependencies.some((id) => plan.steps.find((entry) => entry.id === id)?.type === "DRY_RUN")).toBe(
          true,
        );
      expect(intent.requiredPermissions).toEqual(
        expect.arrayContaining(["document.write", "three.write", "blender.write"]),
      );
      expect(validatePlan(plan).valid).toBe(true);
    }
  });
  it("generates identical explicit dry-run-first plans for identical inputs", () => {
    const fixture = plannerFixture();
    const provider = createDeterministicReasoningProvider();
    const intent = provider.analyzeIntent({ session: fixture.session, context: fixture.context });
    const first = provider.generatePlan({ ...fixture, intent });
    const second = provider.generatePlan({ ...fixture, intent });
    expect(first).toEqual(second);
    expect(first.steps.map((step) => step.type)).toEqual([
      "READ",
      "READ",
      "DRY_RUN",
      "WRITE",
      "READ",
      "VERIFY",
      "COMPLETE",
    ]);
    expect(first.steps.find((step) => step.type === "WRITE")?.dependencies).toContain(
      first.steps.find((step) => step.type === "DRY_RUN")?.id,
    );
    expect(validatePlan(first).valid).toBe(true);
  });

  it("rejects dependency cycles and writes without matching dry runs", () => {
    const fixture = plannerFixture();
    const provider = createDeterministicReasoningProvider();
    const intent = provider.analyzeIntent({ session: fixture.session, context: fixture.context });
    const plan = provider.generatePlan({ ...fixture, intent });
    const firstId = plan.steps[0]?.id;
    const lastId = plan.steps.at(-1)?.id;
    if (!firstId || !lastId) throw new Error("Expected planner fixture steps.");
    const cyclic = {
      ...plan,
      steps: plan.steps.map((step) => (step.id === firstId ? { ...step, dependencies: [lastId] } : step)),
    };
    expect(validatePlan(cyclic).diagnostics.map((entry) => entry.code)).toContain("AGENT_PLAN_CYCLE");
    const noDryRun = {
      ...plan,
      steps: plan.steps
        .filter((step) => step.type !== "DRY_RUN")
        .map((step) => (step.type === "WRITE" ? { ...step, dependencies: [] } : step)),
    };
    expect(validatePlan(noDryRun).diagnostics.some((entry) => entry.message.includes("dry-run"))).toBe(true);
  });

  it("reports unavailable subsystem capabilities without inventing tools", () => {
    const fixture = plannerFixture();
    const goal = createAgentGoal({ category: "RECONSTRUCT", request: "Recreate this website." });
    const session = createAgentSession({
      actorId: "actor",
      workspaceId: "workspace",
      projectId: "project",
      goal,
      createdAt: NOW,
    });
    const context = assembleAgentContext({ goal, records: [] });
    const provider = createDeterministicReasoningProvider();
    const intent = provider.analyzeIntent({ session, context });
    const plan = provider.generatePlan({ session, context, intent, capabilities: fixture.capabilities });
    expect(plan.capabilityGaps).toEqual([
      expect.objectContaining({ capability: "reconstruction.execute", reason: "UNAVAILABLE" }),
    ]);
    expect(plan.steps.some((step) => step.tool === "reconstruction.execute")).toBe(false);
  });

  it("plans a bounded read-only multi-view reconstruction analysis with no dry-run or write", () => {
    const fixture = plannerFixture();
    const goal = createAgentGoal({
      category: "CUSTOM_3D",
      request: "Prepare these views for 3D reconstruction.",
      parameters: {
        operation: "multiview_reconstruct",
        views: [
          { assetId: "asset_00000000-0000-4000-8000-000000000001", imageWidth: 1024, imageHeight: 1024, role: "FRONT" },
        ],
      },
    });
    const session = createAgentSession({
      actorId: "actor",
      workspaceId: "workspace",
      projectId: "project",
      documentId: "document",
      goal,
      createdAt: NOW,
    });
    const context = assembleAgentContext({ goal, records: [] });
    const provider = createDeterministicReasoningProvider();
    const intent = provider.analyzeIntent({ session, context });
    const plan = provider.generatePlan({ session, context, intent, capabilities: fixture.capabilities });

    expect(plan.capabilityGaps).toEqual([]);
    expect(plan.steps.map((step) => step.type)).toEqual(["INSPECT", "VERIFY", "COMPLETE"]);
    expect(plan.steps[0]?.tool).toBe("three.multiview_analyze");
    expect(plan.steps.some((step) => step.type === "DRY_RUN" || step.type === "WRITE")).toBe(false);
    expect(validatePlan(plan).valid).toBe(true);
  });

  it("plans lighting mutation through MCP with dry-run and exactly one terminal verification", () => {
    const fixture = plannerFixture();
    const goal = createAgentGoal({
      category: "CUSTOM_3D",
      request: "Match this product reference lighting.",
      parameters: {
        operation: "lighting_match_reference",
        assetId: "asset_11111111-1111-4111-8111-111111111111",
        sceneId: "scene_11111111-1111-4111-8111-111111111111",
        name: "Matched product rig",
        preset: "PRODUCT",
        target: "REALTIME",
        reference: {
          referenceId: "reference_11111111-1111-4111-8111-111111111111",
          width: 4,
          height: 4,
          samples: Array.from({ length: 16 }, (_, index) => ({
            x: index % 4,
            y: Math.floor(index / 4),
            r: 0.5,
            g: 0.4,
            b: 0.3,
            a: 1,
          })),
        },
      },
    });
    const session = createAgentSession({
      actorId: "actor",
      workspaceId: "workspace",
      projectId: "project",
      documentId: "document",
      goal,
      createdAt: NOW,
    });
    const context = assembleAgentContext({ goal, records: [] });
    const provider = createDeterministicReasoningProvider();
    const intent = provider.analyzeIntent({ session, context });
    const capabilities = createAgentCapabilities(
      fixture.capabilities.tools.map((tool) =>
        intent.requiredCapabilities.includes(tool.name) ? { ...tool, enabled: true } : tool,
      ),
      fixture.capabilities.actorPermissions,
    );
    const plan = provider.generatePlan({ session, context, intent, capabilities });
    const dryRun = plan.steps.find((entry) => entry.type === "DRY_RUN");
    const write = plan.steps.find((entry) => entry.type === "WRITE");
    expect(intent.requiredPermissions).toEqual(
      expect.arrayContaining(["lighting.read", "lighting.write", "document.write", "blender.write"]),
    );
    expect(plan.capabilityGaps).toEqual([]);
    expect(dryRun?.tool).toBe("lighting.create_rig");
    expect(write?.dependencies).toContain(dryRun?.id);
    expect(plan.steps.filter((entry) => entry.type === "VERIFY")).toHaveLength(1);
    expect(plan.steps.at(-1)?.type).toBe("VERIFY");
    expect(validatePlan(plan).valid).toBe(true);
  });

  it("plans professional camera updates through dry-run, Blender verification, and one terminal validation", () => {
    const fixture = plannerFixture();
    const cameraId = "camera_11111111-1111-4111-8111-111111111111";
    const goal = createAgentGoal({
      category: "CUSTOM_3D",
      request: "Dolly the camera closer while preserving the target and validate the framing.",
      parameters: {
        operation: "camera_update",
        assetId: "asset_11111111-1111-4111-8111-111111111111",
        sceneId: "scene_11111111-1111-4111-8111-111111111111",
        cameraId,
        camera: { id: cameraId, name: "Hero camera" },
        time: 1.25,
      },
    });
    const session = createAgentSession({
      actorId: "actor",
      workspaceId: "workspace",
      projectId: "project",
      documentId: "document",
      goal,
      createdAt: NOW,
    });
    const context = assembleAgentContext({ goal, records: [] });
    const provider = createDeterministicReasoningProvider();
    const intent = provider.analyzeIntent({ session, context });
    const capabilities = createAgentCapabilities(
      fixture.capabilities.tools.map((tool) =>
        intent.requiredCapabilities.includes(tool.name) ? { ...tool, enabled: true } : tool,
      ),
      fixture.capabilities.actorPermissions,
    );
    const plan = provider.generatePlan({ session, context, intent, capabilities });
    const dryRun = plan.steps.find((entry) => entry.type === "DRY_RUN");
    const write = plan.steps.find((entry) => entry.type === "WRITE");
    expect(intent.requiredPermissions).toEqual(
      expect.arrayContaining(["camera.read", "camera.write", "document.write", "blender.write", "validation.read"]),
    );
    expect(plan.capabilityGaps).toEqual([]);
    expect(dryRun?.tool).toBe("camera.update");
    expect(write?.dependencies).toContain(dryRun?.id);
    expect(plan.steps.map((entry) => entry.tool).filter(Boolean)).toEqual([
      "camera.inspect",
      "document.get",
      "camera.update",
      "camera.update",
      "camera.evaluate",
      "camera.validate",
    ]);
    expect(plan.steps.filter((entry) => entry.type === "VERIFY")).toHaveLength(1);
    expect(plan.steps.at(-1)?.type).toBe("VERIFY");
    expect(validatePlan(plan).valid).toBe(true);
  });
});

describe("compound multi-operation edit planner (Block E, E1/E3)", () => {
  function compoundGoal(prompt: string) {
    return createAgentGoal({
      category: "EDIT",
      request: prompt.trim().length > 0 ? prompt : "(empty compound edit prompt)",
      parameters: { operation: "compound_edit", prompt },
    });
  }

  it("builds a real, dependency-ordered plan for a two-clause prompt: one plain resize, one recolor needing a fresh token", () => {
    const fixture = plannerFixture();
    const goal = compoundGoal("make the headline bigger and change the background to orange");
    const session = createAgentSession({
      actorId: "actor",
      workspaceId: "workspace",
      projectId: "project",
      documentId: "document",
      goal,
      createdAt: NOW,
    });
    const provider = createDeterministicReasoningProvider();
    const intent = provider.analyzeIntent({ session, context: fixture.context });
    expect(intent.ambiguities).toEqual([]);
    const plan = provider.generatePlan({
      session,
      intent,
      context: fixture.context,
      capabilities: fixture.capabilities,
    });
    expect(plan.capabilityGaps).toEqual([]);
    expect(validatePlan(plan).valid).toBe(true);

    const tools = plan.steps.map((entry) => entry.tool).filter(Boolean);
    // read -> analyze (no tool) -> resize dry/write (clause 1, no token) -> token dry/write then
    // recolor dry/write (clause 2, needs a token) -> COMPLETE (no tool).
    expect(tools).toEqual([
      "document.get",
      "node.update",
      "node.update",
      "token.register",
      "token.register",
      "node.update",
      "node.update",
    ]);
    const [read, analyze, resizeDry, resizeWrite, tokenDry, tokenWrite, recolorDry, recolorWrite, verify, complete] =
      plan.steps;
    expect(analyze?.type).toBe("ANALYZE");
    expect(resizeDry?.dependencies).toEqual([analyze?.id]);
    expect(resizeWrite?.dependencies).toEqual([resizeDry?.id]);
    // The token registration for clause 2 depends on the SHARED analyze step, not on clause 1's
    // write — the two clauses target different real nodes and don't need to serialize on each
    // other's resolution, only on the document version each write actually produces.
    expect(tokenDry?.dependencies).toEqual([analyze?.id]);
    expect(tokenWrite?.dependencies).toEqual([tokenDry?.id]);
    // The real "create/update token -> update paint" dependency chain (E3): the recolor write
    // cannot run before its own token is registered.
    expect(recolorDry?.dependencies).toEqual([tokenWrite?.id]);
    expect(recolorWrite?.dependencies).toEqual([recolorDry?.id]);
    // Sequential optimistic-concurrency chaining: clause 2's writes bind expectedDocumentVersion
    // from the PRECEDING write's own real result, never straight back to the original read, so a
    // second clause's write does not fail with a stale-version conflict the moment the first
    // clause's write actually commits.
    const versionBinding = (entry: (typeof plan.steps)[number] | undefined) =>
      entry?.inputBindings.find((binding) => binding.targetPath === "expectedDocumentVersion");
    expect(versionBinding(resizeDry)).toMatchObject({ sourceStepId: read?.id, sourcePath: "data.documentVersion" });
    expect(versionBinding(tokenDry)).toMatchObject({ sourceStepId: resizeWrite?.id, sourcePath: "data.resultVersion" });
    expect(versionBinding(recolorDry)).toMatchObject({
      sourceStepId: tokenWrite?.id,
      sourcePath: "data.resultVersion",
    });
    expect(verify?.type).toBe("VERIFY");
    expect(verify?.verificationRequirement.assertions).toEqual([
      { sourceStepId: resizeWrite?.id, operator: "SUCCESS" },
      { sourceStepId: recolorWrite?.id, operator: "SUCCESS" },
    ]);
    expect(complete?.type).toBe("COMPLETE");
  });

  it("blocks before planning with a real ambiguity diagnostic for an empty or fully unclassifiable prompt", () => {
    const fixture = plannerFixture();
    for (const prompt of ["", "juggle the flamingo"]) {
      const goal = compoundGoal(prompt);
      const session = createAgentSession({
        actorId: "actor",
        workspaceId: "workspace",
        projectId: "project",
        documentId: "document",
        goal,
        createdAt: NOW,
      });
      const provider = createDeterministicReasoningProvider();
      const intent = provider.analyzeIntent({ session, context: fixture.context });
      expect(intent.ambiguities.length, prompt).toBeGreaterThan(0);
    }
  });

  it("reports a real, honest capability gap — never a fabricated success — when token.register is unavailable", () => {
    const fixture = plannerFixture();
    const goal = compoundGoal("make the headline bigger");
    const session = createAgentSession({
      actorId: "actor",
      workspaceId: "workspace",
      projectId: "project",
      documentId: "document",
      goal,
      createdAt: NOW,
    });
    const withoutTokenRegister = createAgentCapabilities(
      fixture.capabilities.tools.map((tool) => (tool.name === "token.register" ? { ...tool, enabled: false } : tool)),
      fixture.capabilities.actorPermissions,
    );
    const provider = createDeterministicReasoningProvider();
    const intent = provider.analyzeIntent({ session, context: fixture.context });
    const plan = provider.generatePlan({
      session,
      intent,
      context: fixture.context,
      capabilities: withoutTokenRegister,
    });
    expect(plan.capabilityGaps).toEqual([
      expect.objectContaining({ capability: "token.register", reason: "UNAVAILABLE" }),
    ]);
    // A capability gap replaces the real plan with an honest "report capability gap" step —
    // never a plan that pretends to proceed anyway.
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.type).toBe("COMPLETE");
  });
});
