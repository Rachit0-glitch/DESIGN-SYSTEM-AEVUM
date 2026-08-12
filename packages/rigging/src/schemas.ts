import { EntityIdSchema } from "@aevum/document-model";
import { z } from "zod";

export const RIGGING_PACKAGE_VERSION = "1.0.0" as const;

const Vec3Schema = z.strictObject({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });

// ---------------------------------------------------------------------------
// Diagnostics (Phase 19B §45)
// ---------------------------------------------------------------------------

export const RigDiagnosticCodeSchema = z.enum([
  "RIG_HIERARCHY_INVALID",
  "RIG_CYCLE",
  "RIG_MULTIPLE_PARENTS",
  "RIG_DANGLING_REFERENCE",
  "RIG_BONE_MISSING",
  "RIG_REST_POSE_INVALID",
  "RIG_RESOURCE_LIMIT_EXCEEDED",
  "SKIN_BINDING_MISSING",
  "SKIN_WEIGHT_INVALID",
  "SKIN_WEIGHT_NOT_NORMALIZED",
  "SKIN_WEIGHT_NEGATIVE",
  "SKIN_WEIGHT_NAN",
  "SKIN_VERTEX_UNWEIGHTED",
  "SKIN_INFLUENCE_LIMIT_EXCEEDED",
  "SKIN_ORPHAN_GROUP",
  "SKIN_BONE_REFERENCE_INVALID",
  "IK_CHAIN_INVALID",
  "CONSTRAINT_TARGET_INVALID",
  "POSE_TRANSFORM_INVALID",
  "POSE_BONE_NOT_FOUND",
  "IK_DID_NOT_CONVERGE",
  "IK_TARGET_UNREACHABLE",
  "DEFORMATION_MATRIX_INVALID",
  "DEFORMATION_VERTEX_INVALID",
  "DEFORMATION_EXTREME_DISPLACEMENT",
  "DEFORMATION_COLLAPSED",
  "DEFORMATION_BOUNDS_SUSPICIOUS",
  "RETARGET_MAPPING_INVALID",
  "RETARGET_BONE_UNMAPPED",
  "RIG_EXPORT_LOSS",
  "RIG_HUMANOID_EVIDENCE_INSUFFICIENT",
]);
export type RigDiagnosticCode = z.infer<typeof RigDiagnosticCodeSchema>;

export const RigDiagnosticSchema = z.strictObject({
  code: RigDiagnosticCodeSchema,
  severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
  message: z.string().min(1).max(2_000),
  stage: z.string().min(1).max(64),
  recoverable: z.boolean(),
  relatedIds: z.array(z.string().min(1)),
  details: z.record(z.string(), z.unknown()),
});
export type RigDiagnostic = z.infer<typeof RigDiagnosticSchema>;

// ---------------------------------------------------------------------------
// Resource limits (Phase 19B §46)
// ---------------------------------------------------------------------------

export const RigResourceLimitsSchema = z.strictObject({
  maxBones: z.number().int().positive().max(4_096).default(256),
  maxDeformBones: z.number().int().positive().max(4_096).default(128),
  maxConstraints: z.number().int().positive().max(512).default(64),
  maxIKChains: z.number().int().positive().max(64).default(16),
  maxSkinInfluencesPerVertex: z.number().int().positive().max(8).default(4),
  maxManualWeightEdits: z.number().int().positive().max(100_000).default(10_000),
  maxRiggedMeshes: z.number().int().positive().max(256).default(32),
  maxIKChainLength: z.number().int().positive().max(128).default(32),
  maxIKIterations: z.number().int().positive().max(512).default(64),
  maxCpuSkinVertices: z.number().int().positive().max(5_000_000).default(250_000),
  maxRetargetMappings: z.number().int().positive().max(512).default(128),
  maxPoseOperations: z.number().int().positive().max(4_096).default(256),
});
export type RigResourceLimits = z.infer<typeof RigResourceLimitsSchema>;
export const DEFAULT_RIG_RESOURCE_LIMITS: RigResourceLimits = RigResourceLimitsSchema.parse({});

// ---------------------------------------------------------------------------
// Bone specs — the provider-neutral input to rig construction (Phase 19B §13/§14)
// ---------------------------------------------------------------------------

export const BoneSpecSchema = z.strictObject({
  key: z.string().min(1).max(128),
  parentKey: z.string().min(1).max(128).nullable(),
  head: Vec3Schema,
  tail: Vec3Schema,
  deforming: z.boolean().default(true),
  humanoidLabel: z.string().min(1).max(64).optional(),
});
export type BoneSpec = z.infer<typeof BoneSpecSchema>;

export const RigTemplateIdSchema = z.enum(["MECHANICAL_CHAIN", "BASIC_HUMANOID"]);
export type RigTemplateId = z.infer<typeof RigTemplateIdSchema>;

export const RigTemplateResultSchema = z.strictObject({
  templateId: RigTemplateIdSchema,
  bones: z.array(BoneSpecSchema).min(1),
  diagnostics: z.array(RigDiagnosticSchema),
});
export type RigTemplateResult = z.infer<typeof RigTemplateResultSchema>;

// ---------------------------------------------------------------------------
// Weight validation — operates on a compact, in-memory-only vertex influence table.
// Never persisted into the CDD (Phase 19B §8/§9); this is the shape used when inspecting
// skin data read back from Blender or from a registered GLB's JOINTS_0/WEIGHTS_0 accessors.
// ---------------------------------------------------------------------------

export const VertexInfluenceSchema = z.strictObject({
  jointIndex: z.number().int().nonnegative(),
  weight: z.number(),
});
export type VertexInfluence = z.infer<typeof VertexInfluenceSchema>;

export const WeightValidationIssueSchema = z.strictObject({
  vertexIndex: z.number().int().nonnegative(),
  code: RigDiagnosticCodeSchema,
  detail: z.string().min(1).max(500),
});
export type WeightValidationIssue = z.infer<typeof WeightValidationIssueSchema>;

export const WeightValidationReportSchema = z.strictObject({
  vertexCount: z.number().int().nonnegative(),
  jointCount: z.number().int().nonnegative(),
  maxInfluencesObserved: z.number().int().nonnegative(),
  unweightedVertexCount: z.number().int().nonnegative(),
  invalidVertexCount: z.number().int().nonnegative(),
  normalized: z.boolean(),
  issues: z.array(WeightValidationIssueSchema),
  diagnostics: z.array(RigDiagnosticSchema),
});
export type WeightValidationReport = z.infer<typeof WeightValidationReportSchema>;

export const WeightNormalizationResultSchema = z.strictObject({
  influences: z.array(z.array(VertexInfluenceSchema)),
  verticesModified: z.number().int().nonnegative(),
  influencesRemoved: z.number().int().nonnegative(),
  diagnostics: z.array(RigDiagnosticSchema),
});
export type WeightNormalizationResult = z.infer<typeof WeightNormalizationResultSchema>;

// ---------------------------------------------------------------------------
// Rig validation report (Phase 19B §22)
// ---------------------------------------------------------------------------

export const RigValidationReportSchema = z.strictObject({
  version: z.literal(RIGGING_PACKAGE_VERSION),
  rigId: EntityIdSchema,
  valid: z.boolean(),
  boneCount: z.number().int().nonnegative(),
  deformBoneCount: z.number().int().nonnegative(),
  hierarchyValid: z.boolean(),
  restPoseValid: z.boolean(),
  skinBindingCount: z.number().int().nonnegative(),
  constraintCount: z.number().int().nonnegative(),
  ikChainCount: z.number().int().nonnegative(),
  exportCompatible: z.boolean(),
  diagnostics: z.array(RigDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});
export type RigValidationReport = z.infer<typeof RigValidationReportSchema>;

// ---------------------------------------------------------------------------
// Part-to-bone association (Phase 19B §27)
// ---------------------------------------------------------------------------

export const PartBoneAssociationSchema = z.strictObject({
  partId: z.string().min(1),
  partLabel: z.string().min(1),
  boneKey: z.string().min(1),
});
export type PartBoneAssociation = z.infer<typeof PartBoneAssociationSchema>;

// Regenerable runtime pose and deformation contracts. These records never become canonical
// per-frame document state; the CDD retains only rest/bind transforms and rig configuration.
export const QuaternionValueSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  w: z.number().finite(),
});
export const Matrix4Schema = z.array(z.number().finite()).length(16);
export const PoseDeltaSchema = z.strictObject({
  boneId: EntityIdSchema,
  translation: Vec3Schema.optional(),
  rotation: QuaternionValueSchema.optional(),
  scale: Vec3Schema.optional(),
});
export type PoseDelta = z.infer<typeof PoseDeltaSchema>;

export const EvaluatedBonePoseSchema = z.strictObject({
  boneId: EntityIdSchema,
  parentBoneId: EntityIdSchema.nullable(),
  localMatrix: Matrix4Schema,
  worldMatrix: Matrix4Schema,
  jointMatrix: Matrix4Schema,
});
export type EvaluatedBonePose = z.infer<typeof EvaluatedBonePoseSchema>;

export const EvaluatedPoseSchema = z.strictObject({
  version: z.literal(RIGGING_PACKAGE_VERSION),
  rigId: EntityIdSchema,
  time: z.number().finite().nonnegative(),
  progress: z.number().finite().min(0).max(1),
  source: z.enum(["REST", "FK", "ANIMATION", "IK", "MIXED"]),
  bones: z.array(EvaluatedBonePoseSchema),
  ikResults: z.array(
    z.strictObject({
      chainId: EntityIdSchema,
      converged: z.boolean(),
      reachable: z.boolean(),
      iterations: z.number().int().nonnegative(),
      finalDistance: z.number().finite().nonnegative(),
    }),
  ),
  diagnostics: z.array(RigDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});
export type EvaluatedPose = z.infer<typeof EvaluatedPoseSchema>;

export const SkinVertexSchema = z.strictObject({
  position: Vec3Schema,
  normal: Vec3Schema.optional(),
  influences: z.array(VertexInfluenceSchema),
});
export type SkinVertex = z.infer<typeof SkinVertexSchema>;
export const DeformedVertexSchema = z.strictObject({
  position: Vec3Schema,
  normal: Vec3Schema.optional(),
});
export type DeformedVertex = z.infer<typeof DeformedVertexSchema>;
export const CpuSkinningResultSchema = z.strictObject({
  version: z.literal(RIGGING_PACKAGE_VERSION),
  classification: z.literal("REAL"),
  vertices: z.array(DeformedVertexSchema),
  bounds: z.strictObject({ min: Vec3Schema, max: Vec3Schema }),
  diagnostics: z.array(RigDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});
export type CpuSkinningResult = z.infer<typeof CpuSkinningResultSchema>;

export const WeightEditOperationSchema = z.strictObject({
  mode: z.enum(["SET", "ADD", "SUBTRACT", "CLEAR", "NORMALIZE"]),
  vertexIndices: z.array(z.number().int().nonnegative()),
  jointIndex: z.number().int().nonnegative().optional(),
  value: z.number().finite().min(0).max(1).optional(),
});
export type WeightEditOperation = z.infer<typeof WeightEditOperationSchema>;
export const WeightInspectionSchema = z.strictObject({
  vertexCount: z.number().int().nonnegative(),
  weightedVertexCount: z.number().int().nonnegative(),
  unweightedVertexCount: z.number().int().nonnegative(),
  minWeight: z.number().finite().nonnegative(),
  maxWeight: z.number().finite().nonnegative(),
  averageInfluences: z.number().finite().nonnegative(),
  perJointVertexCounts: z.array(z.number().int().nonnegative()),
  validation: WeightValidationReportSchema,
});
export type WeightInspection = z.infer<typeof WeightInspectionSchema>;

export const DeformationQualityReportSchema = z.strictObject({
  version: z.literal(RIGGING_PACKAGE_VERSION),
  valid: z.boolean(),
  classification: z.enum(["EXCELLENT", "ACCEPTABLE", "DEGRADED", "INVALID"]),
  score: z.number().finite().min(0).max(1),
  measurements: z.strictObject({
    vertexCount: z.number().int().nonnegative(),
    invalidVertexCount: z.number().int().nonnegative(),
    maximumDisplacement: z.number().finite().nonnegative(),
    meanDisplacement: z.number().finite().nonnegative(),
    restDiagonal: z.number().finite().nonnegative(),
    posedDiagonal: z.number().finite().nonnegative(),
    boundsRatio: z.number().finite().nonnegative(),
  }),
  diagnostics: z.array(RigDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});
export type DeformationQualityReport = z.infer<typeof DeformationQualityReportSchema>;

export const RetargetMappingSchema = z.strictObject({
  sourceBoneId: EntityIdSchema,
  targetBoneId: EntityIdSchema,
  semanticRole: z.string().min(1).max(64).optional(),
});
export type RetargetMapping = z.infer<typeof RetargetMappingSchema>;
export const RetargetResultSchema = z.strictObject({
  mappings: z.array(RetargetMappingSchema),
  targetPoseDeltas: z.array(PoseDeltaSchema),
  unmappedSourceBoneIds: z.array(EntityIdSchema),
  unmappedTargetBoneIds: z.array(EntityIdSchema),
  diagnostics: z.array(RigDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});
export type RetargetResult = z.infer<typeof RetargetResultSchema>;
