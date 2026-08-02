import { CanonicalDesignDocumentSchema } from "@aevum/document-model";
import {
  ReconstructionTaskSchema,
  createReconstructionReport,
  type ReconstructionApplicationResult,
  type ReconstructionDiagnostic,
  type ReconstructionEngine,
  type ReconstructionProposal,
  type ReconstructionReport,
  type ReconstructionStageRecord,
  type ReconstructionTask,
  type ReconstructionVerificationSummary,
  type ReferenceAnalysis,
} from "@aevum/reconstruction";
import { buildRenderGraph, type RenderGraph } from "@aevum/renderer-2d";
import { projectScene, type SceneProjectionResult } from "@aevum/scene-runtime";
import { createLogger, type AevumLogger, type PackageContract } from "@aevum/shared";
import { z } from "zod";

export const RECONSTRUCTION_JOB_STAGES = [
  "VALIDATE_TASK",
  "LOAD_REFERENCE",
  "ANALYZE_REFERENCE",
  "BUILD_PROPOSAL",
  "VALIDATE_PROPOSAL",
  "GENERATE_COMMANDS",
  "DRY_RUN",
  "APPLY_TRANSACTION",
  "PROJECT_SCENE",
  "BUILD_RENDER_GRAPH",
  "CREATE_REPORT",
  "COMPLETE",
] as const;

export type ReconstructionJobStage = (typeof RECONSTRUCTION_JOB_STAGES)[number];

export const ReconstructionWorkerJobSchema = z.strictObject({
  id: z.string().min(1),
  requestId: z.string().min(1),
  task: ReconstructionTaskSchema,
  existingDocument: CanonicalDesignDocumentSchema.optional(),
});

export type ReconstructionWorkerJob = z.infer<typeof ReconstructionWorkerJobSchema>;

export interface ReconstructionStageEvent extends ReconstructionStageRecord {
  readonly jobId: string;
  readonly taskId: string;
}

export interface ReconstructionWorkerOptions {
  readonly engine: ReconstructionEngine;
  readonly logger?: AevumLogger;
  readonly onStage?: (event: ReconstructionStageEvent) => void;
  readonly now?: () => number;
}

export interface ReconstructionWorkerSuccess {
  readonly success: true;
  readonly jobId: string;
  readonly task: ReconstructionTask;
  readonly analysis: ReferenceAnalysis;
  readonly proposal: ReconstructionProposal;
  readonly application: ReconstructionApplicationResult;
  readonly projection: SceneProjectionResult;
  readonly renderGraph: RenderGraph;
  readonly report: ReconstructionReport;
  readonly stages: readonly ReconstructionStageRecord[];
}

export interface ReconstructionWorkerFailure {
  readonly success: false;
  readonly jobId?: string;
  readonly status: "BLOCKED" | "FAILED" | "CANCELLED";
  readonly diagnostics: readonly ReconstructionDiagnostic[];
  readonly report?: ReconstructionReport;
  readonly stages: readonly ReconstructionStageRecord[];
}

export type ReconstructionWorkerResult = ReconstructionWorkerSuccess | ReconstructionWorkerFailure;

function workerDiagnostic(
  code: "CANCELLED" | "INVALID_PROPOSAL_REFERENCE" | "DRY_RUN_FAILED" | "TRANSACTION_FAILED",
  stage: string,
  message: string,
): ReconstructionDiagnostic {
  return {
    code,
    severity: code === "CANCELLED" ? "WARNING" : "CRITICAL",
    message,
    stage,
    relatedIds: [],
    recoverable: true,
    details: {},
  };
}

function sceneSummary(projection: SceneProjectionResult): ReconstructionVerificationSummary {
  const errorCount = projection.diagnostics.filter(
    (entry) => entry.severity === "ERROR" || entry.severity === "CRITICAL",
  ).length;
  const warningCount = projection.diagnostics.filter((entry) => entry.severity === "WARNING").length;
  return {
    status: !projection.complete || errorCount > 0 ? "FAILED" : warningCount > 0 ? "WARNINGS" : "PASSED",
    fingerprint: projection.fingerprint,
    complete: projection.complete && errorCount === 0,
    nodeCount: projection.nodes.size,
    operationCount: 0,
    diagnosticCount: projection.diagnostics.length,
    errorCount,
    diagnostics: projection.diagnostics.map((entry) => ({
      code: entry.code,
      severity: entry.severity,
      message: entry.message,
      ...(entry.entityId ? { entityId: entry.entityId } : {}),
      recoverable: entry.recoverable,
    })),
  };
}

function graphSummary(graph: RenderGraph): ReconstructionVerificationSummary {
  const errorCount = graph.diagnostics.filter((entry) => entry.severity === "ERROR").length;
  const warningCount = graph.diagnostics.filter((entry) => entry.severity === "WARNING").length;
  return {
    status: errorCount > 0 ? "FAILED" : warningCount > 0 ? "WARNINGS" : "PASSED",
    fingerprint: graph.fingerprint,
    complete: errorCount === 0,
    nodeCount: graph.paintOrder.length,
    operationCount: graph.operations.size,
    diagnosticCount: graph.diagnostics.length,
    errorCount,
    diagnostics: graph.diagnostics.map((entry) => ({
      code: entry.code,
      severity: entry.severity,
      message: entry.message,
      ...(entry.runtimeNodeId ? { entityId: entry.runtimeNodeId } : {}),
      recoverable: entry.recoverable,
    })),
  };
}

class CancellationError extends Error {}
class StageError extends Error {
  constructor(readonly diagnostics: readonly ReconstructionDiagnostic[]) {
    super(diagnostics[0]?.message ?? "Reconstruction stage failed.");
  }
}

export function createReconstructionWorker(options: ReconstructionWorkerOptions) {
  const now = options.now ?? (() => performance.now());
  const rootLogger = options.logger ?? createLogger();

  return Object.freeze({
    async execute(
      input: unknown,
      execution: { readonly signal?: AbortSignal } = {},
    ): Promise<ReconstructionWorkerResult> {
      const stages: ReconstructionStageRecord[] = [];
      let currentStage: ReconstructionJobStage = "VALIDATE_TASK";
      let job: ReconstructionWorkerJob | undefined;
      let analysis: ReferenceAnalysis | undefined;
      let proposal: ReconstructionProposal | undefined;
      let application: ReconstructionApplicationResult | undefined;
      let sceneVerification: ReconstructionVerificationSummary | undefined;
      let graphVerification: ReconstructionVerificationSummary | undefined;
      const logger = (context: { jobId?: string; task?: ReconstructionTask } = {}) =>
        rootLogger.child({
          ...(context.jobId ? { jobId: context.jobId } : {}),
          ...(context.task ? { projectId: context.task.projectId, documentId: context.task.targetDocumentId } : {}),
        });

      const runStage = async <T>(stage: ReconstructionJobStage, action: () => T | Promise<T>): Promise<T> => {
        currentStage = stage;
        const startedAt = now();
        options.onStage?.({
          jobId: job?.id ?? "unvalidated",
          taskId: job?.task.id ?? "unvalidated",
          stage,
          status: "RUNNING",
          durationMs: 0,
          diagnosticCount: 0,
        });
        logger({ ...(job ? { jobId: job.id, task: job.task } : {}) }).info(
          "reconstruction.stage.started",
          `Started ${stage}.`,
          { stage, status: "RUNNING" },
        );
        try {
          if (execution.signal?.aborted) throw new CancellationError(`Reconstruction cancelled before ${stage}.`);
          const value = await action();
          const record = {
            stage,
            status: "COMPLETED" as const,
            durationMs: Math.max(0, now() - startedAt),
            diagnosticCount: 0,
          };
          stages.push(record);
          options.onStage?.({ jobId: job?.id ?? "unvalidated", taskId: job?.task.id ?? "unvalidated", ...record });
          logger({ ...(job ? { jobId: job.id, task: job.task } : {}) }).info(
            "reconstruction.stage.completed",
            `Completed ${stage}.`,
            { ...record },
          );
          return value;
        } catch (error) {
          const status = error instanceof CancellationError ? ("CANCELLED" as const) : ("FAILED" as const);
          const diagnosticCount = error instanceof StageError ? error.diagnostics.length : 1;
          const record = { stage, status, durationMs: Math.max(0, now() - startedAt), diagnosticCount };
          stages.push(record);
          options.onStage?.({ jobId: job?.id ?? "unvalidated", taskId: job?.task.id ?? "unvalidated", ...record });
          logger({ ...(job ? { jobId: job.id, task: job.task } : {}) }).error(
            "reconstruction.stage.failed",
            error instanceof Error ? error.message : `Failed ${stage}.`,
            { ...record },
          );
          throw error;
        }
      };

      try {
        const validatedJob = await runStage("VALIDATE_TASK", () => ReconstructionWorkerJobSchema.parse(input));
        job = validatedJob;
        await runStage("LOAD_REFERENCE", () => {
          const source = options.engine.configuration;
          if (!source) throw new Error("Reconstruction engine configuration is unavailable.");
        });
        const completedAnalysis = await runStage("ANALYZE_REFERENCE", () => {
          const result = options.engine.analyze(validatedJob.task);
          if (!result.success) throw new StageError(result.diagnostics);
          return result.analysis;
        });
        analysis = completedAnalysis;
        const completedProposal = await runStage("BUILD_PROPOSAL", () => {
          const result = options.engine.createProposal(
            validatedJob.task,
            completedAnalysis,
            validatedJob.existingDocument,
          );
          if (!result.success) throw new StageError(result.diagnostics);
          return result.proposal;
        });
        proposal = completedProposal;
        await runStage("VALIDATE_PROPOSAL", () => {
          const validation = options.engine.validateProposal(completedProposal, validatedJob.existingDocument);
          if (!validation.success) throw new StageError(validation.diagnostics);
        });
        await runStage("GENERATE_COMMANDS", () => options.engine.generateCommandPlan(completedProposal));
        await runStage("DRY_RUN", () => {
          const result = options.engine.dryRun(completedProposal, validatedJob.existingDocument ?? null);
          if (!result.success) throw new StageError(result.diagnostics);
        });
        const completedApplication = await runStage("APPLY_TRANSACTION", () => {
          const outcome = options.engine.apply(
            completedProposal,
            validatedJob.task,
            validatedJob.existingDocument ?? null,
          );
          if (!outcome.success) throw new StageError(outcome.diagnostics);
          return outcome.result;
        });
        application = completedApplication;
        const projection = await runStage("PROJECT_SCENE", () =>
          projectScene(
            completedApplication.resultingDocument,
            {
              id: completedProposal.proposedDocumentMetadata.viewportId,
              ...completedProposal.proposedDocumentMetadata.viewport,
              reducedMotion: false,
              qualityMode: validatedJob.task.qualityMode,
            },
            { strictMode: false, diagnostics: true, inspectionMode: true, enableCache: false },
          ),
        );
        const completedSceneVerification = sceneSummary(projection);
        sceneVerification = completedSceneVerification;
        if (!completedSceneVerification.complete)
          throw new StageError([
            workerDiagnostic("TRANSACTION_FAILED", "PROJECT_SCENE", "Scene Runtime verification failed."),
          ]);
        const renderGraph = await runStage("BUILD_RENDER_GRAPH", () => buildRenderGraph(projection));
        const completedGraphVerification = graphSummary(renderGraph);
        graphVerification = completedGraphVerification;
        if (!completedGraphVerification.complete)
          throw new StageError([
            workerDiagnostic("TRANSACTION_FAILED", "BUILD_RENDER_GRAPH", "Render Graph verification failed."),
          ]);
        const report = await runStage("CREATE_REPORT", () =>
          createReconstructionReport({
            task: validatedJob.task,
            analysis: completedAnalysis,
            proposal: completedProposal,
            application: completedApplication,
            sceneProjection: completedSceneVerification,
            renderGraph: completedGraphVerification,
            stages: [
              ...stages,
              { stage: "CREATE_REPORT", status: "COMPLETED", durationMs: 0, diagnosticCount: 0 },
              { stage: "COMPLETE", status: "COMPLETED", durationMs: 0, diagnosticCount: 0 },
            ],
          }),
        );
        await runStage("COMPLETE", () => undefined);
        return Object.freeze({
          success: true as const,
          jobId: validatedJob.id,
          task: validatedJob.task,
          analysis: completedAnalysis,
          proposal: completedProposal,
          application: completedApplication,
          projection,
          renderGraph,
          report,
          stages: Object.freeze([...stages]),
        });
      } catch (error) {
        const cancelled = error instanceof CancellationError;
        const diagnostics =
          error instanceof StageError
            ? error.diagnostics
            : [
                workerDiagnostic(
                  cancelled ? "CANCELLED" : "INVALID_PROPOSAL_REFERENCE",
                  currentStage,
                  error instanceof Error ? error.message : "Reconstruction failed.",
                ),
              ];
        const report =
          job && analysis
            ? createReconstructionReport({
                task: job.task,
                analysis,
                ...(proposal ? { proposal } : {}),
                ...(application ? { application } : {}),
                diagnostics,
                ...(sceneVerification ? { sceneProjection: sceneVerification } : {}),
                ...(graphVerification ? { renderGraph: graphVerification } : {}),
                stages,
                completionStatus: cancelled ? "CANCELLED" : "BLOCKED",
              })
            : undefined;
        return Object.freeze({
          success: false as const,
          ...(job ? { jobId: job.id } : {}),
          status: cancelled
            ? ("CANCELLED" as const)
            : error instanceof StageError
              ? ("BLOCKED" as const)
              : ("FAILED" as const),
          diagnostics,
          ...(report ? { report } : {}),
          stages: Object.freeze([...stages]),
        });
      }
    },
  });
}

export type ReconstructionWorker = ReturnType<typeof createReconstructionWorker>;

export const packageContract: PackageContract = {
  name: "@aevum/reconstruction-worker",
  kind: "app",
  responsibility: "In-memory orchestration of deterministic reconstruction jobs and compatibility verification.",
  owns: "Job validation, stage execution, cancellation, Scene Runtime projection, Render Graph verification, and reports.",
  mustNotOwn: "Reconstruction domain contracts, canonical state, queue infrastructure, or placeholder deployment.",
  status: "IMPLEMENTED",
};

export const RECONSTRUCTION_WORKER_STATUS = packageContract.status;
