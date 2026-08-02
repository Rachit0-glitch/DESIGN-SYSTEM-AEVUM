import {
  type CorrectionConfiguration,
  createCorrectionEngine,
  createCorrectionSession,
  type CorrectionReport,
  type CorrectionSession,
} from "@aevum/correction";
import {
  ActorRefSchema,
  CanonicalDesignDocumentSchema,
  EntityIdSchema,
  type CanonicalDesignDocument,
} from "@aevum/document-model";
import { buildRenderGraph, RENDERER_2D_VERSION } from "@aevum/renderer-2d";
import { projectScene } from "@aevum/scene-runtime";
import { createLogger, type AevumLogger, type PackageContract } from "@aevum/shared";
import {
  createValidationTask,
  validateDesign,
  ValidationReferenceSnapshotSchema,
  ValidationReportSchema,
  ValidationTaskSchema,
  type ValidationReferenceSnapshot,
  type ValidationReport,
  type ValidationTask,
} from "@aevum/validation";
import { z } from "zod";

export const CORRECTION_JOB_STAGES = [
  "VALIDATE_JOB",
  "CREATE_SESSION",
  "RUN_CORRECTION_LOOP",
  "CREATE_REPORT",
  "COMPLETE",
] as const;
export type CorrectionJobStage = (typeof CORRECTION_JOB_STAGES)[number];

export interface CorrectionWorkerJob {
  readonly id: string;
  readonly requestId: string;
  readonly document: CanonicalDesignDocument;
  readonly baselineTask: ValidationTask;
  readonly reference: ValidationReferenceSnapshot;
  readonly baselineReport: ValidationReport;
  readonly configuration?: Partial<CorrectionConfiguration> | undefined;
  readonly createdAt: string;
  readonly createdBy: ValidationTask["createdBy"];
}

export const CorrectionWorkerJobSchema = z.strictObject({
  id: z.string().min(1),
  requestId: z.string().min(1),
  document: CanonicalDesignDocumentSchema,
  baselineTask: ValidationTaskSchema,
  reference: ValidationReferenceSnapshotSchema,
  baselineReport: ValidationReportSchema,
  configuration: z
    .strictObject({
      maxPasses: z.number().int().min(1).max(10).optional(),
      minimumImprovement: z.number().finite().min(0).max(1).optional(),
      targetOverallScore: z.number().finite().min(0).max(1).optional(),
      minimumConfidence: z.number().finite().min(0).max(1).optional(),
      protectedProperties: z
        .array(
          z.strictObject({
            nodeId: EntityIdSchema.optional(),
            property: z.enum([
              "NODE",
              "POSITION",
              "SIZE",
              "SPACING",
              "TYPOGRAPHY",
              "COLOR",
              "BORDER",
              "RADIUS",
              "SHADOW",
              "GRADIENT",
              "ASSET_PLACEMENT",
              "VISIBILITY",
              "OPACITY",
              "HIERARCHY",
            ]),
            reason: z.string().min(1),
          }),
        )
        .optional(),
      protectedRegionIds: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: ActorRefSchema,
}) as unknown as z.ZodType<CorrectionWorkerJob>;

export interface CorrectionStageEvent {
  readonly jobId: string;
  readonly stage: CorrectionJobStage;
  readonly status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  readonly durationMs: number;
}

export interface CorrectionWorkerOptions {
  readonly logger?: AevumLogger;
  readonly onStage?: (event: CorrectionStageEvent) => void;
  readonly now?: () => number;
}

export interface CorrectionWorkerExecution {
  readonly signal?: AbortSignal;
}

export type CorrectionWorkerResult =
  | {
      readonly success: true;
      readonly jobId: string;
      readonly session: CorrectionSession;
      readonly report: CorrectionReport;
      readonly document: CanonicalDesignDocument;
      readonly validation: ValidationReport;
      readonly stages: readonly CorrectionStageEvent[];
    }
  | {
      readonly success: false;
      readonly jobId?: string;
      readonly status: "FAILED" | "CANCELLED";
      readonly message: string;
      readonly stages: readonly CorrectionStageEvent[];
    };

class CancellationError extends Error {}

function assertJobConsistency(job: CorrectionWorkerJob): void {
  if (
    job.document.metadata.id !== job.baselineTask.documentId ||
    job.document.documentVersion !== job.baselineTask.documentVersion ||
    job.baselineReport.taskId !== job.baselineTask.id ||
    job.baselineReport.documentId !== job.document.metadata.id ||
    job.baselineReport.documentVersion !== job.document.documentVersion ||
    job.reference.referenceId !== job.baselineTask.referenceId ||
    job.reference.sourceAssetId !== job.baselineTask.sourceAssetId
  ) {
    throw new Error("Correction job document, task, reference, and report identities do not match.");
  }
}

export function createCorrectionWorker(options: CorrectionWorkerOptions = {}) {
  const now = options.now ?? (() => performance.now());
  const rootLogger = options.logger ?? createLogger();
  return Object.freeze({
    async execute(input: unknown, execution: CorrectionWorkerExecution = {}): Promise<CorrectionWorkerResult> {
      const stages: CorrectionStageEvent[] = [];
      let job: CorrectionWorkerJob | undefined;
      const runStage = async <T>(stage: CorrectionJobStage, action: () => T | Promise<T>): Promise<T> => {
        const startedAt = now();
        const running = { jobId: job?.id ?? "unvalidated", stage, status: "RUNNING" as const, durationMs: 0 };
        options.onStage?.(running);
        rootLogger
          .child({
            ...(job
              ? {
                  jobId: job.id,
                  projectId: job.document.metadata.projectId,
                  documentId: job.document.metadata.id,
                  documentVersion: job.document.documentVersion,
                }
              : {}),
          })
          .info("correction.stage.started", `Started ${stage}.`, { stage, status: "RUNNING" });
        try {
          if (execution.signal?.aborted) throw new CancellationError(`Correction cancelled before ${stage}.`);
          const value = await action();
          const completed = {
            jobId: job?.id ?? "unvalidated",
            stage,
            status: "COMPLETED" as const,
            durationMs: Math.max(0, now() - startedAt),
          };
          stages.push(completed);
          options.onStage?.(completed);
          return value;
        } catch (error) {
          const failed = {
            jobId: job?.id ?? "unvalidated",
            stage,
            status: error instanceof CancellationError ? ("CANCELLED" as const) : ("FAILED" as const),
            durationMs: Math.max(0, now() - startedAt),
          };
          stages.push(failed);
          options.onStage?.(failed);
          throw error;
        }
      };

      try {
        const validatedJob = await runStage("VALIDATE_JOB", () => CorrectionWorkerJobSchema.parse(input));
        job = validatedJob;
        assertJobConsistency(validatedJob);
        const session = await runStage("CREATE_SESSION", () =>
          createCorrectionSession({
            document: validatedJob.document,
            baselineReport: validatedJob.baselineReport,
            ...(validatedJob.configuration ? { configuration: validatedJob.configuration } : {}),
            createdAt: validatedJob.createdAt,
            createdBy: validatedJob.createdBy,
          }),
        );
        const engine = createCorrectionEngine({
          revalidationAdapter: {
            async validate(document, passNumber) {
              if (execution.signal?.aborted)
                throw new CancellationError(`Correction cancelled during pass ${passNumber}.`);
              const sceneViewport = {
                ...validatedJob.baselineTask.viewport,
                qualityMode: document.settings.qualityMode,
              };
              const projection = projectScene(document, sceneViewport, {
                strictMode: false,
                diagnostics: true,
                inspectionMode: true,
                enableCache: false,
              });
              if (!projection.complete)
                throw new Error(`Scene Projection is incomplete during correction pass ${passNumber}.`);
              const renderGraph = buildRenderGraph(projection);
              if (renderGraph.diagnostics.some((entry) => entry.severity === "ERROR")) {
                throw new Error(`Render Graph contains a correction-blocking error during pass ${passNumber}.`);
              }
              const task = createValidationTask({
                projectId: document.metadata.projectId,
                documentId: document.metadata.id,
                documentVersion: document.documentVersion,
                referenceId: validatedJob.baselineTask.referenceId,
                sourceAssetId: validatedJob.baselineTask.sourceAssetId,
                referenceAnalysisId: validatedJob.baselineTask.referenceAnalysisId,
                viewport: validatedJob.baselineTask.viewport,
                rendererVersion: RENDERER_2D_VERSION,
                projectionFingerprint: projection.fingerprint,
                renderGraphFingerprint: renderGraph.fingerprint,
                qualityMode: document.settings.qualityMode,
                thresholdProfile: validatedJob.baselineTask.thresholdProfile,
                requestedMetrics: [...validatedJob.baselineTask.requestedMetrics],
                deterministicSeed: validatedJob.baselineTask.deterministicSeed,
                createdAt: validatedJob.createdAt,
                createdBy: validatedJob.createdBy,
              });
              const result = validateDesign({
                task,
                reference: validatedJob.reference,
                document,
                projection,
                renderGraph,
                createdAt: validatedJob.createdAt,
              });
              if (!result.success) throw new Error(result.diagnostics.map((entry) => entry.message).join(" "));
              return result.report;
            },
          },
        });
        const correction = await runStage("RUN_CORRECTION_LOOP", () =>
          engine.run({
            session,
            document: validatedJob.document,
            baselineReport: validatedJob.baselineReport,
            timestamp: validatedJob.createdAt,
          }),
        );
        if (!correction.success) {
          throw new Error(correction.diagnostics.map((entry) => entry.message).join(" "));
        }
        const report = await runStage("CREATE_REPORT", () => correction.report);
        await runStage("COMPLETE", () => undefined);
        return Object.freeze({
          success: true as const,
          jobId: validatedJob.id,
          session: correction.session,
          report,
          document: correction.document,
          validation: correction.validation,
          stages: Object.freeze([...stages]),
        });
      } catch (error) {
        return Object.freeze({
          success: false as const,
          ...(job ? { jobId: job.id } : {}),
          status: error instanceof CancellationError ? ("CANCELLED" as const) : ("FAILED" as const),
          message: error instanceof Error ? error.message : "Correction failed.",
          stages: Object.freeze([...stages]),
        });
      }
    },
  });
}

export type CorrectionWorker = ReturnType<typeof createCorrectionWorker>;

export const packageContract: PackageContract = {
  name: "@aevum/correction-worker",
  kind: "app",
  responsibility: "In-memory orchestration of bounded Autonomous 2D Correction Loop jobs.",
  owns: "Job validation, deterministic projection and revalidation, stage reporting, cancellation, and result assembly.",
  mustNotOwn: "Canonical state, direct mutation, creative redesign, queue infrastructure, or placeholder deployment.",
  status: "IMPLEMENTED",
};

export const CORRECTION_WORKER_STATUS = packageContract.status;
