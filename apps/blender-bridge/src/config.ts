import type { AevumEnvironment } from "@aevum/shared";

export interface BlenderBridgeConfig {
  readonly executablePath?: string;
  readonly tempDir?: string;
  readonly maxJobSeconds: number;
  readonly maxFileBytes: number;
  readonly maxOutputBytes: number;
  readonly maxObjects: number;
  readonly maxMeshes: number;
  readonly maxMaterials: number;
  readonly maxConcurrentJobs: number;
  readonly retainFailedWorkspaces: boolean;
}

export function blenderBridgeConfig(environment: AevumEnvironment): BlenderBridgeConfig {
  return {
    ...(environment.blender.executablePath ? { executablePath: environment.blender.executablePath } : {}),
    ...(environment.blender.tempDir ? { tempDir: environment.blender.tempDir } : {}),
    maxJobSeconds: environment.blender.maxJobSeconds,
    maxFileBytes: environment.blender.maxFileBytes,
    maxOutputBytes: environment.blender.maxOutputBytes,
    maxObjects: environment.blender.maxObjects,
    maxMeshes: environment.blender.maxMeshes,
    maxMaterials: environment.blender.maxMaterials,
    maxConcurrentJobs: environment.blender.maxConcurrentJobs,
    retainFailedWorkspaces: false,
  };
}
