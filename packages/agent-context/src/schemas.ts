import { AgentDiagnosticSchema, AgentObservationSchema } from "@aevum/agent-core";
import { JsonValueSchema } from "@aevum/document-model";
import { z } from "zod";

const FingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const ScopedIdSchema = (scope: string) => z.string().regex(new RegExp(`^${scope}:[0-9a-f]{32}$`));

export const AGENT_CONTEXT_VERSION = "1.0.0" as const;
export const AgentContextRecordKindSchema = z.enum([
  "PROJECT",
  "DOCUMENT",
  "HIERARCHY",
  "NODE",
  "PARENT_NODE",
  "CHILD_NODE",
  "COMPONENT",
  "ASSET",
  "TIMELINE",
  "RESPONSIVE_OVERRIDE",
  "VALIDATION_ISSUE",
  "RECONSTRUCTION_REPORT",
  "CORRECTION_REPORT",
  "CONSTRAINT",
  "HISTORY",
]);
export const AgentContextRecordSchema = z.strictObject({
  id: z.string().min(1).max(255),
  kind: AgentContextRecordKindSchema,
  entityId: z.string().min(1).optional(),
  relatedEntityIds: z.array(z.string().min(1)).default([]),
  keywords: z.array(z.string().min(1).max(100)).default([]),
  data: JsonValueSchema,
  relevance: z.number().finite().min(0).max(1),
  critical: z.boolean().default(false),
});

export const AgentContextBudgetSchema = z.strictObject({
  maxNodes: z.number().int().positive().default(500),
  maxAssets: z.number().int().positive().default(100),
  maxTimelines: z.number().int().positive().default(50),
  maxValidationIssues: z.number().int().positive().default(200),
  maxHistoryEntries: z.number().int().positive().default(50),
  maxCharacters: z.number().int().positive().default(200_000),
  maxTokens: z.number().int().positive().default(50_000),
});

export const AgentContextPolicySchema = z.strictObject({
  id: z.string().min(1).max(128),
  instruction: z.string().min(1).max(2_000),
});
export const OmittedContextRecordSchema = z.strictObject({
  id: z.string().min(1),
  kind: AgentContextRecordKindSchema,
  entityId: z.string().min(1).optional(),
  reason: z.enum(["CATEGORY_LIMIT", "CHARACTER_LIMIT", "TOKEN_LIMIT", "LOW_RELEVANCE"]),
});
export const AgentContextBundleSchema = z.strictObject({
  id: ScopedIdSchema("agent-context"),
  version: z.literal(AGENT_CONTEXT_VERSION),
  goalId: z.string().min(1),
  instructions: z.array(AgentContextPolicySchema),
  context: z.strictObject({
    targetIds: z.array(z.string().min(1)),
    preservedConstraintIds: z.array(z.string().min(1)),
    currentDocumentVersion: z.number().int().positive().optional(),
  }),
  untrustedDesignContent: z.array(AgentContextRecordSchema),
  toolResults: z.array(AgentObservationSchema),
  omitted: z.array(OmittedContextRecordSchema),
  diagnostics: z.array(AgentDiagnosticSchema),
  usage: z.strictObject({
    records: z.number().int().nonnegative(),
    nodes: z.number().int().nonnegative(),
    assets: z.number().int().nonnegative(),
    timelines: z.number().int().nonnegative(),
    validationIssues: z.number().int().nonnegative(),
    historyEntries: z.number().int().nonnegative(),
    characters: z.number().int().nonnegative(),
    estimatedTokens: z.number().int().nonnegative(),
  }),
  fingerprint: FingerprintSchema,
});

export const AgentWorkingMemorySchema = z.strictObject({
  runId: z.string().min(1),
  hypothesis: z.string().max(2_000).optional(),
  locatedTargetIds: z.array(z.string().min(1)),
  relevantNodeIds: z.array(z.string().min(1)),
  failedApproaches: z.array(z.string().min(1).max(1_000)),
  currentValidationScore: z.number().finite().min(0).max(1).optional(),
  currentDocumentVersion: z.number().int().positive().optional(),
  lastObservationIds: z.array(z.string().min(1)),
  fingerprint: FingerprintSchema,
});

export type AgentContextRecordKind = z.infer<typeof AgentContextRecordKindSchema>;
export type AgentContextRecord = z.infer<typeof AgentContextRecordSchema>;
export type AgentContextBudget = z.infer<typeof AgentContextBudgetSchema>;
export type AgentContextPolicy = z.infer<typeof AgentContextPolicySchema>;
export type AgentContextBundle = z.infer<typeof AgentContextBundleSchema>;
export type AgentWorkingMemory = z.infer<typeof AgentWorkingMemorySchema>;
