import { createCorrectionWorker, CORRECTION_JOB_STAGES } from "@aevum/correction-worker";
import { describe, expect, it } from "vitest";
import { createCorrectionFixture, silentLogger } from "../helpers/correction-fixture.js";

describe("Phase 8 complete correction workflow", () => {
  it("runs correction through Command Engine transactions and real revalidation", async () => {
    const fixture = await createCorrectionFixture();
    const worker = createCorrectionWorker({ logger: silentLogger, now: () => 10 });
    const before = structuredClone(fixture.shiftedDocument);
    const result = await worker.execute({
      id: "phase-8-worker",
      requestId: "phase-8-worker-request",
      document: fixture.shiftedDocument,
      baselineTask: fixture.baselineTask,
      reference: fixture.reference,
      baselineReport: fixture.baselineReport,
      configuration: { maxPasses: 3, targetOverallScore: 1, minimumConfidence: 0, minimumImprovement: 0.0001 },
      createdAt: fixture.fixture.task.createdAt,
      createdBy: fixture.fixture.task.createdBy,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.stages.map((entry) => entry.stage)).toEqual(CORRECTION_JOB_STAGES);
    expect(result.document.documentVersion).toBe(fixture.shiftedDocument.documentVersion + 1);
    expect(result.document.nodes[fixture.textNodeId]?.transform.position.x).toBe(fixture.originalX);
    expect(result.report.improvementScore).toBeGreaterThan(0);
    expect(result.report.acceptedCandidateIds.length).toBeGreaterThan(0);
    expect(result.report.stopReason).toBe("NO_CANDIDATES");
    expect(fixture.shiftedDocument).toEqual(before);
  });

  it("honors cancellation before any correction transaction", async () => {
    const fixture = await createCorrectionFixture();
    const controller = new AbortController();
    controller.abort();
    const worker = createCorrectionWorker({ logger: silentLogger });
    const result = await worker.execute(
      {
        id: "phase-8-cancelled",
        requestId: "phase-8-cancelled-request",
        document: fixture.shiftedDocument,
        baselineTask: fixture.baselineTask,
        reference: fixture.reference,
        baselineReport: fixture.baselineReport,
        createdAt: fixture.fixture.task.createdAt,
        createdBy: fixture.fixture.task.createdBy,
      },
      { signal: controller.signal },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.status).toBe("CANCELLED");
    expect(result.stages[0]?.stage).toBe("VALIDATE_JOB");
    expect(result.stages[0]?.status).toBe("CANCELLED");
  });
});
