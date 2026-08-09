import type { AgentContextBundle } from "@aevum/agent-context";
import type { AgentObservation, AgentSession, AgentVerificationResult } from "@aevum/agent-core";
import type { AgentCapabilities, AgentIntent, AgentPlan } from "./schemas.js";

export interface AgentReasoningProvider {
  readonly id: string;
  readonly version: string;
  analyzeIntent(input: { readonly session: AgentSession; readonly context: AgentContextBundle }): AgentIntent;
  generatePlan(input: {
    readonly session: AgentSession;
    readonly intent: AgentIntent;
    readonly context: AgentContextBundle;
    readonly capabilities: AgentCapabilities;
  }): AgentPlan;
  selectNextAction(input: {
    readonly plan: AgentPlan;
    readonly completedStepIds: readonly string[];
  }): string | undefined;
  interpretObservation(input: {
    readonly observation: AgentObservation;
    readonly plan: AgentPlan;
  }): "CONTINUE" | "RETRY" | "REPLAN" | "BLOCK";
  verifyCompletion(input: {
    readonly plan: AgentPlan;
    readonly observations: readonly AgentObservation[];
  }): AgentVerificationResult;
}
