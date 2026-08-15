import type { RuntimeNode } from "@aevum/scene-runtime";
import { deepFreeze } from "./immutable.js";
import { resolveRendererMetadata } from "./metadata.js";
import type { RenderColor, RenderDiagnostic, RenderPaint, ResolvedRenderStyle } from "./types.js";

interface StyleResolution {
  readonly style: ResolvedRenderStyle;
  readonly diagnostics: readonly RenderDiagnostic[];
}

function canonicalColor(value: unknown): RenderColor | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.r !== "number" ||
    typeof candidate.g !== "number" ||
    typeof candidate.b !== "number" ||
    typeof candidate.a !== "number" ||
    typeof candidate.colorSpace !== "string"
  ) {
    return undefined;
  }
  return value as RenderColor;
}

function canonicalGradient(
  value: unknown,
): Extract<RenderPaint, { type: "LINEAR_GRADIENT" | "RADIAL_GRADIENT" }> | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== "LINEAR_GRADIENT" && candidate.type !== "RADIAL_GRADIENT") return undefined;
  if (!Array.isArray(candidate.stops) || candidate.stops.length < 2) return undefined;
  const stops = candidate.stops.map((stop) => {
    const entry = stop as { offset?: unknown; color?: unknown };
    const color = canonicalColor(entry.color);
    if (typeof entry.offset !== "number" || !color) return undefined;
    return { offset: entry.offset, color };
  });
  if (stops.some((stop) => !stop)) return undefined;
  return {
    type: candidate.type,
    stops: stops as { readonly offset: number; readonly color: RenderColor }[],
    ...(typeof candidate.angle === "number" ? { angle: candidate.angle } : {}),
    ...(candidate.center && typeof candidate.center === "object"
      ? { center: candidate.center as { x: number; y: number } }
      : {}),
    ...(typeof candidate.radius === "number" ? { radius: candidate.radius } : {}),
  };
}

function tokenPaint(node: RuntimeNode, tokenId: string | undefined): RenderPaint | undefined {
  if (!tokenId) return undefined;
  const token = node.resolvedReferences.tokens.find((entry) => entry.id === tokenId && entry.resolved)?.value;
  const color = canonicalColor(token?.value);
  if (color) return { type: "SOLID", color };
  return canonicalGradient(token?.value);
}

export function resolveStyle(node: RuntimeNode): StyleResolution {
  const metadata = resolveRendererMetadata(node);
  const diagnostics = [...metadata.diagnostics];
  const source = node.resolvedNode;
  // Text color is per-run in the canonical model, but this render style is one value per node —
  // the first run is used as the representative style, the same simplification the Studio canvas
  // already makes for font family/size/weight/line-height.
  const fillTokenId =
    source.type === "SHAPE"
      ? source.fillTokenId
      : source.type === "TEXT"
        ? source.runs[0]?.style.fillTokenId
        : undefined;
  const strokeTokenId = source.type === "SHAPE" ? source.strokeTokenId : undefined;
  const fill = tokenPaint(node, fillTokenId);
  const stroke = tokenPaint(node, strokeTokenId);

  if (fillTokenId && !fill) {
    diagnostics.push({
      code: "UNRESOLVED_STYLE",
      severity: "WARNING",
      message: `Fill token ${fillTokenId} cannot be resolved to a canonical color paint.`,
      runtimeNodeId: node.id,
      relatedIds: [fillTokenId],
      path: `nodes.${source.id}.fillTokenId`,
      recoverable: true,
    });
  }
  if (strokeTokenId && !stroke) {
    diagnostics.push({
      code: "UNRESOLVED_STYLE",
      severity: "WARNING",
      message: `Stroke token ${strokeTokenId} cannot be resolved to a canonical color paint.`,
      runtimeNodeId: node.id,
      relatedIds: [strokeTokenId],
      path: `nodes.${source.id}.strokeTokenId`,
      recoverable: true,
    });
  }

  const isolated = source.type === "GROUP" ? source.isolation || !source.passThroughBlend : false;
  return deepFreeze({
    style: {
      fills: metadata.metadata.fills.length > 0 ? metadata.metadata.fills : fill ? [fill] : [],
      strokes:
        metadata.metadata.strokes.length > 0
          ? metadata.metadata.strokes
          : stroke
            ? [{ paint: stroke, width: 1, alignment: "CENTER", join: "MITER", cap: "BUTT", dashArray: [] }]
            : [],
      cornerRadii: metadata.metadata.cornerRadii,
      blendMode: metadata.metadata.blendMode,
      isolated,
    },
    diagnostics,
  });
}
