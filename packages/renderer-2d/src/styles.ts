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
            ? [
                {
                  paint: stroke,
                  width: geometryStrokeWidth(source) ?? 1,
                  alignment: "CENTER",
                  join: "MITER",
                  cap: "BUTT",
                  dashArray: [],
                },
              ]
            : [],
      cornerRadii: hasCornerRadii(metadata.metadata.cornerRadii)
        ? metadata.metadata.cornerRadii
        : geometryCornerRadii(source),
      blendMode: metadata.metadata.blendMode,
      isolated,
    },
    diagnostics,
  });
}

function hasCornerRadii(radii: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number }) {
  return radii.topLeft !== 0 || radii.topRight !== 0 || radii.bottomRight !== 0 || radii.bottomLeft !== 0;
}

// Reconstruction samples real cornerRadius/stroke-width values directly onto SHAPE.geometry
// (packages/reconstruction/src/proposal.ts) rather than the "aevum.renderer2d" metadata key, since
// no canonical Radius/Stroke field exists yet (see that file's "migrationTarget" note). Studio's own
// canvas already reads geometry.cornerRadius/geometry.stroke.width directly for the same reason
// (apps/studio/src/main.tsx) — this mirrors that fallback so the rasterizer used by
// fidelity.measure agrees with what Studio actually renders, instead of always defaulting to 0/1.
function geometryCornerRadii(source: RuntimeNode["resolvedNode"]) {
  if (source.type !== "SHAPE") return { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
  const radius = (source.geometry as { cornerRadius?: unknown }).cornerRadius;
  const value = typeof radius === "number" && Number.isFinite(radius) ? radius : 0;
  return { topLeft: value, topRight: value, bottomRight: value, bottomLeft: value };
}

function geometryStrokeWidth(source: RuntimeNode["resolvedNode"]): number | undefined {
  if (source.type !== "SHAPE") return undefined;
  const width = (source.geometry as { stroke?: { width?: unknown } }).stroke?.width;
  return typeof width === "number" && Number.isFinite(width) ? width : undefined;
}
