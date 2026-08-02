import {
  ReconstructionProposalSchema,
  ReconstructionReportSchema,
  ReconstructionTaskSchema,
  ReferenceAnalysisSchema,
  type ReconstructionProposal,
  type ReconstructionReport,
  type ReconstructionTask,
  type ReferenceAnalysis,
} from "./schemas.js";

function parseJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new SyntaxError(
      `Reconstruction JSON is invalid: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

export function serializeReconstructionTask(task: ReconstructionTask, pretty = false): string {
  return JSON.stringify(ReconstructionTaskSchema.parse(task), null, pretty ? 2 : undefined);
}

export function deserializeReconstructionTask(serialized: string): ReconstructionTask {
  return ReconstructionTaskSchema.parse(parseJson(serialized));
}

export function serializeReferenceAnalysis(analysis: ReferenceAnalysis, pretty = false): string {
  return JSON.stringify(ReferenceAnalysisSchema.parse(analysis), null, pretty ? 2 : undefined);
}

export function deserializeReferenceAnalysis(serialized: string): ReferenceAnalysis {
  return ReferenceAnalysisSchema.parse(parseJson(serialized));
}

export function serializeReconstructionProposal(proposal: ReconstructionProposal, pretty = false): string {
  return JSON.stringify(ReconstructionProposalSchema.parse(proposal), null, pretty ? 2 : undefined);
}

export function deserializeReconstructionProposal(serialized: string): ReconstructionProposal {
  return ReconstructionProposalSchema.parse(parseJson(serialized));
}

export function serializeReconstructionReport(report: ReconstructionReport, pretty = false): string {
  return JSON.stringify(ReconstructionReportSchema.parse(report), null, pretty ? 2 : undefined);
}

export function deserializeReconstructionReport(serialized: string): ReconstructionReport {
  return ReconstructionReportSchema.parse(parseJson(serialized));
}
