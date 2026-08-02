import { createPhase6Fixture, createReconstructionEngine } from "@aevum/reconstruction";
import { createReconstructionWorker } from "@aevum/reconstruction-worker";
import { createValidationWorker, VALIDATION_JOB_STAGES } from "@aevum/validation-worker";
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

async function reconstructedFixture() {
  const fixture = createPhase6Fixture();
  const reconstructionWorker = createReconstructionWorker({
    engine: createReconstructionEngine({ assetResolver: fixture.resolver }),
    logger: silentLogger,
    now: () => 10,
  });
  const reconstruction = await reconstructionWorker.execute({
    id: "phase-7-reconstruction",
    requestId: "phase-7-reconstruction-request",
    task: fixture.task,
  });
  if (!reconstruction.success) throw new Error("Phase 6 reconstruction fixture failed.");
  return { fixture, reconstruction };
}

describe("Phase 7 complete validation workflow", () => {
  it("validates reconstructed output deterministically without mutating canonical state", async () => {
    const { fixture, reconstruction } = await reconstructedFixture();
    const worker = createValidationWorker({ logger: silentLogger, now: () => 10 });
    const job = {
      id: "phase-7-validation",
      requestId: "phase-7-validation-request",
      document: reconstruction.application.resultingDocument,
      analysis: reconstruction.analysis,
      proposal: reconstruction.proposal,
      thresholdProfile: "STANDARD" as const,
      requestedMetrics: ["LAYOUT", "TYPOGRAPHY", "ASSET", "HIERARCHY", "CONSTRAINT", "RENDER_GRAPH"] as const,
      deterministicSeed: 7,
      createdAt: fixture.task.createdAt,
      createdBy: fixture.task.createdBy,
    };
    const before = structuredClone(reconstruction.application.resultingDocument);
    const first = await worker.execute(job);
    const second = await worker.execute(job);
    expect(first.success && second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(first.report.reportInputFingerprint).toBe(second.report.reportInputFingerprint);
    expect(first.report.id).toBe(second.report.id);
    expect(first.report.status).toBe("PASS");
    expect(first.reference.snapshotFingerprint).toBe(second.reference.snapshotFingerprint);
    expect(first.stages.map((entry) => entry.stage)).toEqual(VALIDATION_JOB_STAGES);
    expect(first.report.differences.every((entry) => entry.property && entry.regionId && entry.sourceNodeId)).toBe(
      true,
    );
    expect(first.report.heatmaps).toHaveLength(5);
    expect(first.report.correctionPlan.executable).toBe(false);
    expect(reconstruction.application.resultingDocument).toEqual(before);
  });

  it("honors cancellation without starting a validation service", async () => {
    const { fixture, reconstruction } = await reconstructedFixture();
    const controller = new AbortController();
    controller.abort();
    const worker = createValidationWorker({ logger: silentLogger });
    const result = await worker.execute(
      {
        id: "phase-7-cancelled",
        requestId: "phase-7-cancelled-request",
        document: reconstruction.application.resultingDocument,
        analysis: reconstruction.analysis,
        proposal: reconstruction.proposal,
        thresholdProfile: "DRAFT",
        requestedMetrics: ["LAYOUT"],
        deterministicSeed: 7,
        createdAt: fixture.task.createdAt,
        createdBy: fixture.task.createdBy,
      },
      { signal: controller.signal },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.status).toBe("CANCELLED");
    expect(result.stages[0]?.stage).toBe("VALIDATE_JOB");
    expect(result.stages[0]?.status).toBe("CANCELLED");
  });
});
