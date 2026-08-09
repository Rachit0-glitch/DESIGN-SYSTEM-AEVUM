import { diagnostic } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import { ProviderCandidateSchema, type MultiViewReconstructionProposal, type ProviderCandidate } from "./schemas.js";

export interface MultiViewReconstructionProvider {
  readonly id: string;
  readonly version: string;
  reconstruct(proposal: MultiViewReconstructionProposal): ProviderCandidate;
}

/**
 * A replaceable seam, not a real reconstruction system. Real providers (local photogrammetry,
 * an external image-to-3D API, a specialized product-reconstruction service, or a human-assisted
 * workflow) implement this exact interface later without changing any Phase 17 evidence
 * architecture. Phase 17 ships only this deterministic test double, which never produces real
 * geometry and is explicitly labeled as a fixture in its own diagnostics so nobody downstream can
 * mistake it for an AI-generated model.
 */
export function createDeterministicMockProvider(): MultiViewReconstructionProvider {
  return Object.freeze({
    id: "deterministic-test-provider",
    version: "1.0.0",
    reconstruct(proposal: MultiViewReconstructionProposal): ProviderCandidate {
      return deepFreeze(
        ProviderCandidateSchema.parse({
          id: `provider-candidate:${proposal.id}`,
          providerId: "deterministic-test-provider",
          providerVersion: "1.0.0",
          confidence: proposal.readiness.score,
          cameraAssumptions: { turntable: true, radius: 1 },
          scaleAssumptions: { scaleRelative: proposal.scaleEvidenceIds.length === 0 },
          partMapping: { partIds: proposal.partIds },
          diagnostics: [
            diagnostic({
              code: "RECONSTRUCTION_NOT_READY",
              severity: "INFO",
              message:
                "This candidate was produced by the deterministic Phase 17 test provider. It is an interface-compatibility fixture, not a real AI-generated reconstruction, and carries no candidate geometry asset.",
              stage: "PROVIDER_RECONSTRUCTION",
              recoverable: true,
              relatedIds: [proposal.id],
            }),
          ],
          generationProvenance: {
            source: "RECONSTRUCTION_PROVIDER",
            provider: "deterministic-test-provider",
            providerVersion: "1.0.0",
            confidence: proposal.readiness.score,
          },
        }),
      );
    },
  });
}
