import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import {
  ApplyLightingRigCommandSchema,
  RegisterLightingBakeCommandSchema,
  type ApplyLightingRigCommand,
  type RegisterLightingBakeCommand,
} from "../schemas.js";

registerCommand<ApplyLightingRigCommand>({
  type: "lighting.apply_rig",
  schema: ApplyLightingRigCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const scene = source.nodes[command.payload.sceneId];
    if (scene?.type !== "SCENE_3D") {
      throw commandError("REFERENCE_MISSING", `Scene ${command.payload.sceneId} does not exist.`);
    }
    if (scene.locked) throw commandError("LOCKED_ENTITY", `Scene ${scene.id} is locked.`);
    const lightIds = new Set(command.payload.lights.map((light) => light.id));
    const profileIds = new Set(command.payload.profiles.map((profile) => profile.id));
    const probeIds = new Set(command.payload.reflectionProbes.map((probe) => probe.id));
    if (command.payload.rig.lightIds.some((id) => !lightIds.has(id))) {
      throw commandError("REFERENCE_MISSING", "Lighting rig references a light outside the atomic payload.");
    }
    if (command.payload.rig.profileIds.some((id) => !profileIds.has(id))) {
      throw commandError("REFERENCE_MISSING", "Lighting rig references a profile outside the atomic payload.");
    }
    if (command.payload.rig.reflectionProbeIds.some((id) => !probeIds.has(id))) {
      throw commandError("REFERENCE_MISSING", "Lighting rig references a probe outside the atomic payload.");
    }
    if (command.payload.rig.environmentId !== command.payload.environment?.id) {
      throw commandError("REFERENCE_MISSING", "Lighting rig environment must be included in the atomic payload.");
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const scene = source.nodes[command.payload.sceneId];
    if (scene?.type !== "SCENE_3D") throw commandError("REFERENCE_MISSING", "Lighting scene disappeared.");
    const lights = { ...source.lights };
    for (const light of command.payload.lights) lights[light.id] = light;
    const lightingProfiles = { ...source.lightingProfiles };
    for (const profile of command.payload.profiles) lightingProfiles[profile.id] = profile;
    const reflectionProbes = { ...source.reflectionProbes };
    for (const probe of command.payload.reflectionProbes) reflectionProbes[probe.id] = probe;
    const environments = { ...source.environments };
    if (command.payload.environment) environments[command.payload.environment.id] = command.payload.environment;
    const updatedScene = {
      ...scene,
      lightIds: [...command.payload.rig.lightIds],
      lightingRigId: command.payload.rig.id,
      ...(command.payload.environment ? { environmentId: command.payload.environment.id } : {}),
    };
    const affected = [
      command.payload.sceneId,
      command.payload.rig.id,
      ...command.payload.rig.lightIds,
      ...command.payload.rig.profileIds,
      ...command.payload.rig.reflectionProbeIds,
      ...(command.payload.environment ? [command.payload.environment.id] : []),
    ];
    return {
      document: {
        ...source,
        nodes: { ...source.nodes, [scene.id]: updatedScene },
        lights,
        environments,
        lightingRigs: { ...source.lightingRigs, [command.payload.rig.id]: command.payload.rig },
        lightingProfiles,
        reflectionProbes,
      },
      changes: {
        added: affected
          .slice(1)
          .filter(
            (id) =>
              !source.lights[id] &&
              !source.lightingRigs[id] &&
              !source.lightingProfiles[id] &&
              !source.reflectionProbes[id] &&
              !source.environments[id],
          ),
        updated: [scene.id],
      },
      event: { type: "LightingRigApplied", entityIds: affected },
    };
  },
});

registerCommand<RegisterLightingBakeCommand>({
  type: "lighting.register_bake",
  schema: RegisterLightingBakeCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    if (source.assets[command.payload.asset.id] || source.lightingBakes[command.payload.bake.id]) {
      throw commandError("DUPLICATE_ID", "Lighting bake asset or record already exists.");
    }
    if (command.payload.bake.assetId !== command.payload.asset.id) {
      throw commandError("REFERENCE_MISSING", "Lighting bake must reference its atomic output asset.");
    }
    if (
      !source.lightingRigs[command.payload.bake.lightingRigId] ||
      !source.lightingProfiles[command.payload.bake.profileId]
    ) {
      throw commandError("REFERENCE_MISSING", "Lighting bake references a missing rig or profile.");
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    return {
      document: {
        ...source,
        assets: { ...source.assets, [command.payload.asset.id]: command.payload.asset },
        lightingBakes: { ...source.lightingBakes, [command.payload.bake.id]: command.payload.bake },
      },
      changes: { added: [command.payload.asset.id, command.payload.bake.id] },
      event: { type: "LightingBakeRegistered", entityIds: [command.payload.asset.id, command.payload.bake.id] },
    };
  },
});
