import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BlenderBridgeConfig } from "./config.js";
import type { BlenderJobRunner } from "./runner.js";

export interface BlenderBridgeHealth {
  readonly ok: boolean;
  readonly status: "HEALTHY" | "NOT_READY";
  readonly checks: {
    readonly bridge: boolean;
    readonly executable: boolean;
    readonly blenderRuntime: boolean;
    readonly pythonRuntime: boolean;
    readonly headless: boolean;
    readonly workspaceWritable: boolean;
  };
  readonly blenderVersion?: string;
  readonly pythonVersion?: string;
  readonly compatibility?: "SUPPORTED" | "UNSUPPORTED" | "UNTESTED";
}

export function getBlenderBridgeHealth(): BlenderBridgeHealth {
  return {
    ok: true,
    status: "HEALTHY",
    checks: {
      bridge: true,
      executable: false,
      blenderRuntime: false,
      pythonRuntime: false,
      headless: false,
      workspaceWritable: false,
    },
  };
}

async function workspaceIsWritable(config: BlenderBridgeConfig): Promise<boolean> {
  const base = path.resolve(config.tempDir ?? tmpdir(), "aevum-blender");
  try {
    await mkdir(base, { recursive: true });
    const probe = await mkdtemp(path.join(base, "readiness-"));
    await rm(probe, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export async function getBlenderBridgeReadiness(
  runner: BlenderJobRunner,
  config: BlenderBridgeConfig,
): Promise<BlenderBridgeHealth> {
  const workspaceWritable = await workspaceIsWritable(config);
  try {
    const runtime = await runner.inspectRuntime();
    const executable = Boolean(config.executablePath);
    const blenderRuntime = runtime.compatibility !== "UNSUPPORTED";
    const pythonRuntime = /^\d+\.\d+\.\d+/.test(runtime.pythonVersion);
    const ok = executable && blenderRuntime && pythonRuntime && runtime.headless && workspaceWritable;
    return {
      ok,
      status: ok ? "HEALTHY" : "NOT_READY",
      checks: {
        bridge: true,
        executable,
        blenderRuntime,
        pythonRuntime,
        headless: runtime.headless,
        workspaceWritable,
      },
      blenderVersion: runtime.blenderVersion,
      pythonVersion: runtime.pythonVersion,
      compatibility: runtime.compatibility,
    };
  } catch {
    return {
      ok: false,
      status: "NOT_READY",
      checks: {
        bridge: true,
        executable: Boolean(config.executablePath),
        blenderRuntime: false,
        pythonRuntime: false,
        headless: false,
        workspaceWritable,
      },
    };
  }
}
