import { ActorRefSchema, CanonicalDesignDocumentSchema, type CanonicalDesignDocument } from "@aevum/document-model";
import {
  ReconstructionProposalSchema,
  ReferenceAnalysisSchema,
  type ReconstructionProposal,
  type ReferenceAnalysis,
} from "@aevum/reconstruction";
import { buildRenderGraph, RENDERER_2D_VERSION, type RenderGraph } from "@aevum/renderer-2d";
import { projectScene, type SceneProjectionResult } from "@aevum/scene-runtime";
import { createLogger, type AevumLogger, type PackageContract } from "@aevum/shared";
import {
  createValidationReferenceSnapshot,
  createValidationTask,
  RasterDescriptorSchema,
  validateDesign,
  ValidationMetricSchema,
  ValidationThresholdProfileNameSchema,
  type RasterDescriptor,
  type RasterSurface,
  type ValidationMetric,
  type ValidationReferenceSnapshot,
  type ValidationReport,
  type ValidationTask,
  type ValidationTaskInput,
  type ValidationThresholdProfileName,
} from "@aevum/validation";
import { z } from "zod";

export const VALIDATION_JOB_STAGES = [
  "VALIDATE_JOB",
  "PROJECT_SCENE",
  "BUILD_RENDER_GRAPH",
  "CREATE_TASK",
  "PREPARE_REFERENCE",
  "COMPARE",
  "CREATE_REPORT",
  "COMPLETE",
] as const;
export type ValidationJobStage = (typeof VALIDATION_JOB_STAGES)[number];

export interface ValidationWorkerJob {
  readonly id: string;
  readonly requestId: string;
  readonly document: CanonicalDesignDocument;
  readonly analysis: ReferenceAnalysis;
  readonly proposal: ReconstructionProposal;
  readonly thresholdProfile: ValidationThresholdProfileName;
  readonly requestedMetrics: readonly ValidationMetric[];
  readonly deterministicSeed: number;
  readonly createdAt: string;
  readonly createdBy: ValidationTaskInput["createdBy"];
  readonly referenceRaster?: RasterDescriptor | undefined;
  readonly actualRaster?: RasterDescriptor | undefined;
}

export const ValidationWorkerJobSchema: z.ZodType<ValidationWorkerJob> = z.strictObject({
  id: z.string().min(1),
  requestId: z.string().min(1),
  document: CanonicalDesignDocumentSchema,
  analysis: ReferenceAnalysisSchema,
  proposal: ReconstructionProposalSchema,
  thresholdProfile: ValidationThresholdProfileNameSchema,
  requestedMetrics: z.array(ValidationMetricSchema).min(1),
  deterministicSeed: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: ActorRefSchema,
  referenceRaster: RasterDescriptorSchema.optional(),
  actualRaster: RasterDescriptorSchema.optional(),
});
export interface ValidationStageEvent {
  readonly jobId: string;
  readonly stage: ValidationJobStage;
  readonly status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  readonly durationMs: number;
}
export interface ValidationWorkerOptions {
  readonly logger?: AevumLogger;
  readonly onStage?: (event: ValidationStageEvent) => void;
  readonly now?: () => number;
}
export interface ValidationWorkerExecution {
  readonly signal?: AbortSignal;
  readonly referencePixels?: Uint8Array;
  readonly actualPixels?: Uint8Array;
}

export type ValidationWorkerResult =
  | {
      readonly success: true;
      readonly jobId: string;
      readonly task: ValidationTask;
      readonly reference: ValidationReferenceSnapshot;
      readonly projection: SceneProjectionResult;
      readonly renderGraph: RenderGraph;
      readonly report: ValidationReport;
      readonly stages: readonly ValidationStageEvent[];
    }
  | {
      readonly success: false;
      readonly jobId?: string;
      readonly status: "FAILED" | "CANCELLED";
      readonly message: string;
      readonly stages: readonly ValidationStageEvent[];
    };

class CancellationError extends Error {}

function expectedVisual(analysis: ReferenceAnalysis, regionId: string): Record<string, unknown> {
  const shape = analysis.shapeCandidates.find((entry) => entry.regionId === regionId);
  if (!shape) return {};
  return {
    ...(shape.fill ? { fill: shape.fill } : {}),
    ...(shape.stroke ? { stroke: shape.stroke } : {}),
    ...(shape.cornerRadius !== undefined ? { cornerRadius: shape.cornerRadius } : {}),
  };
}

function prepareReference(job: ValidationWorkerJob, graph: RenderGraph): ValidationReferenceSnapshot {
  const regions = new Map(job.analysis.regions.map((region) => [region.id, region]));
  const priorityHints = new Set(["logo", "heading", "hero", "hero-heading", "cta", "navigation", "brand"]);
  const referenceRegionIds = new Map(
    job.proposal.proposedNodes.map((proposed) => [proposed.node.id, `${proposed.sourceRegionId}:${proposed.node.id}`]),
  );
  const mapped = job.proposal.proposedNodes.map((proposed) => {
    const region = regions.get(proposed.sourceRegionId);
    if (!region)
      throw new Error(
        `Proposal node ${proposed.node.id} references missing analysis region ${proposed.sourceRegionId}.`,
      );
    const parentRegionId = proposed.node.parentId ? referenceRegionIds.get(proposed.node.parentId) : undefined;
    return {
      id: referenceRegionIds.get(proposed.node.id) ?? `${region.id}:${proposed.node.id}`,
      sourceRegionId: region.id,
      sourceNodeId: proposed.node.id,
      sourceAssetId: proposed.sourceAssetId,
      ...(parentRegionId ? { parentRegionId } : {}),
      category: region.category,
      bounds: { x: region.bounds.x, y: region.bounds.y, width: region.bounds.width, height: region.bounds.height },
      expectedNode: proposed.node,
      expectedVisual: expectedVisual(job.analysis, region.id),
      priority: region.semanticHints.some((hint) => priorityHints.has(hint.toLowerCase())),
      confidence: proposed.confidence.score,
    };
  });
  const expectedNodeIds = new Set(mapped.map((region) => region.sourceNodeId));
  return createValidationReferenceSnapshot({
    referenceId: job.proposal.proposedDocumentMetadata.reference.id,
    sourceAssetId: job.analysis.sourceAssetId,
    sourceDimensions: job.analysis.sourceDimensions,
    regions: mapped,
    expectedComponentIds: job.proposal.proposedComponents
      .filter((entry) => entry.applied)
      .map((entry) => entry.component.id),
    expectedTokenIds: job.proposal.proposedTokens.filter((entry) => entry.applied).map((entry) => entry.token.id),
    expectedPaintOrderNodeIds: graph.paintOrder.filter((nodeId) => expectedNodeIds.has(nodeId)),
    ...(job.referenceRaster ? { raster: job.referenceRaster } : {}),
  });
}

export function createValidationWorker(options: ValidationWorkerOptions = {}) {
  const now = options.now ?? (() => performance.now());
  const rootLogger = options.logger ?? createLogger();
  return Object.freeze({
    async execute(input: unknown, execution: ValidationWorkerExecution = {}): Promise<ValidationWorkerResult> {
      const stages: ValidationStageEvent[] = [];
      let job: ValidationWorkerJob | undefined;
      const runStage = async <T>(stage: ValidationJobStage, action: () => T | Promise<T>): Promise<T> => {
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
          .info("validation.stage.started", `Started ${stage}.`, { stage, status: "RUNNING" });
        try {
          if (execution.signal?.aborted) throw new CancellationError(`Validation cancelled before ${stage}.`);
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
        const validatedJob = await runStage("VALIDATE_JOB", () => ValidationWorkerJobSchema.parse(input));
        job = validatedJob;
        if (
          validatedJob.analysis.id !== validatedJob.proposal.analysisId ||
          validatedJob.proposal.sourceAssetId !== validatedJob.analysis.sourceAssetId
        )
          throw new Error("Analysis and proposal identities do not match.");
        if (validatedJob.document.metadata.id !== validatedJob.proposal.proposedDocumentMetadata.documentId)
          throw new Error("Document and proposal identities do not match.");
        const viewport = {
          id: validatedJob.proposal.proposedDocumentMetadata.viewportId,
          ...validatedJob.proposal.proposedDocumentMetadata.viewport,
          reducedMotion: false,
        };
        const sceneViewport = { ...viewport, qualityMode: validatedJob.document.settings.qualityMode };
        const projection = await runStage("PROJECT_SCENE", () =>
          projectScene(validatedJob.document, sceneViewport, {
            strictMode: false,
            diagnostics: true,
            inspectionMode: true,
            enableCache: false,
          }),
        );
        if (!projection.complete) throw new Error("Scene Projection is incomplete.");
        const renderGraph = await runStage("BUILD_RENDER_GRAPH", () => buildRenderGraph(projection));
        if (renderGraph.diagnostics.some((entry) => entry.severity === "ERROR"))
          throw new Error("Render Graph contains validation-blocking errors.");
        const task = await runStage("CREATE_TASK", () =>
          createValidationTask({
            projectId: validatedJob.document.metadata.projectId,
            documentId: validatedJob.document.metadata.id,
            documentVersion: validatedJob.document.documentVersion,
            referenceId: validatedJob.proposal.proposedDocumentMetadata.reference.id,
            sourceAssetId: validatedJob.analysis.sourceAssetId,
            referenceAnalysisId: validatedJob.analysis.id,
            viewport,
            rendererVersion: RENDERER_2D_VERSION,
            projectionFingerprint: projection.fingerprint,
            renderGraphFingerprint: renderGraph.fingerprint,
            qualityMode: validatedJob.document.settings.qualityMode,
            thresholdProfile: validatedJob.thresholdProfile,
            requestedMetrics: [...validatedJob.requestedMetrics],
            deterministicSeed: validatedJob.deterministicSeed,
            createdAt: validatedJob.createdAt,
            createdBy: validatedJob.createdBy,
          }),
        );
        const reference = await runStage("PREPARE_REFERENCE", () => prepareReference(validatedJob, renderGraph));
        const raster =
          validatedJob.referenceRaster && validatedJob.actualRaster
            ? {
                reference: {
                  descriptor: validatedJob.referenceRaster,
                  ...(execution.referencePixels ? { pixels: execution.referencePixels } : {}),
                } satisfies RasterSurface,
                actual: {
                  descriptor: validatedJob.actualRaster,
                  ...(execution.actualPixels ? { pixels: execution.actualPixels } : {}),
                } satisfies RasterSurface,
              }
            : undefined;
        const validation = await runStage("COMPARE", () =>
          validateDesign({
            task,
            reference,
            document: validatedJob.document,
            projection,
            renderGraph,
            ...(raster ? { raster } : {}),
            createdAt: validatedJob.createdAt,
          }),
        );
        if (!validation.success) throw new Error(validation.diagnostics.map((entry) => entry.message).join(" "));
        const report = await runStage("CREATE_REPORT", () => validation.report);
        await runStage("COMPLETE", () => undefined);
        return Object.freeze({
          success: true as const,
          jobId: validatedJob.id,
          task,
          reference,
          projection,
          renderGraph,
          report,
          stages: Object.freeze([...stages]),
        });
      } catch (error) {
        return Object.freeze({
          success: false as const,
          ...(job ? { jobId: job.id } : {}),
          status: error instanceof CancellationError ? ("CANCELLED" as const) : ("FAILED" as const),
          message: error instanceof Error ? error.message : "Validation failed.",
          stages: Object.freeze([...stages]),
        });
      }
    },
  });
}

export type ValidationWorker = ReturnType<typeof createValidationWorker>;

export const packageContract: PackageContract = {
  name: "@aevum/validation-worker",
  kind: "app",
  responsibility: "In-memory orchestration of deterministic Visual Validation jobs.",
  owns: "Job validation, stage reporting, cancellation, reference preparation, and validation result assembly.",
  mustNotOwn: "Canonical state, correction execution, queue infrastructure, or placeholder deployment.",
  status: "IMPLEMENTED",
};

export const VALIDATION_WORKER_STATUS = packageContract.status;
