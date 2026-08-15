import { createGoogleVisionProvider, type CreateGoogleVisionProviderOptions } from "./google-adapter.js";
import { createLocalVisionProvider, type CreateLocalVisionProviderOptions } from "./local-adapter.js";
import { createInMemoryVisionAnalysisCache, withVisionAnalysisCache, type VisionAnalysisCache } from "./cache.js";
import type { VisionProvider, VisionProviderId } from "./types.js";

export interface VisionProviderConfig {
  readonly providerId: VisionProviderId;
  readonly google?: CreateGoogleVisionProviderOptions;
  readonly local?: CreateLocalVisionProviderOptions;
  /** Set to false only for tests that need to observe uncached calls. */
  readonly enableCache?: boolean;
  readonly cache?: VisionAnalysisCache;
}

/**
 * Builds the configured VisionProvider (GOOGLE_CLOUD or LOCAL), wrapped in fingerprint-keyed
 * caching by default so identical bytes are never re-analyzed. This is the one place that reads
 * "which provider" — every other module only ever sees the provider-neutral VisionProvider
 * interface.
 */
export function createVisionProvider(config: VisionProviderConfig): VisionProvider {
  const base: VisionProvider =
    config.providerId === "GOOGLE_CLOUD"
      ? createGoogleVisionProvider(config.google ?? {})
      : createLocalVisionProvider(config.local ?? {});
  if (config.enableCache === false) return base;
  const cache = config.cache ?? createInMemoryVisionAnalysisCache();
  return withVisionAnalysisCache(base, cache);
}

/** Reads VISION_PROVIDER from the environment; defaults to LOCAL so nothing requires Google credentials to function. */
export function visionProviderIdFromEnv(env: Record<string, string | undefined> = process.env): VisionProviderId {
  const value = env.VISION_PROVIDER?.toUpperCase();
  return value === "GOOGLE_CLOUD" ? "GOOGLE_CLOUD" : "LOCAL";
}
