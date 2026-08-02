import type { JsonValueSchema } from "@aevum/document-model";
import type { z } from "zod";
import type { MotionFrameProvider } from "./adapters.js";
import { deepFreeze } from "./immutable.js";
import {
  MOTION_ANALYSIS_VERSION,
  MotionAnalysisSchema,
  type CameraMotionDetection,
  type FrameObservation,
  type MotionAnalysis,
  type MotionDiagnostic,
  type MotionFrameSequence,
  type MotionTask,
  type MotionTrackDetection,
} from "./schemas.js";
import { deterministicId, fingerprint, stableStringify } from "./stable.js";

type JsonValue = z.infer<typeof JsonValueSchema>;

const descriptors = [
  { property: "POSITION" as const, key: "position" as const, path: "transform.position", valueType: "VECTOR" as const },
  { property: "ROTATION" as const, key: "rotation" as const, path: "transform.rotation", valueType: "VECTOR" as const },
  { property: "SCALE" as const, key: "scale" as const, path: "transform.scale", valueType: "VECTOR" as const },
  { property: "OPACITY" as const, key: "opacity" as const, path: "transform.opacity", valueType: "NUMBER" as const },
  { property: "VISIBILITY" as const, key: "visible" as const, path: "visible", valueType: "BOOLEAN" as const },
  { property: "CAMERA" as const, key: "focalLength" as const, path: "focalLength", valueType: "NUMBER" as const },
] as const;

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(12));
}

function changed(values: readonly JsonValue[]): boolean {
  const first = values[0];
  return values.some((value) => stableStringify(value) !== stableStringify(first));
}

function observationsFor(sequence: MotionFrameSequence, targetId: string) {
  return sequence.frames
    .flatMap((frame) => {
      const observation = frame.observations.find((entry) => entry.targetId === targetId);
      return observation ? [{ frame, observation }] : [];
    })
    .sort((left, right) => left.frame.index - right.frame.index);
}

function vectorChanged(
  observations: readonly { readonly observation: FrameObservation }[],
  key: "position" | "rotation",
): boolean {
  return changed(observations.flatMap(({ observation }) => (observation[key] ? [observation[key]] : [])));
}

function classifyCamera(
  cameraId: string,
  observations: readonly {
    readonly frame: MotionFrameSequence["frames"][number];
    readonly observation: FrameObservation;
  }[],
): CameraMotionDetection {
  const sourceFrames = observations.map(({ frame }) => frame.index);
  const evidence = [...new Set(observations.flatMap(({ observation }) => observation.evidence))].sort();
  const confidence = average(observations.map(({ observation }) => observation.confidence));
  const focalValues = observations.flatMap(({ observation }) =>
    observation.focalLength === undefined ? [] : [observation.focalLength],
  );
  const positions = observations.flatMap(({ observation }) => (observation.position ? [observation.position] : []));
  const focalChanged = changed(focalValues);
  const rotationChanged = vectorChanged(observations, "rotation");
  const first = positions[0];
  const last = positions.at(-1);
  const xChanged = Boolean(first && last && Math.abs(last.x - first.x) > 1e-9);
  const yChanged = Boolean(first && last && Math.abs(last.y - first.y) > 1e-9);
  const zChanged = Boolean(first && last && Math.abs(last.z - first.z) > 1e-9);
  const motion = focalChanged
    ? "ZOOM"
    : rotationChanged
      ? "ORBIT"
      : zChanged
        ? "DOLLY"
        : yChanged && !xChanged
          ? "CRANE"
          : xChanged || yChanged
            ? "PAN"
            : "STATIC";
  return { cameraId, motion, confidence, sourceFrames, evidence };
}

export function analyzeMotion(task: MotionTask, provider: MotionFrameProvider): MotionAnalysis {
  const sequence = provider.provide(task);
  const tracks: MotionTrackDetection[] = [];
  const diagnostics: MotionDiagnostic[] = [];
  const cameraMotions: CameraMotionDetection[] = [];
  for (const target of [...task.targets].sort((left, right) => left.targetId.localeCompare(right.targetId))) {
    const observations = observationsFor(sequence, target.targetId);
    if (observations.length === 0) {
      diagnostics.push({
        code: "MISSING_TARGET",
        severity: "ERROR",
        message: `No frame observations exist for ${target.targetId}.`,
        stage: "MOTION_ANALYSIS",
        targetId: target.targetId,
        frameIndexes: [],
        recoverable: true,
      });
      continue;
    }
    if (target.targetKind === "CAMERA") cameraMotions.push(classifyCamera(target.targetId, observations));
    for (const descriptor of descriptors) {
      if (!target.properties.includes(descriptor.property)) continue;
      const samples = observations.flatMap(({ frame, observation }) => {
        const value = observation[descriptor.key];
        return value === undefined
          ? []
          : [
              {
                frameIndex: frame.index,
                time: frame.time,
                value,
                confidence: observation.confidence,
                evidence: observation.evidence,
              },
            ];
      });
      if (samples.length === 0) continue;
      const confidence = average(samples.map((sample) => sample.confidence));
      const trackDiagnostics: MotionDiagnostic[] = [];
      if (confidence < task.minimumConfidence) {
        trackDiagnostics.push({
          code: "LOW_CONFIDENCE",
          severity: "WARNING",
          message: `${descriptor.property} motion confidence is below the requested threshold.`,
          stage: "MOTION_ANALYSIS",
          targetId: target.targetId,
          frameIndexes: samples.map((sample) => sample.frameIndex),
          path: descriptor.path,
          recoverable: true,
        });
      }
      tracks.push({
        id: deterministicId("motion-track", {
          taskId: task.id,
          targetId: target.targetId,
          property: descriptor.property,
        }),
        targetId: target.targetId,
        targetKind: target.targetKind,
        property: descriptor.property,
        propertyPath: descriptor.path,
        valueType: descriptor.valueType,
        samples,
        sourceFrames: samples.map((sample) => sample.frameIndex),
        confidence,
        evidence: [...new Set(samples.flatMap((sample) => sample.evidence))].sort(),
        diagnostics: trackDiagnostics,
      });
      diagnostics.push(...trackDiagnostics);
    }
  }
  const confidence = average(tracks.map((track) => track.confidence));
  const analysisBase = {
    id: deterministicId("motion-analysis", { taskId: task.id, frameSequenceId: sequence.id }),
    analysisVersion: MOTION_ANALYSIS_VERSION,
    taskId: task.id,
    frameSequenceId: sequence.id,
    duration: sequence.duration,
    frameRate: sequence.frameRate,
    tracks,
    cameraMotions,
    diagnostics,
    confidence,
  };
  return deepFreeze(MotionAnalysisSchema.parse({ ...analysisBase, analysisFingerprint: fingerprint(analysisBase) }));
}
