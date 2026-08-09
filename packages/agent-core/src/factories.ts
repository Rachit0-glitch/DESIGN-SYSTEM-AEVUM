import {
  AGENT_CONTRACT_VERSION,
  AgentApprovalDecisionSchema,
  AgentAuditRecordSchema,
  AgentGoalSchema,
  AgentObservationSchema,
  AgentOutcomeSchema,
  AgentRunSchema,
  AgentSessionSchema,
  AgentVerificationResultSchema,
  type AgentApprovalDecision,
  type AgentApprovalRequest,
  type AgentAuditRecord,
  type AgentBudget,
  type AgentConstraints,
  type AgentDiagnostic,
  type AgentGoal,
  type AgentGoalCategory,
  type AgentObservation,
  type AgentOutcome,
  type AgentRun,
  type AgentSession,
  type AgentVerificationResult,
  type VerificationStrategy,
} from "./schemas.js";
import { deepFreeze } from "./immutable.js";
import { deterministicAgentId, fingerprint } from "./stable.js";

export interface CreateAgentGoalInput {
  readonly category: AgentGoalCategory;
  readonly request: string;
  readonly requestedOutcome?: string;
  readonly targetProjectId?: string;
  readonly targetDocumentId?: string;
  readonly targetNodeIds?: readonly string[];
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly requiredCapabilities?: readonly string[];
  readonly confidence?: number;
}

export function createAgentGoal(input: CreateAgentGoalInput): AgentGoal {
  const body = {
    version: AGENT_CONTRACT_VERSION,
    category: input.category,
    request: input.request,
    requestedOutcome: input.requestedOutcome ?? input.request,
    ...(input.targetProjectId ? { targetProjectId: input.targetProjectId } : {}),
    ...(input.targetDocumentId ? { targetDocumentId: input.targetDocumentId } : {}),
    targetNodeIds: [...(input.targetNodeIds ?? [])],
    parameters: { ...(input.parameters ?? {}) },
    requiredCapabilities: [...(input.requiredCapabilities ?? [])],
    confidence: input.confidence ?? 1,
  };
  const value = AgentGoalSchema.parse({
    ...body,
    id: deterministicAgentId("agent-goal", body),
    fingerprint: fingerprint(body),
  });
  return deepFreeze(value);
}

export function createAgentSession(input: {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly documentId?: string;
  readonly goal: AgentGoal;
  readonly constraints?: Partial<AgentConstraints>;
  readonly budget?: Partial<AgentBudget>;
  readonly createdAt: string;
}): AgentSession {
  const body = {
    version: AGENT_CONTRACT_VERSION,
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.documentId ? { documentId: input.documentId } : {}),
    goal: input.goal,
    status: "CREATED" as const,
    constraints: input.constraints ?? {},
    budget: input.budget ?? {},
    createdAt: input.createdAt,
  };
  const value = AgentSessionSchema.parse({
    ...body,
    id: deterministicAgentId("agent-session", body),
    fingerprint: fingerprint({ ...body, createdAt: undefined }),
  });
  return deepFreeze(value);
}

export function createAgentRun(input: {
  readonly session: AgentSession;
  readonly sequence?: number;
  readonly correlationId?: string;
  readonly startedAt: string;
}): AgentRun {
  const sequence = input.sequence ?? 1;
  const identity = { sessionId: input.session.id, sequence };
  const body = {
    version: AGENT_CONTRACT_VERSION,
    sessionId: input.session.id,
    sequence,
    correlationId: input.correlationId ?? deterministicAgentId("agent-correlation", identity),
    status: "QUEUED" as const,
    observations: [],
    counters: { steps: 0, toolCalls: 0, writes: 0, replans: 0, retries: 0, validationPasses: 0 },
    startedAt: input.startedAt,
  };
  const value = AgentRunSchema.parse({
    ...body,
    id: deterministicAgentId("agent-run", identity),
    fingerprint: fingerprint(body),
  });
  return deepFreeze(value);
}

export function createAgentObservation(input: {
  readonly runId: string;
  readonly stepId: string;
  readonly type: AgentObservation["type"];
  readonly success: boolean;
  readonly data?: unknown;
  readonly diagnostics?: readonly AgentDiagnostic[];
  readonly documentVersion?: number;
  readonly createdAt: string;
}): AgentObservation {
  const content = {
    version: AGENT_CONTRACT_VERSION,
    runId: input.runId,
    stepId: input.stepId,
    type: input.type,
    success: input.success,
    ...(input.data !== undefined ? { data: input.data } : {}),
    diagnostics: [...(input.diagnostics ?? [])],
    ...(input.documentVersion !== undefined ? { documentVersion: input.documentVersion } : {}),
  };
  const body = { ...content, fingerprint: fingerprint(content), createdAt: input.createdAt };
  return deepFreeze(AgentObservationSchema.parse({ ...body, id: deterministicAgentId("agent-observation", content) }));
}

export function createVerificationResult(input: {
  readonly strategy: VerificationStrategy;
  readonly success: boolean;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly diagnostics?: readonly AgentDiagnostic[];
}): AgentVerificationResult {
  const body = {
    strategy: input.strategy,
    success: input.success,
    ...(input.expected !== undefined ? { expected: input.expected } : {}),
    ...(input.actual !== undefined ? { actual: input.actual } : {}),
    diagnostics: [...(input.diagnostics ?? [])],
  };
  return deepFreeze(AgentVerificationResultSchema.parse({ ...body, fingerprint: fingerprint(body) }));
}

export function createAgentOutcome(input: Omit<AgentOutcome, "fingerprint">): AgentOutcome {
  return deepFreeze(AgentOutcomeSchema.parse({ ...input, fingerprint: fingerprint(input) }));
}

export function createApprovalDecision(
  request: AgentApprovalRequest,
  input: Omit<AgentApprovalDecision, "decidedAt"> & { readonly decidedAt: string },
): AgentApprovalDecision {
  void request;
  return deepFreeze(AgentApprovalDecisionSchema.parse(input));
}

export function createAgentAuditRecord(
  input: Omit<AgentAuditRecord, "id" | "version" | "fingerprint">,
): AgentAuditRecord {
  const content = { version: AGENT_CONTRACT_VERSION, ...input };
  return deepFreeze(
    AgentAuditRecordSchema.parse({
      ...content,
      id: deterministicAgentId("agent-audit", content),
      fingerprint: fingerprint({ ...content, durationMs: undefined, timestamp: undefined }),
    }),
  );
}
