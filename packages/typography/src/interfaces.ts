import type { AssetRecord, TextStyle } from "@aevum/document-model";
import type { FontRecord, FontRegistrationInput, TypographyRun } from "./schemas.js";

export interface FontParseRequest {
  readonly asset: AssetRecord;
  readonly bytes: Uint8Array;
  readonly parserVersion: string;
}

export interface FontMetadataParser {
  readonly id: string;
  readonly version: string;
  parse(request: FontParseRequest): Promise<FontRegistrationInput>;
}

export interface GlyphMeasurementRequest {
  readonly font: FontRecord;
  readonly glyphId: number;
  readonly fontSize: number;
  readonly variationAxes: Readonly<Record<string, number>>;
}

export interface GlyphMeasurement {
  readonly glyphId: number;
  readonly advance: number;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface GlyphMeasurementProvider {
  readonly id: string;
  readonly version: string;
  measureGlyph(request: GlyphMeasurementRequest): GlyphMeasurement | Promise<GlyphMeasurement>;
}

export interface TextMeasurementRequest {
  readonly text: string;
  readonly runs: readonly TypographyRun[];
  readonly maxWidth?: number;
}

export interface TextMeasurement {
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
  readonly lineCount: number;
  readonly lineBreaks: readonly number[];
}

export interface TextMeasurementProvider {
  readonly id: string;
  readonly version: string;
  measureText(request: TextMeasurementRequest): TextMeasurement | Promise<TextMeasurement>;
}

export interface LineBreakRequest {
  readonly text: string;
  readonly runs: readonly TypographyRun[];
  readonly maxWidth: number;
  readonly locale: string;
}

export interface LineBreakResult {
  readonly breakPositions: readonly number[];
  readonly requiredWidth: number;
}

export interface LineBreakProvider {
  readonly id: string;
  readonly version: string;
  breakLines(request: LineBreakRequest): LineBreakResult | Promise<LineBreakResult>;
}

export interface ShapingRequest {
  readonly text: string;
  readonly runs: readonly TypographyRun[];
  readonly features: Readonly<Record<string, boolean | number>>;
}

export interface ShapedGlyph {
  readonly glyphId: number;
  readonly cluster: number;
  readonly fontAssetId?: string;
  readonly advanceX: number;
  readonly advanceY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface ShapingResult {
  readonly glyphs: readonly ShapedGlyph[];
  readonly direction: "LTR" | "RTL";
  readonly engineVersion: string;
}

export interface TextShaper {
  readonly id: string;
  readonly version: string;
  shape(request: ShapingRequest): ShapingResult | Promise<ShapingResult>;
}

export interface TypographyEngine {
  readonly glyphs: GlyphMeasurementProvider;
  readonly text: TextMeasurementProvider;
  readonly lineBreaker: LineBreakProvider;
  readonly shaper: TextShaper;
}

export interface TypographyStyleResolver {
  resolve(style: TextStyle, language: string, script: string): readonly FontRecord[];
}
