import type { ReconstructionApplicationResult } from "./commands.js";
import { deterministicScopedId, fingerprint } from "./deterministic.js";
import { sortDiagnostics } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import {
  RECONSTRUCTION_REPORT_VERSION,
  ReconstructionReportSchema,
  type ReconstructionCompletionStatus,
  type ReconstructionDiagnostic,
  type ReconstructionProposal,
  type ReconstructionReport,
  type ReconstructionStageRecord,
  type ReconstructionTask,
  type ReconstructionVerificationSummary,
  type ReferenceAnalysis,
} from "./schemas.js";

export interface CreateReconstructionReportInput {
  readonly task: ReconstructionTask;
  readonly analysis: ReferenceAnalysis;
  readonly proposal?: ReconstructionProposal;
  readonly application?: ReconstructionApplicationResult;
  readonly diagnostics?: readonly ReconstructionDiagnostic[];
  readonly sceneProjection?: ReconstructionVerificationSummary;
  readonly renderGraph?: ReconstructionVerificationSummary;
  readonly stages?: readonly ReconstructionStageRecord[];
  readonly completionStatus?: ReconstructionCompletionStatus;
  readonly createdAt?: string;
}

export function notRunVerification(): ReconstructionVerificationSummary {
  return deepFreeze({
    status: "NOT_RUN",
    complete: false,
    nodeCount: 0,
    operationCount: 0,
    diagnosticCount: 0,
    errorCount: 0,
    diagnostics: [],
  });
}

function defaultCompletionStatus(input: CreateReconstructionReportInput): ReconstructionCompletionStatus {
  if (!input.proposal) return "ANALYZED";
  if (!input.application) return "PROPOSAL_READY";
  const warnings = [...input.analysis.diagnostics, ...input.proposal.diagnostics, ...(input.diagnostics ?? [])].some(
    (entry) => entry.severity === "WARNING" || entry.severity === "ERROR",
  );
  return warnings ? "APPLIED_WITH_WARNINGS" : "APPLIED";
}

export function createReconstructionReport(input: CreateReconstructionReportInput): ReconstructionReport {
  const proposal = input.proposal;
  const application = input.application;
  const sceneProjection = input.sceneProjection ?? notRunVerification();
  const renderGraph = input.renderGraph ?? notRunVerification();
  const completionStatus = input.completionStatus ?? defaultCompletionStatus(input);
  const diagnostics = sortDiagnostics([
    ...input.analysis.diagnostics,
    ...(proposal?.diagnostics ?? []),
    ...(input.diagnostics ?? []),
  ]);
  const analyzers = [
    ...new Map(
      input.analysis.regions.map((region) => [
        `${region.provenance.analyzerId}@${region.provenance.analyzerVersion}`,
        { id: region.provenance.analyzerId, version: region.provenance.analyzerVersion },
      ]),
    ).values(),
  ].sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`));
  const reportInputFingerprint = fingerprint({
    taskId: input.task.id,
    analysisFingerprint: input.analysis.analysisFingerprint,
    proposalFingerprint: proposal?.proposalFingerprint,
    transactionId: application?.transactionId,
    resultingDocumentVersion: application?.resultingDocumentVersion,
    sceneProjectionFingerprint: sceneProjection.fingerprint,
    sceneProjectionStatus: sceneProjection.status,
    renderGraphFingerprint: renderGraph.fingerprint,
    renderGraphStatus: renderGraph.status,
    completionStatus,
  });
  return deepFreeze(
    ReconstructionReportSchema.parse({
      id: deterministicScopedId("reconstruction-report", { reportInputFingerprint }),
      reportVersion: RECONSTRUCTION_REPORT_VERSION,
      reportInputFingerprint,
      createdAt: input.createdAt ?? new Date().toISOString(),
      taskId: input.task.id,
      analysisId: input.analysis.id,
      ...(proposal ? { proposalId: proposal.id } : {}),
      projectId: input.task.projectId,
      ...(application
        ? { documentId: application.documentId }
        : proposal
          ? { documentId: proposal.proposedDocumentMetadata.documentId }
          : {}),
      sourceAssetId: input.task.sourceAssetId,
      sourceDimensions: input.analysis.sourceDimensions,
      qualityMode: input.task.qualityMode,
      analyzers,
      counts: {
        regions: input.analysis.regions.length,
        proposedNodes: proposal?.proposedNodes.length ?? 0,
        appliedNodes: application ? (proposal?.proposedNodes.length ?? 0) : 0,
        textCandidates: input.analysis.textCandidates.length,
        imageCandidates: input.analysis.assetCandidates.length,
        shapeCandidates: input.analysis.shapeCandidates.length,
        componentCandidates: input.analysis.componentCandidates.length,
        tokenCandidates: input.analysis.tokenCandidates.length,
      },
      confidenceSummary: input.analysis.confidenceSummary,
      diagnostics,
      fallbacks: proposal?.fallbacks ?? [],
      unresolvedIssues: proposal?.unresolvedIssues ?? [],
      ...(application
        ? {
            transaction: {
              transactionId: application.transactionId,
              commandIds: application.commandIds,
              ...(application.previousDocumentVersion !== undefined
                ? { previousDocumentVersion: application.previousDocumentVersion }
                : {}),
              resultingDocumentVersion: application.resultingDocumentVersion,
              createdEntityIds: application.createdEntityIds,
            },
          }
        : {}),
      sceneProjection,
      renderGraph,
      stages: input.stages ?? [],
      completionStatus,
    }),
  );
}
