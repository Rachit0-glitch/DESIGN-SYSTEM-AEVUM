import { deepFreeze } from "./immutable.js";
import {
  ConfidenceValueSchema,
  ReconstructionConfidenceSummarySchema,
  type ReconstructionConfidenceSummary,
} from "./schemas.js";

export const CONFIDENCE_BOUNDARIES = Object.freeze({ HIGH: 0.85, MEDIUM: 0.6, LOW: 0.000_001 });

export function confidence(score: number) {
  const bounded = Math.max(0, Math.min(1, score));
  const label =
    bounded >= CONFIDENCE_BOUNDARIES.HIGH
      ? "HIGH"
      : bounded >= CONFIDENCE_BOUNDARIES.MEDIUM
        ? "MEDIUM"
        : bounded >= CONFIDENCE_BOUNDARIES.LOW
          ? "LOW"
          : "UNKNOWN";
  return deepFreeze(ConfidenceValueSchema.parse({ score: bounded, label }));
}

export function averageConfidence(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function createConfidenceSummary(input: {
  readonly regions: readonly number[];
  readonly semantics: readonly number[];
  readonly text: readonly number[];
  readonly assets: readonly number[];
  readonly layouts: readonly number[];
  readonly components: readonly number[];
  readonly tokens: readonly number[];
}): ReconstructionConfidenceSummary {
  const scores = {
    regionDetection: averageConfidence(input.regions),
    semanticClassification: averageConfidence(input.semantics),
    text: averageConfidence(input.text),
    asset: averageConfidence(input.assets),
    layout: averageConfidence(input.layouts),
    component: averageConfidence(input.components),
    token: averageConfidence(input.tokens),
  };
  const overall = averageConfidence(Object.values(scores).filter((score) => score > 0));
  return deepFreeze(
    ReconstructionConfidenceSummarySchema.parse({
      regionDetection: confidence(scores.regionDetection),
      semanticClassification: confidence(scores.semanticClassification),
      text: confidence(scores.text),
      asset: confidence(scores.asset),
      layout: confidence(scores.layout),
      component: confidence(scores.component),
      token: confidence(scores.token),
      overall: confidence(overall),
    }),
  );
}
