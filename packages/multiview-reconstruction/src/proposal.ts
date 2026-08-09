import { deterministicScopedId, fingerprint } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import {
  MULTIVIEW_PROPOSAL_VERSION,
  MultiViewReconstructionProposalSchema,
  type MultiViewReconstructionProposal,
  type MultiViewReferenceSet,
  type ReadinessAssessment,
  type TargetQualitySchema,
} from "./schemas.js";
import type { z } from "zod";

export interface CreateReconstructionProposalInput {
  readonly referenceSet: MultiViewReferenceSet;
  readonly readiness: ReadinessAssessment;
  readonly targetQuality?: z.infer<typeof TargetQualitySchema>;
}

/**
 * Builds the provider-neutral contract describing what a future 3D reconstruction provider
 * should attempt: the evidence to use, the readiness classification, unresolved ambiguities, and
 * which evidence is protected (user-supplied) and must not be silently overwritten.
 */
export function createReconstructionProposal(
  input: CreateReconstructionProposalInput,
): MultiViewReconstructionProposal {
  const { referenceSet, readiness } = input;

  const protectedEvidenceIds = [
    ...referenceSet.views.filter((view) => view.role.method === "USER_PROVIDED").map((view) => view.id),
    ...referenceSet.landmarks
      .filter((landmark) => landmark.provenance.source === "USER")
      .map((landmark) => landmark.id),
    ...referenceSet.scaleEvidence
      .filter((evidence) => evidence.source === "USER_PROVIDED")
      .map((evidence) => evidence.id),
  ];

  const ambiguities = referenceSet.diagnostics.filter((entry) => entry.severity !== "INFO");

  const base = {
    taskId: referenceSet.taskId,
    referenceSetId: referenceSet.id,
    viewIds: referenceSet.views.map((view) => view.id),
    landmarkIds: referenceSet.landmarks.map((landmark) => landmark.id),
    partIds: referenceSet.parts.map((part) => part.id),
    constraintIds: referenceSet.constraints.map((constraint) => constraint.id),
    scaleEvidenceIds: referenceSet.scaleEvidence.map((evidence) => evidence.id),
    targetQuality: input.targetQuality ?? "HIGH_QUALITY",
    protectedEvidenceIds,
  };

  return deepFreeze(
    MultiViewReconstructionProposalSchema.parse({
      id: deterministicScopedId("multiview-proposal", base),
      proposalVersion: MULTIVIEW_PROPOSAL_VERSION,
      ...base,
      ambiguities,
      readiness,
      proposalFingerprint: fingerprint(base),
    }),
  );
}
