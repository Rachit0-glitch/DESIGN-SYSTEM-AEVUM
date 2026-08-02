import type { RuntimeNode } from "@aevum/scene-runtime";
import { z } from "zod";
import { deepFreeze } from "./immutable.js";
import type { RenderDiagnostic } from "./types.js";

const ColorSchema = z.strictObject({
  r: z.number().finite().min(0).max(1),
  g: z.number().finite().min(0).max(1),
  b: z.number().finite().min(0).max(1),
  a: z.number().finite().min(0).max(1).default(1),
  colorSpace: z.enum(["SRGB", "LINEAR_SRGB", "DISPLAY_P3", "ACESCG", "REC709", "REC2020"]),
});

const GradientStopSchema = z.strictObject({ offset: z.number().finite().min(0).max(1), color: ColorSchema });
const SolidPaintSchema = z.strictObject({ type: z.literal("SOLID"), color: ColorSchema });
const GradientPaintSchema = z.strictObject({
  type: z.enum(["LINEAR_GRADIENT", "RADIAL_GRADIENT"]),
  stops: z.array(GradientStopSchema).min(2),
  angle: z.number().finite().optional(),
  center: z.strictObject({ x: z.number().finite(), y: z.number().finite() }).optional(),
  radius: z.number().finite().nonnegative().optional(),
});
const PaintSchema = z.discriminatedUnion("type", [SolidPaintSchema, GradientPaintSchema]);

const StrokeSchema = z.strictObject({
  paint: PaintSchema,
  width: z.number().finite().nonnegative(),
  alignment: z.enum(["INSIDE", "CENTER", "OUTSIDE"]).default("CENTER"),
  join: z.enum(["MITER", "ROUND", "BEVEL"]).default("MITER"),
  cap: z.enum(["BUTT", "ROUND", "SQUARE"]).default("BUTT"),
  dashArray: z.array(z.number().finite().nonnegative()).default([]),
});

const ShadowEffectSchema = z.strictObject({
  type: z.literal("SHADOW"),
  color: ColorSchema,
  offsetX: z.number().finite(),
  offsetY: z.number().finite(),
  blur: z.number().finite().nonnegative(),
  spread: z.number().finite().default(0),
  inset: z.boolean().default(false),
});
const BlurEffectSchema = z.strictObject({ type: z.literal("BLUR"), radius: z.number().finite().nonnegative() });
const OpacityEffectSchema = z.strictObject({
  type: z.literal("OPACITY"),
  value: z.number().finite().min(0).max(1),
});
const OverlayEffectSchema = z.strictObject({
  type: z.literal("OVERLAY"),
  paint: PaintSchema,
  opacity: z.number().finite().min(0).max(1).default(1),
});
const EffectSchema = z.discriminatedUnion("type", [
  ShadowEffectSchema,
  BlurEffectSchema,
  OpacityEffectSchema,
  OverlayEffectSchema,
]);

const RendererMetadataSchema = z.strictObject({
  zIndex: z.number().int().default(0),
  blendMode: z
    .enum([
      "NORMAL",
      "MULTIPLY",
      "SCREEN",
      "OVERLAY",
      "DARKEN",
      "LIGHTEN",
      "COLOR_DODGE",
      "COLOR_BURN",
      "HARD_LIGHT",
      "SOFT_LIGHT",
      "DIFFERENCE",
      "EXCLUSION",
      "HUE",
      "SATURATION",
      "COLOR",
      "LUMINOSITY",
    ])
    .default("NORMAL"),
  fills: z.array(PaintSchema).default([]),
  strokes: z.array(StrokeSchema).default([]),
  cornerRadii: z
    .strictObject({
      topLeft: z.number().finite().nonnegative(),
      topRight: z.number().finite().nonnegative(),
      bottomRight: z.number().finite().nonnegative(),
      bottomLeft: z.number().finite().nonnegative(),
    })
    .default({ topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 }),
  effects: z.array(EffectSchema).default([]),
  maskType: z.enum(["ALPHA", "CLIP"]).default("ALPHA"),
  imageRepeat: z.enum(["NO_REPEAT", "REPEAT", "REPEAT_X", "REPEAT_Y"]).default("NO_REPEAT"),
  imageAlignment: z
    .enum(["TOP_LEFT", "TOP", "TOP_RIGHT", "LEFT", "CENTER", "RIGHT", "BOTTOM_LEFT", "BOTTOM", "BOTTOM_RIGHT"])
    .default("CENTER"),
  booleanOperation: z.enum(["UNION", "SUBTRACT", "INTERSECT", "EXCLUDE"]).optional(),
});

export type RendererMetadata = z.infer<typeof RendererMetadataSchema>;

const DEFAULT_METADATA = Object.freeze(RendererMetadataSchema.parse({}));

export interface MetadataResolution {
  readonly metadata: Readonly<RendererMetadata>;
  readonly diagnostics: readonly RenderDiagnostic[];
}

export function resolveRendererMetadata(node: RuntimeNode): MetadataResolution {
  const raw = node.resolvedNode.metadata.customData["aevum.renderer2d"];
  if (raw === undefined) return { metadata: DEFAULT_METADATA, diagnostics: [] };
  const parsed = RendererMetadataSchema.safeParse(raw);
  if (parsed.success) return deepFreeze({ metadata: parsed.data, diagnostics: [] });
  return deepFreeze({
    metadata: DEFAULT_METADATA,
    diagnostics: [
      {
        code: "UNRESOLVED_STYLE",
        severity: "WARNING",
        message: `Node ${node.id} has invalid aevum.renderer2d metadata: ${z.prettifyError(parsed.error)}`,
        runtimeNodeId: node.id,
        path: `nodes.${node.sourceNode.id}.metadata.customData.aevum.renderer2d`,
        recoverable: true,
      },
    ],
  });
}
