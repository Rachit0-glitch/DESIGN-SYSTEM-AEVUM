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
