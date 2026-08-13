import { z } from "zod";
import { deepFreeze } from "./stable.js";

export const FidelityProfileNameSchema = z.enum(["DRAFT", "STANDARD", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]);
export type FidelityProfileName = z.infer<typeof FidelityProfileNameSchema>;

export const FidelityDomainSchema = z.enum([
  "RASTER",
  "LAYOUT",
  "TYPOGRAPHY",
  "COLOR",
  "ASSET",
  "CROP",
  "VECTOR",
  "EFFECTS",
  "RESPONSIVE",
  "ANIMATION",
  "GEOMETRY_3D",
  "MATERIAL_3D",
  "LIGHTING",
  "CAMERA",
]);
export type FidelityDomain = z.infer<typeof FidelityDomainSchema>;

export const FidelityProfileSchema = z.strictObject({
  name: FidelityProfileNameSchema,
  targetScore: z.number().min(0).max(1),
  minimumCoverage: z.number().min(0).max(1),
  minimumConfidence: z.number().min(0).max(1),
  domainThresholds: z.record(FidelityDomainSchema, z.number().min(0).max(1)),
  pixelMismatchThreshold: z.number().min(0).max(1),
  channelTolerance: z.number().int().min(0).max(255),
  layoutTolerancePx: z.number().nonnegative(),
  colorDeltaE: z.number().nonnegative(),
  maxPasses: z.number().int().positive().max(50),
  minimumImprovement: z.number().positive().max(1),
});
export type FidelityProfile = z.infer<typeof FidelityProfileSchema>;

const domains = FidelityDomainSchema.options;
function thresholds(value: number): Record<FidelityDomain, number> {
  return Object.fromEntries(domains.map((domain) => [domain, value])) as Record<FidelityDomain, number>;
}

export const FIDELITY_PROFILES: Readonly<Record<FidelityProfileName, FidelityProfile>> = deepFreeze({
  DRAFT: {
    name: "DRAFT",
    targetScore: 0.82,
    minimumCoverage: 0.7,
    minimumConfidence: 0.65,
    domainThresholds: thresholds(0.75),
    pixelMismatchThreshold: 0.12,
    channelTolerance: 20,
    layoutTolerancePx: 4,
    colorDeltaE: 8,
    maxPasses: 2,
    minimumImprovement: 0.005,
  },
  STANDARD: {
    name: "STANDARD",
    targetScore: 0.9,
    minimumCoverage: 0.85,
    minimumConfidence: 0.8,
    domainThresholds: thresholds(0.86),
    pixelMismatchThreshold: 0.06,
    channelTolerance: 12,
    layoutTolerancePx: 2,
    colorDeltaE: 4,
    maxPasses: 4,
    minimumImprovement: 0.0025,
  },
  HIGH_QUALITY: {
    name: "HIGH_QUALITY",
    targetScore: 0.96,
    minimumCoverage: 0.94,
    minimumConfidence: 0.9,
    domainThresholds: thresholds(0.93),
    pixelMismatchThreshold: 0.025,
    channelTolerance: 7,
    layoutTolerancePx: 1,
    colorDeltaE: 2.5,
    maxPasses: 8,
    minimumImprovement: 0.001,
  },
  MAXIMUM_FIDELITY: {
    name: "MAXIMUM_FIDELITY",
    targetScore: 0.985,
    minimumCoverage: 0.98,
    minimumConfidence: 0.95,
    domainThresholds: { ...thresholds(0.97), TYPOGRAPHY: 0.98, LAYOUT: 0.985, ASSET: 0.99 },
    pixelMismatchThreshold: 0.01,
    channelTolerance: 3,
    layoutTolerancePx: 0.5,
    colorDeltaE: 1.5,
    maxPasses: 16,
    minimumImprovement: 0.0005,
  },
});

for (const profile of Object.values(FIDELITY_PROFILES)) FidelityProfileSchema.parse(profile);

export function resolveFidelityProfile(name: FidelityProfileName): FidelityProfile {
  return FIDELITY_PROFILES[name];
}
