import { CURRENT_COMMAND_VERSION, createCommandId, createTransactionId, executeCommand } from "@aevum/command-engine";
import { createPhase6Fixture, createReconstructionEngine } from "@aevum/reconstruction";
import { buildRenderGraph, RENDERER_2D_VERSION } from "@aevum/renderer-2d";
import { projectScene } from "@aevum/scene-runtime";
import {
  createValidationTask,
  validateDesign,
  type ValidationMetric,
  type ValidationReferenceSnapshot,
  type ValidationReport,
  type ValidationTask,
} from "@aevum/validation";
import { createValidationWorker } from "@aevum/validation-worker";
import type { CanonicalDesignDocument } from "@aevum/document-model";

const METRICS: ValidationMetric[] = [
  "LAYOUT",
  "POSITION",
  "SIZE",
  "TYPOGRAPHY",
  "COLOR",
  "BORDER",
  "RADIUS",
  "SHADOW",
  "GRADIENT",
  "IMAGE",
  "ASSET",
  "VISIBILITY",
  "OPACITY",
  "HIERARCHY",
  "COMPONENT",
  "TOKEN",
  "CONSTRAINT",
  "PAINT_ORDER",
  "RENDER_GRAPH",
];

export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return this;
  },
};

async function validateDocument(
  document: CanonicalDesignDocument,
  baselineTask: ValidationTask,
  reference: ValidationReferenceSnapshot,
  createdAt: string,
): Promise<{ task: ValidationTask; report: ValidationReport }> {
  const projection = projectScene(
    document,
    { ...baselineTask.viewport, qualityMode: document.settings.qualityMode },
    { strictMode: false, diagnostics: true, inspectionMode: true, enableCache: false },
  );
  const renderGraph = buildRenderGraph(projection);
  const task = createValidationTask({
    projectId: document.metadata.projectId,
    documentId: document.metadata.id,
    documentVersion: document.documentVersion,
    referenceId: baselineTask.referenceId,
    sourceAssetId: baselineTask.sourceAssetId,
    referenceAnalysisId: baselineTask.referenceAnalysisId,
    viewport: baselineTask.viewport,
    rendererVersion: RENDERER_2D_VERSION,
    projectionFingerprint: projection.fingerprint,
    renderGraphFingerprint: renderGraph.fingerprint,
    qualityMode: document.settings.qualityMode,
    thresholdProfile: baselineTask.thresholdProfile,
    requestedMetrics: [...baselineTask.requestedMetrics],
    deterministicSeed: baselineTask.deterministicSeed,
    createdAt,
    createdBy: baselineTask.createdBy,
  });
  const validation = validateDesign({ task, reference, document, projection, renderGraph, createdAt });
  if (!validation.success) throw new Error(validation.diagnostics[0]?.message);
  return { task, report: validation.report };
}

let cached: Promise<Awaited<ReturnType<typeof buildCorrectionFixture>>> | undefined;

async function buildCorrectionFixture() {
  const fixture = createPhase6Fixture();
  const reconstruction = createReconstructionEngine({ assetResolver: fixture.resolver });
  const analysisResult = reconstruction.analyze(fixture.task);
  if (!analysisResult.success) throw new Error(analysisResult.diagnostics[0]?.message);
  const proposalResult = reconstruction.createProposal(fixture.task, analysisResult.analysis);
  if (!proposalResult.success) throw new Error(proposalResult.diagnostics[0]?.message);
  const application = reconstruction.apply(proposalResult.proposal, fixture.task);
  if (!application.success) throw new Error(application.diagnostics[0]?.message);
  const originalDocument = application.result.resultingDocument;
  const validationWorker = createValidationWorker({ logger: silentLogger, now: () => 10 });
  const originalValidation = await validationWorker.execute({
    id: "phase-8-reference",
    requestId: "phase-8-reference-request",
    document: originalDocument,
    analysis: analysisResult.analysis,
    proposal: proposalResult.proposal,
    thresholdProfile: "STANDARD",
    requestedMetrics: METRICS,
    deterministicSeed: 8,
    createdAt: fixture.task.createdAt,
    createdBy: fixture.task.createdBy,
  });
  if (!originalValidation.success) throw new Error(originalValidation.message);
  const text = Object.values(originalDocument.nodes).find((node) => node.type === "TEXT");
  if (text?.type !== "TEXT") throw new Error("Phase 8 fixture requires a text node.");
  const shiftedTransform = {
    ...text.transform,
    position: { ...text.transform.position, x: text.transform.position.x + 40 },
  };
  const shiftedDocument = executeCommand(originalDocument, {
    id: createCommandId(),
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: originalDocument.metadata.id,
    expectedDocumentVersion: originalDocument.documentVersion,
    timestamp: fixture.task.createdAt,
    actor: fixture.task.createdBy,
    correlationId: "phase-8-fixture-shift",
    transactionId: createTransactionId(),
    type: "node.update",
    payload: {
      nodeId: text.id,
      changes: { transform: shiftedTransform, content: `${text.content} changed` },
    },
  }).newDocument;
  const baseline = await validateDocument(
    shiftedDocument,
    originalValidation.task,
    originalValidation.reference,
    fixture.task.createdAt,
  );
  return Object.freeze({
    fixture,
    originalDocument,
    shiftedDocument,
    textNodeId: text.id,
    originalText: text.content,
    originalX: text.transform.position.x,
    reference: originalValidation.reference,
    baselineTask: baseline.task,
    baselineReport: baseline.report,
    revalidate: (document: CanonicalDesignDocument) =>
      validateDocument(document, baseline.task, originalValidation.reference, fixture.task.createdAt).then(
        (result) => result.report,
      ),
  });
}

export function createCorrectionFixture() {
  cached ??= buildCorrectionFixture();
  return cached;
}
