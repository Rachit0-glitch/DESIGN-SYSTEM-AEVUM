import { TimelineSchema, type Timeline } from "@aevum/document-model";
import { deepFreeze } from "./immutable.js";
import { evaluateTrack } from "./interpolation.js";
import { stableHash } from "./stable.js";
import type { JsonValue, ResolvedTimelineState, TimelineEvaluationContext } from "./types.js";

export function createTimeline(input: unknown): Readonly<Timeline> {
  return deepFreeze(TimelineSchema.parse(input));
}

function selectTimeline(timeline: Timeline, context: TimelineEvaluationContext): Timeline {
  if (context.reducedMotion?.behavior === "PRESERVE" || !context.reducedMotion) return timeline;
  const alternateId = timeline.reducedMotionTimelineId;
  if (!alternateId) return timeline;
  const alternate = context.timelineRegistry?.[alternateId];
  return alternate ?? timeline;
}

function normalizeTime(timeline: Timeline, inputTime: number): { time: number; iteration: number; completed: boolean } {
  const scaled = Math.max(0, inputTime * timeline.timeScale);
  if (!timeline.loop.enabled || timeline.duration === 0) {
    return { time: Math.min(timeline.duration, scaled), iteration: 0, completed: scaled >= timeline.duration };
  }
  const iteration = Math.floor(scaled / timeline.duration);
  const count = timeline.loop.count;
  if (count !== null && iteration >= count) {
    const terminal = timeline.loop.mode === "PING_PONG" && count % 2 === 0 ? 0 : timeline.duration;
    return { time: terminal, iteration: Math.max(0, count - 1), completed: true };
  }
  const within = scaled % timeline.duration;
  const time = timeline.loop.mode === "PING_PONG" && iteration % 2 === 1 ? timeline.duration - within : within;
  return { time, iteration, completed: false };
}

export function evaluateTimeline(
  sourceTimeline: Timeline,
  input: number | TimelineEvaluationContext,
): Readonly<ResolvedTimelineState> {
  const context: TimelineEvaluationContext = typeof input === "number" ? { time: input } : input;
  const timeline = selectTimeline(sourceTimeline, context);
  const driverTime =
    context.progress !== undefined
      ? Math.min(1, Math.max(0, context.progress)) * timeline.duration
      : Math.max(0, context.time ?? 0);
  const motion = context.reducedMotion;
  const reducedTime =
    motion?.behavior === "DISABLE" && timeline.id === sourceTimeline.id
      ? timeline.duration
      : motion?.behavior === "REDUCE" && timeline.id === sourceTimeline.id
        ? driverTime / Math.max(0.000_001, motion.durationScale)
        : driverTime;
  const normalized = normalizeTime(timeline, reducedTime);
  const targetValues: Record<string, Record<string, JsonValue>> = {};
  for (const track of [...timeline.tracks].sort(
    (left, right) => left.layer - right.layer || left.id.localeCompare(right.id),
  )) {
    const value = evaluateTrack(track, normalized.time);
    if (value === undefined) continue;
    targetValues[track.targetId] = { ...(targetValues[track.targetId] ?? {}), [track.propertyPath]: value };
  }
  const playbackState =
    context.playbackState ??
    (context.active === false ? "IDLE" : normalized.completed ? "COMPLETED" : reducedTime > 0 ? "RUNNING" : "IDLE");
  const result: ResolvedTimelineState = {
    timelineId: sourceTimeline.id,
    evaluatedTimelineId: timeline.id,
    timelineVersion: timeline.version,
    inputTime: driverTime,
    effectiveTime: normalized.time,
    progress: timeline.duration === 0 ? 1 : normalized.time / timeline.duration,
    iteration: normalized.iteration,
    playbackState,
    targetValues,
    markerIds: timeline.markers.filter((marker) => marker.time <= normalized.time).map((marker) => marker.id),
    eventIds: timeline.events.filter((event) => event.time <= normalized.time).map((event) => event.id),
    fingerprint: `sha256:${stableHash({
      version: "1.0.0",
      sourceTimelineId: sourceTimeline.id,
      timeline,
      context: { ...context, timelineRegistry: undefined },
      normalized,
      targetValues,
    })}`,
  };
  return deepFreeze(result);
}
