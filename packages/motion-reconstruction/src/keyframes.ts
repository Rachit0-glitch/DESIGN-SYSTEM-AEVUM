import type { JsonValueSchema } from "@aevum/document-model";
import type { z } from "zod";
import { deepFreeze } from "./immutable.js";
import {
  KeyframeDetectionResultSchema,
  type DetectedKeyframe,
  type KeyframeDetectionResult,
  type MotionAnalysis,
} from "./schemas.js";
import { deterministicId, fingerprint } from "./stable.js";

type JsonValue = z.infer<typeof JsonValueSchema>;

function numericLeaves(value: JsonValue): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numericLeaves);
  if (value && typeof value === "object") {
    const record = value as Readonly<Record<string, JsonValue>>;
    return Object.keys(record)
      .sort()
      .flatMap((key) => numericLeaves(record[key] ?? null));
  }
  return [];
}

function distance(left: JsonValue, right: JsonValue): number {
  if (typeof left === "boolean" && typeof right === "boolean") return left === right ? 0 : 1;
  const leftValues = numericLeaves(left);
  const rightValues = numericLeaves(right);
  if (leftValues.length !== rightValues.length || leftValues.length === 0) return left === right ? 0 : 1;
  return Math.sqrt(leftValues.reduce((sum, value, index) => sum + (value - (rightValues[index] ?? value)) ** 2, 0));
}

function directionChanged(previous: JsonValue, current: JsonValue, next: JsonValue): boolean {
  const a = numericLeaves(previous);
  const b = numericLeaves(current);
  const c = numericLeaves(next);
  if (a.length === 0 || a.length !== b.length || b.length !== c.length) return false;
  const first = b.map((value, index) => value - (a[index] ?? value));
  const second = c.map((value, index) => value - (b[index] ?? value));
  return first.reduce((sum, value, index) => sum + value * (second[index] ?? 0), 0) < -1e-9;
}

export function detectKeyframes(analysis: MotionAnalysis, tolerance = 0.001): KeyframeDetectionResult {
  const keyframes: DetectedKeyframe[] = [];
  for (const track of analysis.tracks) {
    const samples = [...track.samples].sort(
      (left, right) => left.time - right.time || left.frameIndex - right.frameIndex,
    );
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      if (!sample) continue;
      const previous = samples[index - 1];
      const next = samples[index + 1];
      let reason: DetectedKeyframe["reason"] | undefined;
      if (!previous) reason = "START";
      else if (track.property === "VISIBILITY" && sample.value !== previous.value) reason = "VISIBILITY_CHANGE";
      else if (!next) reason = "END";
      else {
        const before = distance(previous.value, sample.value);
        const after = distance(sample.value, next.value);
        if ((before <= tolerance && after > tolerance) || (before > tolerance && after <= tolerance)) reason = "STOP";
        else if (directionChanged(previous.value, sample.value, next.value)) reason = "DIRECTION_CHANGE";
        else {
          const beforeDuration = Math.max(1e-9, sample.time - previous.time);
          const afterDuration = Math.max(1e-9, next.time - sample.time);
          const beforeSpeed = before / beforeDuration;
          const afterSpeed = after / afterDuration;
          const ratio = Math.max(beforeSpeed, afterSpeed) / Math.max(1e-9, Math.min(beforeSpeed, afterSpeed));
          if (ratio >= 2 && before > tolerance && after > tolerance) reason = "EASING_CHANGE";
        }
      }
      if (!reason) continue;
      const sourceFrames = [previous?.frameIndex, sample.frameIndex, next?.frameIndex].filter(
        (value): value is number => value !== undefined,
      );
      keyframes.push({
        id: deterministicId("detected-keyframe", { trackId: track.id, frameIndex: sample.frameIndex, reason }),
        trackId: track.id,
        time: sample.time,
        value: sample.value,
        reason,
        confidence: sample.confidence,
        sourceFrames: [...new Set(sourceFrames)],
        evidence: sample.evidence,
      });
    }
  }
  const base = {
    id: deterministicId("keyframe-detection", { analysisId: analysis.id, tolerance }),
    analysisId: analysis.id,
    keyframes,
    diagnostics: [],
  };
  return deepFreeze(KeyframeDetectionResultSchema.parse({ ...base, fingerprint: fingerprint(base) }));
}
