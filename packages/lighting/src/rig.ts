import {
  EnvironmentSchema,
  LightingRigSchema,
  LightSchema,
  ReflectionProbeSchema,
  createTransform,
  type Bounds3D,
  type LightRecord,
} from "@aevum/document-model";
import { LightingRigBuildResultSchema, type LightingEstimate, type LightingRigBuildResult } from "./schemas.js";
import { createLightingProfiles } from "./profiles.js";
import { deepFreeze, lightingEntityId, lightingFingerprint } from "./stable.js";

export interface BuildLightingRigInput {
  readonly sceneId: string;
  readonly name: string;
  readonly type:
    | "THREE_POINT"
    | "PRODUCT"
    | "CHARACTER"
    | "RIM"
    | "SOFTBOX"
    | "NEON"
    | "CINEMATIC"
    | "DAY"
    | "NIGHT"
    | "STUDIO"
    | "CUSTOM";
  readonly bounds?: Bounds3D;
  readonly estimate?: LightingEstimate;
  readonly referenceId?: string;
  readonly hdriAssetId?: string;
}

function temperatureColor(kelvin: number): LightRecord["color"] {
  const t = kelvin / 100;
  const r = t <= 66 ? 1 : Math.min(1, Math.max(0, 1.292936186 * (t - 60) ** -0.1332047592));
  const g =
    t <= 66
      ? Math.min(1, Math.max(0, 0.390081579 * Math.log(t) - 0.631841444))
      : Math.min(1, Math.max(0, 1.129890861 * (t - 60) ** -0.0755148492));
  const b = t >= 66 ? 1 : t <= 19 ? 0 : Math.min(1, Math.max(0, 0.543206789 * Math.log(t - 10) - 1.19625409));
  return { r, g, b, a: 1, colorSpace: "LINEAR_SRGB" };
}

function rotationFor(direction: { x: number; y: number; z: number }) {
  return {
    x: Math.atan2(direction.y, Math.hypot(direction.x, direction.z)),
    y: Math.atan2(-direction.x, -direction.z),
    z: 0,
  };
}

export function buildLightingRig(input: BuildLightingRigInput): LightingRigBuildResult {
  const center = input.bounds?.center ?? { x: 0, y: 0, z: 0 };
  const radius = Math.max(input.bounds?.radius ?? 1, 0.1);
  const estimate = input.estimate;
  const directions: readonly [
    { readonly x: number; readonly y: number; readonly z: number },
    { readonly x: number; readonly y: number; readonly z: number },
    { readonly x: number; readonly y: number; readonly z: number },
  ] = [
    estimate?.keyDirection ?? { x: -0.6, y: 0.7, z: -0.4 },
    estimate?.fillDirection ?? { x: 0.7, y: 0.25, z: -0.5 },
    estimate?.rimDirection ?? { x: 0.1, y: 0.6, z: 0.8 },
  ];
  const ratio = estimate?.keyToFillRatio ?? 3;
  const temperature = estimate?.temperatureKelvin ?? (input.type === "NIGHT" ? 8_000 : 5_600);
  const lightDefinitions = [
    { role: "KEY", intensity: 1_000, direction: directions[0], shadow: true },
    { role: "FILL", intensity: 1_000 / ratio, direction: directions[1], shadow: false },
    { role: "RIM", intensity: 650, direction: directions[2], shadow: false },
  ] as const;
  const lights = lightDefinitions.map((definition, index) => {
    const id = lightingEntityId("light", { sceneId: input.sceneId, name: input.name, role: definition.role });
    const transform = {
      ...createTransform(),
      position: {
        x: center.x - definition.direction.x * radius * 2.5,
        y: center.y - definition.direction.y * radius * 2.5,
        z: center.z - definition.direction.z * radius * 2.5,
      },
      rotation: rotationFor(definition.direction),
    };
    return LightSchema.parse({
      id,
      name: `${input.name} ${definition.role.toLowerCase()}`,
      type: input.type === "DAY" ? "DIRECTIONAL" : "AREA",
      transform,
      color: temperatureColor(index === 1 ? Math.min(40_000, temperature + 800) : temperature),
      intensity: definition.intensity,
      temperatureKelvin: index === 1 ? Math.min(40_000, temperature + 800) : temperature,
      exposure: 0,
      shape: input.type === "DAY" ? undefined : "RECTANGLE",
      size: input.type === "DAY" ? undefined : { width: radius * (index === 0 ? 1.5 : 2), height: radius },
      castShadow: definition.shadow,
      shadow: {
        enabled: definition.shadow,
        mode: "HYBRID",
        mapSize: 2_048,
        bias: -0.0005,
        normalBias: 0.02,
        radius: estimate ? estimate.shadowSoftness * radius : radius * 0.25,
        contact: definition.role === "KEY",
      },
      volumetric: {
        enabled: (estimate?.volumetricContribution ?? 0) > 0.05,
        density: estimate?.volumetricContribution ?? 0,
        anisotropy: 0,
      },
      metadata: { role: definition.role, target: center, direction: definition.direction },
    });
  });
  const environment = EnvironmentSchema.parse({
    id: lightingEntityId("environment", { sceneId: input.sceneId, name: input.name }),
    name: `${input.name} environment`,
    type: input.hdriAssetId ? "HDRI" : input.type === "DAY" || input.type === "NIGHT" ? "SKY" : "STUDIO",
    ...(input.hdriAssetId ? { assetId: input.hdriAssetId } : {}),
    color: temperatureColor(input.type === "NIGHT" ? 10_000 : temperature),
    intensity: estimate?.environmentContribution ?? 0.25,
    rotation: { x: 0, y: 0, z: 0 },
    backgroundIntensity: input.type === "NIGHT" ? 0.03 : 0.2,
    reflectionIntensity: estimate?.reflectionContribution ?? 0.5,
    visibleToCamera: true,
    metadata: { source: estimate ? "REFERENCE_ESTIMATE" : "PRESET" },
  });
  const profiles = createLightingProfiles({ sceneId: input.sceneId, name: input.name });
  const probe = ReflectionProbeSchema.parse({
    id: lightingEntityId("probe", { sceneId: input.sceneId, name: input.name }),
    name: `${input.name} reflection probe`,
    type: "CUBEMAP",
    transform: { ...createTransform(), position: center },
    ...(input.bounds ? { bounds: input.bounds } : {}),
    resolution: 1_024,
    updateMode: "ON_DEMAND",
    influence: 1,
    metadata: {},
  });
  const rig = LightingRigSchema.parse({
    id: lightingEntityId("lighting", { sceneId: input.sceneId, name: input.name, type: input.type }),
    name: input.name,
    type: input.type,
    lightIds: lights.map((light) => light.id),
    environmentId: environment.id,
    reflectionProbeIds: [probe.id],
    profileIds: profiles.map((profile) => profile.id),
    ...(input.referenceId ? { referenceId: input.referenceId } : {}),
    metadata: { classification: "REAL_CANONICAL", preset: input.type },
  });
  const body = { version: "1.0.0" as const, rig, lights, environment, profiles, reflectionProbes: [probe] };
  return deepFreeze(LightingRigBuildResultSchema.parse({ ...body, fingerprint: lightingFingerprint(body) }));
}
