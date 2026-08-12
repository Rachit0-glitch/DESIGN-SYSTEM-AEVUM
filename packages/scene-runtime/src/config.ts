import { z } from "zod";
import type { RuntimeViewport, SceneRuntimeConfiguration } from "./types.js";

const booleanValue = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  return value;
}, z.boolean());

const positiveInteger = z.preprocess(
  (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
  z.number().int().positive(),
);

export const sceneRuntimeConfigurationSchema = z.strictObject({
  strictMode: booleanValue.default(true),
  maxDepth: positiveInteger.default(1_000),
  maxNodes: positiveInteger.default(100_000),
  enableCache: booleanValue.default(true),
  cacheSize: positiveInteger.default(500),
  diagnostics: booleanValue.default(true),
  inspectionMode: booleanValue.default(false),
});

export const runtimeViewportSchema = z.strictObject({
  id: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().finite().positive(),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
  category: z.enum(["DESKTOP", "TABLET", "MOBILE", "CUSTOM"]),
  reducedMotion: z.boolean().default(false),
  breakpointId: z.string().min(1).optional(),
  containerQueryIds: z.array(z.string().min(1)).optional(),
  qualityMode: z.enum(["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]).optional(),
  animation: z
    .strictObject({
      time: z.number().finite().nonnegative(),
      progress: z.number().finite().min(0).max(1).optional(),
      active: z.boolean().optional(),
      playbackState: z.enum(["IDLE", "RUNNING", "PAUSED", "COMPLETED", "CANCELLED", "REVERSED"]).optional(),
      timelineIds: z.array(z.string().min(1)).optional(),
      sequenceId: z.string().min(1).optional(),
    })
    .optional(),
});

export function resolveRuntimeConfiguration(input: Partial<SceneRuntimeConfiguration> = {}): SceneRuntimeConfiguration {
  return Object.freeze(sceneRuntimeConfigurationSchema.parse(input));
}

export function validateProjectionInput(viewport: RuntimeViewport): RuntimeViewport {
  const parsed = runtimeViewportSchema.parse(viewport);
  return Object.freeze({
    id: parsed.id,
    width: parsed.width,
    height: parsed.height,
    deviceScaleFactor: parsed.deviceScaleFactor,
    orientation: parsed.orientation,
    category: parsed.category,
    reducedMotion: parsed.reducedMotion,
    ...(parsed.breakpointId ? { breakpointId: parsed.breakpointId } : {}),
    ...(parsed.containerQueryIds ? { containerQueryIds: parsed.containerQueryIds } : {}),
    ...(parsed.qualityMode ? { qualityMode: parsed.qualityMode } : {}),
    ...(parsed.animation
      ? {
          animation: {
            time: parsed.animation.time,
            ...(parsed.animation.progress !== undefined ? { progress: parsed.animation.progress } : {}),
            ...(parsed.animation.active !== undefined ? { active: parsed.animation.active } : {}),
            ...(parsed.animation.playbackState ? { playbackState: parsed.animation.playbackState } : {}),
            ...(parsed.animation.timelineIds ? { timelineIds: parsed.animation.timelineIds } : {}),
            ...(parsed.animation.sequenceId ? { sequenceId: parsed.animation.sequenceId } : {}),
          },
        }
      : {}),
  });
}
