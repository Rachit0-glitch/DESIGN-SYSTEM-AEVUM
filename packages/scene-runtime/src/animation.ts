import { evaluateTimeline, type JsonValue } from "@aevum/animation-core";
import type { CanonicalDesignDocument, DesignNode } from "@aevum/document-model";
import type { RuntimeAnimationData, RuntimeResponsiveData, RuntimeViewport } from "./types.js";

const aliases: Readonly<Record<string, string>> = {
  position: "transform.position",
  rotation: "transform.rotation",
  scale: "transform.scale",
  opacity: "transform.opacity",
  visibility: "visible",
  "text.runs": "runs",
};

function pathParts(path: string): string[] {
  return (aliases[path] ?? path)
    .replaceAll(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
}

function setPath(target: Record<string, unknown>, path: string, value: JsonValue): boolean {
  const parts = pathParts(path);
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!part) return false;
    const next = cursor[part];
    if (next === null || typeof next !== "object") return false;
    cursor = next as Record<string, unknown>;
  }
  const leaf = parts.at(-1);
  if (!leaf || !(leaf in cursor)) return false;
  cursor[leaf] = structuredClone(value);
  return true;
}

export function resolveNodeAnimation(
  document: CanonicalDesignDocument,
  sourceNodeId: string,
  responsiveNode: DesignNode,
  responsive: RuntimeResponsiveData,
  viewport: RuntimeViewport,
): { readonly node: DesignNode; readonly data: RuntimeAnimationData } {
  const animation = viewport.animation ?? { time: 0 };
  const selected = animation.timelineIds
    ? animation.timelineIds.map((id) => document.timelines[id]).filter((timeline) => timeline !== undefined)
    : Object.values(document.timelines);
  const node = structuredClone(responsiveNode) as DesignNode;
  const changedPaths: string[] = [];
  const appliedTimelineIds: string[] = [];
  const evaluationFingerprints: string[] = [];
  const reducedMotion = responsive.motion ?? {
    behavior: viewport.reducedMotion ? ("REDUCE" as const) : ("PRESERVE" as const),
    durationScale: viewport.reducedMotion ? 0.2 : 1,
  };
  for (const timeline of selected.sort((left, right) => left.id.localeCompare(right.id))) {
    const evaluation = evaluateTimeline(timeline, {
      time: animation.time,
      ...(animation.progress !== undefined ? { progress: animation.progress } : {}),
      ...(animation.active !== undefined ? { active: animation.active } : {}),
      ...(animation.playbackState ? { playbackState: animation.playbackState } : {}),
      reducedMotion,
      timelineRegistry: document.timelines,
    });
    const values = evaluation.targetValues[sourceNodeId];
    if (!values) continue;
    let applied = false;
    for (const [path, value] of Object.entries(values).sort(([left], [right]) => left.localeCompare(right))) {
      if (setPath(node as unknown as Record<string, unknown>, path, value)) {
        changedPaths.push(path);
        applied = true;
      }
    }
    if (applied) {
      appliedTimelineIds.push(timeline.id);
      evaluationFingerprints.push(evaluation.fingerprint);
    }
  }
  return {
    node,
    data: {
      time: animation.time,
      appliedTimelineIds: [...new Set(appliedTimelineIds)],
      changedPaths: [...new Set(changedPaths)].sort(),
      evaluationFingerprints,
    },
  };
}
