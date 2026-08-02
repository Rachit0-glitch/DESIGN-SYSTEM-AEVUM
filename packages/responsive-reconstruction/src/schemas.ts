import { UpdateNodeCommandSchema } from "@aevum/command-engine";
import { ActorRefSchema, EntityIdSchema, ResponsiveOverrideSchema, ResponsiveSchema } from "@aevum/document-model";
import { z } from "zod";

export const RESPONSIVE_TASK_VERSION = "1.0.0" as const;
export const RESPONSIVE_PROPOSAL_VERSION = "1.0.0" as const;
export const RESPONSIVE_TRANSACTION_VERSION = "1.0.0" as const;
export const RESPONSIVE_VALIDATION_VERSION = "1.0.0" as const;
export const RESPONSIVE_REPORT_VERSION = "1.0.0" as const;

const IsoDateSchema = z.iso.datetime({ offset: true });
const FingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const UnitIntervalSchema = z.number().finite().min(0).max(1);

export const ResponsiveVariantSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  width: z.number().int().positive().max(32_768),
  height: z.number().int().positive().max(32_768),
  deviceScaleFactor: z.number().finite().positive().max(8),
  category: z.enum(["DESKTOP", "TABLET", "MOBILE", "CUSTOM"]),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
  reducedMotion: z.boolean(),
  qualityMode: z.enum(["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]),
  breakpointId: z.string().min(1),
  containerQueryIds: z.array(z.string().min(1)).default([]),
});

export const ResponsiveTargetSchema = z.strictObject({
  kind: z.enum(["BREAKPOINT", "ORIENTATION", "CONTAINER_QUERY", "REDUCED_MOTION", "QUALITY_PROFILE"]),
  key: z.string().min(1),
});

export const ResponsiveReferenceEvidenceSchema = z.strictObject({
  id: z.string().min(1),
  viewportId: EntityIdSchema,
  nodeId: EntityIdSchema,
  target: ResponsiveTargetSchema,
  override: ResponsiveOverrideSchema,
  confidence: UnitIntervalSchema,
  source: z.enum(["REFERENCE", "MEASURED", "HUMAN_DIRECTED"]),
  rationale: z.string().min(1),
});

export const ResponsivePropertySchema = z.enum([
  "LAYOUT",
  "ORDER",
  "VISIBILITY",
  "SPACING",
  "TYPOGRAPHY",
  "CROP",
  "CONSTRAINTS",
  "CAMERA",
  "QUALITY",
  "MOTION",
  "DIMENSIONS",
]);

export const ResponsiveProtectionSchema = z.strictObject({
  nodeId: EntityIdSchema,
  property: ResponsivePropertySchema,
  reason: z.string().min(1),
});

export const ResponsiveReconstructionTaskSchema = z
  .strictObject({
    id: z.string().regex(/^responsive-task:[0-9a-f]{32}$/),
    taskVersion: z.literal(RESPONSIVE_TASK_VERSION),
    projectId: EntityIdSchema,
    documentId: EntityIdSchema,
    expectedDocumentVersion: z.number().int().positive(),
    sourceViewportId: EntityIdSchema,
    variants: z.array(ResponsiveVariantSchema).min(3).max(16),
    referenceEvidence: z.array(ResponsiveReferenceEvidenceSchema).default([]),
    protectedProperties: z.array(ResponsiveProtectionSchema).default([]),
    minimumTextSizePx: z.number().finite().min(10).max(32).default(16),
    minimumConfidence: UnitIntervalSchema.default(0.5),
    validateEveryVariant: z.literal(true),
    deterministicSeed: z.number().int().nonnegative(),
    createdAt: IsoDateSchema,
    createdBy: ActorRefSchema,
  })
  .superRefine((task, context) => {
    const ids = task.variants.map((variant) => variant.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: "custom", path: ["variants"], message: "Responsive variant IDs must be unique." });
    for (const category of ["DESKTOP", "TABLET", "MOBILE"] as const) {
      if (!task.variants.some((variant) => variant.category === category))
        context.addIssue({ code: "custom", path: ["variants"], message: `${category} variant is required.` });
    }
    for (const orientation of ["PORTRAIT", "LANDSCAPE"] as const) {
      if (!task.variants.some((variant) => variant.orientation === orientation))
        context.addIssue({ code: "custom", path: ["variants"], message: `${orientation} variant is required.` });
    }
    if (!task.variants.some((variant) => variant.reducedMotion))
      context.addIssue({ code: "custom", path: ["variants"], message: "A reduced-motion variant is required." });
    if (!ids.includes(task.sourceViewportId))
      context.addIssue({ code: "custom", path: ["sourceViewportId"], message: "Source viewport must be a variant." });
    for (const evidence of task.referenceEvidence) {
      if (!ids.includes(evidence.viewportId))
        context.addIssue({ code: "custom", path: ["referenceEvidence"], message: "Evidence viewport is undeclared." });
    }
  });

export const ResponsiveDiagnosticSchema = z.strictObject({
  code: z.enum([
    "INVALID_INPUT",
    "MISSING_NODE",
    "LOCKED_NODE",
    "PROTECTED_PROPERTY",
    "LOW_CONFIDENCE",
    "INVALID_METADATA",
    "NO_RESPONSIVE_CHANGE",
    "MOBILE_SCALED_COPY",
    "TEXT_UNREADABLE",
    "OVERLAP_DETECTED",
    "FOCAL_POINT_LOST",
    "REDUCED_MOTION_MISSING",
    "REFERENCE_MISSING",
    "PROJECTION_FAILED",
    "VALIDATION_FAILED",
    "TRANSACTION_FAILED",
  ]),
  severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
  message: z.string().min(1),
  recoverable: z.boolean(),
  nodeId: EntityIdSchema.optional(),
  viewportId: EntityIdSchema.optional(),
  property: ResponsivePropertySchema.optional(),
});

export const ResponsiveNodeProposalSchema = z.strictObject({
  id: z.string().regex(/^responsive-change:[0-9a-f]{32}$/),
  taskId: z.string().min(1),
  nodeId: EntityIdSchema,
  target: ResponsiveTargetSchema,
  override: ResponsiveOverrideSchema,
  properties: z.array(ResponsivePropertySchema).min(1),
  confidence: UnitIntervalSchema,
  evidenceIds: z.array(z.string().min(1)),
  rationale: z.array(z.string().min(1)).min(1),
  source: z.enum(["REFERENCE", "LOCAL_INFERENCE", "COMBINED"]),
  fingerprint: FingerprintSchema,
});

export const ResponsiveProposalSchema = z.strictObject({
  id: z.string().regex(/^responsive-proposal:[0-9a-f]{32}$/),
  proposalVersion: z.literal(RESPONSIVE_PROPOSAL_VERSION),
  taskId: z.string().min(1),
  projectId: EntityIdSchema,
  documentId: EntityIdSchema,
  expectedDocumentVersion: z.number().int().positive(),
  sourceDocumentFingerprint: FingerprintSchema,
  changes: z.array(ResponsiveNodeProposalSchema),
  diagnostics: z.array(ResponsiveDiagnosticSchema),
  mobileStrategy: z.enum(["REGENERATED", "UNCHANGED", "BLOCKED"]),
  proposalFingerprint: FingerprintSchema,
});

export const ResponsiveTransactionPlanSchema = z.strictObject({
  id: z.string().regex(/^responsive-transaction:[0-9a-f]{32}$/),
  transactionVersion: z.literal(RESPONSIVE_TRANSACTION_VERSION),
  proposalId: z.string().min(1),
  documentId: EntityIdSchema,
  expectedDocumentVersion: z.number().int().positive(),
  transactionId: z.string().regex(/^tx_[0-9a-f-]{36}$/),
  changeIds: z.array(z.string().min(1)).min(1),
  responsiveByNode: z.record(EntityIdSchema, ResponsiveSchema),
  commands: z.array(UpdateNodeCommandSchema).min(1),
  fingerprint: FingerprintSchema,
});

export const ResponsiveVariantValidationSchema = z.strictObject({
  viewport: ResponsiveVariantSchema,
  projectionFingerprint: FingerprintSchema,
  renderGraphFingerprint: FingerprintSchema,
  validationReportId: z.string().min(1).optional(),
  validationScore: UnitIntervalSchema.optional(),
  validationStatus: z.enum(["PASS", "WARN", "FAIL", "NOT_RUN"]),
  mobileRegenerated: z.boolean(),
  textReadable: z.boolean(),
  noUnexpectedOverlap: z.boolean(),
  focalPointsPreserved: z.boolean(),
  reducedMotionSatisfied: z.boolean(),
  diagnostics: z.array(ResponsiveDiagnosticSchema),
});

export const ResponsiveValidationResultSchema = z.strictObject({
  validationVersion: z.literal(RESPONSIVE_VALIDATION_VERSION),
  taskId: z.string().min(1),
  documentId: EntityIdSchema,
  documentVersion: z.number().int().positive(),
  documentFingerprint: FingerprintSchema,
  variants: z.array(ResponsiveVariantValidationSchema).min(1),
  passed: z.boolean(),
  fingerprint: FingerprintSchema,
});

export const ResponsiveReportSchema = z.strictObject({
  id: z.string().regex(/^responsive-report:[0-9a-f]{32}$/),
  reportVersion: z.literal(RESPONSIVE_REPORT_VERSION),
  taskId: z.string().min(1),
  proposalId: z.string().min(1),
  projectId: EntityIdSchema,
  documentId: EntityIdSchema,
  initialDocumentVersion: z.number().int().positive(),
  finalDocumentVersion: z.number().int().positive(),
  changeCount: z.number().int().nonnegative(),
  changedNodeIds: z.array(EntityIdSchema),
  mobileStrategy: z.enum(["REGENERATED", "UNCHANGED", "BLOCKED"]),
  transactionId: z.string().min(1).optional(),
  validation: ResponsiveValidationResultSchema,
  diagnostics: z.array(ResponsiveDiagnosticSchema),
  status: z.enum(["VALIDATED", "VALIDATED_WITH_WARNINGS", "FAILED"]),
  createdAt: IsoDateSchema,
  reportInputFingerprint: FingerprintSchema,
});

export type ResponsiveVariant = z.infer<typeof ResponsiveVariantSchema>;
export type ResponsiveTarget = z.infer<typeof ResponsiveTargetSchema>;
export type ResponsiveReferenceEvidence = z.infer<typeof ResponsiveReferenceEvidenceSchema>;
export type ResponsiveProperty = z.infer<typeof ResponsivePropertySchema>;
export type ResponsiveProtection = z.infer<typeof ResponsiveProtectionSchema>;
export type ResponsiveReconstructionTask = z.infer<typeof ResponsiveReconstructionTaskSchema>;
export type ResponsiveTaskInput = Omit<z.input<typeof ResponsiveReconstructionTaskSchema>, "id" | "taskVersion"> & {
  readonly id?: string;
};
export type ResponsiveDiagnostic = z.infer<typeof ResponsiveDiagnosticSchema>;
export type ResponsiveNodeProposal = z.infer<typeof ResponsiveNodeProposalSchema>;
export type ResponsiveProposal = z.infer<typeof ResponsiveProposalSchema>;
export type ResponsiveTransactionPlan = z.infer<typeof ResponsiveTransactionPlanSchema>;
export type ResponsiveVariantValidation = z.infer<typeof ResponsiveVariantValidationSchema>;
export type ResponsiveValidationResult = z.infer<typeof ResponsiveValidationResultSchema>;
export type ResponsiveReport = z.infer<typeof ResponsiveReportSchema>;
