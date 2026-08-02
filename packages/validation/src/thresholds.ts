import { deepFreeze } from "./immutable.js";
import {
  ValidationThresholdProfileSchema,
  type ValidationThresholdProfile,
  type ValidationThresholdProfileName,
} from "./schemas.js";

const profiles: Record<ValidationThresholdProfileName, ValidationThresholdProfile> = {
  DRAFT: ValidationThresholdProfileSchema.parse({
    name: "DRAFT",
    version: "1.0.0",
    tolerances: {
      positionPx: 8,
      sizePx: 8,
      fontSizePx: 4,
      spacingPx: 6,
      colorDelta: 0.12,
      opacityDelta: 0.1,
      rasterMeanAbsoluteError: 0.18,
    },
    minimumScores: {
      overall: 0.7,
      region: 0.55,
      worstRegion: 0.4,
      layout: 0.65,
      typography: 0.6,
      asset: 0.65,
      component: 0.5,
      structure: 0.7,
      raster: 0.65,
    },
    warningsAllowed: true,
    exact: false,
  }),
  STANDARD: ValidationThresholdProfileSchema.parse({
    name: "STANDARD",
    version: "1.0.0",
    tolerances: {
      positionPx: 4,
      sizePx: 4,
      fontSizePx: 2,
      spacingPx: 3,
      colorDelta: 0.06,
      opacityDelta: 0.05,
      rasterMeanAbsoluteError: 0.1,
    },
    minimumScores: {
      overall: 0.84,
      region: 0.75,
      worstRegion: 0.65,
      layout: 0.82,
      typography: 0.78,
      asset: 0.82,
      component: 0.75,
      structure: 0.88,
      raster: 0.8,
    },
    warningsAllowed: true,
    exact: false,
  }),
  HIGH_QUALITY: ValidationThresholdProfileSchema.parse({
    name: "HIGH_QUALITY",
    version: "1.0.0",
    tolerances: {
      positionPx: 2,
      sizePx: 2,
      fontSizePx: 1,
      spacingPx: 1.5,
      colorDelta: 0.025,
      opacityDelta: 0.02,
      rasterMeanAbsoluteError: 0.04,
    },
    minimumScores: {
      overall: 0.93,
      region: 0.88,
      worstRegion: 0.8,
      layout: 0.93,
      typography: 0.9,
      asset: 0.92,
      component: 0.88,
      structure: 0.96,
      raster: 0.92,
    },
    warningsAllowed: false,
    exact: false,
  }),
  PIXEL_PERFECT: ValidationThresholdProfileSchema.parse({
    name: "PIXEL_PERFECT",
    version: "1.0.0",
    tolerances: {
      positionPx: 0,
      sizePx: 0,
      fontSizePx: 0,
      spacingPx: 0,
      colorDelta: 0,
      opacityDelta: 0,
      rasterMeanAbsoluteError: 0,
    },
    minimumScores: {
      overall: 1,
      region: 1,
      worstRegion: 1,
      layout: 1,
      typography: 1,
      asset: 1,
      component: 1,
      structure: 1,
      raster: 1,
    },
    warningsAllowed: false,
    exact: true,
  }),
};

export const VALIDATION_THRESHOLD_PROFILES = deepFreeze(profiles);

export function getThresholdProfile(name: ValidationThresholdProfileName): ValidationThresholdProfile {
  return VALIDATION_THRESHOLD_PROFILES[name];
}
