import { deepFreeze, fingerprint, type AgentDiagnostic } from "@aevum/agent-core";
import { AgentPlanSchema, AgentPlanValidationSchema, type AgentPlan, type AgentPlanValidation } from "./schemas.js";

export function validatePlan(rawPlan: unknown): AgentPlanValidation {
  const parsed = AgentPlanSchema.safeParse(rawPlan);
  const diagnostics: AgentDiagnostic[] = [];
  if (!parsed.success) {
    diagnostics.push({
      code: "AGENT_PLAN_INVALID",
      severity: "ERROR",
      message: "Agent plan failed runtime schema validation.",
      recoverable: false,
      details: { issueCount: parsed.error.issues.length },
    });
    const body = { valid: false, orderedStepIds: [], diagnostics };
    return deepFreeze(AgentPlanValidationSchema.parse({ ...body, fingerprint: fingerprint(body) }));
  }

  const plan: AgentPlan = parsed.data;
  const byId = new Map(plan.steps.map((step) => [step.id, step]));
  if (byId.size !== plan.steps.length) {
    diagnostics.push({
      code: "AGENT_PLAN_INVALID",
      severity: "ERROR",
      message: "Plan step IDs must be unique.",
      recoverable: false,
    });
  }
  for (const step of plan.steps) {
    const missing = step.dependencies.filter((dependency) => !byId.has(dependency));
    if (missing.length > 0) {
      diagnostics.push({
        code: "AGENT_PLAN_INVALID",
        severity: "ERROR",
        message: `Step ${step.id} references missing dependencies.`,
        recoverable: false,
        stepId: step.id,
        details: { missing },
      });
    }
    if (["DRY_RUN", "WRITE", "TOOL_CALL", "READ", "INSPECT"].includes(step.type) && !step.tool) {
      diagnostics.push({
        code: "AGENT_PLAN_INVALID",
        severity: "ERROR",
        message: `Step ${step.id} requires a tool.`,
        recoverable: false,
        stepId: step.id,
      });
    }
    if (step.type === "WRITE") {
      const dryRunDependency = step.dependencies
        .map((dependency) => byId.get(dependency))
        .find((dependency) => dependency?.type === "DRY_RUN" && dependency.tool === step.tool);
      if (!dryRunDependency) {
        diagnostics.push({
          code: "AGENT_PLAN_INVALID",
          severity: "ERROR",
          message: `Write step ${step.id} requires a direct matching dry-run dependency.`,
          recoverable: false,
          stepId: step.id,
          ...(step.tool ? { tool: step.tool } : {}),
        });
      }
    }
  }

  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cycle = false;
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      cycle = true;
      return;
    }
    if (visited.has(id)) return;
    const step = byId.get(id);
    if (!step) return;
    visiting.add(id);
    for (const dependency of step.dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  };
  for (const step of plan.steps) visit(step.id);
  if (cycle)
    diagnostics.push({
      code: "AGENT_PLAN_CYCLE",
      severity: "ERROR",
      message: "Plan dependency graph contains a cycle.",
      recoverable: false,
    });
  const body = {
    valid: diagnostics.every((entry) => entry.severity !== "ERROR"),
    orderedStepIds: cycle ? [] : ordered,
    diagnostics,
  };
  return deepFreeze(AgentPlanValidationSchema.parse({ ...body, fingerprint: fingerprint(body) }));
}
