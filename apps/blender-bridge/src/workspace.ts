import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { computeSha256 } from "@aevum/assets";
import type { BlenderBridgeConfig } from "./config.js";
import { blenderError } from "./errors.js";
import type { BlenderJob } from "./protocol.js";

export interface BlenderJobWorkspace {
  readonly root: string;
  readonly inputDir: string;
  readonly outputDir: string;
  readonly workingDir: string;
  readonly logsDir: string;
  readonly inputPath: string;
  readonly outputPath: string;
  readonly manifestPath: string;
  readonly resultPath: string;
}

async function ensureContained(root: string, candidate: string): Promise<void> {
  const resolvedRoot = await realpath(root);
  const resolvedCandidate = await realpath(candidate);
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw blenderError("BLENDER_PATH_REJECTED", "Blender job workspace escaped the configured temporary root.");
  }
}

export function validateBlenderInputIsolation(job: BlenderJob, inputBytes: Uint8Array): void {
  let document: unknown;
  try {
    let jsonBytes = inputBytes;
    if (job.inputAsset.mimeType === "model/gltf-binary") {
      if (inputBytes.byteLength < 20) throw new Error("GLB header is incomplete.");
      const view = new DataView(inputBytes.buffer, inputBytes.byteOffset, inputBytes.byteLength);
      if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
        throw new Error("GLB header is invalid.");
      }
      const jsonLength = view.getUint32(12, true);
      const jsonType = view.getUint32(16, true);
      if (jsonType !== 0x4e4f534a || 20 + jsonLength > inputBytes.byteLength) {
        throw new Error("GLB JSON chunk is invalid.");
      }
      jsonBytes = inputBytes.subarray(20, 20 + jsonLength);
    }
    let jsonEnd = jsonBytes.byteLength;
    while (jsonEnd > 0 && [0, 32].includes(jsonBytes[jsonEnd - 1] ?? -1)) jsonEnd -= 1;
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes.subarray(0, jsonEnd)));
  } catch {
    throw blenderError("BLENDER_INPUT_INVALID", "GLB or GLTF input must contain valid glTF 2.0 JSON.");
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw blenderError("BLENDER_INPUT_INVALID", "GLB or GLTF input must contain a JSON object.");
  }
  const source = document as { buffers?: unknown; images?: unknown };
  const resources = [
    ...(Array.isArray(source.buffers) ? source.buffers : []),
    ...(Array.isArray(source.images) ? source.images : []),
  ];
  for (const resource of resources) {
    const uri = resource && typeof resource === "object" ? (resource as { uri?: unknown }).uri : undefined;
    if (typeof uri === "string" && !uri.startsWith("data:")) {
      throw blenderError("BLENDER_PATH_REJECTED", "GLB and GLTF resources must be embedded before Blender execution.");
    }
  }
}

export async function createBlenderWorkspace(
  job: BlenderJob,
  inputBytes: Uint8Array,
  config: BlenderBridgeConfig,
): Promise<BlenderJobWorkspace> {
  if (inputBytes.byteLength !== job.inputAsset.byteSize || inputBytes.byteLength > job.resourceBudget.maxInputBytes) {
    throw blenderError("BLENDER_RESOURCE_LIMIT", "Blender input size does not match the authorized asset budget.");
  }
  if (computeSha256(inputBytes) !== job.inputAsset.hash) {
    throw blenderError("BLENDER_ASSET_HASH_MISMATCH", "Materialized Blender input does not match its registered hash.");
  }
  validateBlenderInputIsolation(job, inputBytes);
  const base = path.resolve(config.tempDir ?? tmpdir(), "aevum-blender");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, `${job.id.slice("blender-job:".length)}-`));
  const inputDir = path.join(root, "input");
  const outputDir = path.join(root, "output");
  const workingDir = path.join(root, "working");
  const logsDir = path.join(root, "logs");
  await Promise.all([inputDir, outputDir, workingDir, logsDir, path.join(root, "home")].map((dir) => mkdir(dir)));
  await ensureContained(base, root);
  const extension = job.inputAsset.mimeType === "model/gltf+json" ? ".gltf" : ".glb";
  const inputPath = path.join(inputDir, `source${extension}`);
  const outputPath = path.join(outputDir, "result.glb");
  const manifestPath = path.join(root, "job.json");
  const resultPath = path.join(root, "result.json");
  await writeFile(inputPath, inputBytes, { flag: "wx" });
  return { root, inputDir, outputDir, workingDir, logsDir, inputPath, outputPath, manifestPath, resultPath };
}

export async function readBoundedFile(filePath: string, maximumBytes: number): Promise<Uint8Array> {
  const details = await stat(filePath);
  if (!details.isFile() || details.size > maximumBytes) {
    throw blenderError("BLENDER_RESOURCE_LIMIT", "Blender output exceeded its authorized size budget.");
  }
  return readFile(filePath);
}

export async function writeInternalManifest(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value), { encoding: "utf8", flag: "wx" });
}

export async function cleanupBlenderWorkspace(
  workspace: BlenderJobWorkspace,
  config: BlenderBridgeConfig,
): Promise<void> {
  if (config.retainFailedWorkspaces) return;
  const base = path.resolve(config.tempDir ?? tmpdir(), "aevum-blender");
  const resolvedRoot = path.resolve(workspace.root);
  if (resolvedRoot === base || !resolvedRoot.startsWith(`${base}${path.sep}`)) {
    throw blenderError("BLENDER_PATH_REJECTED", "Refusing to remove a path outside the Blender job root.");
  }
  await rm(resolvedRoot, { recursive: true, force: true });
}
