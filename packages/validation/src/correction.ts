import type { CanonicalDesignDocument, DesignNode } from "@aevum/document-model";
import { deepFreeze } from "./immutable.js";
import {
  CORRECTION_PLAN_VERSION,
  ValidationCorrectionPlanSchema,
  type ValidationCorrectionPlan,
  type ValidationDifference,
  type ValidationTask,
} from "./schemas.js";
import { deterministicId, fingerprint } from "./stable.js";

function changesFor(difference: ValidationDifference, node: DesignNode): Record<string, unknown> | undefined {
  if (difference.correctionKind === "ADJUST_POSITION" || difference.correctionKind === "ADJUST_OPACITY")
    return { transform: node.transform };
  if (difference.correctionKind === "ADJUST_SIZE") return node.dimensions ? { dimensions: node.dimensions } : undefined;
  if (difference.correctionKind === "ADJUST_VISIBILITY") return { visible: node.visible };
  if (difference.correctionKind === "ADJUST_TYPOGRAPHY" && node.type === "TEXT")
    return { content: node.content, runs: node.runs, paragraphStyle: node.paragraphStyle };
  if (difference.correctionKind === "REPLACE_ASSET" && (node.type === "IMAGE" || node.type === "VIDEO"))
    return { assetId: node.assetId, ...(node.crop ? { crop: node.crop } : {}) };
  return undefined;
}

export function generateCorrectionPlan(
  task: ValidationTask,
  document: CanonicalDesignDocument,
  expectedNodes: ReadonlyMap<string, DesignNode>,
  differences: readonly ValidationDifference[],
): ValidationCorrectionPlan {
  const suggestions = differences
    .flatMap((entry) => {
      const expected = expectedNodes.get(entry.sourceNodeId);
      if (!expected || document.nodes[entry.sourceNodeId]?.locked) return [];
      const changes = changesFor(entry, expected);
      if (!changes) return [];
      const draft = {
        differenceId: entry.id,
        sourceNodeId: entry.sourceNodeId,
        commandType: "node.update" as const,
        payload: { nodeId: entry.sourceNodeId, changes },
        property: entry.property,
        expectedImpact: Math.min(1, 1 - entry.score),
        confidence: entry.confidence,
        rationale: `Proposed from attributed validation difference ${entry.id}; execution requires Command Engine review.`,
        requiresReview: true,
      };
      return [{ ...draft, id: deterministicId("correction", draft) }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const draft = {
    planVersion: CORRECTION_PLAN_VERSION,
    validationTaskId: task.id,
    documentId: task.documentId,
    expectedDocumentVersion: task.documentVersion,
    executable: false as const,
    requiresCommandEngine: true as const,
    suggestions,
  };
  const planFingerprint = fingerprint(draft);
  return deepFreeze(
    ValidationCorrectionPlanSchema.parse({
      ...draft,
      id: deterministicId("correction-plan", { taskId: task.id, planFingerprint }),
      fingerprint: planFingerprint,
    }),
  );
}
