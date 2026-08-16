/**
 * Real usage guardrails for a paid provider — never silently unlimited. A workspace that exceeds
 * its configured daily call budget gets an honest, typed rejection instead of an uncontrolled bill.
 */
import { VisionProviderError, type VisionAnalyzeOptions, type VisionProvider } from "./types.js";

export interface VisionQuotaTracker {
  /** Returns the number of provider calls already recorded for this workspace in the current window. */
  count(workspaceId: string): Promise<number>;
  record(workspaceId: string): Promise<void>;
}

/** In-memory, single-process quota tracker with a fixed rolling window. Real, but not durable or cross-replica. */
export function createInMemoryVisionQuotaTracker(windowMs = 24 * 60 * 60 * 1000): VisionQuotaTracker {
  const calls = new Map<string, number[]>();
  const prune = (workspaceId: string): number[] => {
    const now = Date.now();
    const existing = (calls.get(workspaceId) ?? []).filter((timestamp) => now - timestamp < windowMs);
    // Delete rather than store an empty array: without this, every distinct workspaceId ever seen
    // keeps its own permanent Map entry for the life of the process, even once its calls have all
    // expired out of the window (Block H13 finding).
    if (existing.length === 0) calls.delete(workspaceId);
    else calls.set(workspaceId, existing);
    return existing;
  };
  return {
    async count(workspaceId) {
      return prune(workspaceId).length;
    },
    async record(workspaceId) {
      const existing = prune(workspaceId);
      existing.push(Date.now());
      calls.set(workspaceId, existing);
    },
  };
}

/** Wraps a VisionProvider so calls beyond `maxCallsPerWorkspacePerWindow` fail with a typed, honest error instead of silently proceeding (and being billed). */
export function withVisionQuota(
  provider: VisionProvider,
  tracker: VisionQuotaTracker,
  maxCallsPerWorkspacePerWindow: number,
): (workspaceId: string) => VisionProvider {
  return (workspaceId: string) =>
    Object.freeze({
      id: provider.id,
      version: provider.version,
      async analyzeImage(bytes: Uint8Array, options: VisionAnalyzeOptions) {
        const used = await tracker.count(workspaceId);
        if (used >= maxCallsPerWorkspacePerWindow) {
          throw new VisionProviderError(
            "VISION_PROVIDER_QUOTA_EXCEEDED",
            `Workspace ${workspaceId} has reached its vision analysis quota (${maxCallsPerWorkspacePerWindow} per window).`,
          );
        }
        const analysis = await provider.analyzeImage(bytes, options);
        await tracker.record(workspaceId);
        return analysis;
      },
    });
}
