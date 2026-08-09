import { deepFreeze } from "./immutable.js";
import { ConfidenceValueSchema, type ConfidenceValue } from "./schemas.js";

export const CONFIDENCE_BOUNDARIES = Object.freeze({ HIGH: 0.85, MEDIUM: 0.6, LOW: 0.000_001 });

export function confidence(score: number): ConfidenceValue {
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

export function minConfidence(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}
