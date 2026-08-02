import { deepFreeze } from "./immutable.js";
import {
  RESPONSIVE_REPORT_VERSION,
  ResponsiveProposalSchema,
  ResponsiveReportSchema,
  ResponsiveReconstructionTaskSchema,
  ResponsiveValidationResultSchema,
  type ResponsiveDiagnostic,
  type ResponsiveProposal,
  type ResponsiveReconstructionTask,
  type ResponsiveReport,
  type ResponsiveValidationResult,
} from "./schemas.js";
import { deterministicId, fingerprint } from "./stable.js";

export interface CreateResponsiveReportInput {
  readonly task: ResponsiveReconstructionTask;
  readonly proposal: ResponsiveProposal;
  readonly validation: ResponsiveValidationResult;
  readonly finalDocumentVersion: number;
  readonly transactionId?: string;
  readonly diagnostics?: readonly ResponsiveDiagnostic[];
  readonly createdAt?: string;
}

export function createResponsiveReport(input: CreateResponsiveReportInput): ResponsiveReport {
  const task = ResponsiveReconstructionTaskSchema.parse(input.task);
  const proposal = ResponsiveProposalSchema.parse(input.proposal);
  const validation = ResponsiveValidationResultSchema.parse(input.validation);
  if (proposal.taskId !== task.id || validation.taskId !== task.id)
    throw new Error("Responsive report inputs target different tasks.");
  const diagnostics = [
    ...proposal.diagnostics,
    ...(input.diagnostics ?? []),
    ...validation.variants.flatMap((variant) => variant.diagnostics),
  ];
  const hasErrors = diagnostics.some((entry) => entry.severity === "ERROR" || entry.severity === "CRITICAL");
  const status = !validation.passed ? "FAILED" : hasErrors ? "VALIDATED_WITH_WARNINGS" : "VALIDATED";
  const draft = {
    reportVersion: RESPONSIVE_REPORT_VERSION,
    taskId: task.id,
    proposalId: proposal.id,
    projectId: task.projectId,
    documentId: task.documentId,
    initialDocumentVersion: task.expectedDocumentVersion,
    finalDocumentVersion: input.finalDocumentVersion,
    changeCount: proposal.changes.length,
    changedNodeIds: [...new Set(proposal.changes.map((entry) => entry.nodeId))].sort(),
    mobileStrategy: proposal.mobileStrategy,
    ...(input.transactionId ? { transactionId: input.transactionId } : {}),
    validation,
    diagnostics,
    status,
    createdAt: input.createdAt ?? task.createdAt,
  };
  const reportInputFingerprint = fingerprint(draft);
  return deepFreeze(
    ResponsiveReportSchema.parse({
      ...draft,
      id: deterministicId("responsive-report", { reportInputFingerprint }),
      reportInputFingerprint,
    }),
  );
}
