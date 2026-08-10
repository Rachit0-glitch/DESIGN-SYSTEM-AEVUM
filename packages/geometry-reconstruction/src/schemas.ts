import { Bounds3DSchema, EntityIdSchema, QuaternionSchema, Vector3Schema } from "@aevum/document-model";
import { ProvenanceSchema } from "@aevum/multiview-reconstruction";
import { z } from "zod";

export const GEOMETRY_RECONSTRUCTION_SESSION_VERSION = "1.0.0" as const;

const IsoDateSchema = z.iso.datetime({ offset: true });
export const UnitIntervalSchema = z.number().finite().min(0).max(1);
const NonNegativeSchema = z.number().finite().nonnegative();
const FingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const ScopedIdSchema = (scope: string) => z.string().regex(new RegExp(`^${scope}:[0-9a-f]{32}$`));

// ---------------------------------------------------------------------------
// Diagnostics (extends the vocabulary Phase 17 established, does not replace it)
// ---------------------------------------------------------------------------

export const GeometryDiagnosticCodeSchema = z.enum([
  "RECONSTRUCTION_CAMERA_EVIDENCE_INSUFFICIENT",
  "RECONSTRUCTION_BLOCKED",
  "CANDIDATE_REJECTED_INVALID_TOPOLOGY",
  "CANDIDATE_REJECTED_RESOURCE_LIMIT",
  "CANDIDATE_REJECTED_DEGENERATE_GEOMETRY",
  "LANDMARK_NOT_FITTED",
  "PART_FLATTENED_WARNING",
  "SYMMETRY_APPLIED",
  "SCALE_APPLIED",
  "SCALE_RELATIVE_ONLY",
  "CORRECTION_NO_IMPROVEMENT",
  "CORRECTION_REGRESSION_BLOCKED",
  "CORRECTION_TARGET_REACHED",
  "VIEW_REGRESSION_DETECTED",
  "RESOURCE_LIMIT_EXCEEDED",
  "TOPOLOGY_STRUCTURAL_INVALID",
  // Phase 19A: multi-part correction and voxel refinement
  "PART_SILHOUETTE_TOO_LARGE",
  "PART_SILHOUETTE_TOO_SMALL",
  "PART_POSITION_MISMATCH",
  "PART_LANDMARK_MISMATCH",
  "PART_OVERLAP_DETECTED",
  "PART_CORRECTION_NO_IMPROVEMENT",
  "PART_CORRECTION_REGRESSION_BLOCKED",
  "VOXEL_FALSE_POSITIVE_REGION",
  "VOXEL_FALSE_NEGATIVE_REGION",
  "VOXEL_REFINEMENT_NO_IMPROVEMENT",
  "VOXEL_REFINEMENT_REGRESSION_BLOCKED",
  "VOXEL_VOLUME_BOUND_EXCEEDED",
]);
export const GeometryDiagnosticSchema = z.strictObject({
  code: GeometryDiagnosticCodeSchema,
  severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
  message: z.string().min(1),
  stage: z.string().min(1),
  relatedIds: z.array(z.string().min(1)),
  recoverable: z.boolean(),
  details: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------
// Geometry representation
// ---------------------------------------------------------------------------

export const GeometryRepresentationSchema = z.enum(["BOX_PRIMITIVE", "CYLINDER_PRIMITIVE", "VOXEL_HULL"]);
export const QualityModeSchema = z.enum(["DRAFT", "STANDARD", "HIGH"]);
export const ReconstructionProviderIdSchema = z.enum(["LOCAL_BASELINE", "DETERMINISTIC_TEST"]);

export const RawMeshSchema = z
  .strictObject({
    positions: z.array(z.number().finite()),
    normals: z.array(z.number().finite()).optional(),
    indices: z.array(z.number().int().nonnegative()),
  })
  .superRefine((mesh, context) => {
    if (mesh.positions.length % 3 !== 0) {
      context.addIssue({ code: "custom", path: ["positions"], message: "Positions must be flat VEC3 triples." });
    }
    if (mesh.indices.length % 3 !== 0) {
      context.addIssue({ code: "custom", path: ["indices"], message: "Indices must form complete triangles." });
    }
    if (mesh.normals && mesh.normals.length !== mesh.positions.length) {
      context.addIssue({ code: "custom", path: ["normals"], message: "Normals must match position count." });
    }
    const vertexCount = mesh.positions.length / 3;
    if (mesh.indices.some((index) => index >= vertexCount)) {
      context.addIssue({ code: "custom", path: ["indices"], message: "Index references a nonexistent vertex." });
    }
  });

export const PartMeshSchema = z.strictObject({
  partId: z.string().min(1),
  label: z.string().min(1),
  representation: GeometryRepresentationSchema,
  mesh: RawMeshSchema,
  localTransform: z.strictObject({ position: Vector3Schema, rotation: QuaternionSchema }),
});

export const CandidateGeometrySchema = z.strictObject({
  parts: z.array(PartMeshSchema).min(1),
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const ViewFitMetricSchema = z.strictObject({
  viewId: z.string().min(1),
  role: z.string().min(1),
  silhouetteIoU: UnitIntervalSchema,
  silhouettePrecision: UnitIntervalSchema,
  silhouetteRecall: UnitIntervalSchema,
  boundaryDistance: NonNegativeSchema,
  centroidDistance: NonNegativeSchema,
  areaDifference: NonNegativeSchema,
  weight: UnitIntervalSchema,
});

export const LandmarkFitMetricSchema = z.strictObject({
  landmarkId: z.string().min(1),
  distanceToSurface: NonNegativeSchema.optional(),
  fitted: z.boolean(),
  confidence: UnitIntervalSchema,
});

export const CrossViewFitWeightsSchema = z.strictObject({
  silhouette: UnitIntervalSchema,
  landmark: UnitIntervalSchema,
  cameraConsistency: UnitIntervalSchema,
  scale: UnitIntervalSchema,
  constraintSatisfaction: UnitIntervalSchema,
  coverage: UnitIntervalSchema,
  topologyViability: UnitIntervalSchema,
});
export const CrossViewFitScoreSchema = z.strictObject({
  silhouette: UnitIntervalSchema,
  landmark: UnitIntervalSchema,
  cameraConsistency: UnitIntervalSchema,
  scale: UnitIntervalSchema,
  constraintSatisfaction: UnitIntervalSchema,
  coverage: UnitIntervalSchema,
  topologyViability: UnitIntervalSchema,
  overall: UnitIntervalSchema,
  weights: CrossViewFitWeightsSchema,
});

// ---------------------------------------------------------------------------
// Candidate contract
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 19A: per-part scoring
// ---------------------------------------------------------------------------

export const PartScoreSchema = z.strictObject({
  partId: z.string().min(1),
  label: z.string().min(1),
  silhouetteFit: UnitIntervalSchema,
  landmarkFit: UnitIntervalSchema,
  constraintFit: UnitIntervalSchema,
  topologyViability: UnitIntervalSchema,
  overall: UnitIntervalSchema,
  viewScores: z.array(z.strictObject({ viewId: z.string().min(1), iou: UnitIntervalSchema })),
  diagnostics: z.array(GeometryDiagnosticSchema),
});

export const CandidateReconstructionSchema = z.strictObject({
  id: ScopedIdSchema("candidate"),
  taskId: z.string().min(1),
  referenceSetId: z.string().min(1),
  providerId: ReconstructionProviderIdSchema,
  providerVersion: z.string().min(1),
  sourceEvidenceFingerprint: FingerprintSchema,
  generationMethod: GeometryRepresentationSchema,
  geometry: CandidateGeometrySchema,
  bounds: Bounds3DSchema,
  triangleCount: z.number().int().nonnegative(),
  partCount: z.number().int().positive(),
  assetId: EntityIdSchema.optional(),
  assetHash: FingerprintSchema.optional(),
  score: CrossViewFitScoreSchema,
  viewMetrics: z.array(ViewFitMetricSchema),
  landmarkMetrics: z.array(LandmarkFitMetricSchema),
  partScores: z.array(PartScoreSchema),
  diagnostics: z.array(GeometryDiagnosticSchema),
  provenance: ProvenanceSchema,
  fingerprint: FingerprintSchema,
});

// ---------------------------------------------------------------------------
// Passes, difference evidence, provider registry
// ---------------------------------------------------------------------------

export const ReconstructionPassActionSchema = z.enum([
  "INITIAL_GENERATION",
  "ADJUST_BOX_DIMENSION",
  "ADJUST_CYLINDER_DIMENSION",
  "REGENERATE_VOXEL_HULL",
  // Phase 19A
  "PART_TRANSLATE",
  "PART_AXIS_SCALE",
  "PART_REPOSITION_FROM_LANDMARKS",
  "VOXEL_OCCUPANCY_REFINEMENT",
]);
export const ReconstructionPassSchema = z.strictObject({
  id: ScopedIdSchema("reconstruction-pass"),
  passNumber: z.number().int().positive(),
  sessionId: z.string().min(1),
  action: ReconstructionPassActionSchema,
  targetPartId: z.string().min(1).optional(),
  candidateIdBefore: z.string().min(1).optional(),
  candidateIdAfter: z.string().min(1),
  scoreBefore: UnitIntervalSchema.optional(),
  scoreAfter: UnitIntervalSchema,
  accepted: z.boolean(),
  regressedViewIds: z.array(z.string().min(1)),
  regressedPartIds: z.array(z.string().min(1)),
  diagnostics: z.array(GeometryDiagnosticSchema),
  fingerprint: FingerprintSchema,
});

export const DifferenceEvidenceSchema = z.strictObject({
  viewId: z.string().min(1),
  partId: z.string().min(1).optional(),
  falsePositiveAreaRatio: UnitIntervalSchema,
  falseNegativeAreaRatio: UnitIntervalSchema,
  classifications: z.array(GeometryDiagnosticCodeSchema),
  landmarkMismatches: z.array(z.strictObject({ landmarkId: z.string().min(1), errorMagnitude: NonNegativeSchema })),
});

export const ProviderRegistryEntrySchema = z.strictObject({
  id: ReconstructionProviderIdSchema,
  version: z.string().min(1),
  capabilities: z.array(GeometryRepresentationSchema),
  supportedEvidenceTypes: z.array(z.string().min(1)),
  qualityModes: z.array(QualityModeSchema),
  resourceLimits: z.strictObject({
    maxVoxelResolution: z.number().int().positive(),
    maxTriangles: z.number().int().positive(),
    maxCandidates: z.number().int().positive(),
    maxPasses: z.number().int().positive(),
    maxExecutionMs: z.number().int().positive(),
  }),
});

// ---------------------------------------------------------------------------
// Session config and report
// ---------------------------------------------------------------------------

export const ReconstructionConfigSchema = z.strictObject({
  qualityMode: QualityModeSchema.default("STANDARD"),
  maxCandidates: z.number().int().positive().max(8).default(3),
  maxPasses: z.number().int().positive().max(20).default(6),
  targetScore: UnitIntervalSchema.default(0.75),
  voxelResolution: z.number().int().positive().max(64).default(32),
  maxTriangles: z.number().int().positive().max(200_000).default(20_000),
  maxExecutionMs: z.number().int().positive().max(60_000).default(20_000),
  // Phase 19A: bounded multi-part and voxel refinement
  maxPartPasses: z.number().int().positive().max(10).default(4),
  maxVoxelRefinementPasses: z.number().int().positive().max(10).default(3),
  voxelConsensusMinViews: z.number().int().positive().max(16).default(2),
  maxVoxelVolumeChangeRatio: UnitIntervalSchema.default(0.25),
  partOverlapToleranceRatio: UnitIntervalSchema.default(0.15),
});

export const ReconstructionStopReasonSchema = z.enum([
  "TARGET_SCORE_REACHED",
  "NO_IMPROVEMENT",
  "REGRESSION_DETECTED",
  "MAXIMUM_PASSES_REACHED",
  "INSUFFICIENT_EVIDENCE",
  "RESOURCE_LIMIT_REACHED",
]);
export const ReconstructionStatusSchema = z.enum(["BLOCKED", "COMPLETED"]);

export const ReconstructionSessionReportSchema = z.strictObject({
  id: ScopedIdSchema("reconstruction-session"),
  reportVersion: z.literal(GEOMETRY_RECONSTRUCTION_SESSION_VERSION),
  createdAt: IsoDateSchema,
  taskId: z.string().min(1),
  referenceSetId: z.string().min(1),
  providerId: ReconstructionProviderIdSchema,
  providerVersion: z.string().min(1),
  qualityMode: QualityModeSchema,
  status: ReconstructionStatusSchema,
  stopReason: ReconstructionStopReasonSchema,
  candidates: z.array(CandidateReconstructionSchema),
  selectedCandidateId: z.string().min(1).optional(),
  passes: z.array(ReconstructionPassSchema),
  differenceEvidence: z.array(DifferenceEvidenceSchema),
  finalScore: CrossViewFitScoreSchema.optional(),
  resourceUsage: z.strictObject({
    voxelResolution: z.number().int().positive().optional(),
    sampleCount: z.number().int().nonnegative().optional(),
    durationMs: NonNegativeSchema,
  }),
  canonicalAssetId: EntityIdSchema.optional(),
  canonicalAssetHash: FingerprintSchema.optional(),
  diagnostics: z.array(GeometryDiagnosticSchema),
  reportFingerprint: FingerprintSchema,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PartScore = z.infer<typeof PartScoreSchema>;
export type GeometryDiagnostic = z.infer<typeof GeometryDiagnosticSchema>;
export type RawMesh = z.infer<typeof RawMeshSchema>;
export type PartMesh = z.infer<typeof PartMeshSchema>;
export type CandidateGeometry = z.infer<typeof CandidateGeometrySchema>;
export type ViewFitMetric = z.infer<typeof ViewFitMetricSchema>;
export type LandmarkFitMetric = z.infer<typeof LandmarkFitMetricSchema>;
export type CrossViewFitWeights = z.infer<typeof CrossViewFitWeightsSchema>;
export type CrossViewFitScore = z.infer<typeof CrossViewFitScoreSchema>;
export type CandidateReconstruction = z.infer<typeof CandidateReconstructionSchema>;
export type ReconstructionPass = z.infer<typeof ReconstructionPassSchema>;
export type DifferenceEvidence = z.infer<typeof DifferenceEvidenceSchema>;
export type ProviderRegistryEntry = z.infer<typeof ProviderRegistryEntrySchema>;
export type ReconstructionConfig = z.infer<typeof ReconstructionConfigSchema>;
export type ReconstructionConfigInput = z.input<typeof ReconstructionConfigSchema>;
export type ReconstructionSessionReport = z.infer<typeof ReconstructionSessionReportSchema>;
