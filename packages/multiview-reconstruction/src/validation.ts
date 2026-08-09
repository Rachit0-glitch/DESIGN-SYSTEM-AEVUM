import { deterministicScopedId, fingerprint } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import {
  MultiViewValidationReportSchema,
  type MultiViewDiagnostic,
  type MultiViewReferenceSet,
  type MultiViewValidationReport,
} from "./schemas.js";

function isOk(diagnostics: readonly MultiViewDiagnostic[], codes: readonly string[]): boolean {
  return !diagnostics.some(
    (entry) => codes.includes(entry.code) && (entry.severity === "ERROR" || entry.severity === "CRITICAL"),
  );
}

/**
 * Cross-view consistency validation, independent from Phase 7's 2D pixel validation: it checks
 * whether the evidence gathered about MULTIPLE views of one object agrees with itself, not
 * whether any single image matches a rendered reference.
 */
export function validateMultiView(referenceSet: MultiViewReferenceSet): MultiViewValidationReport {
  const diagnostics = referenceSet.diagnostics;
  const criticalCount = diagnostics.filter((entry) => entry.severity === "CRITICAL").length;
  const errorCount = diagnostics.filter((entry) => entry.severity === "ERROR").length;
  const status = criticalCount > 0 ? "FAIL" : errorCount > 0 ? "WARN" : "PASS";

  const base = {
    referenceSetId: referenceSet.id,
    coverageOk: isOk(diagnostics, ["VIEW_COVERAGE_INSUFFICIENT"]),
    cameraConsistencyOk: isOk(diagnostics, ["CAMERA_CONFLICT"]),
    landmarkConsistencyOk: isOk(diagnostics, ["LANDMARK_CONFLICT", "LANDMARK_REPROJECTION_ERROR_HIGH"]),
    silhouetteConsistencyOk: isOk(diagnostics, ["SILHOUETTE_CONFLICT"]),
    partCorrespondenceOk: isOk(diagnostics, ["PART_CORRESPONDENCE_AMBIGUOUS"]),
    scaleConsistencyOk: isOk(diagnostics, ["SCALE_CONFLICT"]),
    constraintConsistencyOk: isOk(diagnostics, ["SYMMETRY_CONFLICT"]),
    status,
  };

  return deepFreeze(
    MultiViewValidationReportSchema.parse({
      id: deterministicScopedId("multiview-validation", base),
      ...base,
      diagnostics,
      fingerprint: fingerprint(base),
    }),
  );
}
