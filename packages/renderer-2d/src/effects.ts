import type { RuntimeNode } from "@aevum/scene-runtime";
import { deepFreeze } from "./immutable.js";
import { resolveRendererMetadata } from "./metadata.js";
import type { EffectResolutionResult } from "./types.js";

export function resolveEffects(node: RuntimeNode): EffectResolutionResult {
  const resolution = resolveRendererMetadata(node);
  return deepFreeze({ effects: resolution.metadata.effects, diagnostics: resolution.diagnostics });
}
