export * from "./fixtures.js";
export * from "./interfaces.js";
export * from "./registry.js";
export * from "./schemas.js";
export * from "./serialization.js";

export const packageContract = {
  name: "@aevum/typography",
  kind: "package",
  responsibility:
    "Font identity, registries, glyph and OpenType metadata, multilingual run contracts, and replaceable shaping interfaces.",
  owns: "Professional typography metadata and provider-neutral measurement, line-breaking, parsing, and shaping contracts.",
  mustNotOwn:
    "Canonical project state, renderers, asset storage, HarfBuzz, OpenType.js, or text rendering implementations.",
  status: "IMPLEMENTED",
} as const;

export const TYPOGRAPHY_STATUS = packageContract.status;
