import type { JsonValue, Timeline } from "./types.js";
import { evaluateEasing } from "./easing.js";

function interpolateValue(from: JsonValue, to: JsonValue, progress: number): JsonValue {
  if (typeof from === "number" && typeof to === "number") return from + (to - from) * progress;
  if (Array.isArray(from) && Array.isArray(to) && from.length === to.length) {
    return from.map((entry, index) => interpolateValue(entry, to[index] as JsonValue, progress));
  }
  if (from && to && typeof from === "object" && typeof to === "object" && !Array.isArray(from) && !Array.isArray(to)) {
    const fromRecord = from as Record<string, JsonValue>;
    const toRecord = to as Record<string, JsonValue>;
    const keys = [...new Set([...Object.keys(fromRecord), ...Object.keys(toRecord)])].sort();
    return Object.fromEntries(
      keys.map((key) => [
        key,
        key in fromRecord && key in toRecord
          ? interpolateValue(fromRecord[key] as JsonValue, toRecord[key] as JsonValue, progress)
          : progress < 1
            ? (fromRecord[key] ?? toRecord[key])
            : (toRecord[key] ?? fromRecord[key]),
      ]),
    );
  }
  return progress < 1 ? from : to;
}

export function evaluateTrack(track: Timeline["tracks"][number], time: number): JsonValue | undefined {
  if (track.muted || track.keyframes.length === 0) return undefined;
  const keyframes = [...track.keyframes].sort(
    (left, right) => left.time - right.time || left.id.localeCompare(right.id),
  );
  const first = keyframes[0];
  const last = keyframes.at(-1);
  if (!first || !last) return undefined;
  if (time <= first.time) return first.value as JsonValue;
  if (time >= last.time) return last.value as JsonValue;
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.time >= time);
  const right = keyframes[rightIndex];
  const left = keyframes[rightIndex - 1];
  if (!left || !right) return last.value as JsonValue;
  if (left.interpolation === "HOLD" || left.interpolation === "STEP") return left.value as JsonValue;
  const span = right.time - left.time;
  const linearProgress = span === 0 ? 1 : (time - left.time) / span;
  const eased = evaluateEasing(left.easing, linearProgress);
  return interpolateValue(left.value as JsonValue, right.value as JsonValue, eased);
}
