/**
 * Provider-neutral vision analysis contract. Nothing in this file, or anything that consumes
 * VisionAnalysis, may depend on a specific vendor's response shape — that isolation is what lets
 * Google Cloud Vision, the local pixel-math provider, or a future Claude Vision adapter all
 * satisfy the same interface without packages/reconstruction ever knowing which one ran.
 */

export type VisionProviderId = "GOOGLE_CLOUD" | "LOCAL";

export interface VisionPoint {
  readonly x: number;
  readonly y: number;
}

export interface VisionBoundingPoly {
  /** Absolute source-pixel coordinates, top-left origin — never normalized 0-1 at this layer. */
  readonly vertices: readonly VisionPoint[];
}

export type VisionTextLevel = "PAGE" | "BLOCK" | "PARAGRAPH" | "WORD" | "SYMBOL";

export interface VisionTextBlock {
  readonly id: string;
  readonly level: VisionTextLevel;
  readonly text: string;
  readonly boundingPoly: VisionBoundingPoly;
  /** 0-1. Providers that don't report per-block confidence should use a conservative estimate. */
  readonly confidence: number;
  readonly languageHints: readonly string[];
  readonly children: readonly VisionTextBlock[];
}

export interface VisionLabel {
  readonly description: string;
  /** 0-1 */
  readonly score: number;
  readonly topicality?: number;
}

export interface VisionObjectRegion {
  readonly name: string;
  /** 0-1 */
  readonly score: number;
  readonly boundingPoly: VisionBoundingPoly;
}

export interface VisionDominantColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0-1 */
  readonly score: number;
  /** 0-1 fraction of the image this color occupies. */
  readonly pixelFraction: number;
}

export interface VisionImageProperties {
  readonly dominantColors: readonly VisionDominantColor[];
}

export interface VisionProviderMetadata {
  readonly providerId: VisionProviderId;
  readonly providerVersion: string;
  /** sha256:... of the analyzed bytes. */
  readonly sourceHash: string;
  /** Deterministic hash of (providerId, sourceHash, request options) — the cache key. */
  readonly requestFingerprint: string;
  readonly analyzedAt: string;
  /** True when this analysis is a cached replay of a previous request, not a fresh provider call. */
  readonly cached: boolean;
}

export interface VisionAnalysis {
  readonly provider: VisionProviderMetadata;
  readonly imageWidth: number;
  readonly imageHeight: number;
  /** Root-level nodes only (top PAGE block(s)); walk `.children` for the full hierarchy. */
  readonly textBlocks: readonly VisionTextBlock[];
  readonly labels: readonly VisionLabel[];
  readonly objects: readonly VisionObjectRegion[];
  readonly imageProperties?: VisionImageProperties;
  /** Honest, non-fatal notes — e.g. a feature the provider didn't return anything for. */
  readonly warnings: readonly string[];
}

export interface VisionAnalyzeOptions {
  /** sha256:... of the bytes being analyzed; required so every provider can fingerprint/cache. */
  readonly sourceHash: string;
  readonly languageHints?: readonly string[];
  readonly maxLabels?: number;
  readonly maxObjects?: number;
}

export interface VisionProvider {
  readonly id: VisionProviderId;
  readonly version: string;
  analyzeImage(bytes: Uint8Array, options: VisionAnalyzeOptions): Promise<VisionAnalysis>;
}

/** Real, actionable failure modes a caller must handle explicitly — never silently swallowed. */
export type VisionProviderErrorCode =
  | "VISION_PROVIDER_UNAVAILABLE"
  | "VISION_PROVIDER_TIMEOUT"
  | "VISION_PROVIDER_QUOTA_EXCEEDED"
  | "VISION_PROVIDER_INVALID_IMAGE"
  | "VISION_PROVIDER_AUTH_FAILED"
  | "VISION_PROVIDER_RESPONSE_INVALID";

export class VisionProviderError extends Error {
  readonly code: VisionProviderErrorCode;
  constructor(code: VisionProviderErrorCode, message: string) {
    super(message);
    this.name = "VisionProviderError";
    this.code = code;
  }
}
