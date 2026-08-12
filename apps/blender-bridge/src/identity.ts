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
  // Locally constructed rigs do not have glTF node provenance. Their operation fingerprint is
  // exported as a Blender custom property and is the durable lookup key; visible names are never
  // used to identify a canonical rig.
  const rigs = Object.values(document.nodes)
    .filter((node) => node.type === "RIG_3D")
    .flatMap((node) => {
      const sourceFingerprint = node.metadata.customData["aevum.rig_fingerprint"];
      return typeof sourceFingerprint === "string"
        ? [{ kind: "OBJECT" as const, entityId: node.id, sourceName: node.name, sourceFingerprint }]
        : [];
    });
  const materials = Object.values(document.materials)
    .filter((value) => lineage.has(value.importProvenance?.sourceAssetId ?? ""))
    .map((value) => ({ kind: "MATERIAL" as const, entityId: value.id, sourceName: value.name }));
  const cameras = Object.values(document.cameras)
    .filter((value) => lineage.has(value.importProvenance?.sourceAssetId ?? ""))
    .map((value) => ({ kind: "CAMERA" as const, entityId: value.id, sourceName: value.name }));
  const lights = Object.values(document.lights)
    .filter((value) => lineage.has(value.importProvenance?.sourceAssetId ?? ""))
    .map((value) => ({ kind: "LIGHT" as const, entityId: value.id, sourceName: value.name }));
  return [...objects, ...rigs, ...materials, ...cameras, ...lights].sort((left, right) =>
    `${left.kind}:${left.entityId}`.localeCompare(`${right.kind}:${right.entityId}`),
  );
}
