import { readFile } from "node:fs/promises";
import { computeSha256 } from "@aevum/assets";
import { z } from "zod";
import type { BlenderBridgeConfig } from "./config.js";
import { BlenderBridgeError, blenderError } from "./errors.js";
import { launchBlenderProcess, type BlenderProcessHandle } from "./process.js";
import {
  BLENDER_BRIDGE_PROTOCOL_VERSION,
  BlenderDiagnosticSchema,
  BlenderJobSchema,
  createBlenderJobResult,
  type BlenderArtifact,
  type BlenderDiagnostic,
  type BlenderJob,
  type BlenderJobResult,
  type BlenderJobState,
  type BlenderRuntimeInfo,
} from "./protocol.js";
import { blenderScriptPath, inspectBlenderRuntime } from "./runtime.js";
import { blenderFingerprint, deepFreeze } from "./stable.js";
import {
  cleanupBlenderWorkspace,
  createBlenderWorkspace,
  readBoundedFile,
  writeInternalManifest,
  type BlenderJobWorkspace,
} from "./workspace.js";

const InternalResultSchema = z.strictObject({
  protocolVersion: z.literal(BLENDER_BRIDGE_PROTOCOL_VERSION),
  jobId: BlenderJobSchema.shape.id,
  state: z.enum(["SUCCEEDED", "FAILED"]),
  operation: z.string().min(1),
  data: z.unknown().optional(),
  diagnostics: z.array(BlenderDiagnosticSchema),
  durationMs: z.number().int().nonnegative(),
});

export interface BlenderExecution {
  readonly result: BlenderJobResult;
  readonly outputGlb?: Uint8Array;
  readonly inspectionJson?: Uint8Array;
  readonly diagnosticLog?: Uint8Array;
}

export interface BlenderJobRunner {
  execute(job: BlenderJob, inputBytes: Uint8Array): Promise<BlenderExecution>;
  cancel(jobId: string): boolean;
  inspectRuntime(): Promise<BlenderRuntimeInfo>;
  readonly activeJobs: number;
}

class ConcurrencyGate {
  readonly #limit: number;
  #active = 0;
  readonly #waiters: Array<() => void> = [];

  public constructor(limit: number) {
    this.#limit = limit;
  }

  public async enter(): Promise<() => void> {
    if (this.#active >= this.#limit) await new Promise<void>((resolve) => this.#waiters.push(resolve));
    this.#active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active -= 1;
      this.#waiters.shift()?.();
    };
  }
}

function artifact(
  job: BlenderJob,
  runtime: BlenderRuntimeInfo,
  type: BlenderArtifact["type"],
  bytes: Uint8Array,
  createdAt: string,
): BlenderArtifact {
  const hash = computeSha256(bytes);
  return {
    id: `blender-artifact:${blenderFingerprint({ jobId: job.id, type, hash }).slice(7, 39)}`,
    jobId: job.id,
    type,
    hash,
    byteSize: bytes.byteLength,
    mimeType: type === "GLB" ? "model/gltf-binary" : "application/json",
    logicalPath:
      type === "GLB"
        ? "/output/result.glb"
        : type === "DIAGNOSTIC_LOG"
          ? "/logs/process.json"
          : "/output/inspection.json",
    createdAt,
    provenance: {
      sourceAssetId: job.inputAsset.assetId,
      sourceAssetHash: job.inputAsset.hash,
      blenderVersion: runtime.blenderVersion,
      operationFingerprint: blenderFingerprint(job.operation),
    },
  };
}

function transition(transitions: Array<{ state: BlenderJobState; at: string }>, state: BlenderJobState): void {
  transitions.push({ state, at: new Date().toISOString() });
}

function diagnosticFrom(error: unknown): BlenderDiagnostic {
  if (error instanceof BlenderBridgeError)
    return (
      error.diagnostics[0] ?? {
        code: error.code,
        severity: "BLOCKING",
        message: error.message,
        recoverable: false,
      }
    );
  return {
    code: "BLENDER_PROCESS_FAILED",
    severity: "BLOCKING",
    message: "The controlled Blender job failed before producing a valid result.",
    recoverable: false,
  };
}

export function createBlenderJobRunner(config: BlenderBridgeConfig): BlenderJobRunner {
  const gate = new ConcurrencyGate(config.maxConcurrentJobs);
  const running = new Map<string, BlenderProcessHandle>();
  const cancelled = new Set<string>();
  let runtimePromise: Promise<BlenderRuntimeInfo> | undefined;

  const inspectRuntime = () => {
    runtimePromise ??= inspectBlenderRuntime(config);
    return runtimePromise;
  };

  return {
    get activeJobs() {
      return running.size;
    },
    inspectRuntime,
    cancel(jobId) {
      cancelled.add(jobId);
      const process = running.get(jobId);
      process?.cancel();
      return Boolean(process);
    },
    async execute(rawJob, inputBytes) {
      const release = await gate.enter();
      const startedAt = new Date().toISOString();
      const started = Date.now();
      const transitions: Array<{ state: BlenderJobState; at: string }> = [];
      let workspace: BlenderJobWorkspace | undefined;
      let runtime: BlenderRuntimeInfo | undefined;
      let exitCode: number | null = null;
      try {
        transition(transitions, "CREATED");
        transition(transitions, "VALIDATING");
        const job = BlenderJobSchema.parse(rawJob);
        if (cancelled.has(job.id)) throw blenderError("BLENDER_CANCELLED", "Blender job was cancelled before launch.");
        runtime = await inspectRuntime();
        if (runtime.compatibility === "UNSUPPORTED") {
          throw blenderError("BLENDER_VERSION_UNSUPPORTED", "Configured Blender version is unsupported.");
        }
        transition(transitions, "PREPARING");
        workspace = await createBlenderWorkspace(job, inputBytes, config);
        await writeInternalManifest(workspace.manifestPath, {
          protocolVersion: BLENDER_BRIDGE_PROTOCOL_VERSION,
          jobId: job.id,
          inputPath: workspace.inputPath,
          outputPath: workspace.outputPath,
          identityBindings: job.identityBindings,
          operation: job.operation,
          resourceBudget: {
            maxObjects: job.resourceBudget.maxObjects,
            maxMeshes: job.resourceBudget.maxMeshes,
            maxMaterials: job.resourceBudget.maxMaterials,
          },
          expectedOutputs: job.expectedOutputs,
        });
        transition(transitions, "RUNNING");
        const handle = launchBlenderProcess({
          executablePath: config.executablePath ?? "",
          workspace: workspace.root,
          timeoutMs: job.resourceBudget.timeoutMs,
          args: [
            "--background",
            "--factory-startup",
            "--disable-autoexec",
            "--python",
            blenderScriptPath("bootstrap.py"),
            "--",
            "--manifest",
            workspace.manifestPath,
            "--result",
            workspace.resultPath,
          ],
        });
        running.set(job.id, handle);
        const processResult = await handle.completed;
        exitCode = processResult.exitCode;
        running.delete(job.id);
        if (processResult.cancelled || cancelled.has(job.id)) {
          transition(transitions, "CANCELLED");
          return deepFreeze({
            result: createBlenderJobResult({
              jobId: job.id,
              state: "CANCELLED",
              operation: job.operation.kind,
              startedAt,
              completedAt: new Date().toISOString(),
              durationMs: Date.now() - started,
              exitCode,
              transitions,
              runtime,
              artifacts: [],
              diagnostics: [
                {
                  code: "BLENDER_CANCELLED",
                  severity: "ERROR",
                  message: "Blender job was cancelled.",
                  recoverable: true,
                },
              ],
            }),
          });
        }
        if (processResult.timedOut) {
          transition(transitions, "TIMED_OUT");
          return deepFreeze({
            result: createBlenderJobResult({
              jobId: job.id,
              state: "TIMED_OUT",
              operation: job.operation.kind,
              startedAt,
              completedAt: new Date().toISOString(),
              durationMs: Date.now() - started,
              exitCode,
              transitions,
              runtime,
              artifacts: [],
              diagnostics: [
                {
                  code: "BLENDER_TIMEOUT",
                  severity: "ERROR",
                  message: "Blender job exceeded its timeout.",
                  recoverable: true,
                },
              ],
            }),
          });
        }
        transition(transitions, "COLLECTING");
        let internal: z.infer<typeof InternalResultSchema>;
        try {
          internal = InternalResultSchema.parse(JSON.parse(await readFile(workspace.resultPath, "utf8")));
        } catch {
          throw blenderError("BLENDER_RESULT_INVALID", "Blender did not produce a valid structured result.");
        }
        if (processResult.exitCode !== 0 || internal.state !== "SUCCEEDED") {
          transition(transitions, "FAILED");
          return deepFreeze({
            result: createBlenderJobResult({
              jobId: job.id,
              state: "FAILED",
              operation: job.operation.kind,
              startedAt,
              completedAt: new Date().toISOString(),
              durationMs: Date.now() - started,
              exitCode,
              transitions,
              runtime,
              artifacts: [],
              diagnostics:
                internal.diagnostics.length > 0
                  ? internal.diagnostics
                  : [
                      {
                        code: "BLENDER_PROCESS_FAILED",
                        severity: "ERROR",
                        message: "Blender exited unsuccessfully.",
                        recoverable: false,
                      },
                    ],
            }),
          });
        }
        transition(transitions, "VALIDATING_OUTPUT");
        const completedAt = new Date().toISOString();
        const inspectionJson = new TextEncoder().encode(JSON.stringify(internal.data ?? null));
        const diagnosticLog = new TextEncoder().encode(
          JSON.stringify({
            jobId: job.id,
            operation: job.operation.kind,
            exitCode: processResult.exitCode,
            durationMs: processResult.durationMs,
            stdoutBytes: Buffer.byteLength(processResult.stdout),
            stderrBytes: Buffer.byteLength(processResult.stderr),
          }),
        );
        const artifacts: BlenderArtifact[] = [];
        if (job.expectedOutputs.inspection)
          artifacts.push(artifact(job, runtime, "INSPECTION_JSON", inspectionJson, completedAt));
        artifacts.push(artifact(job, runtime, "DIAGNOSTIC_LOG", diagnosticLog, completedAt));
        let outputGlb: Uint8Array | undefined;
        if (job.expectedOutputs.glb) {
          try {
            outputGlb = await readBoundedFile(workspace.outputPath, job.resourceBudget.maxOutputBytes);
          } catch {
            throw blenderError("BLENDER_OUTPUT_MISSING", "Expected GLB artifact was not produced.");
          }
          artifacts.push(artifact(job, runtime, "GLB", outputGlb, completedAt));
        }
        transition(transitions, "SUCCEEDED");
        const result = createBlenderJobResult({
          jobId: job.id,
          state: "SUCCEEDED",
          operation: job.operation.kind,
          startedAt,
          completedAt,
          durationMs: Date.now() - started,
          exitCode,
          transitions,
          runtime,
          ...(internal.data === undefined ? {} : { data: internal.data as never }),
          artifacts,
          diagnostics: internal.diagnostics,
        });
        return deepFreeze({ result, ...(outputGlb ? { outputGlb } : {}), inspectionJson, diagnosticLog });
      } catch (error) {
        const code = error instanceof BlenderBridgeError ? error.code : "BLENDER_PROCESS_FAILED";
        const state = code === "BLENDER_CANCELLED" ? "CANCELLED" : code === "BLENDER_TIMEOUT" ? "TIMED_OUT" : "FAILED";
        transition(transitions, state);
        const job = BlenderJobSchema.safeParse(rawJob);
        const operation = job.success ? job.data.operation.kind : "scene.inspect";
        const jobId = job.success ? job.data.id : `blender-job:${"0".repeat(32)}`;
        return deepFreeze({
          result: createBlenderJobResult({
            jobId,
            state,
            operation,
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - started,
            exitCode,
            transitions,
            ...(runtime ? { runtime } : {}),
            artifacts: [],
            diagnostics: [diagnosticFrom(error)],
          }),
        });
      } finally {
        running.delete(rawJob.id);
        cancelled.delete(rawJob.id);
        if (workspace) await cleanupBlenderWorkspace(workspace, config);
        release();
      }
    },
  };
}

export function cancelBlenderJob(runner: BlenderJobRunner, jobId: string): boolean {
  return runner.cancel(jobId);
}

export function executeBlenderJob(
  runner: BlenderJobRunner,
  job: BlenderJob,
  inputBytes: Uint8Array,
): Promise<BlenderExecution> {
  return runner.execute(job, inputBytes);
}
