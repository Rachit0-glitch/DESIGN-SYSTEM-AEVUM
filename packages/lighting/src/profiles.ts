import { LightingProfileSchema, type LightingProfileRecord } from "@aevum/document-model";
import { lightingEntityId } from "./stable.js";

export function createLightingProfiles(seed: unknown): LightingProfileRecord[] {
  const profiles: Array<Omit<LightingProfileRecord, "id">> = [
    {
      name: "Realtime",
      target: "REALTIME",
      maxActiveLights: 16,
      maxShadowLights: 4,
      shadowMapSize: 2_048,
      shadowMode: "DYNAMIC",
      reflectionMode: "PROBES",
      volumetrics: true,
      environmentResolution: 1_024,
      bakePolicy: "OPTIONAL",
      metadata: { classification: "REAL_RENDERER_READY" },
    },
    {
      name: "Offline",
      target: "OFFLINE",
      maxActiveLights: 64,
      maxShadowLights: 32,
      shadowMapSize: 8_192,
      shadowMode: "PATH_TRACED",
      reflectionMode: "PATH_TRACED",
      volumetrics: true,
      environmentResolution: 4_096,
      bakePolicy: "NONE",
      metadata: { classification: "REAL_BLENDER" },
    },
    {
      name: "Mobile",
      target: "MOBILE",
      maxActiveLights: 4,
      maxShadowLights: 1,
      shadowMapSize: 1_024,
      shadowMode: "HYBRID",
      reflectionMode: "ENVIRONMENT",
      volumetrics: false,
      environmentResolution: 512,
      bakePolicy: "REQUIRED",
      metadata: { classification: "REAL_RENDERER_READY", fallback: "BAKED_OR_ENVIRONMENT" },
    },
  ];
  return profiles.map((profile) =>
    LightingProfileSchema.parse({ ...profile, id: lightingEntityId("profile", { seed, target: profile.target }) }),
  );
}
