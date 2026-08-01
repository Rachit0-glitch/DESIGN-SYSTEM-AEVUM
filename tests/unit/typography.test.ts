import {
  FontRecordSchema,
  VariationAxisSchema,
  createFontFamily,
  deserializeFontRegistry,
  readFontMetadata,
  registerFont,
  serializeFontRegistry,
  typographyFixtures,
  withFontMetadata,
  type FontRegistrationInput,
  type TextShaper,
} from "@aevum/typography";
import { assetIdFromHash, computeSha256, registerAsset } from "@aevum/assets";
import { describe, expect, it } from "vitest";

function registrationInput(): FontRegistrationInput {
  const fixture = typographyFixtures.variable.fonts[0];
  if (!fixture) throw new Error("Variable fixture requires a font.");
  const { id: _id, schemaVersion: _schemaVersion, ...input } = fixture;
  return input;
}

describe("Typography Foundation", () => {
  it("registers and deduplicates immutable fonts by checksum", () => {
    const first = registerFont({}, registrationInput());
    expect(first.kind).toBe("REGISTERED");
    const registry = { [first.font.id]: first.font };
    const duplicate = registerFont(registry, registrationInput());

    expect(duplicate.kind).toBe("DUPLICATE");
    expect(duplicate.font).toBe(first.font);
    expect(first.font.axes.map((axis) => axis.tag)).toEqual(["wght", "wdth", "opsz", "slnt"]);
    expect(Object.isFrozen(first.font)).toBe(true);
  });

  it("validates variable axes and OpenType feature metadata", () => {
    expect(
      VariationAxisSchema.safeParse({ tag: "wght", name: "Weight", min: 100, default: 400, max: 900 }).success,
    ).toBe(true);
    expect(
      VariationAxisSchema.safeParse({ tag: "wght", name: "Weight", min: 900, default: 400, max: 100 }).success,
    ).toBe(false);

    const font = registerFont({}, registrationInput()).font;
    expect(font.openTypeFeatures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "liga", category: "LIGATURES" }),
        expect.objectContaining({ tag: "tnum", category: "TABULAR_NUMBERS" }),
      ]),
    );
  });

  it("attaches typography metadata to a canonical FONT proposal without mutation", () => {
    const bytes = new TextEncoder().encode("uploaded-variable-font");
    const checksum = computeSha256(bytes);
    const assetId = assetIdFromHash(checksum);
    const base = registrationInput();
    const font = registerFont({}, { ...base, checksum, source: { kind: "UPLOADED", assetId } }).font;
    const assetResult = registerAsset(
      {},
      {
        bytes,
        kind: "FONT",
        originalFilename: "aevum-variable.woff2",
        mimeType: "font/woff2",
        sourceUri: "memory://aevum-variable.woff2",
        createdAt: font.registeredAt,
        registeredAt: font.registeredAt,
        provenance: {
          origin: { kind: "UPLOAD", uri: "memory://aevum-variable.woff2" },
          importer: font.registeredBy,
          processingChain: [],
          parentAssetIds: [],
        },
        details: { kind: "FONT", format: "WOFF2" },
        security: { status: "PASSED", inspectedAt: font.registeredAt, inspector: "font-fixture", issues: [] },
      },
    );
    if (assetResult.kind !== "REGISTERED") throw new Error("Expected font asset proposal.");
    const enriched = withFontMetadata(assetResult.asset, font);

    expect(assetResult.asset.metadata).not.toHaveProperty("aevum.typography");
    expect(readFontMetadata(enriched)).toEqual(font);
    expect(enriched.id).toBe(assetResult.asset.id);
  });

  it("creates font families only from registered uploaded faces", () => {
    const font = registerFont({}, registrationInput()).font;
    const family = createFontFamily(
      { [font.id]: font },
      {
        id: "font-family:aevum-variable",
        name: "AEVUM Variable",
        uploadedFontIds: [font.id],
        fallbackFamilies: ["Arial", "sans-serif"],
        systemFamilies: ["Arial"],
      },
    );
    expect(family.uploadedFontIds).toEqual([font.id]);
    expect(() => createFontFamily({}, family)).toThrow("missing font");
  });

  it("loads Latin, Arabic, Hindi, Japanese, variable, and mixed-font metadata fixtures", () => {
    expect(Object.keys(typographyFixtures)).toEqual(["latin", "arabic", "hindi", "japanese", "variable", "mixed"]);
    for (const fixture of Object.values(typographyFixtures)) {
      expect(fixture.runs.every((run) => run.end <= fixture.text.length)).toBe(true);
      for (const font of fixture.fonts) expect(FontRecordSchema.parse(font)).toEqual(font);
    }
    expect(typographyFixtures.arabic.runs[0]?.direction).toBe("RTL");
    expect(new Set(typographyFixtures.mixed.runs.map((run) => run.script))).toEqual(new Set(["Latn", "Arab", "Deva"]));
  });

  it("serializes font registries and supports a replaceable RTL shaping contract", async () => {
    const font = registerFont({}, registrationInput()).font;
    const restored = deserializeFontRegistry(serializeFontRegistry({ [font.id]: font }, true));
    expect(restored[font.id]).toEqual(font);

    const shaper: TextShaper = {
      id: "test-shaper",
      version: "1.0.0",
      shape(request) {
        return {
          direction: request.runs.some((run) => run.direction === "RTL") ? "RTL" : "LTR",
          engineVersion: this.version,
          glyphs: Array.from(request.text, (_character, index) => ({
            glyphId: index + 1,
            cluster: index,
            advanceX: 10,
            advanceY: 0,
            offsetX: 0,
            offsetY: 0,
          })),
        };
      },
    };
    const shaped = await shaper.shape({
      text: typographyFixtures.arabic.text,
      runs: typographyFixtures.arabic.runs,
      features: { liga: true },
    });
    expect(shaped.direction).toBe("RTL");
    expect(shaped.glyphs.length).toBeGreaterThan(0);
  });
});
