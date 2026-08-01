import { FontRecordSchema, TypographyFixtureSchema, type FontRecord, type TypographyFixture } from "./schemas.js";

const TIME = "2026-08-01T04:00:00.000Z";
const actor = { id: "fixture_typography_worker", type: "WORKER" as const };

function font(
  suffix: string,
  family: string,
  coverage: { start: number; end: number; name: string },
  options: { variable?: boolean; axes?: FontRecord["axes"] } = {},
): FontRecord {
  const hex = suffix.repeat(64).slice(0, 64);
  const checksum = `sha256:${hex}`;
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return FontRecordSchema.parse({
    id: `type_${uuid}`,
    schemaVersion: "1.0.0",
    checksum,
    source: { kind: "FALLBACK", family },
    family,
    subfamily: "Regular",
    fullName: `${family} Regular`,
    postScriptName: `${family.replaceAll(" ", "")}-Regular`,
    style: "NORMAL",
    weight: 400,
    stretch: 100,
    format: "OTF",
    variable: options.variable ?? false,
    axes: options.axes ?? [],
    glyphs: {
      glyphCount: 1024,
      unicodeCoverage: [coverage],
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      capHeight: 700,
      xHeight: 500,
      lineGap: 200,
    },
    openTypeFeatures: [
      { tag: "liga", name: "Standard Ligatures", category: "LIGATURES", enabledByDefault: true },
      { tag: "tnum", name: "Tabular Numbers", category: "TABULAR_NUMBERS", enabledByDefault: false },
    ],
    registeredAt: TIME,
    registeredBy: actor,
    embeddingPermissions: ["DESKTOP", "WEB"],
    exportRestrictions: [],
  });
}

const latinFont = font("1", "AEVUM Sans", { start: 0x20, end: 0x024f, name: "Latin" });
const arabicFont = font("2", "AEVUM Arabic", { start: 0x0600, end: 0x06ff, name: "Arabic" });
const hindiFont = font("3", "AEVUM Devanagari", { start: 0x0900, end: 0x097f, name: "Devanagari" });
const japaneseFont = font("4", "AEVUM Japanese", { start: 0x3040, end: 0x30ff, name: "Kana" });
const variableFont = font(
  "5",
  "AEVUM Variable",
  { start: 0x20, end: 0x024f, name: "Latin" },
  {
    variable: true,
    axes: [
      { tag: "wght", name: "Weight", min: 100, default: 400, max: 900, hidden: false },
      { tag: "wdth", name: "Width", min: 75, default: 100, max: 125, hidden: false },
      { tag: "opsz", name: "Optical Size", min: 8, default: 16, max: 72, hidden: false },
      { tag: "slnt", name: "Slant", min: -12, default: 0, max: 0, hidden: false },
    ],
  },
);

const style = (fontRecord: FontRecord) => ({
  fontFamily: fontRecord.family,
  fallbackFamilies: ["sans-serif"],
  fontMatchStatus: "LIKELY_MATCH" as const,
  size: { value: 32, unit: "PX" as const, mode: "FIXED" as const },
  lineHeight: { multiplier: 1.4 },
  letterSpacing: { value: 0, unit: "PX" as const, mode: "FIXED" as const },
  weight: 400,
  style: "NORMAL" as const,
  variableAxes: {},
  openTypeFeatures: { liga: true },
});

function fixture(
  id: string,
  name: string,
  text: string,
  fontRecord: FontRecord,
  language: string,
  script: string,
  direction: "LTR" | "RTL",
): TypographyFixture {
  return TypographyFixtureSchema.parse({
    id,
    name,
    text,
    baseDirection: direction,
    fonts: [fontRecord],
    runs: [{ start: 0, end: text.length, style: style(fontRecord), language, script, direction }],
  });
}

const mixedText = "AEVUM مرحبا नमस्ते";
const latinEnd = 5;
const arabicStart = 6;
const arabicEnd = 11;
const hindiStart = 12;

export const typographyFixtures = {
  latin: fixture("typography-fixture:latin", "Latin", "Maximum Fidelity", latinFont, "en", "Latn", "LTR"),
  arabic: fixture("typography-fixture:arabic", "Arabic", "مرحبا بالعالم", arabicFont, "ar", "Arab", "RTL"),
  hindi: fixture("typography-fixture:hindi", "Hindi", "नमस्ते दुनिया", hindiFont, "hi", "Deva", "LTR"),
  japanese: fixture("typography-fixture:japanese", "Japanese", "こんにちは世界", japaneseFont, "ja", "Jpan", "LTR"),
  variable: fixture(
    "typography-fixture:variable-font",
    "Variable font",
    "Variable typography",
    variableFont,
    "en",
    "Latn",
    "LTR",
  ),
  mixed: TypographyFixtureSchema.parse({
    id: "typography-fixture:mixed-font",
    name: "Mixed font",
    text: mixedText,
    baseDirection: "LTR",
    fonts: [latinFont, arabicFont, hindiFont],
    runs: [
      { start: 0, end: latinEnd, style: style(latinFont), language: "en", script: "Latn", direction: "LTR" },
      {
        start: arabicStart,
        end: arabicEnd,
        style: style(arabicFont),
        language: "ar",
        script: "Arab",
        direction: "RTL",
      },
      {
        start: hindiStart,
        end: mixedText.length,
        style: style(hindiFont),
        language: "hi",
        script: "Deva",
        direction: "LTR",
      },
    ],
  }),
} as const;
