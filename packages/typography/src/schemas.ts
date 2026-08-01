import { ActorRefSchema, EntityIdSchema, TextStyleSchema, type DesignNode } from "@aevum/document-model";
import { z } from "zod";

const IsoDateSchema = z.iso.datetime({ offset: true });
const ChecksumSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/i);

export const TYPOGRAPHY_METADATA_KEY = "aevum.typography" as const;
export const TYPOGRAPHY_METADATA_VERSION = "1.0.0" as const;

export const FontFormatSchema = z.enum(["WOFF2", "WOFF", "TTF", "OTF"]);
export const FontStyleSchema = z.enum(["NORMAL", "ITALIC", "OBLIQUE"]);
export const TextDirectionSchema = z.enum(["LTR", "RTL", "AUTO"]);

export const VariationAxisSchema = z
  .strictObject({
    tag: z.string().regex(/^[\x20-\x7e]{4}$/, "Variation axis tags must contain four printable ASCII characters."),
    name: z.string().min(1),
    min: z.number().finite(),
    default: z.number().finite(),
    max: z.number().finite(),
    hidden: z.boolean().default(false),
  })
  .superRefine((axis, context) => {
    if (axis.min > axis.default || axis.default > axis.max) {
      context.addIssue({
        code: "custom",
        path: ["default"],
        message: "Axis values must satisfy min <= default <= max.",
      });
    }
  });

export const UnicodeRangeSchema = z
  .strictObject({
    start: z.number().int().min(0).max(0x10ffff),
    end: z.number().int().min(0).max(0x10ffff),
    name: z.string().min(1).optional(),
  })
  .superRefine((range, context) => {
    if (range.start > range.end) {
      context.addIssue({ code: "custom", path: ["end"], message: "Unicode range end must not precede start." });
    }
  });

export const GlyphMetadataSchema = z.strictObject({
  glyphCount: z.number().int().positive(),
  unicodeCoverage: z.array(UnicodeRangeSchema),
  unitsPerEm: z.number().int().positive(),
  ascender: z.number().finite(),
  descender: z.number().finite(),
  capHeight: z.number().finite(),
  xHeight: z.number().finite(),
  lineGap: z.number().finite(),
});

export const OpenTypeFeatureSchema = z.strictObject({
  tag: z.string().regex(/^[\x20-\x7e]{4}$/, "OpenType feature tags must contain four printable ASCII characters."),
  name: z.string().min(1),
  category: z.enum([
    "LIGATURES",
    "ALTERNATES",
    "FRACTIONS",
    "SMALL_CAPS",
    "TABULAR_NUMBERS",
    "STYLISTIC_SET",
    "LANGUAGE",
    "OTHER",
  ]),
  enabledByDefault: z.boolean(),
});

const UploadedFontSourceSchema = z.strictObject({ kind: z.literal("UPLOADED"), assetId: EntityIdSchema });
const FallbackFontSourceSchema = z.strictObject({
  kind: z.literal("FALLBACK"),
  family: z.string().min(1),
  provider: z.string().min(1).optional(),
});
const SystemFontSourceSchema = z.strictObject({
  kind: z.literal("SYSTEM"),
  family: z.string().min(1),
  platform: z.string().min(1).optional(),
});
export const FontSourceSchema = z.discriminatedUnion("kind", [
  UploadedFontSourceSchema,
  FallbackFontSourceSchema,
  SystemFontSourceSchema,
]);

const FontRegistrationShape = {
  checksum: ChecksumSchema,
  source: FontSourceSchema,
  family: z.string().min(1),
  subfamily: z.string().min(1),
  fullName: z.string().min(1),
  postScriptName: z.string().min(1),
  style: FontStyleSchema,
  weight: z.number().int().min(1).max(1000),
  stretch: z.number().finite().min(50).max(200),
  format: FontFormatSchema,
  variable: z.boolean(),
  axes: z.array(VariationAxisSchema),
  glyphs: GlyphMetadataSchema,
  openTypeFeatures: z.array(OpenTypeFeatureSchema),
  registeredAt: IsoDateSchema,
  registeredBy: ActorRefSchema,
  embeddingPermissions: z.array(
    z.enum(["DESKTOP", "WEB", "APPLICATION", "CANVA", "CLIENT_DELIVERY", "REDISTRIBUTION", "OUTLINE"]),
  ),
  exportRestrictions: z.array(z.string().min(1)),
};

type RefinableFont = { readonly variable: boolean; readonly axes: readonly unknown[] };

function validateFontAxes(font: RefinableFont, context: z.RefinementCtx): void {
  if (font.variable && font.axes.length === 0) {
    context.addIssue({ code: "custom", path: ["axes"], message: "Variable fonts require at least one axis." });
  }
  if (!font.variable && font.axes.length > 0) {
    context.addIssue({ code: "custom", path: ["axes"], message: "Static fonts cannot define variation axes." });
  }
}

export const FontRecordSchema = z
  .strictObject({
    id: EntityIdSchema.refine((id) => id.startsWith("type_"), "Font record IDs must use the type_ prefix."),
    schemaVersion: z.literal(TYPOGRAPHY_METADATA_VERSION),
    ...FontRegistrationShape,
  })
  .superRefine(validateFontAxes);

export const FontRegistrationInputSchema = z.strictObject(FontRegistrationShape).superRefine(validateFontAxes);

export const FontFamilySchema = z.strictObject({
  id: z.string().regex(/^font-family:[a-z0-9][a-z0-9._-]*$/),
  name: z.string().min(1),
  uploadedFontIds: z.array(EntityIdSchema),
  fallbackFamilies: z.array(z.string().min(1)),
  systemFamilies: z.array(z.string().min(1)),
});

export const TypographyRunSchema = z
  .strictObject({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    style: TextStyleSchema,
    language: z.string().min(2),
    script: z.string().regex(/^[A-Z][a-z]{3}$/, "Expected an ISO 15924 script code."),
    direction: TextDirectionSchema,
  })
  .superRefine((run, context) => {
    if (run.start >= run.end) {
      context.addIssue({ code: "custom", path: ["end"], message: "Text run end must be greater than start." });
    }
  });

export const TypographyFixtureSchema = z
  .strictObject({
    id: z.string().regex(/^typography-fixture:[a-z0-9-]+$/),
    name: z.string().min(1),
    text: z.string().min(1),
    baseDirection: TextDirectionSchema,
    fonts: z.array(FontRecordSchema).min(1),
    runs: z.array(TypographyRunSchema).min(1),
  })
  .superRefine((fixture, context) => {
    for (const [index, run] of fixture.runs.entries()) {
      if (run.end > fixture.text.length) {
        context.addIssue({ code: "custom", path: ["runs", index, "end"], message: "Text run exceeds fixture text." });
      }
    }
  });

export type FontRecord = z.infer<typeof FontRecordSchema>;
export type FontRegistrationInput = z.input<typeof FontRegistrationInputSchema>;
export type FontFamily = z.infer<typeof FontFamilySchema>;
export type VariationAxis = z.infer<typeof VariationAxisSchema>;
export type GlyphMetadata = z.infer<typeof GlyphMetadataSchema>;
export type OpenTypeFeature = z.infer<typeof OpenTypeFeatureSchema>;
export type TypographyRun = z.infer<typeof TypographyRunSchema>;
export type TypographyFixture = z.infer<typeof TypographyFixtureSchema>;
export type CanonicalTextRun = Extract<DesignNode, { type: "TEXT" }>["runs"][number];
