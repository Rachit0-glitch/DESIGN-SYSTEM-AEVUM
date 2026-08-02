import { evaluateTimeline } from "@aevum/animation-core";
import { deepFreeze } from "./immutable.js";
import {
  MOTION_REPORT_VERSION,
  MotionReportSchema,
  type KeyframeDetectionResult,
  type MotionAnalysis,
  type MotionFrameSequence,
  type MotionReport,
  type MotionRuntimeSample,
  type MotionTask,
  type MotionValidation,
  type TimelineProposal,
} from "./schemas.js";
import { deterministicId, fingerprint } from "./stable.js";

export interface CreateMotionReportInput {
  readonly task: MotionTask;
  readonly sequence: MotionFrameSequence;
  readonly analysis: MotionAnalysis;
  readonly keyframes: KeyframeDetectionResult;
  readonly proposal: TimelineProposal;
  readonly validation: MotionValidation;
  readonly createdAt: string;
}

function runtimeSamples(proposal: TimelineProposal): MotionRuntimeSample[] {
  if (!proposal.timeline) return [];
  const timeline = proposal.timeline;
  const times = [...new Set([0, timeline.duration / 2, timeline.duration])];
  return times.map((time) => {
    const evaluation = evaluateTimeline(timeline, time);
    return {
      time,
      evaluationFingerprint: evaluation.fingerprint,
      targetValues: evaluation.targetValues,
    };
  });
}

export function createMotionReport(input: CreateMotionReportInput): MotionReport {
  const diagnostics = [
    ...new Map(
      [...input.analysis.diagnostics, ...input.keyframes.diagnostics, ...input.validation.diagnostics].map((entry) => [
        JSON.stringify(entry),
        entry,
      ]),
    ).values(),
  ];
  const status = !input.validation.success
    ? "FAILED"
    : diagnostics.some((entry) => entry.severity === "WARNING")
      ? "REVIEW_REQUIRED"
      : "VALIDATED";
  const base = {
    id: deterministicId("motion-report", {
      taskId: input.task.id,
      proposalFingerprint: input.proposal.proposalFingerprint,
      validationFingerprint: input.validation.fingerprint,
    }),
    reportVersion: MOTION_REPORT_VERSION,
    createdAt: input.createdAt,
    taskId: input.task.id,
    analysisId: input.analysis.id,
    proposalId: input.proposal.id,
    sourceAssetIds: input.task.sourceAssetIds,
    sourceFormat: input.task.sourceFormat,
    duration: input.sequence.duration,
    frameRate: input.sequence.frameRate,
    counts: {
      frames: input.sequence.frames.length,
      tracks: input.analysis.tracks.length,
      keyframes: input.keyframes.keyframes.length,
    },
    cameraMotions: input.analysis.cameraMotions,
    confidence: input.analysis.confidence,
    validation: input.validation,
    runtimeSamples: runtimeSamples(input.proposal),
    diagnostics,
    status,
  };
  return deepFreeze(MotionReportSchema.parse({ ...base, reportFingerprint: fingerprint(base) }));
}
