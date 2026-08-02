import { CURRENT_COMMAND_VERSION, type Command } from "@aevum/command-engine";
import {
  TimelineSchema,
  type CanonicalDesignDocument,
  type Timeline,
  type TimelineKeyframe,
} from "@aevum/document-model";
import { deepFreeze } from "./immutable.js";
import {
  MOTION_PROPOSAL_VERSION,
  MotionCommandPlanSchema,
  TimelineProposalSchema,
  type DetectedKeyframe,
  type KeyframeDetectionResult,
  type MotionAnalysis,
  type MotionCommandPlan,
  type MotionDiagnostic,
  type MotionTask,
  type TimelineProposal,
} from "./schemas.js";
import {
  deterministicCommandId,
  deterministicEntityId,
  deterministicId,
  deterministicTransactionId,
  fingerprint,
} from "./stable.js";

export interface GenerateTimelineProposalInput {
  readonly task: MotionTask;
  readonly analysis: MotionAnalysis;
  readonly keyframes: KeyframeDetectionResult;
  readonly document: CanonicalDesignDocument;
  readonly timestamp: string;
}

function incrementVersion(version: string): string {
  const [major = "1", minor = "0", patch = "0"] = version.split(".");
  return `${major}.${minor}.${Number(patch) + 1}`;
}

function canonicalKeyframe(task: MotionTask, trackId: string, keyframe: DetectedKeyframe): TimelineKeyframe {
  const visibility = typeof keyframe.value === "boolean";
  const easing = visibility
    ? ({ type: "STEPS", count: 1, position: "END" } as const)
    : keyframe.reason === "EASING_CHANGE"
      ? ({ type: "EASE_IN_OUT" } as const)
      : ({ type: "LINEAR" } as const);
  return {
    id: deterministicEntityId("keyframe", {
      taskId: task.id,
      trackId,
      sourceKeyframeId: keyframe.id,
    }),
    time: keyframe.time,
    value: keyframe.value,
    easing,
    interpolation: visibility ? "HOLD" : keyframe.reason === "EASING_CHANGE" ? "BEZIER" : "LINEAR",
    metadata: {
      motionReconstructionVersion: MOTION_PROPOSAL_VERSION,
      confidence: keyframe.confidence,
      reason: keyframe.reason,
      sourceFrames: keyframe.sourceFrames,
      evidence: keyframe.evidence,
    },
  };
}

function buildTimeline(
  task: MotionTask,
  analysis: MotionAnalysis,
  keyframes: KeyframeDetectionResult,
  document: CanonicalDesignDocument,
): Timeline {
  const existing = task.commandIntent.type === "UPDATE" ? document.timelines[task.commandIntent.timelineId] : undefined;
  const timelineId =
    existing?.id ??
    deterministicEntityId("timeline", {
      taskId: task.id,
      analysisFingerprint: analysis.analysisFingerprint,
      name: task.timelineName,
    });
  const detectedByTrack = new Map<string, DetectedKeyframe[]>();
  for (const keyframe of keyframes.keyframes) {
    const entries = detectedByTrack.get(keyframe.trackId) ?? [];
    entries.push(keyframe);
    detectedByTrack.set(keyframe.trackId, entries);
  }
  const tracks = [...analysis.tracks]
    .sort((left, right) => left.targetId.localeCompare(right.targetId) || left.property.localeCompare(right.property))
    .flatMap((detection, layer) => {
      const trackId = deterministicEntityId("track", {
        taskId: task.id,
        targetId: detection.targetId,
        property: detection.property,
      });
      const entries = [...(detectedByTrack.get(detection.id) ?? [])].sort(
        (left, right) => left.time - right.time || left.id.localeCompare(right.id),
      );
      if (entries.length === 0) return [];
      return [
        {
          id: trackId,
          targetId: detection.targetId,
          property: detection.property,
          propertyPath: detection.propertyPath,
          valueType: detection.valueType,
          muted: false,
          locked: false,
          layer,
          keyframes: entries.map((entry) => canonicalKeyframe(task, trackId, entry)),
        },
      ];
    });
  return TimelineSchema.parse({
    id: timelineId,
    version: existing ? incrementVersion(existing.version) : "1.0.0",
    name: task.timelineName,
    type: "TIME",
    duration: analysis.duration,
    frameRate: analysis.frameRate,
    timeScale: 1,
    loop: { enabled: false, count: 1, mode: "RESTART" },
    tracks,
    clips: [],
    markers: [],
    triggers: [],
    events: [],
    labels: {},
    metadata: {
      motionReconstructionVersion: MOTION_PROPOSAL_VERSION,
      motionTaskId: task.id,
      motionAnalysisId: analysis.id,
      keyframeDetectionId: keyframes.id,
      sourceAssetIds: task.sourceAssetIds,
      sourceFormat: task.sourceFormat,
      analysisFingerprint: analysis.analysisFingerprint,
      confidence: analysis.confidence,
    },
  });
}

function createCommand(
  task: MotionTask,
  timeline: Timeline | undefined,
  timestamp: string,
): { readonly command: Command; readonly transactionId: `tx_${string}` } {
  const action = task.commandIntent.type;
  const transactionId = deterministicTransactionId({ taskId: task.id, action });
  const base = {
    id: deterministicCommandId({ taskId: task.id, action }),
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: task.documentId,
    expectedDocumentVersion: task.expectedDocumentVersion,
    timestamp,
    actor: task.createdBy,
    correlationId: task.id,
    transactionId,
  };
  let command: Command;
  if (action === "DELETE") {
    command = { ...base, type: "timeline.delete", payload: { timelineId: task.commandIntent.timelineId } };
  } else {
    if (!timeline) throw new Error(`${action.toLowerCase()} command generation requires a canonical timeline.`);
    command =
      action === "UPDATE"
        ? { ...base, type: "timeline.update", payload: { timeline } }
        : { ...base, type: "timeline.create", payload: { timeline } };
  }
  return { command, transactionId };
}

export function generateTimelineProposal(input: GenerateTimelineProposalInput): TimelineProposal {
  const { task, analysis, keyframes, document, timestamp } = input;
  if (analysis.taskId !== task.id || keyframes.analysisId !== analysis.id) {
    throw new Error("Motion analysis and keyframes must belong to the supplied task.");
  }
  if (document.metadata.id !== task.documentId || document.documentVersion !== task.expectedDocumentVersion) {
    throw new Error("Target document identity or version does not match the motion task.");
  }
  if (task.commandIntent.type === "UPDATE" && !document.timelines[task.commandIntent.timelineId]) {
    throw new Error(`Timeline ${task.commandIntent.timelineId} does not exist for update.`);
  }
  if (task.commandIntent.type === "DELETE" && !document.timelines[task.commandIntent.timelineId]) {
    throw new Error(`Timeline ${task.commandIntent.timelineId} does not exist for deletion.`);
  }
  const timeline =
    task.commandIntent.type === "DELETE" ? undefined : buildTimeline(task, analysis, keyframes, document);
  const { command, transactionId } = createCommand(task, timeline, timestamp);
  const planBase = {
    id: deterministicId("motion-command-plan", { taskId: task.id, action: task.commandIntent.type }),
    transactionId,
    action: task.commandIntent.type,
    commands: [command],
  };
  const commandPlan: MotionCommandPlan = MotionCommandPlanSchema.parse({
    ...planBase,
    fingerprint: fingerprint(planBase),
  });
  const diagnostics: MotionDiagnostic[] = [];
  const proposalBase = {
    id: deterministicId("timeline-proposal", {
      taskId: task.id,
      analysisFingerprint: analysis.analysisFingerprint,
      keyframeFingerprint: keyframes.fingerprint,
      action: task.commandIntent.type,
    }),
    proposalVersion: MOTION_PROPOSAL_VERSION,
    taskId: task.id,
    analysisId: analysis.id,
    keyframeDetectionId: keyframes.id,
    action: task.commandIntent.type,
    ...(timeline ? { timeline } : {}),
    commandPlan,
    confidence: analysis.confidence,
    diagnostics,
  };
  return deepFreeze(
    TimelineProposalSchema.parse({
      ...proposalBase,
      proposalFingerprint: fingerprint(proposalBase),
    }),
  );
}
