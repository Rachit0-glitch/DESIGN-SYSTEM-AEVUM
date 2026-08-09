import { deterministicScopedId, fingerprint } from "./deterministic.js";
import { hasBlockingDiagnostics } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import {
  MULTIVIEW_REPORT_VERSION,
  MultiViewAnalysisReportSchema,
  type CoverageReport,
  type MultiViewAnalysisReport,
  type MultiViewReconstructionProposal,
  type MultiViewReferenceSet,
  type MultiViewValidationReport,
  type ReadinessAssessment,
} from "./schemas.js";

export interface CreateMultiViewReportInput {
  readonly referenceSet: MultiViewReferenceSet;
  readonly coverage: CoverageReport;
  readonly readiness: ReadinessAssessment;
  readonly validation: MultiViewValidationReport;
  readonly proposal: MultiViewReconstructionProposal;
  readonly createdAt: string;
}

export function createMultiViewAnalysisReport(input: CreateMultiViewReportInput): MultiViewAnalysisReport {
  const { referenceSet, coverage, readiness, validation, proposal } = input;

  const viewSummaries = referenceSet.views.map((view) => ({
    viewId: view.id,
    assetId: view.assetId,
    role: view.role.role,
    roleConfidence: view.role.confidence,
  }));

  const status =
    validation.status === "FAIL" || hasBlockingDiagnostics(referenceSet.diagnostics)
      ? "BLOCKED"
      : readiness.classification === "INSUFFICIENT" || readiness.classification === "WEAK"
        ? "NEEDS_MORE_EVIDENCE"
        : "READY_FOR_PROPOSAL";

  const base = {
    taskId: referenceSet.taskId,
    referenceSetId: referenceSet.id,
    viewSummaries,
    coverage,
    readiness,
    validation,
    proposal,
    status,
  };

  return deepFreeze(
    MultiViewAnalysisReportSchema.parse({
      id: deterministicScopedId("multiview-report", base),
      reportVersion: MULTIVIEW_REPORT_VERSION,
      createdAt: input.createdAt,
      ...base,
      diagnostics: referenceSet.diagnostics,
      reportFingerprint: fingerprint(base),
    }),
  );
}
