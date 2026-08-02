import type { PackageContract } from "@aevum/shared";

export { resolveEffects } from "./effects.js";
export { buildRenderGraph } from "./graph.js";
export { resolvePaintOrder } from "./paint-order.js";
export { createRenderer, render } from "./renderer.js";
export type {
  BlendOperation,
  ClipOperation,
  EffectOperation,
  EffectResolutionResult,
  ImageOperation,
  MaskOperation,
  PaintOperation,
  PaintOrderResult,
  RenderBackendHint,
  RenderBlendMode,
  RenderColor,
  RenderDiagnostic,
  RenderDiagnosticCode,
  RenderEffect,
  Renderer2D,
  RendererCacheStatistics,
  RendererConfiguration,
  RendererOutput,
  RenderGraph,
  RenderGraphEdge,
  RenderGraphNode,
  RenderOperationKind,
  RenderPaint,
  RenderStroke,
  ResolvedRenderStyle,
  TextOperation,
  VectorOperation,
} from "./types.js";
export { RENDERER_2D_VERSION } from "./types.js";

export const packageContract: PackageContract = {
  name: "@aevum/renderer-2d",
  kind: "package",
  responsibility: "Deterministic renderer-independent Hybrid 2D Render Graph construction.",
  owns: "2D paint ordering, visual metadata resolution, diagnostics, and render caching.",
  mustNotOwn: "Canonical state, layout solving, browser APIs, target output, or exporter policy.",
  status: "IMPLEMENTED",
};

export const RENDERER_2D_STATUS = packageContract.status;
