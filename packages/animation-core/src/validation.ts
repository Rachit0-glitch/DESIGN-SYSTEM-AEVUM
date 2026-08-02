import {
  AnimationStateMachineSchema,
  TimelineSchema,
  type AnimationStateMachine,
  type Timeline,
} from "@aevum/document-model";
import { deepFreeze } from "./immutable.js";
import type { AnimationDiagnostic, AnimationValidationResult } from "./types.js";

function schemaDiagnostics(error: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): AnimationDiagnostic[] {
  return error.issues.map((entry) => ({
    code: entry.path.includes("easing") ? "INVALID_EASING" : "SCHEMA_INVALID",
    severity: "ERROR",
    message: entry.message,
    path: entry.path.join("."),
    recoverable: true,
  }));
}

export function validateTimeline(input: unknown): AnimationValidationResult<Timeline> {
  const parsed = TimelineSchema.safeParse(input);
  if (!parsed.success) return deepFreeze({ success: false, diagnostics: schemaDiagnostics(parsed.error) });
  const timeline = parsed.data;
  const diagnostics: AnimationDiagnostic[] = [];
  if (timeline.tracks.length === 0) {
    diagnostics.push({
      code: "MISSING_TRACKS",
      severity: "ERROR",
      message: "Timeline has no tracks.",
      path: "tracks",
      entityId: timeline.id,
      recoverable: true,
    });
  }
  for (const [trackIndex, track] of timeline.tracks.entries()) {
    let previous = -1;
    if (track.keyframes.length === 0)
      diagnostics.push({
        code: "INVALID_KEYFRAME",
        severity: "ERROR",
        message: "Track has no keyframes.",
        path: `tracks.${trackIndex}.keyframes`,
        entityId: track.id,
        recoverable: true,
      });
    for (const [keyframeIndex, keyframe] of track.keyframes.entries()) {
      if (keyframe.time > timeline.duration)
        diagnostics.push({
          code: "INVALID_KEYFRAME",
          severity: "ERROR",
          message: `Keyframe time ${keyframe.time} exceeds timeline duration ${timeline.duration}.`,
          path: `tracks.${trackIndex}.keyframes.${keyframeIndex}.time`,
          entityId: keyframe.id,
          recoverable: true,
        });
      if (keyframe.time <= previous)
        diagnostics.push({
          code: "UNSORTED_KEYFRAMES",
          severity: "ERROR",
          message: "Keyframe times must be strictly increasing.",
          path: `tracks.${trackIndex}.keyframes.${keyframeIndex}.time`,
          entityId: keyframe.id,
          recoverable: true,
        });
      previous = keyframe.time;
    }
  }
  const trackIds = new Set(timeline.tracks.map((track) => track.id));
  for (const [clipIndex, clip] of timeline.clips.entries()) {
    if (clip.end <= clip.start || clip.end > timeline.duration)
      diagnostics.push({
        code: "OVERLAPPING_CLIPS",
        severity: "ERROR",
        message: "Clip range must be ordered and contained by the timeline.",
        path: `clips.${clipIndex}`,
        entityId: clip.id,
        recoverable: true,
      });
    for (const trackId of clip.trackIds)
      if (!trackIds.has(trackId))
        diagnostics.push({
          code: "BROKEN_TRACK_REFERENCE",
          severity: "ERROR",
          message: `Clip references missing track ${trackId}.`,
          path: `clips.${clipIndex}.trackIds`,
          entityId: clip.id,
          recoverable: true,
        });
  }
  const clips = [...timeline.clips].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
  for (let index = 1; index < clips.length; index += 1) {
    const previous = clips[index - 1];
    const current = clips[index];
    if (
      previous &&
      current &&
      current.start < previous.end &&
      current.trackIds.some((id) => previous.trackIds.includes(id))
    )
      diagnostics.push({
        code: "OVERLAPPING_CLIPS",
        severity: "ERROR",
        message: `Clips ${previous.id} and ${current.id} overlap on a shared track.`,
        path: "clips",
        entityId: current.id,
        recoverable: true,
      });
  }
  if (timeline.loop.enabled && timeline.loop.count === null)
    diagnostics.push({
      code: "INFINITE_LOOP",
      severity: "WARNING",
      message: "Timeline has an unbounded loop; fixed-time evaluation remains bounded.",
      path: "loop.count",
      entityId: timeline.id,
      recoverable: true,
    });
  if (timeline.reducedMotionTimelineId === timeline.id)
    diagnostics.push({
      code: "CIRCULAR_REDUCED_MOTION",
      severity: "ERROR",
      message: "A timeline cannot use itself as its reduced-motion alternative.",
      path: "reducedMotionTimelineId",
      entityId: timeline.id,
      recoverable: true,
    });
  return deepFreeze({
    success: !diagnostics.some((entry) => entry.severity === "ERROR"),
    value: timeline,
    diagnostics,
  });
}

export function validateStateMachine(input: unknown): AnimationValidationResult<AnimationStateMachine> {
  const parsed = AnimationStateMachineSchema.safeParse(input);
  if (!parsed.success) return deepFreeze({ success: false, diagnostics: schemaDiagnostics(parsed.error) });
  const machine = parsed.data;
  const diagnostics: AnimationDiagnostic[] = [];
  const states = new Set(machine.states.map((state) => state.id));
  const triggers = new Set(machine.triggers.map((trigger) => trigger.id));
  if (!states.has(machine.initialStateId))
    diagnostics.push({
      code: "BROKEN_TRANSITION",
      severity: "ERROR",
      message: "Initial state is missing.",
      path: "initialStateId",
      entityId: machine.id,
      recoverable: true,
    });
  for (const [index, transition] of machine.transitions.entries()) {
    if (
      !states.has(transition.fromStateId) ||
      !states.has(transition.toStateId) ||
      (transition.triggerId && !triggers.has(transition.triggerId))
    )
      diagnostics.push({
        code: "BROKEN_TRANSITION",
        severity: "ERROR",
        message: `Transition ${transition.id} has a missing state or trigger.`,
        path: `transitions.${index}`,
        entityId: transition.id,
        recoverable: true,
      });
    if (transition.fromStateId === transition.toStateId && !transition.triggerId && !transition.guard)
      diagnostics.push({
        code: "CIRCULAR_STATE",
        severity: "ERROR",
        message: "Unconditional self-transition would cycle indefinitely.",
        path: `transitions.${index}`,
        entityId: transition.id,
        recoverable: true,
      });
  }
  return deepFreeze({ success: !diagnostics.some((entry) => entry.severity === "ERROR"), value: machine, diagnostics });
}
