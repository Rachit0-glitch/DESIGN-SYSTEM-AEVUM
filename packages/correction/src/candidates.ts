import type { CanonicalDesignDocument, DesignNode } from "@aevum/document-model";
import { ValidationReportSchema, type ValidationDifference, type ValidationReport } from "@aevum/validation";
import { deepFreeze } from "./immutable.js";
import {
  CORRECTION_CANDIDATE_VERSION,
  CandidateGenerationResultSchema,
  CorrectionSessionSchema,
  type CandidateRejectionReason,
  type CandidateGenerationResult,
  type CorrectionCandidate,
  type CorrectionProperty,
  type CorrectionSession,
  type RejectedCorrectionCandidate,
} from "./schemas.js";
import { deterministicId, fingerprint, stableStringify } from "./stable.js";

function propertyFor(difference: ValidationDifference): CorrectionProperty {
  const property = difference.property.toLowerCase();
  if (difference.correctionKind === "REPAIR_HIERARCHY" || property.includes("parent")) return "HIERARCHY";
  if (property === "bounds.x" || property === "bounds.y") return "POSITION";
  if (property === "bounds.width" || property === "bounds.height") return "SIZE";
  if (property.includes("spacing")) return "SPACING";
  if (property.startsWith("text.")) return "TYPOGRAPHY";
  if (property.includes("color") || property.includes("fill")) return "COLOR";
  if (property.includes("border") || property.includes("stroke")) return "BORDER";
  if (property.includes("radius")) return "RADIUS";
  if (property.includes("shadow")) return "SHADOW";
  if (property.includes("gradient")) return "GRADIENT";
  if (property.startsWith("asset.")) return "ASSET_PLACEMENT";
  if (property === "visible") return "VISIBILITY";
  if (property.includes("opacity")) return "OPACITY";
  return "NODE";
}

function visualMetadataChange(node: DesignNode, difference: ValidationDifference): Record<string, unknown> {
  const reconstruction = node.metadata.customData["aevum.reconstruction"];
  const reconstructionData =
    reconstruction && typeof reconstruction === "object" && !Array.isArray(reconstruction)
      ? (reconstruction as Record<string, unknown>)
      : {};
  const styles = reconstructionData.styleCandidates;
  const styleCandidates =
    styles && typeof styles === "object" && !Array.isArray(styles) ? (styles as Record<string, unknown>) : {};
  const key = difference.property.replace(/^visual\./, "");
  return {
    metadata: {
      ...node.metadata,
      customData: {
        ...node.metadata.customData,
        "aevum.reconstruction": {
          ...reconstructionData,
          styleCandidates: { ...styleCandidates, [key]: difference.expectedValue },
        },
      },
    },
  };
}

function fallbackChanges(
  node: DesignNode,
  difference: ValidationDifference,
  property: CorrectionProperty,
): Record<string, unknown> | undefined {
  if (property === "POSITION") {
    const axis = difference.property.endsWith(".x") ? "x" : "y";
    if (typeof difference.expectedValue !== "number") return undefined;
    return {
      transform: { ...node.transform, position: { ...node.transform.position, [axis]: difference.expectedValue } },
    };
  }
  if (property === "SIZE" && node.dimensions && typeof difference.expectedValue === "number") {
    const axis = difference.property.endsWith(".width") ? "width" : "height";
    return {
      dimensions: { ...node.dimensions, [axis]: { ...node.dimensions[axis], value: difference.expectedValue } },
    };
  }
  if (property === "VISIBILITY" && typeof difference.expectedValue === "boolean") {
    return { visible: difference.expectedValue };
  }
  if (property === "OPACITY" && typeof difference.expectedValue === "number") {
    return { transform: { ...node.transform, opacity: difference.expectedValue } };
  }
  if (["COLOR", "BORDER", "RADIUS", "SHADOW", "GRADIENT"].includes(property)) {
    return visualMetadataChange(node, difference);
  }
  return undefined;
}

function sanitizeSuggestionChanges(
  changes: Readonly<Record<string, unknown>>,
  property: CorrectionProperty,
): Record<string, unknown> {
  const sanitized = { ...changes };
  if (property === "TYPOGRAPHY" || property === "SPACING") delete sanitized.content;
  return sanitized;
}

function rejection(
  session: CorrectionSession,
  passNumber: number,
  difference: ValidationDifference,
  property: CorrectionProperty,
  reason: CandidateRejectionReason,
  message: string,
): RejectedCorrectionCandidate {
  const draft = {
    sessionId: session.id,
    passNumber,
    sourceDifferenceId: difference.id,
    nodeId: difference.sourceNodeId,
    property,
    reason,
    message,
  };
  return { ...draft, id: deterministicId("correction-rejection", draft) };
}

function protectionReason(
  session: CorrectionSession,
  node: DesignNode,
  property: CorrectionProperty,
): CandidateRejectionReason | undefined {
  if (node.locked) return "LOCKED_NODE";
  if (property === "HIERARCHY") return "PROTECTED_HIERARCHY";
  const protectedRule = session.configuration.protectedProperties.find(
    (rule) => (!rule.nodeId || rule.nodeId === node.id) && (rule.property === "NODE" || rule.property === property),
  );
  return protectedRule ? "PROTECTED_PROPERTY" : undefined;
}

function severityWeight(severity: ValidationDifference["severity"]): number {
  return severity === "CRITICAL" ? 4 : severity === "ERROR" ? 3 : severity === "WARNING" ? 2 : 1;
}

export interface GenerateCorrectionCandidatesInput {
  readonly session: CorrectionSession;
  readonly passNumber: number;
  readonly report: ValidationReport;
  readonly document: CanonicalDesignDocument;
}

export function generateCorrectionCandidates(input: GenerateCorrectionCandidatesInput): CandidateGenerationResult {
  const session = CorrectionSessionSchema.parse(input.session);
  const report = ValidationReportSchema.parse(input.report);
  if (report.documentId !== input.document.metadata.id || report.documentVersion !== input.document.documentVersion) {
    throw new Error("Validation report does not match the candidate-generation document.");
  }
  if (input.passNumber < 1 || input.passNumber > session.configuration.maxPasses) {
    throw new Error("Correction pass number is outside the configured bounds.");
  }
  const suggestionByDifference = new Map(report.correctionPlan.suggestions.map((entry) => [entry.differenceId, entry]));
  const candidates: CorrectionCandidate[] = [];
  const rejected: RejectedCorrectionCandidate[] = [];
  for (const difference of [...report.differences].sort((left, right) => left.id.localeCompare(right.id))) {
    const property = propertyFor(difference);
    const node = input.document.nodes[difference.sourceNodeId];
    if (!node) {
      rejected.push(
        rejection(session, input.passNumber, difference, property, "MISSING_NODE", "Source node is missing."),
      );
      continue;
    }
    if (difference.property === "text.content") {
      rejected.push(
        rejection(
          session,
          input.passNumber,
          difference,
          property,
          "CONTENT_CHANGE_FORBIDDEN",
          "Correction cannot invent or replace text content.",
        ),
      );
      continue;
    }
    const protectedReason = protectionReason(session, node, property);
    if (protectedReason) {
      rejected.push(
        rejection(
          session,
          input.passNumber,
          difference,
          property,
          protectedReason,
          `Property ${property} is protected.`,
        ),
      );
      continue;
    }
    if (difference.confidence < session.configuration.minimumConfidence) {
      rejected.push(
        rejection(
          session,
          input.passNumber,
          difference,
          property,
          "LOW_CONFIDENCE",
          "Difference confidence is below the session minimum.",
        ),
      );
      continue;
    }
    const suggestion = suggestionByDifference.get(difference.id);
    const changes = suggestion
      ? sanitizeSuggestionChanges(suggestion.payload.changes, property)
      : fallbackChanges(node, difference, property);
    if (!changes || Object.keys(changes).length === 0 || property === "NODE") {
      rejected.push(
        rejection(
          session,
          input.passNumber,
          difference,
          property,
          "UNSUPPORTED_DIFFERENCE",
          "No safe canonical correction is available for this difference.",
        ),
      );
      continue;
    }
    const draft = {
      candidateVersion: CORRECTION_CANDIDATE_VERSION,
      sessionId: session.id,
      passNumber: input.passNumber,
      ...(suggestion ? { sourceSuggestionId: suggestion.id } : {}),
      sourceDifferenceId: difference.id,
      nodeId: node.id,
      property,
      commandType: "node.update" as const,
      changes,
      expectedImpact: suggestion?.expectedImpact ?? Math.min(1, 1 - difference.score),
      confidence: difference.confidence,
      priority: severityWeight(difference.severity) * difference.confidence * Math.max(0.001, 1 - difference.score),
    };
    const candidateFingerprint = fingerprint(draft);
    candidates.push({
      ...draft,
      id: deterministicId("correction-candidate", { candidateFingerprint }),
      fingerprint: candidateFingerprint,
    });
  }
  candidates.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  rejected.sort((left, right) => left.id.localeCompare(right.id));
  const resultFingerprint = fingerprint({
    candidates: candidates.map((entry) => entry.fingerprint),
    rejected: rejected.map((entry) => stableStringify(entry)),
  });
  return deepFreeze(CandidateGenerationResultSchema.parse({ candidates, rejected, fingerprint: resultFingerprint }));
}
