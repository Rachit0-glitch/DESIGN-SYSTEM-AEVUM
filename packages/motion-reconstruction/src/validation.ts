import { validateTimeline } from "@aevum/animation-core";
import type { CanonicalDesignDocument, JsonValueSchema } from "@aevum/document-model";
import type { z } from "zod";
import { deepFreeze } from "./immutable.js";
import {
  MotionValidationSchema,
  type KeyframeDetectionResult,
  type MotionAnalysis,
  type MotionDiagnostic,
  type MotionFrameSequence,
  type MotionTask,
  type MotionValidation,
  type TimelineProposal,
} from "./schemas.js";
import { fingerprint } from "./stable.js";

type JsonValue = z.infer<typeof JsonValueSchema>;

export interface ValidateMotionInput {
  readonly task: MotionTask;
  readonly sequence: MotionFrameSequence;
  readonly document: CanonicalDesignDocument;
  readonly analysis?: MotionAnalysis;
  readonly keyframes?: KeyframeDetectionResult;
  readonly proposal?: TimelineProposal;
}

const supportedPaths = new Set([
  "transform.position",
  "transform.rotation",
  "transform.scale",
  "transform.opacity",
  "visible",
  "focalLength",
]);

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
  const a = numericLeaves(left);
  const b = numericLeaves(right);
  if (a.length === 0 || a.length !== b.length) return 0;
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - (b[index] ?? value)) ** 2, 0));
}

export function validateMotion(input: ValidateMotionInput): MotionValidation {
  const { task, sequence, document, analysis, keyframes, proposal } = input;
  const diagnostics: MotionDiagnostic[] = [];
  const orderedFrames = [...sequence.frames].sort((left, right) => left.index - right.index);
  for (let index = 0; index < orderedFrames.length; index += 1) {
    const frame = orderedFrames[index];
    const previous = orderedFrames[index - 1];
    if (!frame) continue;
    if (frame.index !== index) {
      diagnostics.push({
        code: "MISSING_FRAME",
        severity: "ERROR",
        message: `Expected frame index ${index}, received ${frame.index}.`,
        stage: "FRAME_VALIDATION",
        frameIndexes: [frame.index],
        recoverable: true,
      });
    }
    if (previous && frame.time <= previous.time) {
      diagnostics.push({
        code: "INVALID_TIMING",
        severity: "ERROR",
        message: "Frame timestamps must be strictly increasing.",
        stage: "FRAME_VALIDATION",
        frameIndexes: [previous.index, frame.index],
        recoverable: true,
      });
    }
  }
  const lastFrame = orderedFrames.at(-1);
  if (lastFrame && lastFrame.time > sequence.duration) {
    diagnostics.push({
      code: "INVALID_TIMING",
      severity: "ERROR",
      message: "The last frame exceeds the declared sequence duration.",
      stage: "FRAME_VALIDATION",
      frameIndexes: [lastFrame.index],
      recoverable: true,
    });
  }
  for (const target of task.targets) {
    const exists =
      target.targetKind === "CAMERA"
        ? Boolean(document.cameras[target.targetId])
        : Boolean(document.nodes[target.targetId]);
    if (!exists)
      diagnostics.push({
        code: "MISSING_TARGET",
        severity: "ERROR",
        message: `${target.targetKind.toLowerCase()} target ${target.targetId} does not exist.`,
        stage: "STRUCTURAL_VALIDATION",
        targetId: target.targetId,
        frameIndexes: [],
        recoverable: true,
      });
  }
  if (analysis) {
    if (analysis.taskId !== task.id || analysis.frameSequenceId !== sequence.id) {
      diagnostics.push({
        code: "BROKEN_TRACK",
        severity: "ERROR",
        message: "Motion analysis does not belong to the supplied task and frame sequence.",
        stage: "MOTION_VALIDATION",
        frameIndexes: [],
        recoverable: true,
      });
    }
    if (analysis.tracks.length === 0 && task.commandIntent.type !== "DELETE")
      diagnostics.push({
        code: "BROKEN_TRACK",
        severity: "ERROR",
        message: "No editable motion tracks were detected.",
        stage: "MOTION_VALIDATION",
        frameIndexes: [],
        recoverable: true,
      });
    for (const track of analysis.tracks) {
      if (!supportedPaths.has(track.propertyPath))
        diagnostics.push({
          code: "INVALID_PATH",
          severity: "ERROR",
          message: `Unsupported canonical property path ${track.propertyPath}.`,
          stage: "MOTION_VALIDATION",
          targetId: track.targetId,
          frameIndexes: track.sourceFrames,
          path: track.propertyPath,
          recoverable: true,
        });
      for (let index = 1; index < track.samples.length; index += 1) {
        const previous = track.samples[index - 1];
        const current = track.samples[index];
        if (!previous || !current) continue;
        const elapsed = current.time - previous.time;
        const speed = elapsed > 0 ? distance(previous.value, current.value) / elapsed : Number.POSITIVE_INFINITY;
        if (speed > task.maximumDeltaPerSecond)
          diagnostics.push({
            code: "IMPOSSIBLE_INTERPOLATION",
            severity: "ERROR",
            message: `Detected ${track.property.toLowerCase()} delta exceeds the configured physical limit.`,
            stage: "MOTION_VALIDATION",
            targetId: track.targetId,
            frameIndexes: [previous.frameIndex, current.frameIndex],
            path: track.propertyPath,
            recoverable: true,
          });
      }
    }
    diagnostics.push(...analysis.diagnostics);
  }
  if (keyframes && analysis && keyframes.analysisId !== analysis.id)
    diagnostics.push({
      code: "BROKEN_TRACK",
      severity: "ERROR",
      message: "Detected keyframes do not belong to the supplied analysis.",
      stage: "KEYFRAME_VALIDATION",
      frameIndexes: [],
      recoverable: true,
    });
  if (proposal) {
    if (proposal.taskId !== task.id || (analysis && proposal.analysisId !== analysis.id))
      diagnostics.push({
        code: "COMMAND_PLAN_INVALID",
        severity: "ERROR",
        message: "Timeline proposal lineage does not match the supplied task and analysis.",
        stage: "PROPOSAL_VALIDATION",
        frameIndexes: [],
        recoverable: true,
      });
    if (proposal.action === "DELETE" ? proposal.timeline !== undefined : proposal.timeline === undefined) {
      diagnostics.push({
        code: "COMMAND_PLAN_INVALID",
        severity: "ERROR",
        message: "Timeline proposal payload does not match its command action.",
        stage: "PROPOSAL_VALIDATION",
        frameIndexes: [],
        recoverable: true,
      });
    }
    if (proposal.timeline) {
      const timelineValidation = validateTimeline(proposal.timeline);
      diagnostics.push(
        ...timelineValidation.diagnostics.map(
          (entry): MotionDiagnostic => ({
            code: "TIMELINE_INVALID",
            severity: entry.severity,
            message: entry.message,
            stage: "TIMELINE_VALIDATION",
            frameIndexes: [],
            path: entry.path,
            recoverable: entry.recoverable,
          }),
        ),
      );
    }
  }
  const orderedDiagnostics = diagnostics.sort(
    (left, right) =>
      left.severity.localeCompare(right.severity) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
  const errorCount = orderedDiagnostics.filter((entry) => entry.severity === "ERROR").length;
  const warningCount = orderedDiagnostics.filter((entry) => entry.severity === "WARNING").length;
  const score = Math.max(0, Math.min(1, 1 - errorCount * 0.2 - warningCount * 0.05));
  const base = { success: errorCount === 0, score, diagnostics: orderedDiagnostics };
  return deepFreeze(MotionValidationSchema.parse({ ...base, fingerprint: fingerprint(base) }));
}
