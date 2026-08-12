import type { CanonicalDesignDocument, LightRecord, LightingProfileRecord } from "@aevum/document-model";
import {
  DEFAULT_LIGHTING_LIMITS,
  ResolvedLightingSchema,
  type LightingDiagnostic,
  type LightingResourceLimits,
  type ResolvedLighting,
} from "./schemas.js";
import { deepFreeze, lightingFingerprint } from "./stable.js";

function rolePriority(light: LightRecord): number {
  const role = light.metadata.role;
  return role === "KEY" ? 0 : role === "FILL" ? 1 : role === "RIM" ? 2 : 3;
}

export function resolveLighting(
  document: CanonicalDesignDocument,
  sceneId: string,
  target: LightingProfileRecord["target"],
  limits: LightingResourceLimits = DEFAULT_LIGHTING_LIMITS,
): ResolvedLighting {
  const scene = document.nodes[sceneId];
  if (scene?.type !== "SCENE_3D") throw new Error(`Scene ${sceneId} is not a canonical 3D scene.`);
  const rig = scene.lightingRigId ? document.lightingRigs[scene.lightingRigId] : undefined;
  if (!rig) throw new Error(`Scene ${sceneId} has no canonical lighting rig.`);
  const diagnostics: LightingDiagnostic[] = [];
  const profiles = rig.profileIds.flatMap((id) =>
    document.lightingProfiles[id] ? [document.lightingProfiles[id]] : [],
  );
  let profile = profiles.find((entry) => entry?.target === target);
  if (!profile) {
    profile = profiles.sort((left, right) => left.id.localeCompare(right.id))[0];
    if (!profile) throw new Error(`Lighting rig ${rig.id} has no available profile.`);
    diagnostics.push({
      code: "PROFILE_FALLBACK",
      severity: "WARNING",
      domain: "RESOURCE",
      message: `Lighting target ${target} uses fallback profile ${profile.id}.`,
      entityId: rig.id,
      recoverable: true,
    });
  }
  const maxLights = Math.min(profile.maxActiveLights, limits.maxLights);
  const available = rig.lightIds
    .flatMap((id) => (document.lights[id] ? [document.lights[id]] : []))
    .sort((left, right) => rolePriority(left) - rolePriority(right) || left.id.localeCompare(right.id));
  const lights = available.slice(0, maxLights);
  if (available.length > lights.length) {
    diagnostics.push({
      code: "LIGHT_BUDGET_EXCEEDED",
      severity: "WARNING",
      domain: "RESOURCE",
      message: `${available.length - lights.length} lights were omitted by the ${target} profile budget.`,
      entityId: rig.id,
      recoverable: true,
      details: { available: available.length, active: lights.length },
    });
  }
  const shadowLimit = Math.min(profile.maxShadowLights, limits.maxShadowLights);
  const shadowLightIds = lights
    .filter((light) => light.shadow?.enabled || light.castShadow)
    .slice(0, shadowLimit)
    .map((light) => light.id);
  if (lights.filter((light) => light.shadow?.enabled || light.castShadow).length > shadowLightIds.length) {
    diagnostics.push({
      code: "SHADOW_BUDGET_EXCEEDED",
      severity: "WARNING",
      domain: "RESOURCE",
      message: "Shadow-casting lights were reduced to the active profile budget.",
      entityId: rig.id,
      recoverable: true,
    });
  }
  const reflectionProbes = rig.reflectionProbeIds
    .flatMap((id) => (document.reflectionProbes[id] ? [document.reflectionProbes[id]] : []))
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, limits.maxReflectionProbes);
  const environment = rig.environmentId ? document.environments[rig.environmentId] : undefined;
  const body = {
    version: "1.0.0" as const,
    sceneId,
    rigId: rig.id,
    target,
    profile,
    lights,
    ...(environment ? { environment } : {}),
    reflectionProbes,
    shadowLightIds,
    diagnostics,
  };
  return deepFreeze(ResolvedLightingSchema.parse({ ...body, fingerprint: lightingFingerprint(body) }));
}
