import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { BlenderIdentityBindingSchema } from "./protocol.js";
import type { z } from "zod";

export type BlenderIdentityBinding = z.infer<typeof BlenderIdentityBindingSchema>;

function sourceLineage(document: CanonicalDesignDocument, sourceAssetId: string): ReadonlySet<string> {
  const ids = new Set<string>();
  let current: string | undefined = sourceAssetId;
  while (current && !ids.has(current)) {
    ids.add(current);
    current = document.assets[current]?.source.originalAssetId;
  }
  return ids;
}

export function createBlenderIdentityBindings(
  document: CanonicalDesignDocument,
  sourceAssetId: string,
): readonly BlenderIdentityBinding[] {
  const lineage = sourceLineage(document, sourceAssetId);
  const objects = Object.values(document.nodes)
    .filter(
      (node) =>
        node.type === "GROUP_3D" &&
        lineage.has(node.importProvenance?.sourceAssetId ?? "") &&
        node.importProvenance?.sourceNodeIndex !== undefined,
    )
    .map((node) => ({ kind: "OBJECT" as const, entityId: node.id, sourceName: node.name }));
  const materials = Object.values(document.materials)
    .filter((value) => lineage.has(value.importProvenance?.sourceAssetId ?? ""))
    .map((value) => ({ kind: "MATERIAL" as const, entityId: value.id, sourceName: value.name }));
  const cameras = Object.values(document.cameras)
    .filter((value) => lineage.has(value.importProvenance?.sourceAssetId ?? ""))
    .map((value) => ({ kind: "CAMERA" as const, entityId: value.id, sourceName: value.name }));
  const lights = Object.values(document.lights)
    .filter((value) => lineage.has(value.importProvenance?.sourceAssetId ?? ""))
    .map((value) => ({ kind: "LIGHT" as const, entityId: value.id, sourceName: value.name }));
  return [...objects, ...materials, ...cameras, ...lights].sort((left, right) =>
    `${left.kind}:${left.entityId}`.localeCompare(`${right.kind}:${right.entityId}`),
  );
}
