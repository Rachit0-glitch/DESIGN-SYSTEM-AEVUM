import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import {
  UpdateCameraCommandSchema,
  UpdateLightCommandSchema,
  UpdateMaterialCommandSchema,
  type UpdateCameraCommand,
  type UpdateLightCommand,
  type UpdateMaterialCommand,
} from "../schemas.js";

registerCommand<UpdateMaterialCommand>({
  type: "material.update",
  schema: UpdateMaterialCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    if (!source.materials[command.payload.material.id]) {
      throw commandError("REFERENCE_MISSING", `Material ${command.payload.material.id} does not exist.`);
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const material = command.payload.material;
    return {
      document: { ...source, materials: { ...source.materials, [material.id]: material } },
      changes: { updated: [material.id] },
      event: { type: "MaterialUpdated", entityIds: [material.id] },
    };
  },
});

registerCommand<UpdateCameraCommand>({
  type: "camera.update",
  schema: UpdateCameraCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    if (!source.cameras[command.payload.camera.id]) {
      throw commandError("REFERENCE_MISSING", `Camera ${command.payload.camera.id} does not exist.`);
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const camera = command.payload.camera;
    return {
      document: { ...source, cameras: { ...source.cameras, [camera.id]: camera } },
      changes: { updated: [camera.id] },
      event: { type: "CameraUpdated", entityIds: [camera.id] },
    };
  },
});

registerCommand<UpdateLightCommand>({
  type: "light.update",
  schema: UpdateLightCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    if (!source.lights[command.payload.light.id]) {
      throw commandError("REFERENCE_MISSING", `Light ${command.payload.light.id} does not exist.`);
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const light = command.payload.light;
    return {
      document: { ...source, lights: { ...source.lights, [light.id]: light } },
      changes: { updated: [light.id] },
      event: { type: "LightUpdated", entityIds: [light.id] },
    };
  },
});
