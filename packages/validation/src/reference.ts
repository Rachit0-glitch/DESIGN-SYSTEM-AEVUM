import type { DesignNode } from "@aevum/document-model";
import { deepFreeze } from "./immutable.js";
import {
  VALIDATION_REFERENCE_VERSION,
  ValidationReferenceSnapshotSchema,
  type RasterDescriptor,
  type ValidationReferenceRegion,
  type ValidationReferenceSnapshot,
} from "./schemas.js";
import { deterministicId, fingerprint } from "./stable.js";

export interface CreateValidationReferenceSnapshotInput {
  readonly referenceId: string;
  readonly sourceAssetId: string;
  readonly sourceDimensions: Readonly<{ width: number; height: number }>;
  readonly regions: readonly ValidationReferenceRegion[];
  readonly expectedComponentIds?: readonly string[];
  readonly expectedTokenIds?: readonly string[];
  readonly expectedPaintOrderNodeIds?: readonly string[];
  readonly raster?: RasterDescriptor;
}

export function createValidationReferenceSnapshot(
  input: CreateValidationReferenceSnapshotInput,
): ValidationReferenceSnapshot {
  const nodeIds = new Set<string>();
  const regionIds = new Set<string>();
  for (const region of input.regions) {
    if (nodeIds.has(region.sourceNodeId)) throw new Error(`Duplicate validation source node ${region.sourceNodeId}.`);
    if (regionIds.has(region.id)) throw new Error(`Duplicate validation region ${region.id}.`);
    if (region.expectedNode.id !== region.sourceNodeId)
      throw new Error(`Region ${region.id} source node must match expected node ID.`);
    nodeIds.add(region.sourceNodeId);
    regionIds.add(region.id);
  }
  for (const region of input.regions) {
    if (region.parentRegionId && !regionIds.has(region.parentRegionId))
      throw new Error(`Region ${region.id} has missing parent region ${region.parentRegionId}.`);
  }
  const draft = {
    referenceVersion: VALIDATION_REFERENCE_VERSION,
    referenceId: input.referenceId,
    sourceAssetId: input.sourceAssetId,
    sourceDimensions: input.sourceDimensions,
    regions: input.regions,
    expectedComponentIds: [...(input.expectedComponentIds ?? [])].sort(),
    expectedTokenIds: [...(input.expectedTokenIds ?? [])].sort(),
    expectedPaintOrderNodeIds: input.expectedPaintOrderNodeIds ?? input.regions.map((region) => region.sourceNodeId),
    ...(input.raster ? { raster: input.raster } : {}),
  };
  const snapshotFingerprint = fingerprint(draft);
  return deepFreeze(
    ValidationReferenceSnapshotSchema.parse({
      ...draft,
      id: deterministicId("validation-reference", { snapshotFingerprint }),
      snapshotFingerprint,
    }),
  );
}

export function expectedNodeMap(reference: ValidationReferenceSnapshot): ReadonlyMap<string, DesignNode> {
  return new Map(reference.regions.map((region) => [region.sourceNodeId, region.expectedNode]));
}
