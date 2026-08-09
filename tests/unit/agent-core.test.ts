import {
  AgentGoalSchema,
  AgentSessionSchema,
  createAgentGoal,
  createAgentSession,
  deterministicIdempotencyKey,
} from "@aevum/agent-core";
import { describe, expect, it } from "vitest";

const NOW = "2026-08-09T12:00:00.000Z";

describe("agent core", () => {
  it("creates immutable versioned sessions with extensible goals and bounded budgets", () => {
    const goal = createAgentGoal({
      category: "CUSTOM_ACCESSIBILITY_REVIEW",
      request: "Inspect accessibility metadata.",
      requestedOutcome: "Return a structured accessibility review.",
    });
    const session = createAgentSession({
      actorId: "actor-1",
      workspaceId: "workspace-1",
      goal,
      budget: { maxSteps: 7, maxWrites: 0 },
      createdAt: NOW,
    });

    expect(AgentGoalSchema.parse(JSON.parse(JSON.stringify(goal)))).toEqual(goal);
    expect(AgentSessionSchema.parse(JSON.parse(JSON.stringify(session)))).toEqual(session);
    expect(session.budget.maxSteps).toBe(7);
    expect(session.budget.maxWrites).toBe(0);
    expect(Object.isFrozen(goal)).toBe(true);
    expect(Object.isFrozen(session.budget)).toBe(true);
  });

  it("binds idempotency to session, run, step, tool, and canonical input", () => {
    const base = {
      sessionId: "session",
      runId: "run",
      stepId: "step",
      tool: "document.rename",
      input: { name: "AEVUM" },
    };
    expect(deterministicIdempotencyKey(base)).toBe(deterministicIdempotencyKey(structuredClone(base)));
    expect(deterministicIdempotencyKey(base)).not.toBe(
      deterministicIdempotencyKey({ ...base, input: { name: "Different" } }),
    );
  });
});
