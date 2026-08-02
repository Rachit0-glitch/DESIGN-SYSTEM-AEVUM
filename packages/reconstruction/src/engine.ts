import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { ReconstructionAdapters, ReconstructionAssetResolver } from "./adapters.js";
import { analyzeReference } from "./analyzer.js";
import {
  applyReconstructionProposal,
  dryRunReconstructionProposal,
  generateReconstructionCommandPlan,
} from "./commands.js";
import { createReconstructionProposal, validateReconstructionProposal } from "./proposal.js";
import { createReconstructionReport, type CreateReconstructionReportInput } from "./report.js";
import {
  ReconstructionConfigurationSchema,
  type ReconstructionConfiguration,
  type ReconstructionProposal,
  type ReconstructionTask,
} from "./schemas.js";
import { createReconstructionTask, validateReconstructionTask } from "./task.js";

export interface ReconstructionEngineOptions {
  readonly assetResolver: ReconstructionAssetResolver;
  readonly adapters?: ReconstructionAdapters;
  readonly configuration?: Partial<ReconstructionConfiguration>;
}

export function createReconstructionEngine(options: ReconstructionEngineOptions) {
  const configuration = Object.freeze(ReconstructionConfigurationSchema.parse(options.configuration ?? {}));
  return Object.freeze({
    configuration,
    createTask: createReconstructionTask,
    validateTask: validateReconstructionTask,
    analyze(task: ReconstructionTask) {
      return analyzeReference(task, options.assetResolver, {
        configuration,
        ...(options.adapters ? { adapters: options.adapters } : {}),
      });
    },
    createProposal(
      task: ReconstructionTask,
      analysis: Parameters<typeof createReconstructionProposal>[1],
      existingDocument?: CanonicalDesignDocument,
    ) {
      return createReconstructionProposal(task, analysis, options.assetResolver, {
        configuration,
        ...(existingDocument ? { existingDocument } : {}),
      });
    },
    validateProposal(input: unknown, existingDocument?: CanonicalDesignDocument) {
      return validateReconstructionProposal(input, existingDocument);
    },
    generateCommandPlan: generateReconstructionCommandPlan,
    dryRun(proposal: ReconstructionProposal, document: CanonicalDesignDocument | null = null) {
      return dryRunReconstructionProposal(proposal, document);
    },
    apply(proposal: ReconstructionProposal, task: ReconstructionTask, document: CanonicalDesignDocument | null = null) {
      return applyReconstructionProposal(proposal, task, document);
    },
    createReport(input: CreateReconstructionReportInput) {
      return createReconstructionReport(input);
    },
  });
}

export type ReconstructionEngine = ReturnType<typeof createReconstructionEngine>;
