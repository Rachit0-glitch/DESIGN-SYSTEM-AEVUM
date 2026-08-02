import type { SceneProjectionResult } from "@aevum/scene-runtime";
import { z } from "zod";
import { RendererCache } from "./cache.js";
import { buildRenderGraph } from "./graph.js";
import { deepFreeze } from "./immutable.js";
import { sha256 } from "./stable.js";
import { RENDERER_2D_VERSION, type Renderer2D, type RendererConfiguration, type RendererOutput } from "./types.js";

const ConfigurationSchema = z.strictObject({
  enableCache: z.boolean().default(true),
  cacheSize: z.number().int().positive().max(10_000).default(64),
});

function cacheKey(projection: SceneProjectionResult): string {
  return sha256({
    projectionFingerprint: projection.fingerprint,
    rendererVersion: RENDERER_2D_VERSION,
    viewport: projection.viewport,
    quality: projection.qualityMode,
  });
}

function renderUncached(projection: SceneProjectionResult): RendererOutput {
  const key = cacheKey(projection);
  const graph = buildRenderGraph(projection);
  return deepFreeze({
    graph,
    diagnostics: graph.diagnostics,
    complete: projection.complete && !graph.diagnostics.some((diagnostic) => diagnostic.severity === "ERROR"),
    statistics: {
      visibleNodes: graph.paintOrder.length,
      operations: graph.operations.size,
      diagnostics: graph.diagnostics.length,
      cacheKey: key,
    },
  });
}

export function createRenderer(configuration: Partial<RendererConfiguration> = {}): Renderer2D {
  const resolved = ConfigurationSchema.parse(configuration);
  const cache = new RendererCache(resolved.cacheSize);
  return Object.freeze({
    render(projection: SceneProjectionResult): RendererOutput {
      if (!resolved.enableCache) return renderUncached(projection);
      const key = cacheKey(projection);
      const cached = cache.get(key);
      if (cached) return cached;
      const output = renderUncached(projection);
      cache.set(key, output);
      return output;
    },
    clearCache(): void {
      cache.clear();
    },
    cacheStatistics() {
      return cache.statistics();
    },
  });
}

export function render(projection: SceneProjectionResult): RendererOutput {
  return renderUncached(projection);
}
