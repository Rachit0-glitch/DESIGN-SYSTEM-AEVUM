import { deepFreeze } from "./immutable.js";
import {
  HEATMAP_VERSION,
  ValidationHeatmapSchema,
  type ValidationDifference,
  type ValidationHeatmap,
  type ValidationReferenceSnapshot,
} from "./schemas.js";
import { deterministicId, fingerprint } from "./stable.js";

export function buildHeatmap(
  reference: ValidationReferenceSnapshot,
  differences: readonly ValidationDifference[],
  type: ValidationHeatmap["type"] = "RAW_DIFFERENCE",
): ValidationHeatmap {
  const relevantMetrics =
    type === "LAYOUT"
      ? new Set(["LAYOUT", "POSITION", "SIZE", "CONSTRAINT"])
      : type === "TYPOGRAPHY"
        ? new Set(["TYPOGRAPHY"])
        : type === "COLOR"
          ? new Set(["COLOR", "BORDER", "RADIUS", "SHADOW", "GRADIENT", "OPACITY"])
          : type === "ASSET"
            ? new Set(["IMAGE", "ASSET"])
            : undefined;
  const regionById = new Map(reference.regions.map((region) => [region.id, region]));
  const cells = differences
    .filter((entry) => !relevantMetrics || relevantMetrics.has(entry.metric))
    .map((entry) => {
      const region = regionById.get(entry.regionId);
      if (!region) return undefined;
      return { ...region.bounds, intensity: 1 - entry.score, regionId: region.id, sourceNodeId: region.sourceNodeId };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    .sort((left, right) => left.regionId.localeCompare(right.regionId) || right.intensity - left.intensity);
  const draft = {
    heatmapVersion: HEATMAP_VERSION,
    type,
    width: reference.sourceDimensions.width,
    height: reference.sourceDimensions.height,
    cells,
    legend: { minimum: 0 as const, maximum: 1 as const, label: "Normalized difference intensity" },
    placeholder: true,
  };
  const heatmapFingerprint = fingerprint(draft);
  return deepFreeze(
    ValidationHeatmapSchema.parse({
      ...draft,
      id: deterministicId("heatmap", { type, heatmapFingerprint }),
      fingerprint: heatmapFingerprint,
    }),
  );
}
