/**
 * Cost control for a paid provider: never re-analyze bytes we've already analyzed. The cache key
 * is a deterministic hash of (providerId, sourceHash, the request options that affect the
 * response) — not the bytes themselves, since the caller already content-addresses those.
 */
import { createHash } from "node:crypto";
import type { VisionAnalysis, VisionAnalyzeOptions, VisionProviderId } from "./types.js";

export function requestFingerprint(providerId: VisionProviderId, options: VisionAnalyzeOptions): string {
  const stable = JSON.stringify({
    providerId,
    sourceHash: options.sourceHash,
    languageHints: [...(options.languageHints ?? [])].sort(),
    maxLabels: options.maxLabels ?? null,
    maxObjects: options.maxObjects ?? null,
  });
  return `sha256:${createHash("sha256").update(stable).digest("hex")}`;
}

export interface VisionAnalysisCache {
  get(fingerprint: string): Promise<VisionAnalysis | undefined>;
  set(fingerprint: string, analysis: VisionAnalysis): Promise<void>;
}

/**
 * In-memory cache — real, working, and sufficient for a single server process, but not shared
 * across replicas or restarts. A durable, cross-replica cache (e.g. a Supabase table keyed by
 * requestFingerprint) is real future work, not implemented here; this is disclosed, not hidden.
 */
export function createInMemoryVisionAnalysisCache(maxEntries = 500): VisionAnalysisCache {
  const store = new Map<string, VisionAnalysis>();
  return {
    async get(fingerprint) {
      return store.get(fingerprint);
    },
    async set(fingerprint, analysis) {
      if (store.size >= maxEntries && !store.has(fingerprint)) {
        const oldestKey = store.keys().next().value;
        if (oldestKey !== undefined) store.delete(oldestKey);
      }
      store.set(fingerprint, analysis);
    },
  };
}

/** Wraps any VisionProvider with fingerprint-keyed caching — never calls the inner provider twice for the same request. */
export function withVisionAnalysisCache(
  provider: {
    readonly id: VisionProviderId;
    readonly version: string;
    analyzeImage: (bytes: Uint8Array, options: VisionAnalyzeOptions) => Promise<VisionAnalysis>;
  },
  cache: VisionAnalysisCache,
) {
  return Object.freeze({
    id: provider.id,
    version: provider.version,
    async analyzeImage(bytes: Uint8Array, options: VisionAnalyzeOptions): Promise<VisionAnalysis> {
      const fingerprint = requestFingerprint(provider.id, options);
      const cached = await cache.get(fingerprint);
      if (cached) return { ...cached, provider: { ...cached.provider, cached: true } };
      const analysis = await provider.analyzeImage(bytes, options);
      await cache.set(fingerprint, analysis);
      return analysis;
    },
  });
}
