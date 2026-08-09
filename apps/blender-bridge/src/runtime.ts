import { createReadStream } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BlenderBridgeConfig } from "./config.js";
import { blenderError } from "./errors.js";
import { launchBlenderProcess, type BlenderProcessResult } from "./process.js";
import { BLENDER_BRIDGE_PROTOCOL_VERSION, BlenderRuntimeInfoSchema, type BlenderRuntimeInfo } from "./protocol.js";
import { deepFreeze } from "./stable.js";

const runtimePrefix = "AEVUM_RUNTIME_RESULT=";

function scriptPath(name: string): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "blender", name);
}

async function hashFile(filePath: string): Promise<`sha256:${string}`> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

export async function inspectBlenderRuntime(config: BlenderBridgeConfig): Promise<BlenderRuntimeInfo> {
  const executablePath = config.executablePath;
  if (!executablePath) throw blenderError("BLENDER_NOT_CONFIGURED", "BLENDER_EXECUTABLE_PATH is not configured.");
  try {
    await access(executablePath);
  } catch {
    throw blenderError("BLENDER_EXECUTABLE_NOT_FOUND", "The configured Blender executable does not exist.");
  }
  const workspace = path.resolve(config.tempDir ?? tmpdir(), "aevum-blender", "runtime-probe");
  await mkdir(workspace, { recursive: true });
  const process = launchBlenderProcess({
    executablePath,
    workspace,
    timeoutMs: Math.min(config.maxJobSeconds * 1_000, 60_000),
    args: ["--background", "--factory-startup", "--disable-autoexec", "--python", scriptPath("probe.py")],
  });
  let result: BlenderProcessResult;
  try {
    result = await process.completed;
  } catch {
    throw blenderError("BLENDER_START_FAILED", "The configured Blender process could not start.");
  }
  if (result.timedOut) throw blenderError("BLENDER_TIMEOUT", "Blender runtime inspection timed out.");
  if (result.exitCode !== 0) throw blenderError("BLENDER_PROCESS_FAILED", "Blender runtime inspection failed.");
  const line = result.stdout.split(/\r?\n/u).find((entry) => entry.startsWith(runtimePrefix));
  if (!line) throw blenderError("BLENDER_RESULT_INVALID", "Blender runtime inspection returned no structured result.");
  let payload: unknown;
  try {
    payload = JSON.parse(line.slice(runtimePrefix.length));
  } catch {
    throw blenderError("BLENDER_RESULT_INVALID", "Blender runtime inspection returned invalid JSON.");
  }
  const base = payload as { blenderVersion?: string; pythonVersion?: string; platform?: string };
  const parts = (base.blenderVersion ?? "").split(".").map(Number);
  const [major, minor, patchVersion] = parts;
  const compatibility = major === 5 && minor === 1 ? "SUPPORTED" : major === 5 ? "UNTESTED" : "UNSUPPORTED";
  return deepFreeze(
    BlenderRuntimeInfoSchema.parse({
      protocolVersion: BLENDER_BRIDGE_PROTOCOL_VERSION,
      blenderVersion: base.blenderVersion,
      blenderMajor: major,
      blenderMinor: minor,
      blenderPatch: patchVersion,
      pythonVersion: base.pythonVersion,
      platform: base.platform,
      compatibility,
      headless: true,
      executableFingerprint: await hashFile(executablePath),
      durationMs: result.durationMs,
    }),
  );
}

export function blenderScriptPath(name: "bootstrap.py" | "probe.py"): string {
  return scriptPath(name);
}
