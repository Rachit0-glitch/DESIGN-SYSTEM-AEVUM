import { deepFreeze } from "./immutable.js";
import { deterministicScopedId } from "./deterministic.js";
import { SilhouetteEvidenceSchema, type SilhouetteEvidence } from "./schemas.js";

export interface Normalized2D {
  readonly x: number;
  readonly y: number;
}

export interface SilhouetteStatistics {
  readonly bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
  readonly centroid: Normalized2D;
  readonly areaRatio: number;
  readonly aspectRatio: number;
}

/**
 * Computes real, deterministic geometry statistics for a normalized (0..1) polygon contour using
 * the shoelace formula for signed area/centroid. This is provider-independent math: it works on
 * whatever contour a silhouette provider returns, real or fixture.
 */
export function computeSilhouetteStatistics(contour: readonly Normalized2D[]): SilhouetteStatistics {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let signedArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (const [index, current] of contour.entries()) {
    const next = contour[(index + 1) % contour.length] as Normalized2D;
    minX = Math.min(minX, current.x);
    minY = Math.min(minY, current.y);
    maxX = Math.max(maxX, current.x);
    maxY = Math.max(maxY, current.y);
    const cross = current.x * next.y - next.x * current.y;
    signedArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  signedArea /= 2;
  const area = Math.abs(signedArea);
  const centroid =
    area < 1e-9
      ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      : { x: centroidX / (6 * signedArea), y: centroidY / (6 * signedArea) };

  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);

  return {
    bounds: { minX, minY, maxX, maxY },
    centroid: {
      x: Math.min(1, Math.max(0, centroid.x)),
      y: Math.min(1, Math.max(0, centroid.y)),
    },
    areaRatio: Math.min(1, Math.max(0, area)),
    aspectRatio: width / height,
  };
}

export interface SilhouetteProviderContext {
  readonly viewId: string;
  readonly contourHint?: readonly Normalized2D[];
}

export interface SilhouetteProvider {
  readonly id: string;
  readonly version: string;
  estimate(context: SilhouetteProviderContext): SilhouetteEvidence | undefined;
}

/**
 * The only Phase 17 silhouette source: a caller-supplied contour (typically extracted from a
 * manifest or test fixture). There is no real background-removal/segmentation model behind this —
 * `method` is always honestly reported as MANIFEST_PROVIDED or DETERMINISTIC_FIXTURE, never a
 * claim of real segmentation.
 */
export function createManifestSilhouetteProvider(): SilhouetteProvider {
  return Object.freeze({
    id: "manifest-silhouette-provider",
    version: "1.0.0",
    estimate(context: SilhouetteProviderContext): SilhouetteEvidence | undefined {
      if (!context.contourHint || context.contourHint.length < 3) return undefined;
      const statistics = computeSilhouetteStatistics(context.contourHint);
      return deepFreeze(
        SilhouetteEvidenceSchema.parse({
          id: deterministicScopedId("silhouette", { viewId: context.viewId, contour: context.contourHint }),
          viewId: context.viewId,
          provider: "manifest-silhouette-provider",
          providerVersion: "1.0.0",
          method: "MANIFEST_PROVIDED",
          contour: context.contourHint,
          bounds: statistics.bounds,
          centroid: statistics.centroid,
          areaRatio: statistics.areaRatio,
          aspectRatio: statistics.aspectRatio,
          confidence: 0.7,
        }),
      );
    },
  });
}
