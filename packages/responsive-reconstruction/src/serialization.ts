import {
  ResponsiveProposalSchema,
  ResponsiveReportSchema,
  ResponsiveReconstructionTaskSchema,
  type ResponsiveProposal,
  type ResponsiveReconstructionTask,
  type ResponsiveReport,
} from "./schemas.js";

export function serializeResponsiveTask(task: ResponsiveReconstructionTask, pretty = false): string {
  return JSON.stringify(ResponsiveReconstructionTaskSchema.parse(task), null, pretty ? 2 : undefined);
}

export function deserializeResponsiveTask(value: string): ResponsiveReconstructionTask {
  return ResponsiveReconstructionTaskSchema.parse(JSON.parse(value) as unknown);
}

export function serializeResponsiveProposal(proposal: ResponsiveProposal, pretty = false): string {
  return JSON.stringify(ResponsiveProposalSchema.parse(proposal), null, pretty ? 2 : undefined);
}

export function deserializeResponsiveProposal(value: string): ResponsiveProposal {
  return ResponsiveProposalSchema.parse(JSON.parse(value) as unknown);
}

export function serializeResponsiveReport(report: ResponsiveReport, pretty = false): string {
  return JSON.stringify(ResponsiveReportSchema.parse(report), null, pretty ? 2 : undefined);
}

export function deserializeResponsiveReport(value: string): ResponsiveReport {
  return ResponsiveReportSchema.parse(JSON.parse(value) as unknown);
}
