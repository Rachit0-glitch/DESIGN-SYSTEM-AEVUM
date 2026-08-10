import {
  createDeterministicMockProvider,
  diagnostic as multiviewDiagnostic,
  type MultiViewReconstructionProposal,
  type MultiViewReferenceSet,
  type ProviderCandidate,
} from "@aevum/multiview-reconstruction";
import { runReconstructionSession, type RunReconstructionSessionResult } from "./session.js";
import { ProviderRegistryEntrySchema, type ProviderRegistryEntry, type ReconstructionConfigInput } from "./schemas.js";

export const LOCAL_BASELINE_PROVIDER_VERSION = "1.0.0";

export interface GeometryReconstructionInput {
  readonly proposal: MultiViewReconstructionProposal;
  readonly referenceSet: MultiViewReferenceSet;
  readonly config?: Partial<ReconstructionConfigInput>;
  readonly createdAt: string;
}

export interface GeometryReconstructionOutput extends RunReconstructionSessionResult {
  readonly candidate: ProviderCandidate;
}

/**
 * Phase 17 defined `MultiViewReconstructionProvider.reconstruct(proposal)` as a *synchronous*
 * interface, which was correct for its own deterministic test double but cannot support a real
 * provider: real geometry generation here needs the full `MultiViewReferenceSet` (the proposal
 * only carries ID references, not the evidence itself) and produces a GLB via an inherently async
 * serialization step. This extends the contract — full evidence input, async output — rather than
 * silently breaking it; Phase 17's original interface and its deterministic mock provider are
 * untouched and still work exactly as before (see `createDeterministicTestProvider` below).
 */
export interface GeometryReconstructionProvider {
  readonly id: "LOCAL_BASELINE" | "DETERMINISTIC_TEST";
  readonly version: string;
  reconstruct(input: GeometryReconstructionInput): Promise<GeometryReconstructionOutput>;
}

/**
 * The first real local reconstruction provider: fits box/cylinder primitives and/or carves a
 * voxel visual hull from Phase 17 evidence, scores every candidate against real silhouette/
 * landmark/constraint metrics, and runs a bounded, non-regressing correction loop. It works best
 * for product-like, bounded-geometry objects with strong silhouette/landmark evidence — organic,
 * highly occluded, or transparent subjects remain future work (see the package README).
 */
export function createLocalBaselineProvider(): GeometryReconstructionProvider {
  return {
    id: "LOCAL_BASELINE",
    version: LOCAL_BASELINE_PROVIDER_VERSION,
    async reconstruct(input: GeometryReconstructionInput): Promise<GeometryReconstructionOutput> {
      const result = await runReconstructionSession({
        referenceSet: input.referenceSet,
        proposal: input.proposal,
        providerId: "LOCAL_BASELINE",
        providerVersion: LOCAL_BASELINE_PROVIDER_VERSION,
        createdAt: input.createdAt,
        ...(input.config ? { config: input.config } : {}),
      });

      const candidate: ProviderCandidate = {
        id: `provider-candidate:${input.proposal.id}`,
        providerId: "LOCAL_BASELINE",
        providerVersion: LOCAL_BASELINE_PROVIDER_VERSION,
        confidence: result.report.finalScore?.overall ?? 0,
        ...(result.report.canonicalAssetId ? { candidateAssetId: result.report.canonicalAssetId } : {}),
        cameraAssumptions: { turntable: true },
        scaleAssumptions: { scaleRelative: input.referenceSet.scaleEvidence.length === 0 },
        partMapping: { partIds: [...input.proposal.partIds] },
        diagnostics:
          result.report.status === "BLOCKED"
            ? [
                multiviewDiagnostic({
                  code: "RECONSTRUCTION_NOT_READY",
                  severity: "ERROR",
                  message:
                    "The local baseline reconstruction provider could not generate a candidate from the available evidence.",
                  stage: "PROVIDER_RECONSTRUCTION",
                  recoverable: true,
                  relatedIds: [input.proposal.id],
                }),
              ]
            : [],
        generationProvenance: {
          source: "RECONSTRUCTION_PROVIDER",
          provider: "LOCAL_BASELINE",
          providerVersion: LOCAL_BASELINE_PROVIDER_VERSION,
          confidence: result.report.finalScore?.overall ?? 0,
        },
      };

      return { ...result, candidate };
    },
  };
}

/** Re-exposes Phase 17's own deterministic mock provider under the `DETERMINISTIC_TEST` registry
 * entry — proves interface-compatibility without duplicating that provider's logic. */
export function createDeterministicTestProvider() {
  return createDeterministicMockProvider();
}

const SHARED_RESOURCE_LIMITS = {
  maxVoxelResolution: 64,
  maxTriangles: 200_000,
  maxCandidates: 8,
  maxPasses: 20,
  maxExecutionMs: 60_000,
} as const;

/** The bounded set of reconstruction providers AEVUM currently integrates. No external/paid
 * provider (Tripo, Meshy, Rodin, Luma, Replicate, fal, or any photogrammetry service) is listed —
 * none is integrated, and none should be added without an explicit later phase. */
export function listReconstructionProviders(): readonly ProviderRegistryEntry[] {
  return [
    ProviderRegistryEntrySchema.parse({
      id: "LOCAL_BASELINE",
      version: LOCAL_BASELINE_PROVIDER_VERSION,
      capabilities: ["BOX_PRIMITIVE", "CYLINDER_PRIMITIVE", "VOXEL_HULL"],
      supportedEvidenceTypes: [
        "CAMERA_ESTIMATE",
        "LANDMARK",
        "SILHOUETTE",
        "SCALE_EVIDENCE",
        "GEOMETRIC_CONSTRAINT",
        "PART_EVIDENCE",
      ],
      qualityModes: ["DRAFT", "STANDARD", "HIGH"],
      resourceLimits: SHARED_RESOURCE_LIMITS,
    }),
    ProviderRegistryEntrySchema.parse({
      id: "DETERMINISTIC_TEST",
      version: "1.0.0",
      capabilities: [],
      supportedEvidenceTypes: [],
      qualityModes: ["DRAFT", "STANDARD", "HIGH"],
      resourceLimits: SHARED_RESOURCE_LIMITS,
    }),
  ];
}
