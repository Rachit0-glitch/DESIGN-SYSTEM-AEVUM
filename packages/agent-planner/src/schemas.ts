import {
  AgentDiagnosticSchema,
  AgentGoalCategorySchema,
  AgentToolSafetySchema,
  VerificationStrategySchema,
} from "@aevum/agent-core";
import { JsonValueSchema } from "@aevum/document-model";
import { McpPermissionSchema, McpToolDescriptorSchema } from "@aevum/mcp-protocol";
import { z } from "zod";

export const AGENT_PLAN_VERSION = "1.0.0" as const;
const FingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const ScopedIdSchema = (scope: string) => z.string().regex(new RegExp(`^${scope}:[0-9a-f]{32}$`));

export const AgentIntentSchema = z.strictObject({
  id: ScopedIdSchema("agent-intent"),
  version: z.literal(AGENT_PLAN_VERSION),
  goalId: ScopedIdSchema("agent-goal"),
  category: AgentGoalCategorySchema,
  targetProjectId: z.string().min(1).optional(),
  targetDocumentId: z.string().min(1).optional(),
  targetNodeIds: z.array(z.string().min(1)),
  requestedOutcome: z.string().min(1).max(10_000),
  constraints: z.array(z.string().min(1).max(500)),
  protectedProperties: z.array(z.strictObject({ nodeId: z.string().min(1).optional(), property: z.string().min(1) })),
  requiredCapabilities: z.array(z.string().min(1).max(128)),
  requiredPermissions: z.array(McpPermissionSchema),
  ambiguities: z.array(z.string().min(1).max(500)),
  confidence: z.number().finite().min(0).max(1),
  parameters: z.record(z.string(), JsonValueSchema),
  fingerprint: FingerprintSchema,
});

export const AgentPlanStepTypeSchema = z.enum([
  "INSPECT",
  "READ",
  "ANALYZE",
  "PLAN",
  "TOOL_CALL",
  "DRY_RUN",
  "WRITE",
  "VALIDATE",
  "COMPARE",
  "VERIFY",
  "WAIT",
  "COMPLETE",
]);
export const AgentInputBindingSchema = z.strictObject({
  targetPath: z.string().min(1).max(255),
  sourceStepId: ScopedIdSchema("agent-step"),
  sourcePath: z.string().min(1).max(255),
});
export const AgentExpectedObservationSchema = z.strictObject({
  sourceStepId: ScopedIdSchema("agent-step").optional(),
  path: z.string().min(1).max(255).optional(),
  expectedSourceStepId: ScopedIdSchema("agent-step").optional(),
  expectedSourcePath: z.string().min(1).max(255).optional(),
  operator: z.enum(["SUCCESS", "EQUALS", "EXISTS", "ABSENT", "GREATER_THAN", "VERSION_INCREMENT"]),
  value: JsonValueSchema.optional(),
});
export const AgentRetryPolicySchema = z.strictObject({
  maxAttempts: z.number().int().positive(),
  backoffMs: z.number().int().nonnegative(),
  retryOn: z.array(z.enum(["NETWORK", "TIMEOUT", "RATE_LIMIT", "TEMPORARY_DEPENDENCY"])),
});
export const AgentVerificationRequirementSchema = z.strictObject({
  required: z.boolean(),
  strategy: VerificationStrategySchema,
  assertions: z.array(AgentExpectedObservationSchema),
});
export const AgentPlanStepSchema = z.strictObject({
  id: ScopedIdSchema("agent-step"),
  type: AgentPlanStepTypeSchema,
  label: z.string().min(1).max(255),
  tool: z.string().min(1).max(128).optional(),
  dependencies: z.array(ScopedIdSchema("agent-step")),
  input: JsonValueSchema,
  inputBindings: z.array(AgentInputBindingSchema),
  expectedObservation: AgentExpectedObservationSchema,
  retryPolicy: AgentRetryPolicySchema,
  failurePolicy: z.enum(["FAIL", "BLOCK", "REPLAN", "CONTINUE"]),
  verificationRequirement: AgentVerificationRequirementSchema,
  safety: AgentToolSafetySchema,
  requiresApproval: z.boolean(),
});

export const AgentCapabilityGapSchema = z.strictObject({
  capability: z.string().min(1).max(128),
  reason: z.enum(["UNAVAILABLE", "PERMISSION_DENIED"]),
  requiredPhaseOrTool: z.string().min(1).max(255),
  canPartiallyProceed: z.boolean(),
  suggestedAction: z.string().min(1).max(500),
});
export const AgentPlanSchema = z.strictObject({
  id: ScopedIdSchema("agent-plan"),
  version: z.literal(AGENT_PLAN_VERSION),
  goalId: ScopedIdSchema("agent-goal"),
  steps: z.array(AgentPlanStepSchema).min(1),
  requiredCapabilities: z.array(z.string().min(1).max(128)),
  expectedWrites: z.boolean(),
  verificationStrategy: VerificationStrategySchema,
  capabilityGaps: z.array(AgentCapabilityGapSchema),
  fingerprint: FingerprintSchema,
});

export const AgentCapabilitiesSchema = z.strictObject({
  tools: z.array(McpToolDescriptorSchema),
  actorPermissions: z.array(McpPermissionSchema),
  fingerprint: FingerprintSchema,
});
export const AgentPlanValidationSchema = z.strictObject({
  valid: z.boolean(),
  orderedStepIds: z.array(ScopedIdSchema("agent-step")),
  diagnostics: z.array(AgentDiagnosticSchema),
  fingerprint: FingerprintSchema,
});

export type AgentIntent = z.infer<typeof AgentIntentSchema>;
export type AgentPlanStepType = z.infer<typeof AgentPlanStepTypeSchema>;
export type AgentInputBinding = z.infer<typeof AgentInputBindingSchema>;
export type AgentExpectedObservation = z.infer<typeof AgentExpectedObservationSchema>;
export type AgentPlanStep = z.infer<typeof AgentPlanStepSchema>;
export type AgentCapabilityGap = z.infer<typeof AgentCapabilityGapSchema>;
export type AgentPlan = z.infer<typeof AgentPlanSchema>;
export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;
export type AgentPlanValidation = z.infer<typeof AgentPlanValidationSchema>;
