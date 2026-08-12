import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import {
  ApplyCinematicSequenceCommandSchema,
  CreateCameraCommandSchema,
  type ApplyCinematicSequenceCommand,
  type CreateCameraCommand,
} from "../schemas.js";

registerCommand<CreateCameraCommand>({
  type: "camera.create",
  schema: CreateCameraCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    if (source.cameras[command.payload.camera.id]) throw commandError("DUPLICATE_ID", "Camera already exists.");
    if (command.payload.sceneId) {
      const scene = source.nodes[command.payload.sceneId];
      if (scene?.type !== "SCENE_3D") throw commandError("REFERENCE_MISSING", "Camera scene does not exist.");
      if (scene.locked) throw commandError("LOCKED_ENTITY", `Scene ${scene.id} is locked.`);
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const camera = command.payload.camera;
    let nodes = source.nodes;
    const updated: string[] = [];
    if (command.payload.sceneId && command.payload.makeActive) {
      const scene = source.nodes[command.payload.sceneId];
      if (scene?.type !== "SCENE_3D") throw commandError("REFERENCE_MISSING", "Camera scene disappeared.");
      nodes = { ...nodes, [scene.id]: { ...scene, activeCameraId: camera.id } };
      updated.push(scene.id);
    }
    return {
      document: { ...source, nodes, cameras: { ...source.cameras, [camera.id]: camera } },
      changes: { added: [camera.id], updated },
      event: { type: "CameraCreated", entityIds: [camera.id, ...updated] },
    };
  },
});

registerCommand<ApplyCinematicSequenceCommand>({
  type: "cinematic.apply_sequence",
  schema: ApplyCinematicSequenceCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const scene = source.nodes[command.payload.sequence.sceneId];
    if (scene?.type !== "SCENE_3D") throw commandError("REFERENCE_MISSING", "Cinematic scene does not exist.");
    if (scene.locked) throw commandError("LOCKED_ENTITY", `Scene ${scene.id} is locked.`);
    const shotIds = new Set(command.payload.shots.map((entry) => entry.id));
    if (command.payload.sequence.shotIds.some((id) => !shotIds.has(id))) {
      throw commandError("REFERENCE_MISSING", "Sequence references a shot outside the atomic payload.");
    }
    const pathIds = new Set(command.payload.paths.map((entry) => entry.id));
    const timelineIds = new Set(command.payload.timelines.map((entry) => entry.id));
    for (const shot of command.payload.shots) {
      if (!source.cameras[shot.cameraId])
        throw commandError("REFERENCE_MISSING", `Camera ${shot.cameraId} does not exist.`);
      if (shot.cameraPathId && !pathIds.has(shot.cameraPathId) && !source.cameraPaths[shot.cameraPathId]) {
        throw commandError("REFERENCE_MISSING", `Camera path ${shot.cameraPathId} does not exist.`);
      }
      if (shot.timelineId && !timelineIds.has(shot.timelineId) && !source.timelines[shot.timelineId]) {
        throw commandError("REFERENCE_MISSING", `Timeline ${shot.timelineId} does not exist.`);
      }
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const cameraPaths = { ...source.cameraPaths };
    const cinematicShots = { ...source.cinematicShots };
    const timelines = { ...source.timelines };
    for (const path of command.payload.paths) cameraPaths[path.id] = path;
    for (const shot of command.payload.shots) cinematicShots[shot.id] = shot;
    for (const timeline of command.payload.timelines) timelines[timeline.id] = timeline;
    const affected = [
      command.payload.sequence.id,
      ...command.payload.sequence.shotIds,
      ...command.payload.paths.map((entry) => entry.id),
      ...command.payload.timelines.map((entry) => entry.id),
    ];
    return {
      document: {
        ...source,
        cameraPaths,
        cinematicShots,
        cinematicSequences: {
          ...source.cinematicSequences,
          [command.payload.sequence.id]: command.payload.sequence,
        },
        timelines,
      },
      changes: {
        added: affected.filter(
          (id) =>
            !source.cameraPaths[id] &&
            !source.cinematicShots[id] &&
            !source.cinematicSequences[id] &&
            !source.timelines[id],
        ),
        updated: affected.filter((id) =>
          Boolean(
            source.cameraPaths[id] ||
              source.cinematicShots[id] ||
              source.cinematicSequences[id] ||
              source.timelines[id],
          ),
        ),
      },
      event: { type: "CinematicSequenceApplied", entityIds: affected },
    };
  },
});
