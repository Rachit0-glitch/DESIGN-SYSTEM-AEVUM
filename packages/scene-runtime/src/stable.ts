import { createHash } from "node:crypto";
import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { RuntimeViewport, SceneRuntimeConfiguration } from "./types.js";
import { SCENE_PROJECTION_VERSION } from "./types.js";

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableSerialize(child)}`).join(",")}}`;
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

export function createProjectionFingerprint(
  document: CanonicalDesignDocument,
  viewport: RuntimeViewport,
  configuration: SceneRuntimeConfiguration,
): string {
  return `sha256:${stableHash({
    projectionVersion: SCENE_PROJECTION_VERSION,
    document,
    viewport,
    configuration,
  })}`;
}

export function createProjectedInstanceId(instanceId: string, componentId: string, sourceNodeId: string): string {
  return `runtime_${stableHash({ instanceId, componentId, sourceNodeId }).slice(0, 32)}`;
}
