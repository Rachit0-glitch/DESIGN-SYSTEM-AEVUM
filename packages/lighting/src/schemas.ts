import {
  EnvironmentSchema,
  LightingProfileSchema,
  LightingRigSchema,
  LightSchema,
  ReflectionProbeSchema,
  Vector3Schema,
} from "@aevum/document-model";
import { z } from "zod";

export const LIGHTING_PACKAGE_VERSION = "1.0.0" as const;

export const LightingDiagnosticSchema = z.strictObject({
  code: z.enum([
    "REFERENCE_INSUFFICIENT",
    "REFERENCE_INVALID",
    "LIGHT_BUDGET_EXCEEDED",
    "SHADOW_BUDGET_EXCEEDED",
    "MISSING_LIGHT",
    "MISSING_ENVIRONMENT",
    "MISSING_PROFILE",
    "DIRECTION_MISMATCH",
    "INTENSITY_MISMATCH",
    "TEMPERATURE_MISMATCH",
    "SHADOW_MISMATCH",
    "REFLECTION_MISMATCH",
    "VOLUMETRIC_UNSUPPORTED",
    "MATERIAL_SEPARATED",
    "PROFILE_FALLBACK",
  ]),
  severity: z.enum(["INFO", "WARNING", "ERROR", "BLOCKING"]),
  domain: z.enum(["LIGHTING", "MATERIAL", "ENVIRONMENT", "RESOURCE"]),
  message: z.string().min(1).max(1_000),
  entityId: z.string().optional(),
  recoverable: z.boolean(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const LightingResourceLimitsSchema = z.strictObject({
  maxSamples: z.number().int().min(64).max(262_144).default(65_536),
  maxLights: z.number().int().min(1).max(256).default(64),
  maxShadowLights: z.number().int().min(0).max(64).default(16),
  maxReflectionProbes: z.number().int().min(0).max(64).default(16),
  maxRigProfiles: z.number().int().min(1).max(16).default(8),
  maxBakeResolution: z.number().int().min(64).max(8_192).default(2_048),
});
export type LightingResourceLimits = z.infer<typeof LightingResourceLimitsSchema>;
export const DEFAULT_LIGHTING_LIMITS: LightingResourceLimits = LightingResourceLimitsSchema.parse({});

export const ReferencePixelSampleSchema = z.strictObject({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  r: z.number().finite().min(0).max(1),
  g: z.number().finite().min(0).max(1),
  b: z.number().finite().min(0).max(1),
  a: z.number().finite().min(0).max(1).default(1),
  region: z.enum(["SUBJECT", "BACKGROUND", "SHADOW", "HIGHLIGHT", "REFLECTION", "VOLUME"]).optional(),
});
export const ReferenceLightingInputSchema = z.strictObject({
  referenceId: z.string().min(1),
  width: z.number().int().positive().max(32_768),
  height: z.number().int().positive().max(32_768),
  samples: z.array(ReferencePixelSampleSchema).min(16),
});

export const LightingEstimateSchema = z.strictObject({
  version: z.literal(LIGHTING_PACKAGE_VERSION),
  referenceId: z.string().min(1),
  keyDirection: Vector3Schema,
  fillDirection: Vector3Schema,
  rimDirection: Vector3Schema,
  keyToFillRatio: z.number().finite().min(1).max(1_000),
  temperatureKelvin: z.number().finite().min(1_000).max(40_000),
  shadowSoftness: z.number().finite().min(0).max(1),
  environmentContribution: z.number().finite().min(0).max(1),
  reflectionContribution: z.number().finite().min(0).max(1),
  contactShadow: z.number().finite().min(0).max(1),
  volumetricContribution: z.number().finite().min(0).max(1),
  confidence: z.number().finite().min(0).max(1),
  evidence: z.strictObject({
    sampleCount: z.number().int().positive(),
    meanLuminance: z.number().finite().min(0).max(1),
    luminanceRange: z.number().finite().min(0).max(1),
    highlightCentroid: z.strictObject({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }),
    shadowFraction: z.number().finite().min(0).max(1),
    highlightFraction: z.number().finite().min(0).max(1),
  }),
  diagnostics: z.array(LightingDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export const LightingRigBuildResultSchema = z.strictObject({
  version: z.literal(LIGHTING_PACKAGE_VERSION),
  rig: LightingRigSchema,
  lights: z.array(LightSchema),
  environment: EnvironmentSchema.optional(),
  profiles: z.array(LightingProfileSchema),
  reflectionProbes: z.array(ReflectionProbeSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export const ResolvedLightingSchema = z.strictObject({
  version: z.literal(LIGHTING_PACKAGE_VERSION),
  sceneId: z.string().min(1),
  rigId: z.string().min(1),
  target: z.enum(["REALTIME", "OFFLINE", "MOBILE"]),
  profile: LightingProfileSchema,
  lights: z.array(LightSchema),
  environment: EnvironmentSchema.optional(),
  reflectionProbes: z.array(ReflectionProbeSchema),
  shadowLightIds: z.array(z.string()),
  diagnostics: z.array(LightingDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export const LightingValidationReportSchema = z.strictObject({
  version: z.literal(LIGHTING_PACKAGE_VERSION),
  valid: z.boolean(),
  overallScore: z.number().finite().min(0).max(1),
  lightingScore: z.number().finite().min(0).max(1),
  materialScore: z.number().finite().min(0).max(1),
  shadowScore: z.number().finite().min(0).max(1),
  reflectionScore: z.number().finite().min(0).max(1),
  environmentScore: z.number().finite().min(0).max(1),
  measurements: z.strictObject({
    activeLightCount: z.number().int().nonnegative(),
    shadowLightCount: z.number().int().nonnegative(),
    directionErrorDegrees: z.number().finite().nonnegative(),
    temperatureErrorKelvin: z.number().finite().nonnegative(),
    intensityRatioError: z.number().finite().nonnegative(),
    reflectionProbeCount: z.number().int().nonnegative(),
  }),
  diagnostics: z.array(LightingDiagnosticSchema),
  corrections: z.array(
    z.strictObject({
      entityId: z.string(),
      property: z.string(),
      expected: z.unknown(),
      actual: z.unknown(),
      confidence: z.number().finite().min(0).max(1),
    }),
  ),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export type LightingDiagnostic = z.infer<typeof LightingDiagnosticSchema>;
export type ReferencePixelSample = z.infer<typeof ReferencePixelSampleSchema>;
export type ReferenceLightingInput = z.infer<typeof ReferenceLightingInputSchema>;
export type LightingEstimate = z.infer<typeof LightingEstimateSchema>;
export type LightingRigBuildResult = z.infer<typeof LightingRigBuildResultSchema>;
export type ResolvedLighting = z.infer<typeof ResolvedLightingSchema>;
export type LightingValidationReport = z.infer<typeof LightingValidationReportSchema>;
