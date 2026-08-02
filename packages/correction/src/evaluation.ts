import { validateDocument, type CanonicalDesignDocument } from "@aevum/document-model";
import { ValidationReportSchema, type ValidationReport, type ValidationRegionResult } from "@aevum/validation";
import { deepFreeze } from "./immutable.js";
import {
  CorrectionEvaluationSchema,
  CorrectionTransactionPlanSchema,
  type CorrectionConfiguration,
  type CorrectionEvaluation,
  type CorrectionTransactionPlan,
} from "./schemas.js";
import { fingerprint, stableStringify } from "./stable.js";

type EvaluationReason = CorrectionEvaluation["reasons"][number];

function validationConfidence(report: ValidationReport): number {
  if (report.differences.length === 0) return 1;
  return report.differences.reduce((sum, entry) => sum + entry.confidence, 0) / report.differences.length;
}

function comparableRegion(region: ValidationRegionResult | undefined): unknown {
  if (!region) return null;
  return {
    sourceNodeId: region.sourceNodeId,
    score: region.score,
    status: region.status,
    metrics: region.metrics,
    differenceIds: region.differenceIds,
  };
}

export interface EvaluateCorrectionInput {
  readonly baselineReport: ValidationReport;
  readonly candidateReport: ValidationReport;
  readonly candidateDocument: CanonicalDesignDocument;
  readonly configuration: CorrectionConfiguration;
  readonly transactionPlan: CorrectionTransactionPlan;
}

export function evaluateCorrection(input: EvaluateCorrectionInput): CorrectionEvaluation {
  const baseline = ValidationReportSchema.parse(input.baselineReport);
  const candidate = ValidationReportSchema.parse(input.candidateReport);
  const transactionPlan = CorrectionTransactionPlanSchema.parse(input.transactionPlan);
  if (
    candidate.documentId !== input.candidateDocument.metadata.id ||
    candidate.documentVersion !== input.candidateDocument.documentVersion ||
    candidate.projectId !== input.candidateDocument.metadata.projectId ||
    baseline.documentId !== candidate.documentId ||
    baseline.referenceId !== candidate.referenceId
  ) {
    throw new Error("Correction evaluation report and candidate document identities do not match.");
  }
  if (
    transactionPlan.documentId !== baseline.documentId ||
    transactionPlan.expectedDocumentVersion !== baseline.documentVersion ||
    input.candidateDocument.documentVersion !== transactionPlan.expectedDocumentVersion + 1
  ) {
    throw new Error("Correction evaluation transaction plan does not match the baseline and candidate versions.");
  }
  const reasons: EvaluationReason[] = [];
  const overallDelta = candidate.scores.overall - baseline.scores.overall;
  if (overallDelta < input.configuration.minimumImprovement) reasons.push("OVERALL_NOT_IMPROVED");
  if (candidate.scores.worstRegion < baseline.scores.worstRegion) reasons.push("WORST_REGION_REGRESSED");
  if (candidate.scores.typography < baseline.scores.typography) reasons.push("TYPOGRAPHY_REGRESSED");
  if (candidate.scores.layout < baseline.scores.layout) reasons.push("LAYOUT_REGRESSED");
  const confidenceBefore = validationConfidence(baseline);
  const confidenceAfter = validationConfidence(candidate);
  if (confidenceAfter < confidenceBefore) reasons.push("CONFIDENCE_REGRESSED");
  if (!validateDocument(input.candidateDocument).success) reasons.push("DOCUMENT_INVALID");
  const baselineCritical = baseline.differences.filter((entry) => entry.severity === "CRITICAL").length;
  const candidateCritical = candidate.differences.filter((entry) => entry.severity === "CRITICAL").length;
  if (candidateCritical > baselineCritical) reasons.push("CRITICAL_ISSUE_INTRODUCED");
  const baselineRegions = new Map(baseline.regions.map((entry) => [entry.regionId, entry]));
  const candidateRegions = new Map(candidate.regions.map((entry) => [entry.regionId, entry]));
  const regressedRegionIds: string[] = [];
  for (const regionId of input.configuration.protectedRegionIds) {
    if (
      stableStringify(comparableRegion(baselineRegions.get(regionId))) !==
      stableStringify(comparableRegion(candidateRegions.get(regionId)))
    ) {
      regressedRegionIds.push(regionId);
    }
  }
  if (regressedRegionIds.length > 0) reasons.push("PROTECTED_REGION_CHANGED");
  const accepted = reasons.length === 0;
  const finalReasons: EvaluationReason[] = accepted ? ["ACCEPTED"] : [...new Set(reasons)];
  const draft = {
    accepted,
    reasons: finalReasons,
    transactionPlanId: transactionPlan.id,
    candidateDocumentVersion: input.candidateDocument.documentVersion,
    candidateDocumentFingerprint: fingerprint(input.candidateDocument),
    baselineReportId: baseline.id,
    candidateReportId: candidate.id,
    overallBefore: baseline.scores.overall,
    overallAfter: candidate.scores.overall,
    overallDelta,
    worstRegionBefore: baseline.scores.worstRegion,
    worstRegionAfter: candidate.scores.worstRegion,
    layoutBefore: baseline.scores.layout,
    layoutAfter: candidate.scores.layout,
    typographyBefore: baseline.scores.typography,
    typographyAfter: candidate.scores.typography,
    confidenceBefore,
    confidenceAfter,
    protectedRegionIds: [...input.configuration.protectedRegionIds].sort(),
    regressedRegionIds: regressedRegionIds.sort(),
  };
  return deepFreeze(CorrectionEvaluationSchema.parse({ ...draft, fingerprint: fingerprint(draft) }));
}
