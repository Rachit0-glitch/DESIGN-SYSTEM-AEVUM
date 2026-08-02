import { createEmptyDocumentFixture, createEntityId, validateDocument } from "@aevum/document-model";
import { createReconstructionEngine, createReconstructionTask, createPhase6Fixture } from "@aevum/reconstruction";
import { createReconstructionWorker, RECONSTRUCTION_JOB_STAGES } from "@aevum/reconstruction-worker";
import { describe, expect, it } from "vitest";

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return this;
  },
};

describe("Phase 6 complete reconstruction workflow", () => {
  it("runs screenshot to report through the Command Engine, Scene Runtime, and Render Graph", async () => {
    const fixture = createPhase6Fixture();
    const engine = createReconstructionEngine({ assetResolver: fixture.resolver });
    const events: string[] = [];
    const worker = createReconstructionWorker({
      engine,
      logger: silentLogger,
      onStage: (event) => {
        if (event.status === "COMPLETED") events.push(event.stage);
      },
    });
    const result = await worker.execute({ id: "phase-6-e2e", requestId: "phase-6-request", task: fixture.task });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(validateDocument(result.application.resultingDocument).success).toBe(true);
    expect(Object.values(result.application.resultingDocument.nodes).some((node) => node.type === "PAGE")).toBe(true);
    expect(Object.values(result.application.resultingDocument.nodes).some((node) => node.type === "FRAME")).toBe(true);
    expect(Object.values(result.application.resultingDocument.nodes).some((node) => node.type === "TEXT")).toBe(true);
    expect(
      Object.values(result.application.resultingDocument.nodes).some(
        (node) => node.type === "IMAGE" || node.type === "SHAPE",
      ),
    ).toBe(true);
    expect(result.projection.complete).toBe(true);
    expect(result.renderGraph.operations.size).toBeGreaterThan(0);
    expect(result.report.sceneProjection.complete).toBe(true);
    expect(result.report.renderGraph.complete).toBe(true);
    expect(events).toEqual(RECONSTRUCTION_JOB_STAGES);
  });

  it("is deterministic across complete executions apart from timing metadata", async () => {
    const fixture = createPhase6Fixture();
    const engine = createReconstructionEngine({ assetResolver: fixture.resolver });
    const worker = createReconstructionWorker({ engine, logger: silentLogger, now: () => 10 });
    const job = { id: "phase-6-repeat", requestId: "phase-6-repeat-request", task: fixture.task };
    const first = await worker.execute(job);
    const second = await worker.execute(job);
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.analysis.analysisFingerprint).toBe(second.analysis.analysisFingerprint);
      expect(first.proposal.proposalFingerprint).toBe(second.proposal.proposalFingerprint);
      expect(first.application.resultingDocument).toEqual(second.application.resultingDocument);
      expect(first.projection.fingerprint).toBe(second.projection.fingerprint);
      expect(first.renderGraph.fingerprint).toBe(second.renderGraph.fingerprint);
      expect(first.report.reportInputFingerprint).toBe(second.report.reportInputFingerprint);
    }
  });

  it("adds a page to an explicitly versioned existing document", async () => {
    const fixture = createPhase6Fixture();
    const existing = createEmptyDocumentFixture();
    const task = createReconstructionTask({
      projectId: existing.metadata.projectId,
      sourceAssetId: fixture.asset.id,
      requestedPageName: "Imported reference",
      qualityMode: "DRAFT",
      targetViewport: fixture.task.targetViewport,
      targetDocumentId: existing.metadata.id,
      expectedDocumentVersion: existing.documentVersion,
      preserveEditability: true,
      allowRasterFallbacks: true,
      requestedCapabilities: fixture.task.requestedCapabilities,
      deterministicSeed: 7,
      createdAt: fixture.task.createdAt,
      createdBy: fixture.task.createdBy,
    });
    const worker = createReconstructionWorker({
      engine: createReconstructionEngine({ assetResolver: fixture.resolver }),
      logger: silentLogger,
    });
    const result = await worker.execute({
      id: "phase-6-existing",
      requestId: "phase-6-existing-request",
      task,
      existingDocument: existing,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.application.previousDocumentVersion).toBe(existing.documentVersion);
      expect(result.application.resultingDocument.metadata.id).toBe(existing.metadata.id);
      expect(result.application.resultingDocument.pages).toHaveLength(1);
      expect(existing.pages).toHaveLength(0);
    }
  });

  it("blocks a stale existing-document version before mutation", async () => {
    const fixture = createPhase6Fixture();
    const existing = createEmptyDocumentFixture();
    const task = createReconstructionTask({
      projectId: existing.metadata.projectId,
      sourceAssetId: fixture.asset.id,
      qualityMode: "DRAFT",
      targetViewport: fixture.task.targetViewport,
      targetDocumentId: existing.metadata.id,
      expectedDocumentVersion: existing.documentVersion + 1,
      preserveEditability: true,
      allowRasterFallbacks: true,
      requestedCapabilities: ["REGION_DETECTION"],
      deterministicSeed: 8,
      createdAt: fixture.task.createdAt,
      createdBy: fixture.task.createdBy,
    });
    const before = structuredClone(existing);
    const worker = createReconstructionWorker({
      engine: createReconstructionEngine({ assetResolver: fixture.resolver }),
      logger: silentLogger,
    });
    const result = await worker.execute({
      id: "phase-6-stale",
      requestId: "phase-6-stale-request",
      task,
      existingDocument: existing,
    });
    expect(result.success).toBe(false);
    expect(existing).toEqual(before);
  });

  it("honors cancellation and emits a cancelled stage", async () => {
    const fixture = createPhase6Fixture();
    const controller = new AbortController();
    controller.abort();
    const events: string[] = [];
    const worker = createReconstructionWorker({
      engine: createReconstructionEngine({ assetResolver: fixture.resolver }),
      logger: silentLogger,
      onStage: (event) => events.push(`${event.stage}:${event.status}`),
    });
    const result = await worker.execute(
      { id: "phase-6-cancel", requestId: "phase-6-cancel-request", task: fixture.task },
      { signal: controller.signal },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.status).toBe("CANCELLED");
    expect(events).toContain("VALIDATE_TASK:CANCELLED");
  });

  it("rejects invalid worker job payloads with a structured failure", async () => {
    const fixture = createPhase6Fixture();
    const worker = createReconstructionWorker({
      engine: createReconstructionEngine({ assetResolver: fixture.resolver }),
      logger: silentLogger,
    });
    const result = await worker.execute({ id: createEntityId("artifact"), requestId: "missing-task" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.status).toBe("FAILED");
  });
});
