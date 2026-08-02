import type { CanonicalDesignDocument } from "@aevum/document-model";
import { ValidationReportSchema, type ValidationReport } from "@aevum/validation";
import { generateCorrectionCandidates } from "./candidates.js";
import { evaluateCorrection } from "./evaluation.js";
import { deepFreeze } from "./immutable.js";
import { createCorrectionReport } from "./report.js";
import {
  CORRECTION_PASS_VERSION,
  CorrectionPassSchema,
  CorrectionSessionSchema,
  type CorrectionDiagnostic,
  type CorrectionFinalResult,
  type CorrectionPass,
  type CorrectionReport,
  type CorrectionSession,
  type CorrectionStopReason,
  type CorrectionTransactionPlan,
} from "./schemas.js";
import { createCorrectionSession, updateCorrectionSession } from "./session.js";
import { applyCorrection, compileCorrectionTransaction, dryRunCorrection } from "./transaction.js";
import { deterministicId, fingerprint } from "./stable.js";

export interface CorrectionRevalidationAdapter {
  validate(document: CanonicalDesignDocument, passNumber: number): ValidationReport | Promise<ValidationReport>;
}

export interface RunCorrectionInput {
  readonly session: CorrectionSession;
  readonly document: CanonicalDesignDocument;
  readonly baselineReport: ValidationReport;
  readonly timestamp: string;
}

export type RunCorrectionResult =
  | {
      readonly success: true;
      readonly session: CorrectionSession;
      readonly report: CorrectionReport;
      readonly document: CanonicalDesignDocument;
      readonly validation: ValidationReport;
    }
  | {
      readonly success: false;
      readonly session: CorrectionSession;
      readonly document: CanonicalDesignDocument;
      readonly validation: ValidationReport;
      readonly diagnostics: readonly CorrectionDiagnostic[];
    };

function correctionPass(input: Omit<CorrectionPass, "id" | "passVersion" | "fingerprint">): CorrectionPass {
  const draft = { ...input, passVersion: CORRECTION_PASS_VERSION };
  const passFingerprint = fingerprint(draft);
  return deepFreeze(
    CorrectionPassSchema.parse({
      ...draft,
      id: deterministicId("correction-pass", {
        sessionId: input.sessionId,
        passNumber: input.passNumber,
        passFingerprint,
      }),
      fingerprint: passFingerprint,
    }),
  );
}

function stopReasonForRejected(reasons: readonly string[]): CorrectionStopReason {
  return reasons.length === 1 && reasons[0] === "OVERALL_NOT_IMPROVED"
    ? "NO_MEASURABLE_IMPROVEMENT"
    : "REGRESSION_DETECTED";
}

function finalResult(
  session: CorrectionSession,
  stopReason: CorrectionStopReason,
  initialValidation: ValidationReport,
  finalValidation: ValidationReport,
  document: CanonicalDesignDocument,
): CorrectionFinalResult {
  const acceptedCandidateIds = session.passes.flatMap((pass) =>
    pass.decisions.filter((entry) => entry.outcome === "ACCEPTED").map((entry) => entry.candidateId),
  );
  const rejectedCandidateIds = [
    ...session.passes.flatMap((pass) =>
      pass.decisions.filter((entry) => entry.outcome === "REJECTED").map((entry) => entry.candidateId),
    ),
    ...session.passes.flatMap((pass) => pass.generationRejections.map((entry) => entry.id)),
  ];
  return {
    stopReason,
    initialDocumentVersion: session.initialDocumentVersion,
    finalDocumentVersion: document.documentVersion,
    initialValidationReportId: initialValidation.id,
    finalValidationReportId: finalValidation.id,
    initialScore: initialValidation.scores.overall,
    finalScore: finalValidation.scores.overall,
    improvement: finalValidation.scores.overall - initialValidation.scores.overall,
    acceptedCandidateIds: [...new Set(acceptedCandidateIds)].sort(),
    rejectedCandidateIds: [...new Set(rejectedCandidateIds)].sort(),
  };
}

function diagnostic(
  code: CorrectionDiagnostic["code"],
  severity: CorrectionDiagnostic["severity"],
  message: string,
  passNumber?: number,
): CorrectionDiagnostic {
  return { code, severity, message, recoverable: severity !== "CRITICAL", ...(passNumber ? { passNumber } : {}) };
}

export function createCorrectionEngine(options: { readonly revalidationAdapter: CorrectionRevalidationAdapter }) {
  return Object.freeze({
    createSession: createCorrectionSession,
    generateCorrectionCandidates,
    compileCorrectionTransaction,
    dryRunCorrection,
    applyCorrection,
    evaluateCorrection,
    createCorrectionReport,
    async run(input: RunCorrectionInput): Promise<RunCorrectionResult> {
      let session = CorrectionSessionSchema.parse(input.session);
      let document = input.document;
      const initialValidation = ValidationReportSchema.parse(input.baselineReport);
      let validation = initialValidation;
      const diagnostics: CorrectionDiagnostic[] = [];
      const passes: CorrectionPass[] = [];
      session = updateCorrectionSession(session, { status: "RUNNING", passes });
      let stopReason: CorrectionStopReason | undefined;

      if (validation.status === "PASS" || validation.scores.overall >= session.configuration.targetOverallScore) {
        stopReason = "THRESHOLD_REACHED";
      }

      for (let passNumber = 1; !stopReason && passNumber <= session.configuration.maxPasses; passNumber += 1) {
        const generation = generateCorrectionCandidates({ session, passNumber, report: validation, document });
        if (generation.candidates.length === 0) {
          passes.push(
            correctionPass({
              sessionId: session.id,
              passNumber,
              status: "REJECTED",
              inputDocumentVersion: document.documentVersion,
              baselineReportId: validation.id,
              candidateIds: [],
              generationRejections: generation.rejected,
              decisions: [],
              scoreBefore: validation.scores.overall,
              diagnostics: ["No safe correction candidates were generated."],
              createdAt: input.timestamp,
            }),
          );
          stopReason = "NO_CANDIDATES";
          diagnostics.push(diagnostic("NO_CANDIDATES", "WARNING", "No safe correction candidates remain.", passNumber));
          break;
        }

        let plan: CorrectionTransactionPlan;
        try {
          plan = compileCorrectionTransaction({
            session,
            passNumber,
            candidates: generation.candidates,
            document,
            timestamp: input.timestamp,
          });
        } catch (error) {
          diagnostics.push(
            diagnostic(
              "TRANSACTION_FAILED",
              "CRITICAL",
              error instanceof Error ? error.message : "Correction transaction compilation failed.",
              passNumber,
            ),
          );
          stopReason = "TRANSACTION_FAILED";
          break;
        }

        const dryRun = dryRunCorrection(plan, document);
        if (!dryRun.success) {
          passes.push(
            correctionPass({
              sessionId: session.id,
              passNumber,
              status: "DRY_RUN_FAILED",
              inputDocumentVersion: document.documentVersion,
              baselineReportId: validation.id,
              candidateIds: plan.candidateIds,
              generationRejections: generation.rejected,
              transactionPlanId: plan.id,
              decisions: plan.candidateIds.map((candidateId) => ({
                candidateId,
                outcome: "REJECTED" as const,
                reason: "Atomic transaction dry run failed.",
              })),
              scoreBefore: validation.scores.overall,
              diagnostics: [dryRun.message],
              createdAt: input.timestamp,
            }),
          );
          diagnostics.push(diagnostic("DRY_RUN_FAILED", "CRITICAL", dryRun.message, passNumber));
          stopReason = "TRANSACTION_FAILED";
          break;
        }

        let candidateValidation: ValidationReport;
        try {
          candidateValidation = ValidationReportSchema.parse(
            await options.revalidationAdapter.validate(dryRun.resultingDocument, passNumber),
          );
        } catch (error) {
          diagnostics.push(
            diagnostic(
              "REVALIDATION_FAILED",
              "CRITICAL",
              error instanceof Error ? error.message : "Candidate revalidation failed.",
              passNumber,
            ),
          );
          stopReason = "TRANSACTION_FAILED";
          break;
        }
        const evaluation = evaluateCorrection({
          baselineReport: validation,
          candidateReport: candidateValidation,
          candidateDocument: dryRun.resultingDocument,
          configuration: session.configuration,
          transactionPlan: plan,
        });
        if (!evaluation.accepted) {
          passes.push(
            correctionPass({
              sessionId: session.id,
              passNumber,
              status: "REJECTED",
              inputDocumentVersion: document.documentVersion,
              baselineReportId: validation.id,
              candidateReportId: candidateValidation.id,
              candidateIds: plan.candidateIds,
              generationRejections: generation.rejected,
              transactionPlanId: plan.id,
              decisions: plan.candidateIds.map((candidateId) => ({
                candidateId,
                outcome: "REJECTED" as const,
                reason: evaluation.reasons.join(", "),
              })),
              evaluation,
              scoreBefore: validation.scores.overall,
              scoreAfter: candidateValidation.scores.overall,
              scoreDelta: evaluation.overallDelta,
              diagnostics: ["Candidate transaction was rejected after revalidation."],
              createdAt: input.timestamp,
            }),
          );
          diagnostics.push(diagnostic("REGRESSION_DETECTED", "WARNING", evaluation.reasons.join(", "), passNumber));
          stopReason = stopReasonForRejected(evaluation.reasons);
          break;
        }

        const applied = applyCorrection(plan, document, evaluation);
        if (!applied.success) {
          diagnostics.push(diagnostic("TRANSACTION_FAILED", "CRITICAL", applied.message, passNumber));
          stopReason = "TRANSACTION_FAILED";
          break;
        }
        passes.push(
          correctionPass({
            sessionId: session.id,
            passNumber,
            status: "ACCEPTED",
            inputDocumentVersion: document.documentVersion,
            outputDocumentVersion: applied.resultingDocument.documentVersion,
            baselineReportId: validation.id,
            candidateReportId: candidateValidation.id,
            candidateIds: plan.candidateIds,
            generationRejections: generation.rejected,
            transactionPlanId: plan.id,
            decisions: plan.candidateIds.map((candidateId) => ({
              candidateId,
              outcome: "ACCEPTED" as const,
              reason: "Revalidation proved measurable non-regressive improvement.",
            })),
            evaluation,
            scoreBefore: validation.scores.overall,
            scoreAfter: candidateValidation.scores.overall,
            scoreDelta: evaluation.overallDelta,
            diagnostics: [],
            createdAt: input.timestamp,
          }),
        );
        document = applied.resultingDocument;
        validation = candidateValidation;
        session = updateCorrectionSession(session, { status: "RUNNING", passes });
        if (validation.status === "PASS" || validation.scores.overall >= session.configuration.targetOverallScore) {
          stopReason = "THRESHOLD_REACHED";
        } else if (passNumber === session.configuration.maxPasses) {
          stopReason = "MAXIMUM_PASSES_REACHED";
          diagnostics.push(
            diagnostic("MAXIMUM_PASSES_REACHED", "INFO", "Configured correction pass limit reached.", passNumber),
          );
        }
      }

      stopReason ??= "MAXIMUM_PASSES_REACHED";
      session = updateCorrectionSession(session, { status: "RUNNING", passes });
      session = updateCorrectionSession(session, {
        status: stopReason === "TRANSACTION_FAILED" ? "FAILED" : "COMPLETED",
        passes,
        finalResult: finalResult(session, stopReason, initialValidation, validation, document),
      });
      if (session.status === "FAILED")
        return deepFreeze({ success: false, session, document, validation, diagnostics });
      const report = createCorrectionReport({
        session,
        initialValidation,
        finalValidation: validation,
        diagnostics,
        createdAt: input.timestamp,
      });
      return deepFreeze({ success: true, session, report, document, validation });
    },
  });
}

export type CorrectionEngine = ReturnType<typeof createCorrectionEngine>;
