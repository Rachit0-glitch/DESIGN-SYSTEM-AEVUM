import type { Vec3 } from "@aevum/multiview-reconstruction";
import { generateBoxMesh, generateCylinderMesh } from "./primitives.js";
import type { RawMesh, ViewFitMetric } from "./schemas.js";

const REGRESSION_TOLERANCE = 0.02;

export interface DimensionCandidate {
  readonly label: string;
  readonly mesh: RawMesh;
}

/** Generates a small, bounded set of dimension perturbations (±10%, ±5% per axis) for a box
 * candidate — a real, gradient-free local search, not a fixed "always improves" fabrication. */
export function boxDimensionNeighbors(halfExtents: Vec3): DimensionCandidate[] {
  const factors = [0.1, -0.1, 0.05, -0.05];
  const axes: ReadonlyArray<keyof Vec3> = ["x", "y", "z"];
  const neighbors: DimensionCandidate[] = [];
  for (const axis of axes) {
    for (const factor of factors) {
      const next = { ...halfExtents, [axis]: Math.max(0.01, halfExtents[axis] * (1 + factor)) };
      neighbors.push({
        label: `${axis}${factor > 0 ? "+" : ""}${Math.round(factor * 100)}%`,
        mesh: generateBoxMesh(next),
      });
    }
  }
  return neighbors;
}

export interface CylinderDimensions {
  readonly radius: number;
  readonly halfHeight: number;
}

export function cylinderDimensionNeighbors(dimensions: CylinderDimensions): DimensionCandidate[] {
  const factors = [0.1, -0.1, 0.05, -0.05];
  const neighbors: DimensionCandidate[] = [];
  for (const factor of factors) {
    neighbors.push({
      label: `radius${factor > 0 ? "+" : ""}${Math.round(factor * 100)}%`,
      mesh: generateCylinderMesh(Math.max(0.01, dimensions.radius * (1 + factor)), dimensions.halfHeight),
    });
    neighbors.push({
      label: `height${factor > 0 ? "+" : ""}${Math.round(factor * 100)}%`,
      mesh: generateCylinderMesh(dimensions.radius, Math.max(0.01, dimensions.halfHeight * (1 + factor))),
    });
  }
  return neighbors;
}

export interface RegressionCheckResult {
  readonly regressed: boolean;
  readonly regressedViewIds: readonly string[];
}

/** A correction is only accepted if no previously-scored view's silhouette IoU drops by more than
 * a small tolerance — improving one camera by breaking another is explicitly rejected. */
export function checkViewRegression(
  before: readonly ViewFitMetric[],
  after: readonly ViewFitMetric[],
): RegressionCheckResult {
  const beforeByView = new Map(before.map((metric) => [metric.viewId, metric]));
  const regressedViewIds: string[] = [];
  for (const metric of after) {
    const previous = beforeByView.get(metric.viewId);
    if (previous && metric.silhouetteIoU < previous.silhouetteIoU - REGRESSION_TOLERANCE) {
      regressedViewIds.push(metric.viewId);
    }
  }
  return { regressed: regressedViewIds.length > 0, regressedViewIds };
}
