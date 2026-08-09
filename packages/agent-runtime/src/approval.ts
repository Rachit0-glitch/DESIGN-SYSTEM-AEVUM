import { createApprovalDecision, type AgentApprovalDecision, type AgentApprovalRequest } from "@aevum/agent-core";

export interface AgentApprovalAdapter {
  decide(request: AgentApprovalRequest): Promise<AgentApprovalDecision>;
}

export function createDeterministicApprovalAdapter(
  input: {
    readonly approvedStepIds?: readonly string[];
    readonly approvedTools?: readonly string[];
    readonly rejectedStepIds?: readonly string[];
    readonly timestamp?: string;
  } = {},
): AgentApprovalAdapter {
  const approvedSteps = new Set(input.approvedStepIds ?? []);
  const approvedTools = new Set(input.approvedTools ?? []);
  const rejectedSteps = new Set(input.rejectedStepIds ?? []);
  const adapter: AgentApprovalAdapter = {
    async decide(request) {
      const explicitApproval = approvedSteps.has(request.stepId) || approvedTools.has(request.tool);
      const approved = explicitApproval && !rejectedSteps.has(request.stepId);
      return createApprovalDecision(request, {
        approved,
        source: "FIXTURE",
        reason: approved ? "Explicit deterministic approval matched." : "No explicit approval matched this write.",
        decidedAt: input.timestamp ?? new Date(0).toISOString(),
      });
    },
  };
  return Object.freeze(adapter);
}
