import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { ValidationReferenceSnapshot } from "@aevum/validation";
import { generateResponsiveProposal } from "./inference.js";
import { createResponsiveReport } from "./report.js";
import type { ResponsiveDiagnostic, ResponsiveReconstructionTask, ResponsiveReport } from "./schemas.js";
import { createResponsiveReconstructionTask } from "./task.js";
import {
  applyResponsiveProposal,
  compileResponsiveTransaction,
  dryRunResponsiveProposal,
  type ResponsiveApplicationResult,
} from "./transaction.js";
import { validateResponsiveVariants } from "./validation.js";

export interface RunResponsiveReconstructionInput {
  readonly task: ResponsiveReconstructionTask;
  readonly document: CanonicalDesignDocument;
  readonly references: Readonly<Record<string, ValidationReferenceSnapshot>>;
  readonly timestamp: string;
  readonly thresholdProfile?: "DRAFT" | "STANDARD" | "HIGH_QUALITY" | "PIXEL_PERFECT";
}

export type RunResponsiveReconstructionResult =
  | {
      readonly success: true;
      readonly application: Extract<ResponsiveApplicationResult, { success: true }>;
      readonly report: ResponsiveReport;
    }
  | {
      readonly success: false;
      readonly message: string;
      readonly report?: ResponsiveReport;
      readonly diagnostics: readonly ResponsiveDiagnostic[];
    };

export function createResponsiveReconstructionEngine() {
  return Object.freeze({
    createTask: createResponsiveReconstructionTask,
    generateProposal: generateResponsiveProposal,
    compileTransaction: compileResponsiveTransaction,
    dryRun: dryRunResponsiveProposal,
    validateVariants: validateResponsiveVariants,
    apply: applyResponsiveProposal,
    createReport: createResponsiveReport,
    run(input: RunResponsiveReconstructionInput): RunResponsiveReconstructionResult {
      const proposal = generateResponsiveProposal(input.task, input.document);
      if (proposal.changes.length === 0) {
        return {
          success: false,
          message: "Responsive reconstruction produced no executable changes.",
          diagnostics: proposal.diagnostics,
        };
      }
      const plan = compileResponsiveTransaction({ proposal, document: input.document, timestamp: input.timestamp });
      const dryRun = dryRunResponsiveProposal(plan, input.document);
      if (!dryRun.success) return { success: false, message: dryRun.message, diagnostics: proposal.diagnostics };
      const validation = validateResponsiveVariants({
        task: input.task,
        document: dryRun.resultingDocument,
        references: input.references,
        ...(input.thresholdProfile ? { thresholdProfile: input.thresholdProfile } : {}),
      });
      if (!validation.passed) {
        const report = createResponsiveReport({
          task: input.task,
          proposal,
          validation,
          finalDocumentVersion: input.document.documentVersion,
          createdAt: input.timestamp,
        });
        return {
          success: false,
          message: "Responsive proposal failed multi-viewport validation.",
          report,
          diagnostics: report.diagnostics,
        };
      }
      const application = applyResponsiveProposal(plan, input.document, validation);
      if (!application.success)
        return { success: false, message: application.message, diagnostics: proposal.diagnostics };
      const report = createResponsiveReport({
        task: input.task,
        proposal,
        validation,
        finalDocumentVersion: application.resultingDocument.documentVersion,
        transactionId: application.auditRecord.transactionId,
        createdAt: input.timestamp,
      });
      return { success: true, application, report };
    },
  });
}

export type ResponsiveReconstructionEngine = ReturnType<typeof createResponsiveReconstructionEngine>;
