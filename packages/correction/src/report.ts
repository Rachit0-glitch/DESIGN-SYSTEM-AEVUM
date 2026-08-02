import { ValidationReportSchema, type ValidationReport } from "@aevum/validation";
import { deepFreeze } from "./immutable.js";
import {
  CORRECTION_REPORT_VERSION,
  CorrectionDiagnosticSchema,
  CorrectionReportSchema,
  CorrectionSessionSchema,
  type CorrectionDiagnostic,
  type CorrectionReport,
  type CorrectionSession,
} from "./schemas.js";
import { deterministicId, fingerprint } from "./stable.js";

export interface CreateCorrectionReportInput {
  readonly session: CorrectionSession;
  readonly initialValidation: ValidationReport;
  readonly finalValidation: ValidationReport;
  readonly diagnostics?: readonly CorrectionDiagnostic[];
  readonly createdAt: string;
}

export function createCorrectionReport(input: CreateCorrectionReportInput): CorrectionReport {
  const session = CorrectionSessionSchema.parse(input.session);
  const initialValidation = ValidationReportSchema.parse(input.initialValidation);
  const finalValidation = ValidationReportSchema.parse(input.finalValidation);
  if (!session.finalResult) throw new Error("A correction report requires a completed session final result.");
  const acceptedCandidateIds = session.passes.flatMap((pass) =>
    pass.decisions.filter((entry) => entry.outcome === "ACCEPTED").map((entry) => entry.candidateId),
  );
  const rejectedCandidateIds = [
    ...session.passes.flatMap((pass) =>
      pass.decisions.filter((entry) => entry.outcome === "REJECTED").map((entry) => entry.candidateId),
    ),
    ...session.passes.flatMap((pass) => pass.generationRejections.map((entry) => entry.id)),
  ];
  const evaluations = session.passes.flatMap((pass) => (pass.evaluation ? [pass.evaluation] : []));
  const regressionSummary = {
    rejectedPasses: session.passes.filter((pass) => pass.status === "REJECTED").length,
    regressedRegionIds: [...new Set(evaluations.flatMap((entry) => entry.regressedRegionIds))].sort(),
    reasons: [...new Set(evaluations.flatMap((entry) => entry.reasons).filter((entry) => entry !== "ACCEPTED"))].sort(),
  };
  const diagnostics = (input.diagnostics ?? []).map((entry) => CorrectionDiagnosticSchema.parse(entry));
  const draft = {
    reportVersion: CORRECTION_REPORT_VERSION,
    sessionId: session.id,
    projectId: session.projectId,
    documentId: session.documentId,
    referenceId: session.referenceId,
    sourceAssetId: session.sourceAssetId,
    initialDocumentVersion: session.initialDocumentVersion,
    finalDocumentVersion: session.finalResult.finalDocumentVersion,
    initialValidation,
    finalValidation,
    passes: session.passes,
    acceptedCandidateIds: [...new Set(acceptedCandidateIds)].sort(),
    rejectedCandidateIds: [...new Set(rejectedCandidateIds)].sort(),
    improvementScore: session.finalResult.improvement,
    regressionSummary,
    stopReason: session.finalResult.stopReason,
    diagnostics,
    createdAt: input.createdAt,
  };
  const reportInputFingerprint = fingerprint(draft);
  return deepFreeze(
    CorrectionReportSchema.parse({
      ...draft,
      id: deterministicId("correction-report", { reportInputFingerprint }),
      reportInputFingerprint,
    }),
  );
}
