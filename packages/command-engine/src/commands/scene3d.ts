import { assertValidDocument, type CanonicalDesignDocument } from "@aevum/document-model";
import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import { ImportScene3DCommandSchema, type ImportScene3DCommand } from "../schemas.js";

function recordById<T extends { readonly id: string }>(values: readonly T[]): Record<string, T> {
  return Object.fromEntries(values.map((value) => [value.id, value]));
}

function importedDocument(source: CanonicalDesignDocument, command: ImportScene3DCommand): CanonicalDesignDocument {
  const payload = command.payload;
  return {
    ...source,
    rootNodeIds: [...source.rootNodeIds, ...payload.rootNodeIds],
    nodes: { ...source.nodes, ...recordById(payload.nodes) },
    assets: { ...source.assets, ...recordById(payload.assets) },
    materials: { ...source.materials, ...recordById(payload.materials) },
    cameras: { ...source.cameras, ...recordById(payload.cameras) },
    lights: { ...source.lights, ...recordById(payload.lights) },
  };
}

function duplicateIds(source: CanonicalDesignDocument, command: ImportScene3DCommand): string[] {
  const payload = command.payload;
  return [
    ...payload.nodes.filter((value) => source.nodes[value.id]).map((value) => value.id),
    ...payload.assets.filter((value) => source.assets[value.id]).map((value) => value.id),
    ...payload.materials.filter((value) => source.materials[value.id]).map((value) => value.id),
    ...payload.cameras.filter((value) => source.cameras[value.id]).map((value) => value.id),
    ...payload.lights.filter((value) => source.lights[value.id]).map((value) => value.id),
  ].sort();
}

registerCommand<ImportScene3DCommand>({
  type: "scene3d.import",
  schema: ImportScene3DCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const asset = source.assets[command.payload.sourceAssetId];
    if (!asset || !["GLB", "GLTF"].includes(asset.type)) {
      throw commandError("COMMAND_VALIDATION_ERROR", "3D import requires a registered GLB or GLTF source asset.");
    }
    const duplicates = duplicateIds(source, command);
    if (duplicates.length > 0) {
      throw commandError("DUPLICATE_ID", "3D import would overwrite canonical entities.", { duplicates });
    }
    try {
      assertValidDocument(importedDocument(source, command));
    } catch (error) {
      throw commandError("COMMAND_VALIDATION_ERROR", "The 3D import proposal does not form a valid document.", {
        reason: error instanceof Error ? error.message : "Unknown validation failure",
      });
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const next = importedDocument(source, command);
    const entityIds = [
      ...command.payload.rootNodeIds,
      ...command.payload.nodes.map((value) => value.id),
      ...command.payload.assets.map((value) => value.id),
      ...command.payload.materials.map((value) => value.id),
      ...command.payload.cameras.map((value) => value.id),
      ...command.payload.lights.map((value) => value.id),
    ];
    return {
      document: next,
      changes: { added: [...new Set(entityIds)].sort() },
      event: {
        type: "Scene3DImported",
        entityIds: command.payload.rootNodeIds,
        data: { sourceAssetId: command.payload.sourceAssetId },
      },
    };
  },
});
