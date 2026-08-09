import { diagnostic } from "./diagnostics.js";
import type { CoverageReport, MultiViewDiagnostic, ReadinessAssessment, ViewRecord } from "./schemas.js";

const SILHOUETTE_SIMILARITY_TOLERANCE = 0.02;

/** Flags views whose silhouette bounds/area/aspect are near-identical — a likely accidental
 * duplicate upload rather than two genuinely distinct angles of the same object. */
export function detectDuplicateViews(views: readonly ViewRecord[]): readonly MultiViewDiagnostic[] {
  const diagnostics: MultiViewDiagnostic[] = [];
  for (const [i, viewA] of views.entries()) {
    for (const viewB of views.slice(i + 1)) {
      const left = viewA.silhouette;
      const right = viewB.silhouette;
      if (!left || !right) continue;
      const boundsClose =
        Math.abs(left.bounds.minX - right.bounds.minX) < SILHOUETTE_SIMILARITY_TOLERANCE &&
        Math.abs(left.bounds.maxX - right.bounds.maxX) < SILHOUETTE_SIMILARITY_TOLERANCE &&
        Math.abs(left.bounds.minY - right.bounds.minY) < SILHOUETTE_SIMILARITY_TOLERANCE &&
        Math.abs(left.bounds.maxY - right.bounds.maxY) < SILHOUETTE_SIMILARITY_TOLERANCE;
      const areaClose = Math.abs(left.areaRatio - right.areaRatio) < SILHOUETTE_SIMILARITY_TOLERANCE;
      if (boundsClose && areaClose && viewA.role.role !== viewB.role.role) {
        diagnostics.push(
          diagnostic({
            code: "VIEW_DUPLICATE",
            severity: "WARNING",
            message: `Views ${viewA.id} (${viewA.role.role}) and ${viewB.id} (${viewB.role.role}) have near-identical silhouettes despite differing declared roles.`,
            stage: "CONFLICT_DETECTION",
            recoverable: true,
            relatedIds: [viewA.id, viewB.id],
          }),
        );
      }
    }
  }
  return diagnostics;
}

/** Depth along the primary optical axis is only constrained when at least one non-frontal
 * direction (a side or top/bottom view) is present; front-only or front+back sets cannot resolve it. */
export function detectDepthAmbiguity(coverage: CoverageReport): readonly MultiViewDiagnostic[] {
  const hasDepthAxis = (["LEFT", "RIGHT", "TOP", "BOTTOM"] as const).some(
    (direction) => coverage.directions[direction]?.status !== "MISSING",
  );
  if (hasDepthAxis) return [];
  return [
    diagnostic({
      code: "INSUFFICIENT_DEPTH_EVIDENCE",
      severity: "WARNING",
      message: "Only frontal/back evidence is present; depth along the side axis is unconstrained.",
      stage: "CONFLICT_DETECTION",
      recoverable: true,
    }),
  ];
}

export function detectNotReady(readiness: ReadinessAssessment): readonly MultiViewDiagnostic[] {
  if (readiness.classification !== "INSUFFICIENT") return [];
  return [
    diagnostic({
      code: "RECONSTRUCTION_NOT_READY",
      severity: "ERROR",
      message:
        "Reconstruction readiness is INSUFFICIENT; more views, landmarks, or silhouette evidence are needed before a provider should attempt a candidate.",
      stage: "CONFLICT_DETECTION",
      recoverable: true,
    }),
  ];
}
