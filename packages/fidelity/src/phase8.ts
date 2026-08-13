import {
  applyCorrection,
  compileCorrectionTransaction,
  createCorrectionSession,
  dryRunCorrection,
  generateCorrectionCandidates,
  type CorrectionEvaluation,
  type CorrectionSession,
  type CorrectionTransactionPlan,
} from "@aevum/correction";
import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { ValidationReport } from "@aevum/validation";
import type { FidelityCorrectionAdapter, FidelityCorrectionProposal, FidelityView } from "./orchestrator.js";
import type { FidelityMeasurement } from "./schemas.js";

export interface Phase8FidelityBridgeOptions {
  readonly timestamp: string;
  readonly actor: { readonly type: "USER" | "MCP_AGENT" | "SYSTEM" | "WORKER"; readonly id: string };
  toValidationReport(input: {
    readonly document: CanonicalDesignDocument;
    readonly measurements: readonly FidelityMeasurement[];
  }): ValidationReport | Promise<ValidationReport>;
  evaluate(input: {
    readonly document: CanonicalDesignDocument;
    readonly plan: CorrectionTransactionPlan;
    readonly dryRunDocument: CanonicalDesignDocument;
  }): CorrectionEvaluation | Promise<CorrectionEvaluation>;
  buildViews(document: CanonicalDesignDocument): readonly FidelityView[] | Promise<readonly FidelityView[]>;
}

interface StoredPlan {
  readonly session: CorrectionSession;
  readonly plan: CorrectionTransactionPlan;
}

/** Delegates canonical correction mechanics to the validated Phase 8 engine. */
export function createPhase8FidelityBridge(options: Phase8FidelityBridgeOptions): FidelityCorrectionAdapter {
  const plans = new Map<string, StoredPlan>();
  const resolvePlan = (proposal: FidelityCorrectionProposal): StoredPlan | undefined => plans.get(proposal.fingerprint);
  const adapter: FidelityCorrectionAdapter = {
    id: "aevum.phase8-correction-bridge",
    version: "1.0.0",
    async propose(input) {
      const report = await options.toValidationReport(input);
      const session = createCorrectionSession({
        document: input.document,
        baselineReport: report,
        configuration: {
          maxPasses: 1,
          protectedProperties: input.protectedNodeIds.map((nodeId) => ({
            nodeId,
            property: "NODE" as const,
            reason: "Protected by the fidelity task.",
          })),
        },
        createdAt: options.timestamp,
        createdBy: options.actor,
      });
      const generated = generateCorrectionCandidates({ session, passNumber: 1, report, document: input.document });
      if (generated.candidates.length === 0) return [];
      const plan = compileCorrectionTransaction({
        session,
        passNumber: 1,
        candidates: generated.candidates,
        document: input.document,
        timestamp: options.timestamp,
      });
      const proposal: FidelityCorrectionProposal = {
        fingerprint: plan.fingerprint as `sha256:${string}`,
        issueIds: generated.candidates.map((candidate) => candidate.sourceDifferenceId).sort(),
        affectedNodeIds: [...new Set(generated.candidates.map((candidate) => candidate.nodeId))].sort(),
        affectedProperties: [...new Set(generated.candidates.map((candidate) => candidate.property))].sort(),
        expectedDocumentVersion: plan.expectedDocumentVersion,
        priority: generated.candidates.reduce((sum, candidate) => sum + candidate.priority, 0),
      };
      plans.set(proposal.fingerprint, { session, plan });
      return [proposal];
    },
    async dryRun({ document, proposal }) {
      const stored = resolvePlan(proposal);
      if (!stored) return { valid: false, message: "Phase 8 correction plan is unavailable or stale." };
      const result = dryRunCorrection(stored.plan, document);
      return { valid: result.success, message: result.success ? "Phase 8 atomic dry run passed." : result.message };
    },
    async apply({ document, proposal }) {
      const stored = resolvePlan(proposal);
      if (!stored)
        return { status: "REJECTED" as const, document, message: "Phase 8 correction plan is unavailable or stale." };
      const dryRun = dryRunCorrection(stored.plan, document);
      if (!dryRun.success) return { status: "VERSION_CONFLICT" as const, document, message: dryRun.message };
      const evaluation = await options.evaluate({
        document,
        plan: stored.plan,
        dryRunDocument: dryRun.resultingDocument,
      });
      const applied = applyCorrection(stored.plan, document, evaluation);
      if (!applied.success) return { status: "REJECTED" as const, document, message: applied.message };
      plans.delete(proposal.fingerprint);
      return {
        status: "APPLIED" as const,
        document: applied.resultingDocument,
        views: await options.buildViews(applied.resultingDocument),
        correctionFingerprint: proposal.fingerprint,
        message: "Phase 8 atomic correction applied.",
      };
    },
  };
  return Object.freeze(adapter);
}
