import { AssetSchema, EntityIdSchema, type AssetRecord } from "@aevum/document-model";
import {
  FontFamilySchema,
  FontRecordSchema,
  FontRegistrationInputSchema,
  TYPOGRAPHY_METADATA_KEY,
  TYPOGRAPHY_METADATA_VERSION,
  type FontFamily,
  type FontRecord,
  type FontRegistrationInput,
} from "./schemas.js";

export type FontRegistry = Readonly<Record<string, FontRecord>>;

export type FontRegistrationResult =
  | { readonly kind: "REGISTERED"; readonly font: FontRecord }
  | { readonly kind: "DUPLICATE"; readonly font: FontRecord };

function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

export function fontIdFromChecksum(checksum: string): string {
  if (!/^sha256:[0-9a-f]{64}$/i.test(checksum)) throw new TypeError("Expected a sha256 font checksum.");
  const hex = checksum.slice("sha256:".length).toLowerCase();
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return EntityIdSchema.parse(`type_${uuid}`);
}

export function findFontByChecksum(registry: FontRegistry, checksum: string): FontRecord | undefined {
  return Object.values(registry).find((font) => font.checksum.toLowerCase() === checksum.toLowerCase());
}

export function registerFont(registry: FontRegistry, rawInput: FontRegistrationInput): FontRegistrationResult {
  const input = FontRegistrationInputSchema.parse(rawInput);
  const duplicate = findFontByChecksum(registry, input.checksum);
  if (duplicate) return immutable({ kind: "DUPLICATE", font: duplicate });

  const font = FontRecordSchema.parse({
    ...input,
    id: fontIdFromChecksum(input.checksum),
    schemaVersion: TYPOGRAPHY_METADATA_VERSION,
  });
  return immutable({ kind: "REGISTERED", font });
}

export function createFontFamily(registry: FontRegistry, input: FontFamily): FontFamily {
  const family = FontFamilySchema.parse(input);
  for (const fontId of family.uploadedFontIds) {
    if (!registry[fontId]) throw new Error(`Font family ${family.id} references missing font ${fontId}.`);
  }
  return immutable(family);
}

export function withFontMetadata(asset: AssetRecord, font: FontRecord): AssetRecord {
  if (asset.type !== "FONT") throw new TypeError(`Asset ${asset.id} is not a FONT asset.`);
  if (asset.hash.toLowerCase() !== font.checksum.toLowerCase()) {
    throw new TypeError(`Font checksum does not match asset ${asset.id}.`);
  }
  if (font.source.kind === "UPLOADED" && font.source.assetId !== asset.id) {
    throw new TypeError(`Font metadata references ${font.source.assetId}, not asset ${asset.id}.`);
  }
  return immutable(AssetSchema.parse({ ...asset, metadata: { ...asset.metadata, [TYPOGRAPHY_METADATA_KEY]: font } }));
}

export function readFontMetadata(asset: AssetRecord): FontRecord {
  return immutable(FontRecordSchema.parse(asset.metadata[TYPOGRAPHY_METADATA_KEY]));
}
