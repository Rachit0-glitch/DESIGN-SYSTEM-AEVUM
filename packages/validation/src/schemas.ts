import { ActorRefSchema, DesignNodeSchema, EntityIdSchema } from "@aevum/document-model";
import { z } from "zod";

export const VALIDATION_TASK_VERSION = "1.0.0" as const;
export const VALIDATION_REFERENCE_VERSION = "1.0.0" as const;
export const VALIDATION_REPORT_VERSION = "1.0.0" as const;
export const CORRECTION_PLAN_VERSION = "1.0.0" as const;
export const HEATMAP_VERSION = "1.0.0" as const;

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

export const ValidationThresholdProfileNameSchema = z.enum(["DRAFT", "STANDARD", "HIGH_QUALITY", "PIXEL_PERFECT"]);
export const ValidationMetricSchema = z.enum([
  "LAYOUT",
  "POSITION",
  "SIZE",
  "TYPOGRAPHY",
  "COLOR",
  "BORDER",
  "RADIUS",
  "SHADOW",
  "GRADIENT",
  "IMAGE",
  "ASSET",
  "VISIBILITY",
  "OPACITY",
  "HIERARCHY",
  "COMPONENT",
  "TOKEN",
  "CONSTRAINT",
  "PAINT_ORDER",
  "RENDER_GRAPH",
  "RASTER",
]);

export const ValidationThresholdProfileSchema = z.strictObject({
  name: ValidationThresholdProfileNameSchema,
  version: z.literal("1.0.0"),
  tolerances: z.strictObject({
    positionPx: NonNegativeSchema,
    sizePx: NonNegativeSchema,
    fontSizePx: NonNegativeSchema,
    spacingPx: NonNegativeSchema,
    colorDelta: UnitIntervalSchema,
    opacityDelta: UnitIntervalSchema,
    rasterMeanAbsoluteError: UnitIntervalSchema,
  }),
  minimumScores: z.strictObject({
    overall: UnitIntervalSchema,
    region: UnitIntervalSchema,
    worstRegion: UnitIntervalSchema,
    layout: UnitIntervalSchema,
    typography: UnitIntervalSchema,
    asset: UnitIntervalSchema,
    component: UnitIntervalSchema,
    structure: UnitIntervalSchema,
    raster: UnitIntervalSchema,
  }),
  warningsAllowed: z.boolean(),
  exact: z.boolean(),
});

export const ValidationViewportSchema = z.strictObject({
  id: EntityIdSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().finite().positive(),
  category: z.enum(["DESKTOP", "TABLET", "MOBILE", "CUSTOM"]),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
  reducedMotion: z.boolean().default(false),
});

export const ValidationTaskSchema = z.strictObject({
  id: z.string().regex(/^validation-task:[0-9a-f]{32}$/),
  taskVersion: z.literal(VALIDATION_TASK_VERSION),
  projectId: EntityIdSchema,
  documentId: EntityIdSchema,
  documentVersion: z.number().int().positive(),
  referenceId: EntityIdSchema,
  sourceAssetId: EntityIdSchema,
  referenceAnalysisId: z.string().min(1).optional(),
  viewport: ValidationViewportSchema,
  rendererVersion: z.string().min(1),
  projectionFingerprint: FingerprintSchema,
  renderGraphFingerprint: FingerprintSchema,
  qualityMode: z.enum(["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]),
  thresholdProfile: ValidationThresholdProfileNameSchema,
  requestedMetrics: z.array(ValidationMetricSchema).min(1),
  deterministicSeed: z.number().int().nonnegative(),
  createdAt: IsoDateSchema,
  createdBy: ActorRefSchema,
});

export const ValidationBoundsSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  width: NonNegativeSchema,
  height: NonNegativeSchema,
});

export const RasterDescriptorSchema = z.strictObject({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  channels: z.literal(4),
  checksum: FingerprintSchema,
  colorSpace: z.enum(["SRGB", "LINEAR_SRGB", "DISPLAY_P3"]).default("SRGB"),
});

export const ValidationReferenceRegionSchema = z.strictObject({
  id: z.string().min(1),
  sourceRegionId: z.string().min(1),
  sourceNodeId: EntityIdSchema,
  sourceAssetId: EntityIdSchema,
  parentRegionId: z.string().min(1).optional(),
  category: z.string().min(1),
  bounds: ValidationBoundsSchema,
  expectedNode: DesignNodeSchema,
  expectedVisual: JsonObjectSchema.default({}),
  priority: z.boolean().default(false),
  confidence: UnitIntervalSchema,
});

export const ValidationReferenceSnapshotSchema = z.strictObject({
  id: z.string().regex(/^validation-reference:[0-9a-f]{32}$/),
  referenceVersion: z.literal(VALIDATION_REFERENCE_VERSION),
  referenceId: EntityIdSchema,
  sourceAssetId: EntityIdSchema,
  sourceDimensions: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
  regions: z.array(ValidationReferenceRegionSchema).min(1),
  expectedComponentIds: z.array(EntityIdSchema),
  expectedTokenIds: z.array(EntityIdSchema),
  expectedPaintOrderNodeIds: z.array(EntityIdSchema),
  raster: RasterDescriptorSchema.optional(),
  snapshotFingerprint: FingerprintSchema,
});

export const ValidationDifferenceSeveritySchema = z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]);
export const ValidationCorrectionKindSchema = z.enum([
  "ADJUST_POSITION",
  "ADJUST_SIZE",
  "ADJUST_TYPOGRAPHY",
  "ADJUST_COLOR",
  "ADJUST_BORDER",
  "ADJUST_RADIUS",
  "ADJUST_SHADOW",
  "ADJUST_GRADIENT",
  "REPLACE_ASSET",
  "ADJUST_VISIBILITY",
  "ADJUST_OPACITY",
  "REPAIR_HIERARCHY",
  "REPAIR_CONSTRAINT",
  "REORDER_NODE",
  "HUMAN_REVIEW",
]);

export const ValidationDifferenceSchema = z.strictObject({
  id: z.string().regex(/^difference:[0-9a-f]{32}$/),
  metric: ValidationMetricSchema,
  sourceNodeId: EntityIdSchema,
  regionId: z.string().min(1),
  property: z.string().min(1),
  expectedValue: JsonValueSchema,
  actualValue: JsonValueSchema,
  severity: ValidationDifferenceSeveritySchema,
  confidence: UnitIntervalSchema,
  score: UnitIntervalSchema,
  threshold: NonNegativeSchema,
  correctionKind: ValidationCorrectionKindSchema,
  message: z.string().min(1),
});

export const ValidationMetricResultSchema = z.strictObject({
  metric: ValidationMetricSchema,
  score: UnitIntervalSchema,
  threshold: UnitIntervalSchema,
  applicable: z.boolean(),
  passed: z.boolean(),
});

export const ValidationRegionResultSchema = z.strictObject({
  regionId: z.string().min(1),
  sourceNodeId: EntityIdSchema,
  score: UnitIntervalSchema,
  status: z.enum(["PASS", "WARN", "FAIL"]),
  metrics: z.array(ValidationMetricResultSchema),
  differenceIds: z.array(z.string().min(1)),
});

export const StructuralValidationResultSchema = z.strictObject({
  score: UnitIntervalSchema,
  hierarchyScore: UnitIntervalSchema,
  componentScore: UnitIntervalSchema,
  tokenScore: UnitIntervalSchema,
  constraintScore: UnitIntervalSchema,
  paintOrderScore: UnitIntervalSchema,
  renderGraphScore: UnitIntervalSchema,
  differenceIds: z.array(z.string().min(1)),
});

export const RasterComparisonResultSchema = z.strictObject({
  adapterId: z.string().min(1),
  adapterVersion: z.string().min(1),
  score: UnitIntervalSchema,
  meanAbsoluteError: UnitIntervalSchema,
  checksumMatch: z.boolean(),
  comparedPixels: z.number().int().nonnegative(),
  placeholder: z.boolean(),
  diagnostics: z.array(z.string().min(1)),
});

export const HeatmapCellSchema = z.strictObject({
  x: NonNegativeSchema,
  y: NonNegativeSchema,
  width: NonNegativeSchema,
  height: NonNegativeSchema,
  intensity: UnitIntervalSchema,
  regionId: z.string().min(1).optional(),
  sourceNodeId: EntityIdSchema.optional(),
});

export const ValidationHeatmapSchema = z.strictObject({
  id: z.string().regex(/^heatmap:[0-9a-f]{32}$/),
  heatmapVersion: z.literal(HEATMAP_VERSION),
  type: z.enum(["RAW_DIFFERENCE", "LAYOUT", "TYPOGRAPHY", "COLOR", "ASSET"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cells: z.array(HeatmapCellSchema),
  legend: z.strictObject({ minimum: z.literal(0), maximum: z.literal(1), label: z.string().min(1) }),
  placeholder: z.boolean(),
  fingerprint: FingerprintSchema,
});

export const ValidationDiagnosticSchema = z.strictObject({
  code: z.enum([
    "INVALID_INPUT",
    "REFERENCE_MISSING",
    "NODE_MISSING",
    "RASTER_UNAVAILABLE",
    "RASTER_MISMATCH",
    "UNSUPPORTED_COMPARISON",
    "THRESHOLD_FAILED",
    "CANCELLED",
  ]),
  severity: ValidationDifferenceSeveritySchema,
  message: z.string().min(1),
  regionId: z.string().min(1).optional(),
  sourceNodeId: EntityIdSchema.optional(),
  recoverable: z.boolean(),
});

export const CorrectionSuggestionSchema = z.strictObject({
  id: z.string().regex(/^correction:[0-9a-f]{32}$/),
  differenceId: z.string().min(1),
  sourceNodeId: EntityIdSchema,
  commandType: z.literal("node.update"),
  payload: z.strictObject({ nodeId: EntityIdSchema, changes: JsonObjectSchema }),
  property: z.string().min(1),
  expectedImpact: UnitIntervalSchema,
  confidence: UnitIntervalSchema,
  rationale: z.string().min(1),
  requiresReview: z.boolean(),
});

export const ValidationCorrectionPlanSchema = z.strictObject({
  id: z.string().regex(/^correction-plan:[0-9a-f]{32}$/),
  planVersion: z.literal(CORRECTION_PLAN_VERSION),
  validationTaskId: z.string().min(1),
  documentId: EntityIdSchema,
  expectedDocumentVersion: z.number().int().positive(),
  executable: z.literal(false),
  requiresCommandEngine: z.literal(true),
  suggestions: z.array(CorrectionSuggestionSchema),
  fingerprint: FingerprintSchema,
});

export const ValidationScoreSummarySchema = z.strictObject({
  overall: UnitIntervalSchema,
  layout: UnitIntervalSchema,
  typography: UnitIntervalSchema,
  asset: UnitIntervalSchema,
  component: UnitIntervalSchema,
  structure: UnitIntervalSchema,
  raster: UnitIntervalSchema,
  worstRegion: UnitIntervalSchema,
});

export const ValidationReportSchema = z.strictObject({
  id: z.string().regex(/^validation-report:[0-9a-f]{32}$/),
  reportVersion: z.literal(VALIDATION_REPORT_VERSION),
  reportInputFingerprint: FingerprintSchema,
  taskId: z.string().min(1),
  projectId: EntityIdSchema,
  documentId: EntityIdSchema,
  documentVersion: z.number().int().positive(),
  referenceId: EntityIdSchema,
  sourceAssetId: EntityIdSchema,
  viewport: ValidationViewportSchema,
  rendererVersion: z.string().min(1),
  projectionFingerprint: FingerprintSchema,
  renderGraphFingerprint: FingerprintSchema,
  thresholdProfile: ValidationThresholdProfileSchema,
  scores: ValidationScoreSummarySchema,
  regions: z.array(ValidationRegionResultSchema),
  structural: StructuralValidationResultSchema,
  raster: RasterComparisonResultSchema,
  differences: z.array(ValidationDifferenceSchema),
  diagnostics: z.array(ValidationDiagnosticSchema),
  heatmaps: z.array(ValidationHeatmapSchema),
  correctionPlan: ValidationCorrectionPlanSchema,
  status: z.enum(["PASS", "WARN", "FAIL"]),
  createdAt: IsoDateSchema,
});

export type ValidationTask = z.infer<typeof ValidationTaskSchema>;
export type ValidationTaskInput = Omit<z.input<typeof ValidationTaskSchema>, "id" | "taskVersion"> & {
  readonly id?: string;
};
export type ValidationThresholdProfileName = z.infer<typeof ValidationThresholdProfileNameSchema>;
export type ValidationThresholdProfile = z.infer<typeof ValidationThresholdProfileSchema>;
export type ValidationMetric = z.infer<typeof ValidationMetricSchema>;
export type ValidationReferenceRegion = z.infer<typeof ValidationReferenceRegionSchema>;
export type ValidationReferenceSnapshot = z.infer<typeof ValidationReferenceSnapshotSchema>;
export type ValidationDifference = z.infer<typeof ValidationDifferenceSchema>;
export type ValidationCorrectionKind = z.infer<typeof ValidationCorrectionKindSchema>;
export type ValidationRegionResult = z.infer<typeof ValidationRegionResultSchema>;
export type StructuralValidationResult = z.infer<typeof StructuralValidationResultSchema>;
export type RasterDescriptor = z.infer<typeof RasterDescriptorSchema>;
export type RasterComparisonResult = z.infer<typeof RasterComparisonResultSchema>;
export type ValidationHeatmap = z.infer<typeof ValidationHeatmapSchema>;
export type ValidationDiagnostic = z.infer<typeof ValidationDiagnosticSchema>;
export type ValidationCorrectionPlan = z.infer<typeof ValidationCorrectionPlanSchema>;
export type ValidationScoreSummary = z.infer<typeof ValidationScoreSummarySchema>;
export type ValidationReport = z.infer<typeof ValidationReportSchema>;
