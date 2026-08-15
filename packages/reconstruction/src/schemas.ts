import { CommandSchema } from "@aevum/command-engine";
import {
  ActorRefSchema,
  AssetSchema,
  ComponentSchema,
  DesignNodeSchema,
  EntityIdSchema,
  ReferenceRecordSchema,
  TextStyleSchema,
  TokenSchema,
} from "@aevum/document-model";
import { z } from "zod";

export const RECONSTRUCTION_TASK_VERSION = "1.0.0" as const;
export const RECONSTRUCTION_ANALYSIS_VERSION = "1.0.0" as const;
export const RECONSTRUCTION_PROPOSAL_VERSION = "1.0.0" as const;
export const RECONSTRUCTION_REPORT_VERSION = "1.0.0" as const;
export const RECONSTRUCTION_MANIFEST_KEY = "aevum.reconstruction.manifest" as const;
export const RECONSTRUCTION_METADATA_KEY = "aevum.reconstruction" as const;

const IsoDateSchema = z.iso.datetime({ offset: true });
const FingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const UnitIntervalSchema = z.number().finite().min(0).max(1);
const NonNegativeSchema = z.number().finite().nonnegative();
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

export const ReconstructionQualityModeSchema = z.enum(["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]);
export const ReconstructionCapabilitySchema = z.enum([
  "REGION_DETECTION",
  "TEXT_DETECTION",
  "ASSET_LINKING",
  "SHAPE_INFERENCE",
  "LAYOUT_INFERENCE",
  "COMPONENT_INFERENCE",
  "TOKEN_INFERENCE",
  "RESPONSIVE_INTENT",
]);

export const ReconstructionViewportSchema = z.strictObject({
  width: z.number().int().positive().max(32_768),
  height: z.number().int().positive().max(32_768),
  deviceScaleFactor: z.number().finite().positive().max(8).default(1),
  category: z.enum(["DESKTOP", "TABLET", "MOBILE", "CUSTOM"]),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
});

export const ReconstructionProviderPolicySchema = z.strictObject({
  allowedProviders: z.array(z.string().min(1)).default([]),
  preferredProviders: z.array(z.string().min(1)).default([]),
  localOnly: z.boolean().default(true),
  externalProcessingAllowed: z.boolean().default(false),
  maximumCost: z.number().finite().nonnegative().optional(),
  privacyMode: z.enum(["STANDARD", "RESTRICTED", "LOCAL_ONLY"]).default("LOCAL_ONLY"),
});

export const ReconstructionConstraintSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["MAX_DEPTH", "MAX_REGIONS", "MAX_NODES", "REQUIRED_CAPABILITY", "CUSTOM"]),
  value: JsonValueSchema,
});

export const ReconstructionTaskSchema = z
  .strictObject({
    id: z.string().regex(/^reconstruction-task:[0-9a-f]{32}$/),
    taskVersion: z.literal(RECONSTRUCTION_TASK_VERSION),
    projectId: EntityIdSchema,
    sourceAssetId: EntityIdSchema,
    sourceReferenceId: EntityIdSchema.optional(),
    requestedPageName: z.string().trim().min(1).max(255).optional(),
    qualityMode: ReconstructionQualityModeSchema,
    targetViewport: ReconstructionViewportSchema,
    targetDocumentId: EntityIdSchema.optional(),
    expectedDocumentVersion: z.number().int().positive().optional(),
    preserveEditability: z.boolean(),
    allowRasterFallbacks: z.boolean(),
    requestedCapabilities: z.array(ReconstructionCapabilitySchema).min(1),
    providerPolicy: ReconstructionProviderPolicySchema.default({
      allowedProviders: [],
      preferredProviders: [],
      localOnly: true,
      externalProcessingAllowed: false,
      privacyMode: "LOCAL_ONLY",
    }),
    constraints: z.array(ReconstructionConstraintSchema).default([]),
    deterministicSeed: z.number().int().nonnegative(),
    createdAt: IsoDateSchema,
    createdBy: ActorRefSchema,
  })
  .superRefine((task, context) => {
    if (task.targetDocumentId && task.expectedDocumentVersion === undefined) {
      context.addIssue({
        code: "custom",
        path: ["expectedDocumentVersion"],
        message: "Existing-document reconstruction requires expectedDocumentVersion.",
      });
    }
    if (!task.targetDocumentId && task.expectedDocumentVersion !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["expectedDocumentVersion"],
        message: "New-document reconstruction must not declare expectedDocumentVersion.",
      });
    }
    if (task.providerPolicy.localOnly && task.providerPolicy.externalProcessingAllowed) {
      context.addIssue({
        code: "custom",
        path: ["providerPolicy", "externalProcessingAllowed"],
        message: "Local-only policy cannot allow external processing.",
      });
    }
  });

export const ReferenceBoundsSchema = z
  .strictObject({
    x: NonNegativeSchema,
    y: NonNegativeSchema,
    width: NonNegativeSchema,
    height: NonNegativeSchema,
    unit: z.literal("SOURCE_PIXEL"),
    normalized: z.strictObject({
      x: UnitIntervalSchema,
      y: UnitIntervalSchema,
      width: UnitIntervalSchema,
      height: UnitIntervalSchema,
    }),
  })
  .superRefine((bounds, context) => {
    if (bounds.normalized.x + bounds.normalized.width > 1.000_001) {
      context.addIssue({ code: "custom", path: ["normalized", "width"], message: "Normalized bounds exceed width." });
    }
    if (bounds.normalized.y + bounds.normalized.height > 1.000_001) {
      context.addIssue({ code: "custom", path: ["normalized", "height"], message: "Normalized bounds exceed height." });
    }
  });

export const RegionCategorySchema = z.enum([
  "PAGE",
  "SECTION",
  "FRAME",
  "GROUP",
  "TEXT",
  "IMAGE",
  "SHAPE",
  "ICON",
  "BACKGROUND",
  "DECORATION",
  "UNKNOWN",
]);

export const ConfidenceLabelSchema = z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
export const ConfidenceValueSchema = z.strictObject({ score: UnitIntervalSchema, label: ConfidenceLabelSchema });

export const ReconstructionProvenanceSchema = z.strictObject({
  sourceAssetId: EntityIdSchema,
  sourceReferenceId: EntityIdSchema.optional(),
  sourceRegionId: z.string().min(1).optional(),
  sourceBounds: ReferenceBoundsSchema.optional(),
  analyzerId: z.string().min(1),
  analyzerVersion: z.string().min(1),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  parameters: JsonObjectSchema,
  deterministicSeed: z.number().int().nonnegative(),
  confidence: UnitIntervalSchema,
  humanOverride: z.boolean(),
});

export const ReconstructionDiagnosticCodeSchema = z.enum([
  "SOURCE_ASSET_NOT_FOUND",
  "SOURCE_ASSET_QUARANTINED",
  "SOURCE_ASSET_FAILED",
  "SOURCE_ASSET_NOT_READY",
  "SOURCE_METADATA_INCOMPLETE",
  "UNSUPPORTED_REFERENCE_TYPE",
  "REGION_DETECTION_FAILED",
  "TEXT_DETECTION_UNAVAILABLE",
  "ASSET_EXTRACTION_UNAVAILABLE",
  "LOW_CONFIDENCE_REGION",
  "AMBIGUOUS_HIERARCHY",
  "AMBIGUOUS_LAYOUT",
  "OVERLAPPING_REGIONS",
  "UNRESOLVED_TEXT",
  "UNRESOLVED_ASSET",
  "UNSUPPORTED_EFFECT",
  "RASTER_FALLBACK_REQUIRED",
  "INVALID_PROPOSED_PARENT",
  "DUPLICATE_PROPOSED_ID",
  "INVALID_PROPOSAL_REFERENCE",
  "COMMAND_PLAN_FAILED",
  "DRY_RUN_FAILED",
  "TRANSACTION_FAILED",
  "RESULT_DOCUMENT_INVALID",
  "LIMIT_EXCEEDED",
  "CANCELLED",
]);

export const ReconstructionDiagnosticSchema = z.strictObject({
  code: ReconstructionDiagnosticCodeSchema,
  severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
  message: z.string().min(1),
  stage: z.string().min(1),
  entityId: z.string().min(1).optional(),
  relatedIds: z.array(z.string().min(1)).default([]),
  path: z.string().min(1).optional(),
  recoverable: z.boolean(),
  details: JsonObjectSchema.default({}),
});

export const DetectedRegionSchema = z.strictObject({
  id: z.string().regex(/^region:[0-9a-f]{32}$/),
  detectionIndex: z.number().int().nonnegative(),
  category: RegionCategorySchema,
  bounds: ReferenceBoundsSchema,
  polygon: z.array(z.strictObject({ x: NonNegativeSchema, y: NonNegativeSchema })).optional(),
  maskAssetId: EntityIdSchema.optional(),
  parentId: z.string().min(1).optional(),
  childIds: z.array(z.string().min(1)),
  confidence: ConfidenceValueSchema,
  zOrderEstimate: z.number().int(),
  occlusion: z.strictObject({ occluded: z.boolean(), occludedByRegionIds: z.array(z.string().min(1)) }),
  semanticHints: z.array(z.string().min(1)),
  visualFeatures: JsonObjectSchema,
  provenance: ReconstructionProvenanceSchema,
});

export const TextCandidateSchema = z.strictObject({
  id: z.string().regex(/^text-candidate:[0-9a-f]{32}$/),
  regionId: z.string().min(1),
  content: z.string().optional(),
  unresolved: z.boolean(),
  style: TextStyleSchema,
  // Real sampled glyph ("ink") color, kept separate from `style` because TextStyleSchema only
  // references color through a Token id (fillTokenId) — the proposal builder resolves this raw
  // sample into a real, deduplicated COLOR Token and sets style.fillTokenId from it.
  sampledColor: JsonObjectSchema.optional(),
  alignment: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFY"]),
  direction: z.enum(["LTR", "RTL", "AUTO"]),
  confidence: ConfidenceValueSchema,
  provenance: ReconstructionProvenanceSchema,
});

export const AssetCandidateSchema = z.strictObject({
  id: z.string().regex(/^asset-candidate:[0-9a-f]{32}$/),
  regionId: z.string().min(1),
  assetId: EntityIdSchema.optional(),
  extracted: z.boolean(),
  crop: z
    .strictObject({
      x: UnitIntervalSchema,
      y: UnitIntervalSchema,
      width: UnitIntervalSchema,
      height: UnitIntervalSchema,
    })
    .optional(),
  fit: z.enum(["FILL", "CONTAIN", "COVER", "NONE", "SCALE_DOWN"]),
  confidence: ConfidenceValueSchema,
  provenance: ReconstructionProvenanceSchema,
});

export const ShapeCandidateSchema = z.strictObject({
  id: z.string().regex(/^shape-candidate:[0-9a-f]{32}$/),
  regionId: z.string().min(1),
  shapeType: z.enum(["RECTANGLE", "ELLIPSE", "POLYGON", "LINE", "CUSTOM"]),
  geometry: JsonObjectSchema,
  fill: JsonObjectSchema.optional(),
  stroke: JsonObjectSchema.optional(),
  cornerRadius: NonNegativeSchema.optional(),
  confidence: ConfidenceValueSchema,
  provenance: ReconstructionProvenanceSchema,
});

export const LayoutCandidateSchema = z.strictObject({
  id: z.string().regex(/^layout-candidate:[0-9a-f]{32}$/),
  regionId: z.string().min(1),
  type: z.enum(["ABSOLUTE", "VERTICAL_STACK", "HORIZONTAL_ROW", "GRID"]),
  gap: NonNegativeSchema.optional(),
  padding: z
    .strictObject({
      top: NonNegativeSchema,
      right: NonNegativeSchema,
      bottom: NonNegativeSchema,
      left: NonNegativeSchema,
    })
    .optional(),
  alignment: z.enum(["START", "CENTER", "END", "STRETCH"]).optional(),
  columns: z.number().int().positive().optional(),
  confidence: ConfidenceValueSchema,
  evidence: z.array(z.string().min(1)),
});

export const ComponentCandidateSchema = z.strictObject({
  id: z.string().regex(/^component-candidate:[0-9a-f]{32}$/),
  proposedName: z.string().min(1),
  instanceRegionIds: z.array(z.string().min(1)).min(2),
  similarityEvidence: z.array(z.string().min(1)),
  sharedStructure: z.array(z.string().min(1)),
  localDifferences: z.array(z.string().min(1)),
  confidence: ConfidenceValueSchema,
  applyPolicy: z.enum(["SUGGEST_ONLY", "APPLY"]),
});

export const TokenCandidateSchema = z.strictObject({
  id: z.string().regex(/^token-candidate:[0-9a-f]{32}$/),
  proposedName: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+$/),
  type: TokenSchema.shape.type,
  value: TokenSchema.shape.value,
  supportingRegionIds: z.array(z.string().min(1)).min(1),
  originalValues: z.array(JsonValueSchema).min(1),
  confidence: ConfidenceValueSchema,
});

export const ReconstructionConfidenceSummarySchema = z.strictObject({
  regionDetection: ConfidenceValueSchema,
  semanticClassification: ConfidenceValueSchema,
  text: ConfidenceValueSchema,
  asset: ConfidenceValueSchema,
  layout: ConfidenceValueSchema,
  component: ConfidenceValueSchema,
  token: ConfidenceValueSchema,
  overall: ConfidenceValueSchema,
});

export const ReferenceAnalysisSchema = z.strictObject({
  id: z.string().regex(/^analysis:[0-9a-f]{32}$/),
  analysisVersion: z.literal(RECONSTRUCTION_ANALYSIS_VERSION),
  taskId: z.string().min(1),
  sourceAssetId: EntityIdSchema,
  sourceHash: FingerprintSchema,
  sourceDimensions: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
  coordinateSystem: z.strictObject({ origin: z.literal("TOP_LEFT"), unit: z.literal("SOURCE_PIXEL") }),
  referenceType: z.enum(["WEBSITE_SCREENSHOT", "UI_SCREENSHOT", "LANDING_PAGE", "POSTER", "STATIC_2D"]),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE", "SQUARE"]),
  regions: z.array(DetectedRegionSchema),
  textCandidates: z.array(TextCandidateSchema),
  assetCandidates: z.array(AssetCandidateSchema),
  shapeCandidates: z.array(ShapeCandidateSchema),
  layoutCandidates: z.array(LayoutCandidateSchema),
  componentCandidates: z.array(ComponentCandidateSchema),
  tokenCandidates: z.array(TokenCandidateSchema),
  diagnostics: z.array(ReconstructionDiagnosticSchema),
  confidenceSummary: ReconstructionConfidenceSummarySchema,
  adapterVersions: z.record(z.string(), z.string().min(1)),
  analysisFingerprint: FingerprintSchema,
});

export const ProposedNodeSchema = z.strictObject({
  node: DesignNodeSchema,
  childOrder: z.number().int().nonnegative(),
  sourceRegionId: z.string().min(1),
  sourceAssetId: EntityIdSchema,
  confidence: ConfidenceValueSchema,
  provenance: ReconstructionProvenanceSchema,
  fallbackStatus: z.enum(["NATIVE", "PLACEHOLDER", "RASTER_BACKED", "UNRESOLVED"]),
  unsupportedFeatureNotes: z.array(z.string()),
});

export const ProposedAssetReferenceSchema = z.strictObject({
  asset: AssetSchema,
  role: z.enum(["SOURCE_REFERENCE", "REGION_ASSET", "RASTER_FALLBACK"]),
  sourceRegionId: z.string().min(1).optional(),
});

export const ProposedComponentSchema = z.strictObject({
  component: ComponentSchema,
  candidateId: z.string().min(1),
  applied: z.boolean(),
});

export const ProposedTokenSchema = z.strictObject({
  token: TokenSchema,
  candidateId: z.string().min(1),
  applied: z.boolean(),
});

export const ProposedResponsiveDataSchema = z.strictObject({
  nodeId: EntityIdSchema,
  sourceViewport: ReconstructionViewportSchema,
  breakpointClassification: z.literal("SOURCE_ONLY"),
  contentPriority: z.number().int().nonnegative(),
  stackingCandidateNodeIds: z.array(EntityIdSchema),
});

export const ReconstructionIssueSchema = z.strictObject({
  id: z.string().min(1),
  code: ReconstructionDiagnosticCodeSchema,
  message: z.string().min(1),
  blocking: z.boolean(),
  relatedIds: z.array(z.string()),
});

export const ReconstructionFallbackSchema = z.strictObject({
  id: z.string().min(1),
  regionId: z.string().min(1),
  kind: z.enum(["FULL_REFERENCE_IMAGE", "VECTOR_PLACEHOLDER", "UNRESOLVED_TEXT", "ABSOLUTE_LAYOUT"]),
  reason: z.string().min(1),
  preservesEditability: z.boolean(),
});

export const ProposedCommandPlanSchema = z.strictObject({
  id: z.string().regex(/^command-plan:[0-9a-f]{32}$/),
  transactionId: z.string().min(1),
  expectedDocumentVersion: z.number().int().nonnegative(),
  commands: z.array(CommandSchema).min(1),
  createdEntityIds: z.array(EntityIdSchema),
  commandPlanFingerprint: FingerprintSchema,
});

export const ReconstructionProposalSchema = z.strictObject({
  id: z.string().regex(/^proposal:[0-9a-f]{32}$/),
  proposalVersion: z.literal(RECONSTRUCTION_PROPOSAL_VERSION),
  taskId: z.string().min(1),
  analysisId: z.string().min(1),
  projectId: EntityIdSchema,
  targetDocumentId: EntityIdSchema.optional(),
  sourceAssetId: EntityIdSchema,
  sourceHash: FingerprintSchema,
  proposedDocumentMetadata: z.strictObject({
    documentId: EntityIdSchema,
    name: z.string().min(1),
    pageName: z.string().min(1),
    viewportId: EntityIdSchema,
    viewport: ReconstructionViewportSchema,
    reference: ReferenceRecordSchema,
  }),
  proposedNodes: z.array(ProposedNodeSchema),
  proposedAssets: z.array(ProposedAssetReferenceSchema),
  proposedComponents: z.array(ProposedComponentSchema),
  proposedTokens: z.array(ProposedTokenSchema),
  proposedResponsiveData: z.array(ProposedResponsiveDataSchema),
  commandPlan: ProposedCommandPlanSchema,
  confidenceSummary: ReconstructionConfidenceSummarySchema,
  diagnostics: z.array(ReconstructionDiagnosticSchema),
  unresolvedIssues: z.array(ReconstructionIssueSchema),
  fallbacks: z.array(ReconstructionFallbackSchema),
  proposalFingerprint: FingerprintSchema,
});

export const ReconstructionCompletionStatusSchema = z.enum([
  "ANALYZED",
  "PROPOSAL_READY",
  "READY_TO_APPLY",
  "APPLIED",
  "APPLIED_WITH_WARNINGS",
  "BLOCKED",
  "FAILED",
  "CANCELLED",
]);

export const ReconstructionVerificationStatusSchema = z.enum(["NOT_RUN", "PASSED", "WARNINGS", "FAILED"]);

export const ReconstructionStageRecordSchema = z.strictObject({
  stage: z.string().min(1),
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
  durationMs: z.number().finite().nonnegative(),
  diagnosticCount: z.number().int().nonnegative().default(0),
});

export const ReconstructionVerificationSummarySchema = z.strictObject({
  status: ReconstructionVerificationStatusSchema,
  fingerprint: FingerprintSchema.optional(),
  complete: z.boolean(),
  nodeCount: z.number().int().nonnegative(),
  operationCount: z.number().int().nonnegative(),
  diagnosticCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  diagnostics: z.array(
    z.strictObject({
      code: z.string().min(1),
      severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
      message: z.string().min(1),
      entityId: z.string().min(1).optional(),
      recoverable: z.boolean(),
    }),
  ),
});

export const ReconstructionReportSchema = z.strictObject({
  id: z.string().regex(/^reconstruction-report:[0-9a-f]{32}$/),
  reportVersion: z.literal(RECONSTRUCTION_REPORT_VERSION),
  reportInputFingerprint: FingerprintSchema,
  createdAt: IsoDateSchema,
  taskId: z.string().min(1),
  analysisId: z.string().min(1),
  proposalId: z.string().min(1).optional(),
  projectId: EntityIdSchema,
  documentId: EntityIdSchema.optional(),
  sourceAssetId: EntityIdSchema,
  sourceDimensions: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
  qualityMode: ReconstructionQualityModeSchema,
  analyzers: z.array(z.strictObject({ id: z.string().min(1), version: z.string().min(1) })),
  counts: z.strictObject({
    regions: z.number().int().nonnegative(),
    proposedNodes: z.number().int().nonnegative(),
    appliedNodes: z.number().int().nonnegative(),
    textCandidates: z.number().int().nonnegative(),
    imageCandidates: z.number().int().nonnegative(),
    shapeCandidates: z.number().int().nonnegative(),
    componentCandidates: z.number().int().nonnegative(),
    tokenCandidates: z.number().int().nonnegative(),
  }),
  confidenceSummary: ReconstructionConfidenceSummarySchema,
  diagnostics: z.array(ReconstructionDiagnosticSchema),
  fallbacks: z.array(ReconstructionFallbackSchema),
  unresolvedIssues: z.array(ReconstructionIssueSchema),
  transaction: z
    .strictObject({
      transactionId: z.string().min(1),
      commandIds: z.array(z.string().min(1)),
      previousDocumentVersion: z.number().int().positive().optional(),
      resultingDocumentVersion: z.number().int().positive(),
      createdEntityIds: z.array(EntityIdSchema),
    })
    .optional(),
  sceneProjection: ReconstructionVerificationSummarySchema,
  renderGraph: ReconstructionVerificationSummarySchema,
  stages: z.array(ReconstructionStageRecordSchema),
  completionStatus: ReconstructionCompletionStatusSchema,
});

export const ReconstructionConfigurationSchema = z.strictObject({
  maxSourceWidth: z.number().int().positive().default(32_768),
  maxSourceHeight: z.number().int().positive().default(32_768),
  maxSourceBytes: z
    .number()
    .int()
    .positive()
    .default(100 * 1024 * 1024),
  maxRegions: z.number().int().positive().default(5_000),
  maxProposalNodes: z.number().int().positive().default(10_000),
  maxHierarchyDepth: z.number().int().positive().default(100),
  maxComponentCandidates: z.number().int().positive().default(1_000),
  maxTokenCandidates: z.number().int().positive().default(1_000),
  maxDiagnostics: z.number().int().positive().default(2_000),
  strictMode: z.boolean().default(true),
  diagnostics: z.boolean().default(true),
  enableComponentInference: z.boolean().default(true),
  enableTokenInference: z.boolean().default(true),
  allowRasterFallback: z.boolean().default(true),
});

export const ReconstructionManifestRegionSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  category: RegionCategorySchema,
  bounds: z.strictObject({
    x: NonNegativeSchema,
    y: NonNegativeSchema,
    width: NonNegativeSchema,
    height: NonNegativeSchema,
  }),
  parentKey: z.string().min(1).optional(),
  confidence: UnitIntervalSchema,
  zOrder: z.number().int().default(0),
  semanticHints: z.array(z.string().min(1)).default([]),
  visualFeatures: JsonObjectSchema.default({}),
  text: z
    .strictObject({
      content: z.string().optional(),
      fontFamily: z.string().min(1).default("AEVUM Unknown"),
      fontSize: z.number().finite().positive().default(16),
      fontWeight: z.number().int().min(1).max(1000).default(400),
      alignment: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFY"]).default("LEFT"),
      direction: z.enum(["LTR", "RTL", "AUTO"]).default("AUTO"),
      color: JsonObjectSchema.optional(),
    })
    .optional(),
  image: z
    .strictObject({
      assetId: EntityIdSchema.optional(),
      fit: z.enum(["FILL", "CONTAIN", "COVER", "NONE", "SCALE_DOWN"]).default("COVER"),
      extracted: z.boolean().default(false),
    })
    .optional(),
  shape: z
    .strictObject({
      shapeType: z.enum(["RECTANGLE", "ELLIPSE", "POLYGON", "LINE", "CUSTOM"]),
      geometry: JsonObjectSchema.default({}),
      fill: JsonObjectSchema.optional(),
      stroke: JsonObjectSchema.optional(),
      cornerRadius: NonNegativeSchema.optional(),
    })
    .optional(),
  layout: z
    .strictObject({
      type: z.enum(["ABSOLUTE", "VERTICAL_STACK", "HORIZONTAL_ROW", "GRID"]),
      gap: NonNegativeSchema.optional(),
      padding: NonNegativeSchema.optional(),
      alignment: z.enum(["START", "CENTER", "END", "STRETCH"]).optional(),
      columns: z.number().int().positive().optional(),
      confidence: UnitIntervalSchema,
    })
    .optional(),
  repetitionKey: z.string().min(1).optional(),
});

export const ReconstructionManifestSchema = z.strictObject({
  manifestVersion: z.literal("1.0.0"),
  referenceType: z.enum(["WEBSITE_SCREENSHOT", "UI_SCREENSHOT", "LANDING_PAGE", "POSTER", "STATIC_2D"]),
  regions: z.array(ReconstructionManifestRegionSchema),
});

export type ReconstructionTask = z.infer<typeof ReconstructionTaskSchema>;
export type ReconstructionTaskInput = Omit<z.input<typeof ReconstructionTaskSchema>, "id" | "taskVersion"> & {
  readonly id?: string;
  readonly taskVersion?: typeof RECONSTRUCTION_TASK_VERSION;
};
export type ReconstructionViewport = z.infer<typeof ReconstructionViewportSchema>;
export type ReconstructionConfiguration = z.infer<typeof ReconstructionConfigurationSchema>;
export type ReconstructionDiagnostic = z.infer<typeof ReconstructionDiagnosticSchema>;
export type ReconstructionDiagnosticCode = z.infer<typeof ReconstructionDiagnosticCodeSchema>;
export type ReferenceBounds = z.infer<typeof ReferenceBoundsSchema>;
export type DetectedRegion = z.infer<typeof DetectedRegionSchema>;
export type TextCandidate = z.infer<typeof TextCandidateSchema>;
export type AssetCandidate = z.infer<typeof AssetCandidateSchema>;
export type ShapeCandidate = z.infer<typeof ShapeCandidateSchema>;
export type LayoutCandidate = z.infer<typeof LayoutCandidateSchema>;
export type ComponentCandidate = z.infer<typeof ComponentCandidateSchema>;
export type TokenCandidate = z.infer<typeof TokenCandidateSchema>;
export type ReconstructionConfidenceSummary = z.infer<typeof ReconstructionConfidenceSummarySchema>;
export type ReconstructionProvenance = z.infer<typeof ReconstructionProvenanceSchema>;
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>;
export type ReconstructionManifest = z.infer<typeof ReconstructionManifestSchema>;
export type ReconstructionManifestRegion = z.infer<typeof ReconstructionManifestRegionSchema>;
export type ProposedNode = z.infer<typeof ProposedNodeSchema>;
export type ProposedCommandPlan = z.infer<typeof ProposedCommandPlanSchema>;
export type ReconstructionProposal = z.infer<typeof ReconstructionProposalSchema>;
export type ReconstructionFallback = z.infer<typeof ReconstructionFallbackSchema>;
export type ReconstructionIssue = z.infer<typeof ReconstructionIssueSchema>;
export type ReconstructionCompletionStatus = z.infer<typeof ReconstructionCompletionStatusSchema>;
export type ReconstructionStageRecord = z.infer<typeof ReconstructionStageRecordSchema>;
export type ReconstructionVerificationSummary = z.infer<typeof ReconstructionVerificationSummarySchema>;
export type ReconstructionReport = z.infer<typeof ReconstructionReportSchema>;
