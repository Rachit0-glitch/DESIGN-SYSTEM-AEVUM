import { spawn, type ChildProcessByStdio } from "node:child_process";
import path from "node:path";
import type { Readable } from "node:stream";

export interface BlenderProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
}

export interface BlenderProcessHandle {
  readonly child: ChildProcessByStdio<null, Readable, Readable>;
  readonly completed: Promise<BlenderProcessResult>;
  cancel(): void;
}

const MAX_CAPTURE_BYTES = 1_048_576;

function boundedAppend(current: string, chunk: Buffer): string {
  if (Buffer.byteLength(current) >= MAX_CAPTURE_BYTES) return current;
  return `${current}${chunk.toString("utf8")}`.slice(0, MAX_CAPTURE_BYTES);
}

export function safeBlenderEnvironment(workspace: string): NodeJS.ProcessEnv {
  const home = path.join(workspace, "home");
  return {
    TEMP: workspace,
    TMP: workspace,
    TMPDIR: workspace,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    BLENDER_USER_CONFIG: path.join(home, "blender-config"),
    BLENDER_USER_SCRIPTS: path.join(home, "blender-scripts"),
    PYTHONNOUSERSITE: "1",
  };
}

export function launchBlenderProcess(input: {
  readonly executablePath: string;
  readonly args: readonly string[];
  readonly workspace: string;
  readonly timeoutMs: number;
}): BlenderProcessHandle {
  const started = Date.now();
  const child = spawn(input.executablePath, [...input.args], {
    cwd: input.workspace,
    env: safeBlenderEnvironment(input.workspace),
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let cancelled = false;
  child.stdout.on("data", (chunk: Buffer) => {
    stdout = boundedAppend(stdout, chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = boundedAppend(stderr, chunk);
  });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, input.timeoutMs);
  const completed = new Promise<BlenderProcessResult>((resolve, reject) => {
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, durationMs: Date.now() - started, timedOut, cancelled });
    });
  });
  return {
    child,
    completed,
    cancel() {
      if (child.exitCode !== null || child.killed) return;
      cancelled = true;
      child.kill("SIGKILL");
    },
  };
}
