import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import { fingerprint } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import { DeformationQualityReportSchema, type DeformationQualityReport, type RigDiagnostic } from "./schemas.js";
import type { Vec3 } from "./math.js";

function bounds(points: readonly Vec3[]) {
  if (points.length === 0) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  return {
    min: {
      x: Math.min(...points.map((p) => p.x)),
      y: Math.min(...points.map((p) => p.y)),
      z: Math.min(...points.map((p) => p.z)),
    },
    max: {
      x: Math.max(...points.map((p) => p.x)),
      y: Math.max(...points.map((p) => p.y)),
      z: Math.max(...points.map((p) => p.z)),
    },
  };
}
const diagonal = (value: ReturnType<typeof bounds>) =>
  Math.hypot(value.max.x - value.min.x, value.max.y - value.min.y, value.max.z - value.min.z);

export function validateDeformation(rest: readonly Vec3[], posed: readonly Vec3[]): DeformationQualityReport {
  if (rest.length !== posed.length) throw new Error("Rest and posed geometry must contain the same vertex count.");
  const diagnostics: RigDiagnostic[] = [];
  const distances = posed.map((point, index) => {
    const source = rest[index] ?? { x: 0, y: 0, z: 0 };
    if (![point.x, point.y, point.z].every(Number.isFinite))
      diagnostics.push(
        diagnostic({
          code: "DEFORMATION_VERTEX_INVALID",
          severity: "ERROR",
          message: `Posed vertex ${index} is non-finite.`,
          stage: "DEFORMATION_VALIDATION",
          recoverable: true,
        }),
      );
    return Math.hypot(point.x - source.x, point.y - source.y, point.z - source.z);
  });
  const restDiagonal = diagonal(bounds(rest));
  const posedDiagonal = diagonal(bounds(posed));
  const boundsRatio =
    restDiagonal > 1e-12 ? posedDiagonal / restDiagonal : posedDiagonal === 0 ? 1 : Number.MAX_SAFE_INTEGER;
  const maximumDisplacement = distances.length ? Math.max(...distances.filter(Number.isFinite), 0) : 0;
  const meanDisplacement = distances.length
    ? distances.filter(Number.isFinite).reduce((a, b) => a + b, 0) / distances.length
    : 0;
  if (restDiagonal > 0 && maximumDisplacement > restDiagonal * 10)
    diagnostics.push(
      diagnostic({
        code: "DEFORMATION_EXTREME_DISPLACEMENT",
        severity: "ERROR",
        message: "Maximum displacement exceeds ten times the rest bounds diagonal.",
        stage: "DEFORMATION_VALIDATION",
        recoverable: true,
        details: { maximumDisplacement, restDiagonal },
      }),
    );
  if (boundsRatio < 0.05)
    diagnostics.push(
      diagnostic({
        code: "DEFORMATION_COLLAPSED",
        severity: "ERROR",
        message: "Posed geometry bounds indicate a collapsed region.",
        stage: "DEFORMATION_VALIDATION",
        recoverable: true,
        details: { boundsRatio },
      }),
    );
  if (boundsRatio > 5)
    diagnostics.push(
      diagnostic({
        code: "DEFORMATION_BOUNDS_SUSPICIOUS",
        severity: "WARNING",
        message: "Posed bounds expanded more than five times the rest bounds.",
        stage: "DEFORMATION_VALIDATION",
        recoverable: true,
        details: { boundsRatio },
      }),
    );
  const errorCount = diagnostics.filter((entry) => entry.severity === "ERROR" || entry.severity === "CRITICAL").length;
  const warningCount = diagnostics.filter((entry) => entry.severity === "WARNING").length;
  const score = Math.max(0, 1 - errorCount * 0.5 - warningCount * 0.15);
  const classification =
    errorCount > 0
      ? ("INVALID" as const)
      : warningCount > 0
        ? ("DEGRADED" as const)
        : score >= 0.95
          ? ("EXCELLENT" as const)
          : ("ACCEPTABLE" as const);
  const measurements = {
    vertexCount: rest.length,
    invalidVertexCount: posed.filter((p) => ![p.x, p.y, p.z].every(Number.isFinite)).length,
    maximumDisplacement,
    meanDisplacement,
    restDiagonal,
    posedDiagonal,
    boundsRatio,
  };
  const body = {
    version: "1.0.0" as const,
    valid: errorCount === 0,
    classification,
    score,
    measurements,
    diagnostics: sortDiagnostics(diagnostics),
  };
  return deepFreeze(DeformationQualityReportSchema.parse({ ...body, fingerprint: fingerprint(body) }));
}
