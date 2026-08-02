import { UpdateNodeCommandSchema } from "@aevum/command-engine";
import { ActorRefSchema, CanonicalDesignDocumentSchema, EntityIdSchema } from "@aevum/document-model";
import { ValidationReportSchema } from "@aevum/validation";
import { z } from "zod";

export const CORRECTION_SESSION_VERSION = "1.0.0" as const;
export const CORRECTION_PASS_VERSION = "1.0.0" as const;
export const CORRECTION_CANDIDATE_VERSION = "1.0.0" as const;
export const CORRECTION_TRANSACTION_VERSION = "1.0.0" as const;
export const CORRECTION_REPORT_VERSION = "1.0.0" as const;

const IsoDateSchema = z.iso.datetime({ offset: true });
const UnitIntervalSchema = z.number().finite().min(0).max(1);
const FingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

export const CorrectionPropertySchema = z.enum([
  "NODE",
  "POSITION",
  "SIZE",
  "SPACING",
  "TYPOGRAPHY",
  "COLOR",
  "BORDER",
  "RADIUS",
  "SHADOW",
  "GRADIENT",
  "ASSET_PLACEMENT",
  "VISIBILITY",
  "OPACITY",
  "HIERARCHY",
]);

export const ProtectedPropertySchema = z.strictObject({
  nodeId: EntityIdSchema.optional(),
  property: CorrectionPropertySchema,
  reason: z.string().min(1),
});

export const CorrectionConfigurationSchema = z.strictObject({
  maxPasses: z.number().int().min(1).max(10).default(3),
  minimumImprovement: UnitIntervalSchema.default(0.001),
  targetOverallScore: UnitIntervalSchema.default(0.95),
  minimumConfidence: UnitIntervalSchema.default(0.5),
  protectedProperties: z.array(ProtectedPropertySchema).default([]),
  protectedRegionIds: z.array(z.string().min(1)).default([]),
});

export const CorrectionCandidateSchema = z.strictObject({
  id: z.string().regex(/^correction-candidate:[0-9a-f]{32}$/),
  candidateVersion: z.literal(CORRECTION_CANDIDATE_VERSION),
  sessionId: z.string().min(1),
  passNumber: z.number().int().positive(),
  sourceSuggestionId: z.string().min(1).optional(),
  sourceDifferenceId: z.string().min(1),
  nodeId: EntityIdSchema,
  property: CorrectionPropertySchema,
  commandType: z.literal("node.update"),
  changes: JsonObjectSchema,
  expectedImpact: UnitIntervalSchema,
  confidence: UnitIntervalSchema,
  priority: z.number().finite().nonnegative(),
  fingerprint: FingerprintSchema,
});

export const CandidateRejectionReasonSchema = z.enum([
  "LOCKED_NODE",
  "PROTECTED_PROPERTY",
  "PROTECTED_HIERARCHY",
  "MISSING_NODE",
  "UNSUPPORTED_DIFFERENCE",
  "LOW_CONFIDENCE",
  "CONTENT_CHANGE_FORBIDDEN",
  "CONFLICTING_CHANGES",
]);

export const RejectedCorrectionCandidateSchema = z.strictObject({
  id: z.string().regex(/^correction-rejection:[0-9a-f]{32}$/),
  sessionId: z.string().min(1),
  passNumber: z.number().int().positive(),
  sourceDifferenceId: z.string().min(1),
  nodeId: EntityIdSchema,
  property: CorrectionPropertySchema,
  reason: CandidateRejectionReasonSchema,
  message: z.string().min(1),
});

export const CandidateGenerationResultSchema = z.strictObject({
  candidates: z.array(CorrectionCandidateSchema),
  rejected: z.array(RejectedCorrectionCandidateSchema),
  fingerprint: FingerprintSchema,
});

export const CorrectionTransactionPlanSchema = z.strictObject({
  id: z.string().regex(/^correction-transaction:[0-9a-f]{32}$/),
  transactionVersion: z.literal(CORRECTION_TRANSACTION_VERSION),
  sessionId: z.string().min(1),
  passNumber: z.number().int().positive(),
  documentId: EntityIdSchema,
  expectedDocumentVersion: z.number().int().positive(),
  transactionId: z.string().regex(/^tx_[0-9a-f-]{36}$/),
  candidateIds: z.array(z.string().min(1)).min(1),
  commands: z.array(UpdateNodeCommandSchema).min(1),
  fingerprint: FingerprintSchema,
});

export const CorrectionEvaluationReasonSchema = z.enum([
  "ACCEPTED",
  "OVERALL_NOT_IMPROVED",
  "WORST_REGION_REGRESSED",
  "PROTECTED_REGION_CHANGED",
  "TYPOGRAPHY_REGRESSED",
  "LAYOUT_REGRESSED",
  "CONFIDENCE_REGRESSED",
  "DOCUMENT_INVALID",
  "CRITICAL_ISSUE_INTRODUCED",
]);

export const CorrectionEvaluationSchema = z.strictObject({
  accepted: z.boolean(),
  reasons: z.array(CorrectionEvaluationReasonSchema).min(1),
  transactionPlanId: z.string().min(1),
  candidateDocumentVersion: z.number().int().positive(),
  candidateDocumentFingerprint: FingerprintSchema,
  baselineReportId: z.string().min(1),
  candidateReportId: z.string().min(1),
  overallBefore: UnitIntervalSchema,
  overallAfter: UnitIntervalSchema,
  overallDelta: z.number().finite().min(-1).max(1),
  worstRegionBefore: UnitIntervalSchema,
  worstRegionAfter: UnitIntervalSchema,
  layoutBefore: UnitIntervalSchema,
  layoutAfter: UnitIntervalSchema,
  typographyBefore: UnitIntervalSchema,
  typographyAfter: UnitIntervalSchema,
  confidenceBefore: UnitIntervalSchema,
  confidenceAfter: UnitIntervalSchema,
  protectedRegionIds: z.array(z.string().min(1)),
  regressedRegionIds: z.array(z.string().min(1)),
  fingerprint: FingerprintSchema,
});

export const CorrectionCandidateDecisionSchema = z.strictObject({
  candidateId: z.string().min(1),
  outcome: z.enum(["ACCEPTED", "REJECTED"]),
  reason: z.string().min(1),
});

export const CorrectionPassSchema = z.strictObject({
  id: z.string().regex(/^correction-pass:[0-9a-f]{32}$/),
  passVersion: z.literal(CORRECTION_PASS_VERSION),
  sessionId: z.string().min(1),
  passNumber: z.number().int().positive(),
  status: z.enum(["CANDIDATE", "DRY_RUN_FAILED", "ACCEPTED", "REJECTED"]),
  inputDocumentVersion: z.number().int().positive(),
  outputDocumentVersion: z.number().int().positive().optional(),
  baselineReportId: z.string().min(1),
  candidateReportId: z.string().min(1).optional(),
  candidateIds: z.array(z.string().min(1)),
  generationRejections: z.array(RejectedCorrectionCandidateSchema),
  transactionPlanId: z.string().min(1).optional(),
  decisions: z.array(CorrectionCandidateDecisionSchema),
  evaluation: CorrectionEvaluationSchema.optional(),
  scoreBefore: UnitIntervalSchema,
  scoreAfter: UnitIntervalSchema.optional(),
  scoreDelta: z.number().finite().min(-1).max(1).optional(),
  diagnostics: z.array(z.string().min(1)),
  createdAt: IsoDateSchema,
  fingerprint: FingerprintSchema,
});

export const CorrectionStopReasonSchema = z.enum([
  "THRESHOLD_REACHED",
  "NO_CANDIDATES",
  "NO_MEASURABLE_IMPROVEMENT",
  "REGRESSION_DETECTED",
  "MAXIMUM_PASSES_REACHED",
  "TRANSACTION_FAILED",
]);

export const CorrectionFinalResultSchema = z.strictObject({
  stopReason: CorrectionStopReasonSchema,
  initialDocumentVersion: z.number().int().positive(),
  finalDocumentVersion: z.number().int().positive(),
  initialValidationReportId: z.string().min(1),
  finalValidationReportId: z.string().min(1),
  initialScore: UnitIntervalSchema,
  finalScore: UnitIntervalSchema,
  improvement: z.number().finite().min(-1).max(1),
  acceptedCandidateIds: z.array(z.string().min(1)),
  rejectedCandidateIds: z.array(z.string().min(1)),
});

export const CorrectionSessionSchema = z.strictObject({
  id: z.string().regex(/^correction-session:[0-9a-f]{32}$/),
  sessionVersion: z.literal(CORRECTION_SESSION_VERSION),
  projectId: EntityIdSchema,
  documentId: EntityIdSchema,
  referenceId: EntityIdSchema,
  sourceAssetId: EntityIdSchema,
  initialDocumentVersion: z.number().int().positive(),
  baselineValidationReportId: z.string().min(1),
  status: z.enum(["CREATED", "RUNNING", "COMPLETED", "FAILED"]),
  configuration: CorrectionConfigurationSchema,
  passes: z.array(CorrectionPassSchema),
  finalResult: CorrectionFinalResultSchema.optional(),
  createdAt: IsoDateSchema,
  createdBy: ActorRefSchema,
  fingerprint: FingerprintSchema,
});

export const CorrectionDiagnosticSchema = z.strictObject({
  code: z.enum([
    "INVALID_INPUT",
    "NO_CANDIDATES",
    "PROTECTED_PROPERTY",
    "DRY_RUN_FAILED",
    "TRANSACTION_FAILED",
    "REVALIDATION_FAILED",
    "REGRESSION_DETECTED",
    "MAXIMUM_PASSES_REACHED",
    "CANCELLED",
  ]),
  severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
  message: z.string().min(1),
  recoverable: z.boolean(),
  passNumber: z.number().int().positive().optional(),
  candidateId: z.string().min(1).optional(),
});

export const CorrectionReportSchema = z.strictObject({
  id: z.string().regex(/^correction-report:[0-9a-f]{32}$/),
  reportVersion: z.literal(CORRECTION_REPORT_VERSION),
  sessionId: z.string().min(1),
  projectId: EntityIdSchema,
  documentId: EntityIdSchema,
  referenceId: EntityIdSchema,
  sourceAssetId: EntityIdSchema,
  initialDocumentVersion: z.number().int().positive(),
  finalDocumentVersion: z.number().int().positive(),
  initialValidation: ValidationReportSchema,
  finalValidation: ValidationReportSchema,
  passes: z.array(CorrectionPassSchema),
  acceptedCandidateIds: z.array(z.string().min(1)),
  rejectedCandidateIds: z.array(z.string().min(1)),
  improvementScore: z.number().finite().min(-1).max(1),
  regressionSummary: z.strictObject({
    rejectedPasses: z.number().int().nonnegative(),
    regressedRegionIds: z.array(z.string().min(1)),
    reasons: z.array(CorrectionEvaluationReasonSchema),
  }),
  stopReason: CorrectionStopReasonSchema,
  diagnostics: z.array(CorrectionDiagnosticSchema),
  createdAt: IsoDateSchema,
  reportInputFingerprint: FingerprintSchema,
});

export const CorrectionWorkerDocumentSchema = CanonicalDesignDocumentSchema;

export type CorrectionProperty = z.infer<typeof CorrectionPropertySchema>;
export type ProtectedProperty = z.infer<typeof ProtectedPropertySchema>;
export type CorrectionConfiguration = z.infer<typeof CorrectionConfigurationSchema>;
export type CorrectionCandidate = z.infer<typeof CorrectionCandidateSchema>;
export type CandidateRejectionReason = z.infer<typeof CandidateRejectionReasonSchema>;
export type RejectedCorrectionCandidate = z.infer<typeof RejectedCorrectionCandidateSchema>;
export type CandidateGenerationResult = z.infer<typeof CandidateGenerationResultSchema>;
export type CorrectionTransactionPlan = z.infer<typeof CorrectionTransactionPlanSchema>;
export type CorrectionEvaluation = z.infer<typeof CorrectionEvaluationSchema>;
export type CorrectionPass = z.infer<typeof CorrectionPassSchema>;
export type CorrectionFinalResult = z.infer<typeof CorrectionFinalResultSchema>;
export type CorrectionStopReason = z.infer<typeof CorrectionStopReasonSchema>;
export type CorrectionSession = z.infer<typeof CorrectionSessionSchema>;
export type CorrectionDiagnostic = z.infer<typeof CorrectionDiagnosticSchema>;
export type CorrectionReport = z.infer<typeof CorrectionReportSchema>;
