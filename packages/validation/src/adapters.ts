import { deepFreeze } from "./immutable.js";
import { RasterComparisonResultSchema, type RasterComparisonResult, type RasterDescriptor } from "./schemas.js";

export interface RasterSurface {
  readonly descriptor: RasterDescriptor;
  readonly pixels?: Uint8Array;
}

export interface RasterComparisonInput {
  readonly reference: RasterSurface;
  readonly actual: RasterSurface;
}

export interface RasterComparisonAdapter {
  readonly id: string;
  readonly version: string;
  compare(input: RasterComparisonInput): RasterComparisonResult;
}

export function createDeterministicLocalRasterAdapter(): RasterComparisonAdapter {
  return Object.freeze({
    id: "aevum.validation.raster.local",
    version: "1.0.0",
    compare(input: RasterComparisonInput) {
      const reference = input.reference;
      const actual = input.actual;
      const dimensionsMatch =
        reference.descriptor.width === actual.descriptor.width &&
        reference.descriptor.height === actual.descriptor.height &&
        reference.descriptor.channels === actual.descriptor.channels;
      if (!dimensionsMatch) {
        return deepFreeze(
          RasterComparisonResultSchema.parse({
            adapterId: this.id,
            adapterVersion: this.version,
            score: 0,
            meanAbsoluteError: 1,
            checksumMatch: false,
            comparedPixels: 0,
            placeholder: !reference.pixels || !actual.pixels,
            diagnostics: ["Raster dimensions do not match."],
          }),
        );
      }
      const checksumMatch = reference.descriptor.checksum === actual.descriptor.checksum;
      if (!reference.pixels || !actual.pixels) {
        return deepFreeze(
          RasterComparisonResultSchema.parse({
            adapterId: this.id,
            adapterVersion: this.version,
            score: checksumMatch ? 1 : 0,
            meanAbsoluteError: checksumMatch ? 0 : 1,
            checksumMatch,
            comparedPixels: 0,
            placeholder: true,
            diagnostics: checksumMatch
              ? ["Raster equality is checksum-based; pixel buffers were not supplied."]
              : ["Pixel buffers were not supplied; differing checksums cannot be measured perceptually."],
          }),
        );
      }
      if (
        reference.pixels.length !== actual.pixels.length ||
        reference.pixels.length !== reference.descriptor.width * reference.descriptor.height * 4
      ) {
        return deepFreeze(
          RasterComparisonResultSchema.parse({
            adapterId: this.id,
            adapterVersion: this.version,
            score: 0,
            meanAbsoluteError: 1,
            checksumMatch,
            comparedPixels: 0,
            placeholder: false,
            diagnostics: ["RGBA pixel buffer length is invalid."],
          }),
        );
      }
      let absoluteDifference = 0;
      for (let index = 0; index < reference.pixels.length; index += 1) {
        absoluteDifference += Math.abs((reference.pixels[index] ?? 0) - (actual.pixels[index] ?? 0));
      }
      const meanAbsoluteError = absoluteDifference / (reference.pixels.length * 255);
      return deepFreeze(
        RasterComparisonResultSchema.parse({
          adapterId: this.id,
          adapterVersion: this.version,
          score: 1 - meanAbsoluteError,
          meanAbsoluteError,
          checksumMatch,
          comparedPixels: reference.descriptor.width * reference.descriptor.height,
          placeholder: false,
          diagnostics: [],
        }),
      );
    },
  });
}

export function notComparedRaster(reason = "Raster comparison was not requested.", score = 1): RasterComparisonResult {
  return deepFreeze(
    RasterComparisonResultSchema.parse({
      adapterId: "aevum.validation.raster.none",
      adapterVersion: "1.0.0",
      score,
      meanAbsoluteError: 1 - score,
      checksumMatch: false,
      comparedPixels: 0,
      placeholder: true,
      diagnostics: [reason],
    }),
  );
}
