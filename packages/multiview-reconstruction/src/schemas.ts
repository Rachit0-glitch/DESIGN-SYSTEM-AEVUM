import {
  ActorRefSchema,
  CoordinateSystem3DSchema,
  EntityIdSchema,
  JsonValueSchema,
  QuaternionSchema,
  Vector3Schema,
} from "@aevum/document-model";
import { z } from "zod";

export const MULTIVIEW_TASK_VERSION = "1.0.0" as const;
export const MULTIVIEW_REFERENCE_SET_VERSION = "1.0.0" as const;
export const MULTIVIEW_PROPOSAL_VERSION = "1.0.0" as const;
export const MULTIVIEW_REPORT_VERSION = "1.0.0" as const;

const IsoDateSchema = z.iso.datetime({ offset: true });
export const UnitIntervalSchema = z.number().finite().min(0).max(1);
const FingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const ScopedIdSchema = (scope: string) => z.string().regex(new RegExp(`^${scope}:[0-9a-f]{32}$`));
const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
export const Normalized2DSchema = z.strictObject({ x: UnitIntervalSchema, y: UnitIntervalSchema });
export type Normalized2D = z.infer<typeof Normalized2DSchema>;

// ---------------------------------------------------------------------------
// Confidence, provenance, diagnostics
// ---------------------------------------------------------------------------

export const ConfidenceLabelSchema = z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
export const ConfidenceValueSchema = z.strictObject({ score: UnitIntervalSchema, label: ConfidenceLabelSchema });

export const ProvenanceSourceSchema = z.enum([
  "USER",
  "MANIFEST",
  "DETERMINISTIC_ANALYZER",
  "VISION_PROVIDER",
  "CAMERA_ESTIMATOR",
  "RECONSTRUCTION_PROVIDER",
]);
export const ProvenanceSchema = z.strictObject({
  source: ProvenanceSourceSchema,
  provider: z.string().min(1),
  providerVersion: z.string().min(1),
  timestamp: IsoDateSchema.optional(),
  sourceViewId: z.string().min(1).optional(),
  sourceAssetId: EntityIdSchema.optional(),
  confidence: UnitIntervalSchema,
});

export const MultiViewDiagnosticCodeSchema = z.enum([
  "ASSET_NOT_FOUND",
  "ASSET_INVALID_TYPE",
  "RESOURCE_LIMIT_EXCEEDED",
  "VIEW_ROLE_AMBIGUOUS",
  "VIEW_DUPLICATE",
  "VIEW_COVERAGE_INSUFFICIENT",
  "CAMERA_UNKNOWN",
  "CAMERA_ESTIMATE_LOW_CONFIDENCE",
  "CAMERA_CONFLICT",
  "LANDMARK_INSUFFICIENT_OBSERVATIONS",
  "LANDMARK_CONFLICT",
  "LANDMARK_REPROJECTION_ERROR_HIGH",
  "SILHOUETTE_MISSING",
  "SILHOUETTE_CONFLICT",
  "PART_CORRESPONDENCE_AMBIGUOUS",
  "PART_OCCLUDED",
  "SCALE_UNKNOWN",
  "SCALE_CONFLICT",
  "SYMMETRY_CONFLICT",
  "INSUFFICIENT_DEPTH_EVIDENCE",
  "RECONSTRUCTION_NOT_READY",
]);
export const MultiViewDiagnosticSchema = z.strictObject({
  code: MultiViewDiagnosticCodeSchema,
  severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
  message: z.string().min(1),
  stage: z.string().min(1),
  relatedIds: z.array(z.string().min(1)),
  path: z.string().min(1).optional(),
  recoverable: z.boolean(),
  details: JsonObjectSchema,
});

// ---------------------------------------------------------------------------
// View roles
// ---------------------------------------------------------------------------

export const ViewRoleSchema = z.enum([
  "FRONT",
  "BACK",
  "LEFT",
  "RIGHT",
  "TOP",
  "BOTTOM",
  "THREE_QUARTER_FRONT_LEFT",
  "THREE_QUARTER_FRONT_RIGHT",
  "THREE_QUARTER_BACK_LEFT",
  "THREE_QUARTER_BACK_RIGHT",
  "DETAIL",
  "UNKNOWN",
]);
export const ViewRoleMethodSchema = z.enum([
  "USER_PROVIDED",
  "INFERRED_FROM_METADATA",
  "INFERRED_FROM_HINT",
  "UNKNOWN",
]);
export const ViewRoleClassificationSchema = z.strictObject({
  role: ViewRoleSchema,
  confidence: UnitIntervalSchema,
  evidence: z.array(z.string().min(1)),
  method: ViewRoleMethodSchema,
  overriddenRole: ViewRoleSchema.optional(),
});

// ---------------------------------------------------------------------------
// Camera model
// ---------------------------------------------------------------------------

export const ProjectionTypeSchema = z.enum(["PERSPECTIVE", "ORTHOGRAPHIC", "WEAK_PERSPECTIVE", "UNKNOWN"]);
export const CameraIntrinsicsSchema = z.strictObject({
  focalLengthPx: z.number().finite().positive().optional(),
  verticalFieldOfView: z.number().finite().positive().max(Math.PI).optional(),
  principalPoint: Normalized2DSchema.optional(),
  aspectRatio: z.number().finite().positive().optional(),
  sensorAssumption: z.string().min(1).optional(),
  confidence: UnitIntervalSchema,
});
export const CameraExtrinsicsSchema = z.strictObject({
  position: Vector3Schema.optional(),
  rotation: QuaternionSchema.optional(),
  target: Vector3Schema.optional(),
  upVector: Vector3Schema.optional(),
  confidence: UnitIntervalSchema,
});
export const CameraEstimateMethodSchema = z.enum(["USER_PROVIDED", "ROLE_ASSUMED_TURNTABLE", "UNKNOWN"]);
export const CameraEstimateSchema = z.strictObject({
  id: ScopedIdSchema("camera-estimate"),
  viewId: z.string().min(1),
  projection: ProjectionTypeSchema,
  intrinsics: CameraIntrinsicsSchema,
  extrinsics: CameraExtrinsicsSchema,
  confidence: UnitIntervalSchema,
  method: CameraEstimateMethodSchema,
  provenance: ProvenanceSchema,
  diagnostics: z.array(MultiViewDiagnosticSchema),
});

// ---------------------------------------------------------------------------
// Silhouette evidence
// ---------------------------------------------------------------------------

export const SilhouetteMethodSchema = z.enum(["MANIFEST_PROVIDED", "DETERMINISTIC_FIXTURE", "UNKNOWN"]);
export const SilhouetteEvidenceSchema = z.strictObject({
  id: ScopedIdSchema("silhouette"),
  viewId: z.string().min(1),
  provider: z.string().min(1),
  providerVersion: z.string().min(1),
  method: SilhouetteMethodSchema,
  contour: z.array(Normalized2DSchema).min(3).max(256),
  bounds: z.strictObject({
    minX: UnitIntervalSchema,
    minY: UnitIntervalSchema,
    maxX: UnitIntervalSchema,
    maxY: UnitIntervalSchema,
  }),
  centroid: Normalized2DSchema,
  areaRatio: UnitIntervalSchema,
  aspectRatio: z.number().finite().positive(),
  confidence: UnitIntervalSchema,
});

// ---------------------------------------------------------------------------
// View record
// ---------------------------------------------------------------------------

export const ViewOrientationSchema = z.enum(["LANDSCAPE", "PORTRAIT", "SQUARE"]);
export const ViewRecordSchema = z.strictObject({
  id: ScopedIdSchema("view"),
  assetId: EntityIdSchema,
  role: ViewRoleClassificationSchema,
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  orientation: ViewOrientationSchema,
  cameraEstimate: CameraEstimateSchema.optional(),
  silhouette: SilhouetteEvidenceSchema.optional(),
  provenance: ProvenanceSchema,
});

// ---------------------------------------------------------------------------
// Landmarks and cross-view correspondence
// ---------------------------------------------------------------------------

export const LandmarkVisibilitySchema = z.enum(["VISIBLE", "PARTIAL", "OCCLUDED", "OUT_OF_FRAME", "UNKNOWN"]);
export const LandmarkObservationSchema = z.strictObject({
  viewId: z.string().min(1),
  normalized: Normalized2DSchema,
  pixel: z.strictObject({ x: z.number().finite(), y: z.number().finite() }).optional(),
  visibility: LandmarkVisibilitySchema,
  confidence: UnitIntervalSchema,
  source: ProvenanceSourceSchema,
});
export const LandmarkSchema = z.strictObject({
  id: ScopedIdSchema("landmark"),
  semanticLabel: z.string().min(1).optional(),
  observations: z.array(LandmarkObservationSchema).min(1),
  confidence: UnitIntervalSchema,
  estimated3D: Vector3Schema.optional(),
  reprojectionError: z.number().finite().nonnegative().optional(),
  provenance: ProvenanceSchema,
});
export const CrossViewCorrespondenceSchema = z.strictObject({
  landmarkId: ScopedIdSchema("landmark"),
  viewIds: z.array(z.string().min(1)).min(1),
  consistent: z.boolean(),
  reprojectionError: z.number().finite().nonnegative().optional(),
  diagnostics: z.array(MultiViewDiagnosticSchema),
});

// ---------------------------------------------------------------------------
// Part evidence
// ---------------------------------------------------------------------------

export const PartVisibilitySchema = z.enum([
  "VISIBLE",
  "PARTIALLY_OCCLUDED",
  "FULLY_OCCLUDED",
  "SELF_OCCLUDED",
  "OUT_OF_FRAME",
  "UNKNOWN",
]);
export const PartObservationSchema = z.strictObject({
  viewId: z.string().min(1),
  bounds: z.strictObject({
    minX: UnitIntervalSchema,
    minY: UnitIntervalSchema,
    maxX: UnitIntervalSchema,
    maxY: UnitIntervalSchema,
  }),
  silhouetteId: ScopedIdSchema("silhouette").optional(),
  visibility: PartVisibilitySchema,
  confidence: UnitIntervalSchema,
  landmarkIds: z.array(ScopedIdSchema("landmark")),
});
export const PartSchema = z.strictObject({
  id: ScopedIdSchema("part"),
  label: z.string().min(1),
  observations: z.array(PartObservationSchema).min(1),
  correspondenceConfidence: UnitIntervalSchema,
  provenance: ProvenanceSchema,
});

// ---------------------------------------------------------------------------
// Scale evidence and geometric constraints
// ---------------------------------------------------------------------------

export const ScaleUnitSchema = z.enum(["MM", "CM", "M", "IN", "FT"]);
export const ScaleEvidenceSourceSchema = z.enum([
  "USER_PROVIDED",
  "KNOWN_SPECIFICATION",
  "REFERENCE_OBJECT",
  "INFERRED",
]);
export const ScaleEvidenceSchema = z.strictObject({
  id: ScopedIdSchema("scale-evidence"),
  source: ScaleEvidenceSourceSchema,
  value: z.number().finite().positive(),
  unit: ScaleUnitSchema,
  description: z.string().min(1).optional(),
  confidence: UnitIntervalSchema,
});

export const GeometricConstraintTypeSchema = z.enum([
  "DISTANCE",
  "RATIO",
  "ALIGNMENT",
  "SYMMETRY",
  "COPLANAR",
  "PARALLEL",
  "PERPENDICULAR",
  "SHARED_AXIS",
  "RADIAL",
  "BOUNDING_DIMENSION",
]);
export const GeometricConstraintSchema = z.strictObject({
  id: ScopedIdSchema("constraint"),
  type: GeometricConstraintTypeSchema,
  entityIds: z.array(z.string().min(1)).min(1),
  value: z.number().finite().optional(),
  unit: ScaleUnitSchema.optional(),
  tolerance: z.number().finite().nonnegative().optional(),
  confidence: UnitIntervalSchema,
  description: z.string().min(1),
  details: JsonObjectSchema,
  provenance: ProvenanceSchema,
});

// ---------------------------------------------------------------------------
// Coverage and readiness
// ---------------------------------------------------------------------------

export const CoverageDirectionSchema = z.enum(["FRONT", "BACK", "LEFT", "RIGHT", "TOP", "BOTTOM"]);
export const CoverageStatusSchema = z.enum(["COVERED", "WEAK", "MISSING"]);
export const DirectionCoverageSchema = z.strictObject({
  status: CoverageStatusSchema,
  confidence: UnitIntervalSchema,
  viewIds: z.array(z.string().min(1)),
});
export const CoverageReportSchema = z.strictObject({
  id: ScopedIdSchema("coverage"),
  directions: z.record(CoverageDirectionSchema, DirectionCoverageSchema),
  diversityScore: UnitIntervalSchema,
  overallScore: UnitIntervalSchema,
});

export const ReconstructionReadinessSchema = z.enum(["INSUFFICIENT", "WEAK", "USABLE", "STRONG", "EXCELLENT"]);
export const ReadinessFactorsSchema = z.strictObject({
  viewCount: UnitIntervalSchema,
  viewDiversity: UnitIntervalSchema,
  cameraConfidence: UnitIntervalSchema,
  landmarkCoverage: UnitIntervalSchema,
  silhouetteCoverage: UnitIntervalSchema,
  partCorrespondence: UnitIntervalSchema,
  scaleEvidence: UnitIntervalSchema,
  crossViewConsistency: UnitIntervalSchema,
});
export const ReadinessAssessmentSchema = z.strictObject({
  id: ScopedIdSchema("readiness"),
  classification: ReconstructionReadinessSchema,
  score: UnitIntervalSchema,
  factors: ReadinessFactorsSchema,
  diagnostics: z.array(MultiViewDiagnosticSchema),
});

// ---------------------------------------------------------------------------
// Multi-view task and reference set
// ---------------------------------------------------------------------------

export const MultiViewConfigSchema = z.strictObject({
  maxViews: z.number().int().positive().max(64).default(16),
  maxLandmarks: z.number().int().positive().max(512).default(64),
  maxObservationsPerLandmark: z.number().int().positive().max(64).default(16),
  maxSilhouetteSamples: z.number().int().positive().max(256).default(128),
  maxParts: z.number().int().positive().max(256).default(32),
  maxConstraints: z.number().int().positive().max(256).default(64),
});

export const ViewRoleHintSchema = z.strictObject({
  assetId: EntityIdSchema,
  role: ViewRoleSchema,
  userProvided: z.boolean(),
});
export const LandmarkHintSchema = z.strictObject({
  semanticLabel: z.string().min(1),
  observations: z
    .array(
      z.strictObject({
        assetId: EntityIdSchema,
        normalized: Normalized2DSchema,
        visibility: LandmarkVisibilitySchema.optional(),
      }),
    )
    .min(1),
});
export const PartHintSchema = z.strictObject({
  label: z.string().min(1),
  observations: z
    .array(
      z.strictObject({
        assetId: EntityIdSchema,
        bounds: z.strictObject({
          minX: UnitIntervalSchema,
          minY: UnitIntervalSchema,
          maxX: UnitIntervalSchema,
          maxY: UnitIntervalSchema,
        }),
        visibility: PartVisibilitySchema.optional(),
      }),
    )
    .min(1),
});

export const MultiViewInputViewSchema = z.strictObject({
  assetId: EntityIdSchema,
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  silhouetteContour: z.array(Normalized2DSchema).min(3).max(256).optional(),
});

export const MultiViewTaskSchema = z
  .strictObject({
    id: ScopedIdSchema("multiview-task"),
    taskVersion: z.literal(MULTIVIEW_TASK_VERSION),
    projectId: EntityIdSchema,
    subjectLabel: z.string().min(1).optional(),
    subjectCategory: z.string().min(1).optional(),
    views: z.array(MultiViewInputViewSchema).min(1),
    roleHints: z.array(ViewRoleHintSchema),
    landmarkHints: z.array(LandmarkHintSchema),
    partHints: z.array(PartHintSchema),
    scaleHints: z.array(ScaleEvidenceSchema.omit({ id: true })),
    config: MultiViewConfigSchema,
    deterministicSeed: z.number().int().nonnegative(),
    createdAt: IsoDateSchema,
    createdBy: ActorRefSchema,
  })
  .superRefine((task, context) => {
    if (new Set(task.views.map((view) => view.assetId)).size !== task.views.length) {
      context.addIssue({ code: "custom", path: ["views"], message: "Multi-view source asset IDs must be unique." });
    }
    if (task.views.length > task.config.maxViews) {
      context.addIssue({ code: "custom", path: ["views"], message: "View count exceeds the configured maximum." });
    }
  });

export const MultiViewReferenceSetSchema = z.strictObject({
  id: ScopedIdSchema("reference-set"),
  referenceSetVersion: z.literal(MULTIVIEW_REFERENCE_SET_VERSION),
  taskId: ScopedIdSchema("multiview-task"),
  projectId: EntityIdSchema,
  assetIds: z.array(EntityIdSchema).min(1),
  views: z.array(ViewRecordSchema).min(1),
  subject: z.strictObject({
    label: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
  }),
  coordinateConvention: CoordinateSystem3DSchema,
  scaleEvidence: z.array(ScaleEvidenceSchema),
  landmarks: z.array(LandmarkSchema),
  parts: z.array(PartSchema),
  constraints: z.array(GeometricConstraintSchema),
  correspondences: z.array(CrossViewCorrespondenceSchema),
  provenance: ProvenanceSchema,
  diagnostics: z.array(MultiViewDiagnosticSchema),
  fingerprint: FingerprintSchema,
});

// ---------------------------------------------------------------------------
// Reconstruction proposal and provider output
// ---------------------------------------------------------------------------

export const TargetQualitySchema = z.enum(["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]);
export const MultiViewReconstructionProposalSchema = z.strictObject({
  id: ScopedIdSchema("multiview-proposal"),
  proposalVersion: z.literal(MULTIVIEW_PROPOSAL_VERSION),
  taskId: ScopedIdSchema("multiview-task"),
  referenceSetId: ScopedIdSchema("reference-set"),
  viewIds: z.array(z.string().min(1)),
  landmarkIds: z.array(ScopedIdSchema("landmark")),
  partIds: z.array(ScopedIdSchema("part")),
  constraintIds: z.array(ScopedIdSchema("constraint")),
  scaleEvidenceIds: z.array(ScopedIdSchema("scale-evidence")),
  targetQuality: TargetQualitySchema,
  ambiguities: z.array(MultiViewDiagnosticSchema),
  protectedEvidenceIds: z.array(z.string().min(1)),
  readiness: ReadinessAssessmentSchema,
  proposalFingerprint: FingerprintSchema,
});

export const ProviderCandidateSchema = z.strictObject({
  id: z.string().min(1),
  providerId: z.string().min(1),
  providerVersion: z.string().min(1),
  confidence: UnitIntervalSchema,
  candidateAssetId: EntityIdSchema.optional(),
  cameraAssumptions: JsonObjectSchema,
  scaleAssumptions: JsonObjectSchema,
  partMapping: JsonObjectSchema,
  diagnostics: z.array(MultiViewDiagnosticSchema),
  generationProvenance: ProvenanceSchema,
});

// ---------------------------------------------------------------------------
// Cross-view validation and final report
// ---------------------------------------------------------------------------

export const MultiViewValidationStatusSchema = z.enum(["PASS", "WARN", "FAIL"]);
export const MultiViewValidationReportSchema = z.strictObject({
  id: ScopedIdSchema("multiview-validation"),
  referenceSetId: ScopedIdSchema("reference-set"),
  status: MultiViewValidationStatusSchema,
  coverageOk: z.boolean(),
  cameraConsistencyOk: z.boolean(),
  landmarkConsistencyOk: z.boolean(),
  silhouetteConsistencyOk: z.boolean(),
  partCorrespondenceOk: z.boolean(),
  scaleConsistencyOk: z.boolean(),
  constraintConsistencyOk: z.boolean(),
  diagnostics: z.array(MultiViewDiagnosticSchema),
  fingerprint: FingerprintSchema,
});

export const MultiViewReportStatusSchema = z.enum(["READY_FOR_PROPOSAL", "NEEDS_MORE_EVIDENCE", "BLOCKED"]);
export const MultiViewAnalysisReportSchema = z.strictObject({
  id: ScopedIdSchema("multiview-report"),
  reportVersion: z.literal(MULTIVIEW_REPORT_VERSION),
  createdAt: IsoDateSchema,
  taskId: ScopedIdSchema("multiview-task"),
  referenceSetId: ScopedIdSchema("reference-set"),
  viewSummaries: z.array(
    z.strictObject({
      viewId: z.string().min(1),
      assetId: EntityIdSchema,
      role: ViewRoleSchema,
      roleConfidence: UnitIntervalSchema,
    }),
  ),
  coverage: CoverageReportSchema,
  readiness: ReadinessAssessmentSchema,
  validation: MultiViewValidationReportSchema,
  proposal: MultiViewReconstructionProposalSchema,
  diagnostics: z.array(MultiViewDiagnosticSchema),
  status: MultiViewReportStatusSchema,
  reportFingerprint: FingerprintSchema,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfidenceValue = z.infer<typeof ConfidenceValueSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type MultiViewDiagnostic = z.infer<typeof MultiViewDiagnosticSchema>;
export type ViewRoleClassification = z.infer<typeof ViewRoleClassificationSchema>;
export type CameraIntrinsics = z.infer<typeof CameraIntrinsicsSchema>;
export type CameraExtrinsics = z.infer<typeof CameraExtrinsicsSchema>;
export type CameraEstimate = z.infer<typeof CameraEstimateSchema>;
export type SilhouetteEvidence = z.infer<typeof SilhouetteEvidenceSchema>;
export type ViewRecord = z.infer<typeof ViewRecordSchema>;
export type LandmarkObservation = z.infer<typeof LandmarkObservationSchema>;
export type Landmark = z.infer<typeof LandmarkSchema>;
export type CrossViewCorrespondence = z.infer<typeof CrossViewCorrespondenceSchema>;
export type PartObservation = z.infer<typeof PartObservationSchema>;
export type Part = z.infer<typeof PartSchema>;
export type ScaleEvidence = z.infer<typeof ScaleEvidenceSchema>;
export type GeometricConstraint = z.infer<typeof GeometricConstraintSchema>;
export type CoverageReport = z.infer<typeof CoverageReportSchema>;
export type ReadinessAssessment = z.infer<typeof ReadinessAssessmentSchema>;
export type MultiViewConfig = z.infer<typeof MultiViewConfigSchema>;
export type MultiViewInputView = z.infer<typeof MultiViewInputViewSchema>;
export type ViewRoleHint = z.infer<typeof ViewRoleHintSchema>;
export type LandmarkHint = z.infer<typeof LandmarkHintSchema>;
export type PartHint = z.infer<typeof PartHintSchema>;
export type MultiViewTask = z.infer<typeof MultiViewTaskSchema>;
export type MultiViewTaskInput = Omit<z.input<typeof MultiViewTaskSchema>, "id" | "taskVersion"> & {
  readonly id?: string;
};
export type MultiViewReferenceSet = z.infer<typeof MultiViewReferenceSetSchema>;
export type MultiViewReconstructionProposal = z.infer<typeof MultiViewReconstructionProposalSchema>;
export type ProviderCandidate = z.infer<typeof ProviderCandidateSchema>;
export type MultiViewValidationReport = z.infer<typeof MultiViewValidationReportSchema>;
export type MultiViewAnalysisReport = z.infer<typeof MultiViewAnalysisReportSchema>;
