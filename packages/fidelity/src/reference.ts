import {
  FidelityReferenceSchema,
  ReferenceEvidenceSchema,
  type FidelityReference,
  type ReferenceEvidence,
} from "./schemas.js";
import type { RasterPixels } from "./pixels.js";
import { fidelityFingerprint, fidelityId } from "./stable.js";

export interface ReferenceRasterInput extends RasterPixels {
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
  readonly hash: `sha256:${string}`;
  readonly sourceAssetId?: string;
  readonly devicePixelRatio: number;
  readonly orientation?: "NORMAL" | "ROTATE_90" | "ROTATE_180" | "ROTATE_270";
}

export function normalizeReference(input: ReferenceRasterInput): {
  reference: FidelityReference;
  raster: RasterPixels;
} {
  if (input.width > 4096 || input.height > 4096 || input.width * input.height > 16_777_216)
    throw new Error("FIDELITY_REFERENCE_PIXEL_BUDGET_EXCEEDED");
  if (input.data.length !== input.width * input.height * 4) throw new Error("FIDELITY_REFERENCE_LENGTH_INVALID");
  const orientation = input.orientation ?? "NORMAL";
  if (orientation !== "NORMAL") throw new Error("FIDELITY_REFERENCE_ORIENTATION_REQUIRES_EXPLICIT_ADAPTER");
  const viewportWidth = input.width / input.devicePixelRatio;
  const viewportHeight = input.height / input.devicePixelRatio;
  if (!Number.isInteger(viewportWidth) || !Number.isInteger(viewportHeight))
    throw new Error("FIDELITY_REFERENCE_DPR_DIMENSION_MISMATCH");
  const body = {
    ...(input.sourceAssetId ? { sourceAssetId: input.sourceAssetId } : {}),
    hash: input.hash,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    colorSpace: "SRGB" as const,
    alphaMode: input.data.some((value, index) => index % 4 === 3 && value < 255)
      ? ("STRAIGHT" as const)
      : ("OPAQUE" as const),
    orientation,
    viewport: {
      id: `reference-${input.width}x${input.height}@${input.devicePixelRatio}`,
      width: viewportWidth,
      height: viewportHeight,
      devicePixelRatio: input.devicePixelRatio,
      orientation: viewportWidth >= viewportHeight ? ("LANDSCAPE" as const) : ("PORTRAIT" as const),
      reducedMotion: false,
      time: 0,
    },
    hints: { fontFamilies: [], assetIds: [] },
    provenance: { providerId: "aevum.reference-normalizer", providerVersion: "1.0.0" },
  };
  return {
    reference: FidelityReferenceSchema.parse({ ...body, id: fidelityId("fidelity-reference", body) }),
    raster: { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data), colorSpace: "SRGB" },
  };
}

export interface ReferenceAnalysisAdapter {
  readonly id: string;
  readonly version: string;
  analyze(input: { readonly reference: FidelityReference; readonly raster: RasterPixels }): Promise<ReferenceEvidence>;
}

export function createDeterministicReferenceAnalysisAdapter(): ReferenceAnalysisAdapter {
  return Object.freeze({
    id: "aevum.reference-analysis.local",
    version: "1.0.0",
    async analyze({ reference }: { readonly reference: FidelityReference; readonly raster: RasterPixels }) {
      const body = {
        providerId: "aevum.reference-analysis.local",
        providerVersion: "1.0.0",
        regions: [
          {
            id: "reference:full",
            region: { x: 0, y: 0, width: reference.width, height: reference.height },
            category: "COMPOSITION",
            confidence: 1,
          },
        ],
        text: [],
        assets: [],
        diagnostics: [
          "Local analysis preserves raster evidence but does not claim OCR or arbitrary semantic recognition.",
        ],
      };
      return ReferenceEvidenceSchema.parse({ ...body, fingerprint: fidelityFingerprint(body) });
    },
  });
}

export interface FontMatchCandidate {
  readonly fontAssetId: string;
  readonly family: string;
  readonly score: number;
  readonly status: "EXACT" | "LIKELY_MATCH" | "CLOSE_SUBSTITUTE" | "UNKNOWN";
  readonly evidence: readonly string[];
}

export function rankFontCandidates(input: {
  readonly requestedFamily?: string;
  readonly referenceAdvance: number;
  readonly candidates: readonly { fontAssetId: string; family: string; measuredAdvance: number }[];
}): readonly FontMatchCandidate[] {
  return input.candidates
    .map((candidate) => {
      const familyMatch = input.requestedFamily?.toLowerCase() === candidate.family.toLowerCase();
      const advanceDelta =
        Math.abs(candidate.measuredAdvance - input.referenceAdvance) / Math.max(1, input.referenceAdvance);
      const score = Math.max(0, Math.min(1, (familyMatch ? 0.55 : 0.15) + 0.45 * (1 - advanceDelta)));
      return {
        fontAssetId: candidate.fontAssetId,
        family: candidate.family,
        score,
        status:
          score >= 0.995
            ? ("EXACT" as const)
            : score >= 0.85
              ? ("LIKELY_MATCH" as const)
              : score >= 0.6
                ? ("CLOSE_SUBSTITUTE" as const)
                : ("UNKNOWN" as const),
        evidence: [
          familyMatch ? "family-metadata-match" : "family-metadata-mismatch",
          `advance-delta:${advanceDelta.toFixed(6)}`,
        ],
      };
    })
    .sort((left, right) => right.score - left.score || left.fontAssetId.localeCompare(right.fontAssetId));
}
