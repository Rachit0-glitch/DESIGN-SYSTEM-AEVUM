import { registerAsset, type AssetRegistrationResult, type AssetRegistry } from "@aevum/assets";
import type { MultiViewReferenceSet } from "@aevum/multiview-reconstruction";

export interface RegisterCandidateAssetInput {
  readonly registry: AssetRegistry;
  readonly referenceSet: MultiViewReferenceSet;
  readonly bytes: Uint8Array;
  readonly candidateId: string;
  readonly generationMethod: string;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly timestamp: string;
}

/**
 * Registers a generated candidate GLB as a canonical asset with `GENERATED` origin and full
 * provenance back to every source image asset it was reconstructed from (not a single-parent
 * derivative, since the geometry synthesizes evidence from multiple views).
 */
export function registerCandidateAsset(input: RegisterCandidateAssetInput): AssetRegistrationResult {
  return registerAsset(input.registry, {
    bytes: input.bytes,
    kind: "GLB",
    originalFilename: `${input.candidateId}.glb`,
    displayName: `Reconstructed candidate (${input.generationMethod})`,
    mimeType: "model/gltf-binary",
    sourceUri: `generated://geometry-reconstruction/${input.candidateId}`,
    createdAt: input.timestamp,
    registeredAt: input.timestamp,
    status: "REGISTERED",
    provenance: {
      origin: { kind: "GENERATED", uri: `generated://geometry-reconstruction/${input.candidateId}` },
      importer: { id: "geometry-reconstruction", type: "SYSTEM" },
      creator: { id: "geometry-reconstruction", type: "SYSTEM" },
      parentAssetIds: [...input.referenceSet.assetIds],
      processingChain: [
        {
          operation: "MULTIVIEW_GEOMETRY_RECONSTRUCTION",
          createdAt: input.timestamp,
          actor: { id: "geometry-reconstruction", type: "SYSTEM" },
          tool: input.providerId,
          toolVersion: input.providerVersion,
          inputAssetIds: [...input.referenceSet.assetIds],
          parameters: {
            referenceSetId: input.referenceSet.id,
            generationMethod: input.generationMethod,
          },
        },
      ],
    },
    details: { kind: "GLB", meshes: 1, materials: 1, textures: 0, animations: 0 },
    security: {
      status: "PASSED",
      inspectedAt: input.timestamp,
      inspector: "geometry-reconstruction",
      issues: [],
    },
  });
}
