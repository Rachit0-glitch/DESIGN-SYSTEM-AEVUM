import { ActorRefSchema, EntityIdSchema } from "@aevum/document-model";
import { z } from "zod";
import { FidelityDomainSchema, FidelityProfileNameSchema } from "./profiles.js";

export const FIDELITY_VERSION = "1.0.0" as const;
const HashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const UnitSchema = z.number().min(0).max(1);
const RegionSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
const ViewportSchema = z.strictObject({
  id: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  devicePixelRatio: z.number().positive().max(4),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
  reducedMotion: z.boolean(),
  time: z.number().nonnegative(),
});

export const FidelityReferenceSchema = z.strictObject({
  id: z.string().regex(/^fidelity-reference:[0-9a-f]{32}$/),
  sourceAssetId: EntityIdSchema.optional(),
  hash: HashSchema,
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  colorSpace: z.literal("SRGB"),
  alphaMode: z.enum(["STRAIGHT", "OPAQUE"]),
  orientation: z.enum(["NORMAL", "ROTATE_90", "ROTATE_180", "ROTATE_270"]),
  viewport: ViewportSchema,
  hints: z.strictObject({ fontFamilies: z.array(z.string()), assetIds: z.array(EntityIdSchema) }),
  provenance: z.strictObject({
    providerId: z.string().min(1),
    providerVersion: z.string().min(1),
    capturedAt: z.iso.datetime({ offset: true }).optional(),
  }),
});
export type FidelityReference = z.infer<typeof FidelityReferenceSchema>;

export const FidelityIssueSchema = z.strictObject({
  id: z.string().regex(/^fidelity-issue:[0-9a-f]{32}$/),
  domain: FidelityDomainSchema,
  code: z.string().min(1),
  severity: z.enum(["INFO", "WARNING", "ERROR", "BLOCKING"]),
  nodeId: EntityIdSchema.optional(),
  region: RegionSchema.optional(),
  property: z.string().min(1),
  expected: z.unknown(),
  actual: z.unknown(),
  measurement: z.number().finite().optional(),
  confidence: UnitSchema,
  causalParentId: z.string().optional(),
  supported: z.boolean(),
  message: z.string().min(1),
});
export type FidelityIssue = z.infer<typeof FidelityIssueSchema>;

export const FidelityDomainScoreSchema = z.strictObject({
  domain: FidelityDomainSchema,
  score: UnitSchema,
  coverage: UnitSchema,
  confidence: UnitSchema,
  measuredRegions: z.number().int().nonnegative(),
  totalRegions: z.number().int().nonnegative(),
  issueIds: z.array(z.string()),
  unsupportedFeatures: z.array(z.string()),
});
export type FidelityDomainScore = z.infer<typeof FidelityDomainScoreSchema>;

export const FidelityDomainEvidenceSchema = z.strictObject({
  domain: FidelityDomainSchema,
  score: UnitSchema,
  coverage: UnitSchema,
  confidence: UnitSchema,
  sourceFingerprint: HashSchema,
  providerId: z.string().min(1),
  issues: z.array(FidelityIssueSchema),
  unsupportedFeatures: z.array(z.string()),
});
export type FidelityDomainEvidence = z.infer<typeof FidelityDomainEvidenceSchema>;

export const PixelMetricsSchema = z.strictObject({
  mae: UnitSchema,
  rmse: UnitSchema,
  mismatchPercentage: UnitSchema,
  alphaMae: UnitSchema,
  channelMae: z.tuple([UnitSchema, UnitSchema, UnitSchema, UnitSchema]),
  ssim: UnitSchema,
  comparedPixels: z.number().int().nonnegative(),
});
export type PixelMetrics = z.infer<typeof PixelMetricsSchema>;

export const FidelityMeasurementSchema = z.strictObject({
  id: z.string().regex(/^fidelity-measurement:[0-9a-f]{32}$/),
  referenceHash: HashSchema,
  targetHash: HashSchema,
  viewport: ViewportSchema,
  pixel: PixelMetricsSchema,
  domainScores: z.array(FidelityDomainScoreSchema),
  issues: z.array(FidelityIssueSchema),
  overallScore: UnitSchema,
  coverage: UnitSchema,
  confidence: UnitSchema,
  worstRegionId: z.string().optional(),
  rendererVersion: z.string().min(1),
  fingerprint: HashSchema,
});
export type FidelityMeasurement = z.infer<typeof FidelityMeasurementSchema>;

export const FidelityTaskSchema = z.strictObject({
  id: z.string().regex(/^fidelity-task:[0-9a-f]{32}$/),
  version: z.literal(FIDELITY_VERSION),
  projectId: EntityIdSchema,
  documentId: EntityIdSchema,
  documentVersion: z.number().int().positive(),
  profile: FidelityProfileNameSchema,
  references: z.array(FidelityReferenceSchema).min(1).max(16),
  protectedNodeIds: z.array(EntityIdSchema),
  maxPasses: z.number().int().positive().max(50),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: ActorRefSchema,
  correlationId: z.string().min(1),
  fingerprint: HashSchema,
});
export type FidelityTask = z.infer<typeof FidelityTaskSchema>;

export const FidelityPassSchema = z.strictObject({
  passNumber: z.number().int().positive(),
  documentVersion: z.number().int().positive(),
  documentFingerprint: HashSchema,
  measurements: z.array(FidelityMeasurementSchema),
  score: UnitSchema,
  accepted: z.boolean(),
  correctionFingerprint: HashSchema.optional(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type FidelityPass = z.infer<typeof FidelityPassSchema>;

export const FidelityReportSchema = z.strictObject({
  id: z.string().regex(/^fidelity-report:[0-9a-f]{32}$/),
  version: z.literal(FIDELITY_VERSION),
  taskId: z.string(),
  status: z.enum(["PASS", "WARNING", "FAIL", "BLOCKED"]),
  overallScore: UnitSchema,
  coverage: UnitSchema,
  confidence: UnitSchema,
  domainScores: z.array(FidelityDomainScoreSchema),
  issues: z.array(FidelityIssueSchema),
  passes: z.array(FidelityPassSchema),
  stopReason: z.enum([
    "TARGET_REACHED",
    "NO_CORRECTIONS",
    "NO_IMPROVEMENT",
    "REGRESSION",
    "OSCILLATION",
    "MAX_PASSES",
    "RESOURCE_BUDGET",
    "CANCELLED",
    "FAILED",
  ]),
  unsupportedFeatures: z.array(z.string()),
  provenance: z.strictObject({
    referenceHashes: z.array(HashSchema),
    documentFingerprint: HashSchema,
    rendererVersion: z.string(),
    providerIds: z.array(z.string()),
    fontAssetIds: z.array(EntityIdSchema),
    imageAssetIds: z.array(EntityIdSchema),
  }),
  fingerprint: HashSchema,
});
export type FidelityReport = z.infer<typeof FidelityReportSchema>;

export const ReferenceEvidenceSchema = z.strictObject({
  providerId: z.string().min(1),
  providerVersion: z.string().min(1),
  regions: z.array(
    z.strictObject({ id: z.string(), region: RegionSchema, category: z.string(), confidence: UnitSchema }),
  ),
  text: z.array(
    z.strictObject({ text: z.string(), region: RegionSchema, lines: z.array(z.string()), confidence: UnitSchema }),
  ),
  assets: z.array(z.strictObject({ region: RegionSchema, confidence: UnitSchema, assetHint: z.string().optional() })),
  diagnostics: z.array(z.string()),
  fingerprint: HashSchema,
});
export type ReferenceEvidence = z.infer<typeof ReferenceEvidenceSchema>;
