import type { RuntimeNode, RuntimeViewport, SceneProjectionResult } from "@aevum/scene-runtime";

export const RENDERER_2D_VERSION = "1.0.0" as const;

export type RenderQuality = SceneProjectionResult["qualityMode"];
export type RenderBackendHint = "DOM" | "SVG" | "CANVAS" | "WEBGL" | "RASTER";
export type RenderOperationKind = "PAINT" | "CLIP" | "MASK" | "BLEND" | "TEXT" | "IMAGE" | "VECTOR" | "EFFECT";
export type RenderDiagnosticSeverity = "INFO" | "WARNING" | "ERROR";
export type RenderDiagnosticCode =
  | "UNSUPPORTED_NODE"
  | "MISSING_ASSET"
  | "INVALID_PAINT_ORDER"
  | "UNRESOLVED_STYLE"
  | "CLIPPING_CONFLICT";

export interface RenderDiagnostic {
  readonly code: RenderDiagnosticCode;
  readonly severity: RenderDiagnosticSeverity;
  readonly message: string;
  readonly runtimeNodeId?: string;
  readonly relatedIds?: readonly string[];
  readonly path?: string;
  readonly recoverable: boolean;
}

export interface RenderColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
  readonly colorSpace: "SRGB" | "LINEAR_SRGB" | "DISPLAY_P3" | "ACESCG" | "REC709" | "REC2020";
}

export interface GradientStop {
  readonly offset: number;
  readonly color: RenderColor;
}

export type RenderPaint =
  | { readonly type: "SOLID"; readonly color: RenderColor }
  | {
      readonly type: "LINEAR_GRADIENT" | "RADIAL_GRADIENT";
      readonly stops: readonly GradientStop[];
      readonly angle?: number | undefined;
      readonly center?: Readonly<{ x: number; y: number }> | undefined;
      readonly radius?: number | undefined;
    };

export type RenderBlendMode =
  | "NORMAL"
  | "MULTIPLY"
  | "SCREEN"
  | "OVERLAY"
  | "DARKEN"
  | "LIGHTEN"
  | "COLOR_DODGE"
  | "COLOR_BURN"
  | "HARD_LIGHT"
  | "SOFT_LIGHT"
  | "DIFFERENCE"
  | "EXCLUSION"
  | "HUE"
  | "SATURATION"
  | "COLOR"
  | "LUMINOSITY";

export interface RenderStroke {
  readonly paint: RenderPaint;
  readonly width: number;
  readonly alignment: "INSIDE" | "CENTER" | "OUTSIDE";
  readonly join: "MITER" | "ROUND" | "BEVEL";
  readonly cap: "BUTT" | "ROUND" | "SQUARE";
  readonly dashArray: readonly number[];
}

export type RenderEffect =
  | {
      readonly type: "SHADOW";
      readonly color: RenderColor;
      readonly offsetX: number;
      readonly offsetY: number;
      readonly blur: number;
      readonly spread: number;
      readonly inset: boolean;
    }
  | { readonly type: "BLUR"; readonly radius: number }
  | { readonly type: "OPACITY"; readonly value: number }
  | { readonly type: "OVERLAY"; readonly paint: RenderPaint; readonly opacity: number };

export interface ResolvedRenderStyle {
  readonly fills: readonly RenderPaint[];
  readonly strokes: readonly RenderStroke[];
  readonly cornerRadii: Readonly<{ topLeft: number; topRight: number; bottomRight: number; bottomLeft: number }>;
  readonly blendMode: RenderBlendMode;
  readonly isolated: boolean;
}

interface RenderOperationBase {
  readonly id: string;
  readonly kind: RenderOperationKind;
  readonly runtimeNodeId: string;
  readonly canonicalNodeId: string;
  readonly parentOperationId?: string;
  readonly order: number;
  readonly depth: number;
  readonly backendHint: RenderBackendHint;
  readonly opacity: number;
  readonly worldTransform: RuntimeNode["worldTransform"];
  readonly dimensions?: RuntimeNode["dimensions"];
  readonly constraints?: RuntimeNode["constraints"];
  readonly layout?: RuntimeNode["layout"];
}

export interface PaintOperation extends RenderOperationBase {
  readonly kind: "PAINT";
  readonly nodeType: RuntimeNode["type"];
  readonly style: ResolvedRenderStyle;
}

export interface ClipOperation extends RenderOperationBase {
  readonly kind: "CLIP";
  readonly clipType: "BOUNDS";
}

export interface MaskOperation extends RenderOperationBase {
  readonly kind: "MASK";
  readonly maskType: "ALPHA" | "CLIP";
  readonly sourceRuntimeNodeIds: readonly string[];
}

export interface BlendOperation extends RenderOperationBase {
  readonly kind: "BLEND";
  readonly blendMode: RenderBlendMode;
  readonly isolated: boolean;
}

type TextSource = Extract<RuntimeNode["sourceNode"], { type: "TEXT" }>;

export interface TextOperation extends RenderOperationBase {
  readonly kind: "TEXT";
  readonly content: string;
  readonly runs: TextSource["runs"];
  readonly paragraphStyle: TextSource["paragraphStyle"];
  readonly fontAssetIds: readonly string[];
}

export interface ImageOperation extends RenderOperationBase {
  readonly kind: "IMAGE";
  readonly asset: Readonly<{
    id: string;
    hash: string;
    mimeType: string;
    uri: string;
    width?: number;
    height?: number;
  }>;
  readonly crop?: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly fit: "FILL" | "CONTAIN" | "COVER" | "NONE" | "SCALE_DOWN";
  readonly repeat: "NO_REPEAT" | "REPEAT" | "REPEAT_X" | "REPEAT_Y";
  readonly alignment:
    | "TOP_LEFT"
    | "TOP"
    | "TOP_RIGHT"
    | "LEFT"
    | "CENTER"
    | "RIGHT"
    | "BOTTOM_LEFT"
    | "BOTTOM"
    | "BOTTOM_RIGHT";
}

export type VectorSource =
  | Readonly<{ type: "SHAPE"; shapeType: string; geometry: Readonly<Record<string, unknown>> }>
  | Readonly<{
      type: "PATHS";
      paths: readonly Readonly<{ data: string; closed: boolean }>[];
      windingRule: "NONZERO" | "EVENODD";
    }>
  | Readonly<{ type: "SVG_ASSET"; assetId: string; hash: string; uri: string }>
  | Readonly<{ type: "INLINE_SVG"; source: string; optimized: boolean }>;

export interface VectorOperation extends RenderOperationBase {
  readonly kind: "VECTOR";
  readonly source: VectorSource;
  readonly fills: readonly RenderPaint[];
  readonly strokes: readonly RenderStroke[];
  readonly booleanOperation?: "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE";
}

export interface EffectOperation extends RenderOperationBase {
  readonly kind: "EFFECT";
  readonly effects: readonly RenderEffect[];
}

export type RenderGraphNode =
  | PaintOperation
  | ClipOperation
  | MaskOperation
  | BlendOperation
  | TextOperation
  | ImageOperation
  | VectorOperation
  | EffectOperation;

export type RenderGraphEdgeType = "CONTAINS" | "CLIPS" | "MASKS" | "BLENDS" | "APPLIES_EFFECT";

export interface RenderGraphEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly type: RenderGraphEdgeType;
}

export interface PaintOrderResult {
  readonly nodeIds: readonly string[];
  readonly nodes: readonly RuntimeNode[];
  readonly diagnostics: readonly RenderDiagnostic[];
}

export interface EffectResolutionResult {
  readonly effects: readonly RenderEffect[];
  readonly diagnostics: readonly RenderDiagnostic[];
}

export interface RenderGraph {
  readonly version: typeof RENDERER_2D_VERSION;
  readonly projectionFingerprint: string;
  readonly fingerprint: string;
  readonly viewport: RuntimeViewport;
  readonly quality: RenderQuality;
  readonly rootOperationIds: readonly string[];
  readonly operations: ReadonlyMap<string, RenderGraphNode>;
  readonly edges: readonly RenderGraphEdge[];
  readonly paintOrder: readonly string[];
  readonly diagnostics: readonly RenderDiagnostic[];
}

export interface RenderStatistics {
  readonly visibleNodes: number;
  readonly operations: number;
  readonly diagnostics: number;
  readonly cacheKey: string;
}

export interface RendererOutput {
  readonly graph: RenderGraph;
  readonly diagnostics: readonly RenderDiagnostic[];
  readonly complete: boolean;
  readonly statistics: RenderStatistics;
}

export interface RendererCacheStatistics {
  readonly hits: number;
  readonly misses: number;
  readonly entries: number;
  readonly evictions: number;
}

export interface RendererConfiguration {
  readonly enableCache: boolean;
  readonly cacheSize: number;
}

export interface Renderer2D {
  render(projection: SceneProjectionResult): RendererOutput;
  clearCache(): void;
  cacheStatistics(): RendererCacheStatistics;
}
