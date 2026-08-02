import { createEntityId, type CanonicalDesignDocument } from "@aevum/document-model";
import { createPhase6Fixture, createReconstructionEngine } from "@aevum/reconstruction";
import { buildRenderGraph } from "@aevum/renderer-2d";
import { projectScene } from "@aevum/scene-runtime";
import {
  buildHeatmap,
  compareStructure,
  createDeterministicLocalRasterAdapter,
  createValidationReferenceSnapshot,
  createValidationTask,
  deserializeCorrectionPlan,
  deserializeValidationReference,
  deserializeValidationReport,
  deserializeValidationTask,
  getThresholdProfile,
  serializeCorrectionPlan,
  serializeValidationReference,
  serializeValidationReport,
  serializeValidationTask,
  validateDesign,
  validateValidationTask,
  type ValidationMetric,
  type ValidationReferenceSnapshot,
  type ValidationTask,
} from "@aevum/validation";
import { createValidationWorker } from "@aevum/validation-worker";
import { describe, expect, it } from "vitest";

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

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return this;
  },
};

async function baseline() {
  const fixture = createPhase6Fixture();
  const engine = createReconstructionEngine({ assetResolver: fixture.resolver });
  const analysisResult = engine.analyze(fixture.task);
  if (!analysisResult.success) throw new Error(analysisResult.diagnostics[0]?.message);
  const proposalResult = engine.createProposal(fixture.task, analysisResult.analysis);
  if (!proposalResult.success) throw new Error(proposalResult.diagnostics[0]?.message);
  const application = engine.apply(proposalResult.proposal, fixture.task);
  if (!application.success) throw new Error(application.diagnostics[0]?.message);
  const worker = createValidationWorker({ logger: silentLogger, now: () => 10 });
  const result = await worker.execute({
    id: "phase-7-unit",
    requestId: "phase-7-unit-request",
    document: application.result.resultingDocument,
    analysis: analysisResult.analysis,
    proposal: proposalResult.proposal,
    thresholdProfile: "STANDARD",
    requestedMetrics: METRICS,
    deterministicSeed: 7,
    createdAt: fixture.task.createdAt,
    createdBy: fixture.task.createdBy,
  });
  if (!result.success) throw new Error(result.message);
  return {
    ...result,
    document: application.result.resultingDocument,
    analysis: analysisResult.analysis,
    proposal: proposalResult.proposal,
  };
}

function taskFor(
  original: ValidationTask,
  document: CanonicalDesignDocument,
  projectionFingerprint: string,
  renderGraphFingerprint: string,
  requestedMetrics: ValidationMetric[] = METRICS,
) {
  return createValidationTask({
    projectId: document.metadata.projectId,
    documentId: document.metadata.id,
    documentVersion: document.documentVersion,
    referenceId: original.referenceId,
    sourceAssetId: original.sourceAssetId,
    referenceAnalysisId: original.referenceAnalysisId,
    viewport: original.viewport,
    rendererVersion: original.rendererVersion,
    projectionFingerprint,
    renderGraphFingerprint,
    qualityMode: document.settings.qualityMode,
    thresholdProfile: original.thresholdProfile,
    requestedMetrics,
    deterministicSeed: original.deterministicSeed,
    createdAt: original.createdAt,
    createdBy: original.createdBy,
  });
}

async function validateDocumentAgainstReference(
  base: Awaited<ReturnType<typeof baseline>>,
  document: CanonicalDesignDocument,
  reference: ValidationReferenceSnapshot = base.reference,
  requestedMetrics: ValidationMetric[] = METRICS,
) {
  const projection = projectScene(
    document,
    { ...base.task.viewport, qualityMode: document.settings.qualityMode },
    { strictMode: false, diagnostics: true, inspectionMode: true, enableCache: false },
  );
  const renderGraph = buildRenderGraph(projection);
  const task = taskFor(base.task, document, projection.fingerprint, renderGraph.fingerprint, requestedMetrics);
  const result = validateDesign({ task, reference, document, projection, renderGraph, createdAt: base.task.createdAt });
  if (!result.success) throw new Error(result.diagnostics[0]?.message);
  return { task, projection, renderGraph, report: result.report };
}

describe("Phase 7 validation contracts", () => {
  it("creates deterministic immutable versioned tasks and validates external input", async () => {
    const first = await baseline();
    const second = await baseline();
    expect(first.task.id).toBe(second.task.id);
    expect(first.task.taskVersion).toBe("1.0.0");
    expect(validateValidationTask(first.task).success).toBe(true);
    expect(validateValidationTask({ ...first.task, documentVersion: 0 }).success).toBe(false);
    expect(Object.isFrozen(first.task)).toBe(true);
  });

  it("provides progressively stricter immutable threshold profiles", () => {
    const draft = getThresholdProfile("DRAFT");
    const standard = getThresholdProfile("STANDARD");
    const highQuality = getThresholdProfile("HIGH_QUALITY");
    const pixelPerfect = getThresholdProfile("PIXEL_PERFECT");
    expect(draft.tolerances.positionPx).toBeGreaterThan(standard.tolerances.positionPx);
    expect(standard.tolerances.positionPx).toBeGreaterThan(highQuality.tolerances.positionPx);
    expect(pixelPerfect.tolerances.positionPx).toBe(0);
    expect(pixelPerfect.minimumScores.overall).toBe(1);
    expect(Object.isFrozen(pixelPerfect)).toBe(true);
  });

  it("performs deterministic local RGBA comparison and honest checksum fallback", () => {
    const checksumA = `sha256:${"a".repeat(64)}`;
    const checksumB = `sha256:${"b".repeat(64)}`;
    const adapter = createDeterministicLocalRasterAdapter();
    const descriptor = { width: 1, height: 1, channels: 4 as const, checksum: checksumA, colorSpace: "SRGB" as const };
    const exact = adapter.compare({
      reference: { descriptor, pixels: Uint8Array.from([0, 10, 20, 255]) },
      actual: { descriptor, pixels: Uint8Array.from([0, 10, 20, 255]) },
    });
    const changed = adapter.compare({
      reference: { descriptor, pixels: Uint8Array.from([0, 0, 0, 255]) },
      actual: { descriptor: { ...descriptor, checksum: checksumB }, pixels: Uint8Array.from([255, 0, 0, 255]) },
    });
    const fallback = adapter.compare({
      reference: { descriptor },
      actual: { descriptor: { ...descriptor, checksum: checksumB } },
    });
    expect(exact.score).toBe(1);
    expect(exact.comparedPixels).toBe(1);
    expect(changed.meanAbsoluteError).toBeCloseTo(0.25);
    expect(fallback.placeholder).toBe(true);
    expect(fallback.score).toBe(0);
  });

  it("attributes layout and typography differences and proposes review-only commands", async () => {
    const base = await baseline();
    const document = structuredClone(base.document);
    const text = Object.values(document.nodes).find((node) => node.type === "TEXT");
    if (text?.type !== "TEXT") throw new Error("Phase 6 fixture has no text node.");
    text.transform.position.x += 40;
    text.content = `${text.content} changed`;
    const before = structuredClone(document);
    const result = await validateDocumentAgainstReference(base, document);
    expect(
      result.report.differences.some((entry) => entry.sourceNodeId === text.id && entry.property === "bounds.x"),
    ).toBe(true);
    expect(
      result.report.differences.some((entry) => entry.sourceNodeId === text.id && entry.property === "text.content"),
    ).toBe(true);
    expect(result.report.correctionPlan.executable).toBe(false);
    expect(result.report.correctionPlan.requiresCommandEngine).toBe(true);
    expect(
      result.report.correctionPlan.suggestions.every(
        (entry) => entry.commandType === "node.update" && entry.requiresReview,
      ),
    ).toBe(true);
    expect(document).toEqual(before);
  });

  it("compares assets, visual metadata, components, tokens, paint order, and render graph", async () => {
    const base = await baseline();
    const imageRegion = base.reference.regions.find((region) => region.expectedNode.type === "IMAGE");
    if (imageRegion?.expectedNode.type !== "IMAGE") throw new Error("Phase 6 fixture has no image region.");
    const missingAssetId = createEntityId("asset");
    const regions = base.reference.regions.map((region) =>
      region.id === imageRegion.id
        ? {
            ...region,
            expectedNode: { ...imageRegion.expectedNode, assetId: missingAssetId },
            expectedVisual: { ...region.expectedVisual, fill: "#000000" },
          }
        : region,
    );
    const reference = createValidationReferenceSnapshot({
      referenceId: base.reference.referenceId,
      sourceAssetId: base.reference.sourceAssetId,
      sourceDimensions: base.reference.sourceDimensions,
      regions,
      expectedComponentIds: [createEntityId("component")],
      expectedTokenIds: [createEntityId("token")],
      expectedPaintOrderNodeIds: [createEntityId("node")],
    });
    const structural = compareStructure(reference, base.document, base.projection, base.renderGraph);
    const result = await validateDocumentAgainstReference(base, base.document, reference);
    const metrics = new Set(result.report.differences.map((entry) => entry.metric));
    for (const metric of ["ASSET", "COLOR", "COMPONENT", "TOKEN", "PAINT_ORDER"] as const) {
      expect(metrics.has(metric)).toBe(true);
    }
    expect(structural.differences.some((entry) => entry.metric === "RENDER_GRAPH")).toBe(false);
    expect(result.report.scores.asset).toBeLessThan(1);
  });

  it("applies normalized color tolerance and scopes work to requested metrics", async () => {
    const base = await baseline();
    const colorRegion = base.reference.regions.find((region) => {
      const fill = region.expectedVisual.fill;
      return fill && typeof fill === "object" && !Array.isArray(fill);
    });
    if (!colorRegion) throw new Error("Phase 6 fixture has no color region.");
    const fill = colorRegion.expectedVisual.fill as Record<string, number>;
    const referenceWithRed = (red: number) =>
      createValidationReferenceSnapshot({
        referenceId: base.reference.referenceId,
        sourceAssetId: base.reference.sourceAssetId,
        sourceDimensions: base.reference.sourceDimensions,
        regions: base.reference.regions.map((region) =>
          region.id === colorRegion.id
            ? { ...region, expectedVisual: { ...region.expectedVisual, fill: { ...fill, r: red } } }
            : region,
        ),
        expectedComponentIds: base.reference.expectedComponentIds,
        expectedTokenIds: base.reference.expectedTokenIds,
        expectedPaintOrderNodeIds: base.reference.expectedPaintOrderNodeIds,
      });
    const close = await validateDocumentAgainstReference(
      base,
      base.document,
      referenceWithRed(Math.max(0, (fill.r ?? 0) - 0.01)),
      ["COLOR"],
    );
    const far = await validateDocumentAgainstReference(base, base.document, referenceWithRed(0), ["COLOR"]);
    expect(close.report.differences.some((entry) => entry.metric === "COLOR")).toBe(false);
    expect(far.report.differences.some((entry) => entry.metric === "COLOR")).toBe(true);
    expect(far.report.regions.every((region) => region.metrics.every((metric) => metric.metric === "COLOR"))).toBe(
      true,
    );
  });

  it("generates deterministic region heatmaps from attributed differences", async () => {
    const base = await baseline();
    const document = structuredClone(base.document);
    const node = Object.values(document.nodes).find((entry) => entry.type === "FRAME");
    if (!node) throw new Error("Phase 6 fixture has no frame node.");
    node.transform.position.y += 20;
    const result = await validateDocumentAgainstReference(base, document);
    const first = buildHeatmap(base.reference, result.report.differences, "LAYOUT");
    const second = buildHeatmap(base.reference, result.report.differences, "LAYOUT");
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.cells.length).toBeGreaterThan(0);
    expect(first.cells.every((cell) => cell.intensity >= 0 && cell.intensity <= 1)).toBe(true);
    expect(first.placeholder).toBe(true);
  });

  it("round-trips tasks, references, reports, and correction plans", async () => {
    const base = await baseline();
    expect(deserializeValidationTask(serializeValidationTask(base.task))).toEqual(base.task);
    expect(deserializeValidationReference(serializeValidationReference(base.reference))).toEqual(base.reference);
    expect(deserializeValidationReport(serializeValidationReport(base.report))).toEqual(base.report);
    expect(deserializeCorrectionPlan(serializeCorrectionPlan(base.report.correctionPlan))).toEqual(
      base.report.correctionPlan,
    );
    expect(Object.isFrozen(base.report)).toBe(true);
  });

  it("reports unavailable raster evidence instead of claiming a comparison", async () => {
    const base = await baseline();
    const result = await validateDocumentAgainstReference(base, base.document, base.reference, ["RASTER"]);
    expect(result.report.raster.placeholder).toBe(true);
    expect(result.report.raster.score).toBe(0);
    expect(result.report.regions.every((region) => region.metrics.length === 0)).toBe(true);
    expect(result.report.diagnostics.some((entry) => entry.code === "RASTER_UNAVAILABLE")).toBe(true);
    expect(result.report.status).toBe("FAIL");
  });
});
