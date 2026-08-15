import { EntityIdSchema, JsonValueSchema } from "@aevum/document-model";
import { McpPermissionSchema } from "@aevum/mcp-protocol";
import { z } from "zod";

export const AGENT_CONTRACT_VERSION = "1.0.0" as const;
const IsoDateSchema = z.iso.datetime({ offset: true });
const FingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const ScopedIdSchema = (scope: string) => z.string().regex(new RegExp(`^${scope}:[0-9a-f]{32}$`));

export const AGENT_DIAGNOSTIC_CODES = [
  "AGENT_GOAL_INVALID",
  "AGENT_TARGET_AMBIGUOUS",
  "AGENT_CONTEXT_LIMIT",
  "AGENT_CAPABILITY_MISSING",
  "AGENT_PERMISSION_DENIED",
  "AGENT_APPROVAL_REQUIRED",
  "AGENT_APPROVAL_REJECTED",
  "AGENT_PLAN_INVALID",
  "AGENT_PLAN_CYCLE",
  "AGENT_STEP_FAILED",
  "AGENT_TOOL_UNAVAILABLE",
  "AGENT_TOOL_TIMEOUT",
  "AGENT_VERSION_CONFLICT",
  "AGENT_REPLAN_LIMIT",
  "AGENT_RETRY_LIMIT",
  "AGENT_WRITE_LIMIT",
  "AGENT_STEP_LIMIT",
  "AGENT_TOOL_CALL_LIMIT",
  "AGENT_EXECUTION_TIMEOUT",
  "AGENT_VERIFICATION_FAILED",
  "AGENT_NO_MEASURABLE_IMPROVEMENT",
  "AGENT_CANCELLED",
] as const;

export const AgentDiagnosticCodeSchema = z.enum(AGENT_DIAGNOSTIC_CODES);
export const AgentDiagnosticSchema = z.strictObject({
  code: AgentDiagnosticCodeSchema,
  severity: z.enum(["INFO", "WARNING", "ERROR"]),
  message: z.string().min(1).max(1_000),
  recoverable: z.boolean(),
  stepId: z.string().min(1).optional(),
  tool: z.string().min(1).max(128).optional(),
  details: z.record(z.string(), JsonValueSchema).optional(),
});

export const AgentGoalCategorySchema = z.union([
  z.enum([
    "INSPECT",
    "EDIT",
    "CREATE",
    "RECONSTRUCT",
    "VALIDATE",
    "CORRECT",
    "RESPONSIVE",
    "ANIMATION",
    "MOTION",
    "ASSET",
    "PROJECT",
  ]),
  z.string().regex(/^CUSTOM_[A-Z0-9_]+$/),
]);

export const ProtectedPropertySchema = z.strictObject({
  nodeId: z.string().min(1).optional(),
  property: z.string().min(1).max(255),
});
export const AgentConstraintsSchema = z.strictObject({
  protectedProperties: z.array(ProtectedPropertySchema).default([]),
  protectedRegionIds: z.array(z.string().min(1)).default([]),
  preserveHierarchy: z.boolean().default(true),
  allowPartialCompletion: z.boolean().default(false),
  allowDestructiveOperations: z.boolean().default(false),
  requiredPermissions: z.array(McpPermissionSchema).default([]),
});

export const AgentBudgetSchema = z.strictObject({
  maxSteps: z.number().int().positive().default(50),
  maxToolCalls: z.number().int().positive().default(100),
  maxWrites: z.number().int().nonnegative().default(20),
  maxReplans: z.number().int().nonnegative().default(5),
  maxRetries: z.number().int().nonnegative().default(3),
  maxExecutionMs: z.number().int().positive().default(300_000),
  maxContextSize: z.number().int().positive().default(200_000),
  maxValidationPasses: z.number().int().nonnegative().default(5),
});

export const AgentGoalSchema = z.strictObject({
  id: ScopedIdSchema("agent-goal"),
  version: z.literal(AGENT_CONTRACT_VERSION),
  category: AgentGoalCategorySchema,
  request: z.string().trim().min(1).max(20_000),
  requestedOutcome: z.string().trim().min(1).max(10_000),
  targetProjectId: z.string().min(1).optional(),
  targetDocumentId: z.string().min(1).optional(),
  targetNodeIds: z.array(z.string().min(1)).default([]),
  parameters: z.record(z.string(), JsonValueSchema).default({}),
  requiredCapabilities: z.array(z.string().min(1).max(128)).default([]),
  confidence: z.number().finite().min(0).max(1),
  fingerprint: FingerprintSchema,
});

export const AgentSessionStatusSchema = z.enum([
  "CREATED",
  "PLANNING",
  "READY",
  "EXECUTING",
  "WAITING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "BLOCKED",
]);
export const AgentSessionSchema = z.strictObject({
  id: ScopedIdSchema("agent-session"),
  version: z.literal(AGENT_CONTRACT_VERSION),
  actorId: z.string().min(1).max(255),
  workspaceId: z.string().min(1).max(255),
  projectId: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  goal: AgentGoalSchema,
  status: AgentSessionStatusSchema,
  constraints: AgentConstraintsSchema,
  budget: AgentBudgetSchema,
  createdAt: IsoDateSchema,
  fingerprint: FingerprintSchema,
});

export const AgentRunStatusSchema = z.enum([
  "QUEUED",
  "PLANNING",
  "EXECUTING",
  "REPLANNING",
  "VERIFYING",
  "SUCCEEDED",
  "FAILED",
  "BLOCKED",
  "CANCELLED",
]);
export const VerificationStrategySchema = z.enum([
  "STATE_ASSERTION",
  "DOCUMENT_VERSION",
  "STRUCTURAL",
  "VISUAL_VALIDATION",
  "MULTI_VIEWPORT",
  "TIMELINE_EVALUATION",
  "CUSTOM",
]);
export const AgentVerificationResultSchema = z.strictObject({
  strategy: VerificationStrategySchema,
  success: z.boolean(),
  expected: JsonValueSchema.optional(),
  actual: JsonValueSchema.optional(),
  diagnostics: z.array(AgentDiagnosticSchema),
  fingerprint: FingerprintSchema,
});

export const AgentObservationSchema = z.strictObject({
  id: ScopedIdSchema("agent-observation"),
  version: z.literal(AGENT_CONTRACT_VERSION),
  runId: ScopedIdSchema("agent-run"),
  stepId: z.string().min(1),
  type: z.enum(["CONTEXT", "INTENT", "PLAN", "TOOL_RESULT", "ANALYSIS", "APPROVAL", "VERIFICATION"]),
  success: z.boolean(),
  data: JsonValueSchema.optional(),
  diagnostics: z.array(AgentDiagnosticSchema),
  documentVersion: z.number().int().positive().optional(),
  fingerprint: FingerprintSchema,
  createdAt: IsoDateSchema,
});

export const AgentOutcomeSchema = z.strictObject({
  status: z.enum(["SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED"]),
  summary: z.string().min(1).max(2_000),
  finalDocumentVersion: z.number().int().positive().optional(),
  verification: AgentVerificationResultSchema.optional(),
  diagnostics: z.array(AgentDiagnosticSchema),
  fingerprint: FingerprintSchema,
});
export const AgentRunSchema = z.strictObject({
  id: ScopedIdSchema("agent-run"),
  version: z.literal(AGENT_CONTRACT_VERSION),
  sessionId: ScopedIdSchema("agent-session"),
  sequence: z.number().int().positive(),
  correlationId: z.string().min(1).max(128),
  status: AgentRunStatusSchema,
  planId: z.string().min(1).optional(),
  observations: z.array(AgentObservationSchema),
  counters: z.strictObject({
    steps: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    writes: z.number().int().nonnegative(),
    replans: z.number().int().nonnegative(),
    retries: z.number().int().nonnegative(),
    validationPasses: z.number().int().nonnegative(),
  }),
  startedAt: IsoDateSchema,
  completedAt: IsoDateSchema.optional(),
  outcome: AgentOutcomeSchema.optional(),
  fingerprint: FingerprintSchema,
});

export const AgentToolSafetySchema = z.enum([
  "READ_ONLY",
  "SAFE_WRITE",
  "DESTRUCTIVE_WRITE",
  "EXPENSIVE",
  "LONG_RUNNING",
]);
export const AgentApprovalPolicySchema = z.enum([
  "AUTO_READ",
  "AUTO_SAFE_WRITE",
  "REQUIRE_DESTRUCTIVE_APPROVAL",
  "REQUIRE_ALL_WRITE_APPROVAL",
]);
export const AgentApprovalRequestSchema = z.strictObject({
  sessionId: ScopedIdSchema("agent-session"),
  runId: ScopedIdSchema("agent-run"),
  stepId: z.string().min(1),
  tool: z.string().min(1).max(128),
  classification: AgentToolSafetySchema,
  policy: AgentApprovalPolicySchema,
  inputFingerprint: FingerprintSchema,
  // Real, derived context for an approval UI (post-D5 cleanup) — all optional so existing callers
  // and the schema's prior shape remain valid; only populated when the engine can genuinely derive
  // it from real plan/document data, never fabricated when it can't.
  nodeId: EntityIdSchema.optional(),
  /** A real, human-readable description of the step's purpose (its plan label), not the raw tool name. */
  operation: z.string().min(1).max(255).optional(),
  /** The real target node's relevant fields as read moments earlier in the same plan run, before this write. */
  before: z.record(z.string(), JsonValueSchema).optional(),
  /** before, shallow-merged with the real computed changes this write is about to apply — a preview, not a guess. */
  after: z.record(z.string(), JsonValueSchema).optional(),
  /** A short, real, derived description of what will change (e.g. "Rename \"X\" -> \"Y\""). */
  summary: z.string().min(1).max(500).optional(),
});
export const AgentApprovalDecisionSchema = z.strictObject({
  approved: z.boolean(),
  source: z.enum(["POLICY", "USER", "FIXTURE"]),
  reason: z.string().min(1).max(1_000),
  decidedAt: IsoDateSchema,
});

export const AgentAuditRecordSchema = z.strictObject({
  id: ScopedIdSchema("agent-audit"),
  version: z.literal(AGENT_CONTRACT_VERSION),
  sessionId: ScopedIdSchema("agent-session"),
  runId: ScopedIdSchema("agent-run"),
  stepId: z.string().min(1),
  actorId: z.string().min(1).max(255),
  goalId: ScopedIdSchema("agent-goal"),
  correlationId: z.string().min(1).max(128),
  tool: z.string().min(1).max(128).optional(),
  toolResult: z.enum(["NOT_CALLED", "SUCCEEDED", "FAILED", "DENIED"]),
  writeStatus: z.enum(["NONE", "DRY_RUN", "COMMITTED", "REJECTED"]),
  documentVersion: z.number().int().positive().optional(),
  verificationSuccess: z.boolean().optional(),
  failureCode: AgentDiagnosticCodeSchema.optional(),
  durationMs: z.number().finite().nonnegative(),
  timestamp: IsoDateSchema,
  fingerprint: FingerprintSchema,
});

export type AgentDiagnosticCode = z.infer<typeof AgentDiagnosticCodeSchema>;
export type AgentDiagnostic = z.infer<typeof AgentDiagnosticSchema>;
export type AgentGoalCategory = z.infer<typeof AgentGoalCategorySchema>;
export type AgentConstraints = z.infer<typeof AgentConstraintsSchema>;
export type AgentBudget = z.infer<typeof AgentBudgetSchema>;
export type AgentGoal = z.infer<typeof AgentGoalSchema>;
export type AgentSession = z.infer<typeof AgentSessionSchema>;
export type AgentSessionStatus = z.infer<typeof AgentSessionStatusSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentObservation = z.infer<typeof AgentObservationSchema>;
export type AgentOutcome = z.infer<typeof AgentOutcomeSchema>;
export type VerificationStrategy = z.infer<typeof VerificationStrategySchema>;
export type AgentVerificationResult = z.infer<typeof AgentVerificationResultSchema>;
export type AgentToolSafety = z.infer<typeof AgentToolSafetySchema>;
export type AgentApprovalPolicy = z.infer<typeof AgentApprovalPolicySchema>;
export type AgentApprovalRequest = z.infer<typeof AgentApprovalRequestSchema>;
export type AgentApprovalDecision = z.infer<typeof AgentApprovalDecisionSchema>;
export type AgentAuditRecord = z.infer<typeof AgentAuditRecordSchema>;
