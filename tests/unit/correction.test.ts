import {
  applyCorrection,
  compileCorrectionTransaction,
  createCorrectionEngine,
  createCorrectionSession,
  deserializeCorrectionReport,
  deserializeCorrectionSession,
  deserializeCorrectionTransaction,
  dryRunCorrection,
  evaluateCorrection,
  generateCorrectionCandidates,
  serializeCorrectionReport,
  serializeCorrectionSession,
  serializeCorrectionTransaction,
  validateCorrectionSession,
} from "@aevum/correction";
import { describe, expect, it } from "vitest";
import { createCorrectionFixture } from "../helpers/correction-fixture.js";

function sessionInput(fixture: Awaited<ReturnType<typeof createCorrectionFixture>>) {
  return {
    document: fixture.shiftedDocument,
    baselineReport: fixture.baselineReport,
    configuration: { maxPasses: 3, targetOverallScore: 1, minimumConfidence: 0, minimumImprovement: 0.0001 },
    createdAt: fixture.fixture.task.createdAt,
    createdBy: fixture.fixture.task.createdBy,
  } as const;
}

describe("Phase 8 correction contracts", () => {
  it("creates deterministic immutable versioned sessions", async () => {
    const fixture = await createCorrectionFixture();
    const first = createCorrectionSession(sessionInput(fixture));
    const second = createCorrectionSession(sessionInput(fixture));
    expect(first.id).toBe(second.id);
    expect(first.sessionVersion).toBe("1.0.0");
    expect(first.status).toBe("CREATED");
    expect(validateCorrectionSession(first).success).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(deserializeCorrectionSession(serializeCorrectionSession(first))).toEqual(first);
  });

  it("generates deterministic safe candidates and refuses content invention", async () => {
    const fixture = await createCorrectionFixture();
    const session = createCorrectionSession(sessionInput(fixture));
    const first = generateCorrectionCandidates({
      session,
      passNumber: 1,
      report: fixture.baselineReport,
      document: fixture.shiftedDocument,
    });
    const second = generateCorrectionCandidates({
      session,
      passNumber: 1,
      report: fixture.baselineReport,
      document: fixture.shiftedDocument,
    });
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.candidates.some((entry) => entry.property === "POSITION")).toBe(true);
    expect(first.rejected.some((entry) => entry.reason === "CONTENT_CHANGE_FORBIDDEN")).toBe(true);
    expect(first.candidates.every((entry) => !("content" in entry.changes))).toBe(true);
  });

  it("enforces protected properties and locked nodes", async () => {
    const fixture = await createCorrectionFixture();
    const protectedSession = createCorrectionSession({
      ...sessionInput(fixture),
      configuration: {
        ...sessionInput(fixture).configuration,
        protectedProperties: [{ nodeId: fixture.textNodeId, property: "POSITION", reason: "Approved placement" }],
      },
    });
    const protectedResult = generateCorrectionCandidates({
      session: protectedSession,
      passNumber: 1,
      report: fixture.baselineReport,
      document: fixture.shiftedDocument,
    });
    const lockedDocument = structuredClone(fixture.shiftedDocument);
    const lockedNode = lockedDocument.nodes[fixture.textNodeId];
    if (!lockedNode) throw new Error("Fixture text node is missing.");
    lockedNode.locked = true;
    const lockedResult = generateCorrectionCandidates({
      session: createCorrectionSession({ ...sessionInput(fixture), document: lockedDocument }),
      passNumber: 1,
      report: fixture.baselineReport,
      document: lockedDocument,
    });
    expect(protectedResult.candidates.some((entry) => entry.property === "POSITION")).toBe(false);
    expect(protectedResult.rejected.some((entry) => entry.reason === "PROTECTED_PROPERTY")).toBe(true);
    expect(lockedResult.rejected.some((entry) => entry.reason === "LOCKED_NODE")).toBe(true);
  });

  it("compiles deterministic candidates into one atomic Command Engine transaction", async () => {
    const fixture = await createCorrectionFixture();
    const session = createCorrectionSession(sessionInput(fixture));
    const generation = generateCorrectionCandidates({
      session,
      passNumber: 1,
      report: fixture.baselineReport,
      document: fixture.shiftedDocument,
    });
    const input = {
      session,
      passNumber: 1,
      candidates: generation.candidates,
      document: fixture.shiftedDocument,
      timestamp: fixture.fixture.task.createdAt,
    };
    const first = compileCorrectionTransaction(input);
    const second = compileCorrectionTransaction(input);
    expect(first).toEqual(second);
    expect(first.commands.length).toBeGreaterThan(0);
    expect(new Set(first.commands.map((entry) => entry.transactionId))).toEqual(new Set([first.transactionId]));
    expect(
      first.commands.every((entry) => entry.expectedDocumentVersion === fixture.shiftedDocument.documentVersion),
    ).toBe(true);
    expect(deserializeCorrectionTransaction(serializeCorrectionTransaction(first))).toEqual(first);
  });

  it("dry-runs, revalidates, and applies an accepted correction without mutating the source", async () => {
    const fixture = await createCorrectionFixture();
    const session = createCorrectionSession(sessionInput(fixture));
    const generation = generateCorrectionCandidates({
      session,
      passNumber: 1,
      report: fixture.baselineReport,
      document: fixture.shiftedDocument,
    });
    const plan = compileCorrectionTransaction({
      session,
      passNumber: 1,
      candidates: generation.candidates,
      document: fixture.shiftedDocument,
      timestamp: fixture.fixture.task.createdAt,
    });
    const before = structuredClone(fixture.shiftedDocument);
    const dryRun = dryRunCorrection(plan, fixture.shiftedDocument);
    expect(dryRun.success).toBe(true);
    if (!dryRun.success) return;
    const candidateReport = await fixture.revalidate(dryRun.resultingDocument);
    const evaluation = evaluateCorrection({
      baselineReport: fixture.baselineReport,
      candidateReport,
      candidateDocument: dryRun.resultingDocument,
      configuration: session.configuration,
      transactionPlan: plan,
    });
    const applied = applyCorrection(plan, fixture.shiftedDocument, evaluation);
    expect(evaluation.accepted).toBe(true);
    expect(applied.success).toBe(true);
    if (applied.success) {
      expect(applied.resultingDocument.documentVersion).toBe(fixture.shiftedDocument.documentVersion + 1);
      expect(applied.auditRecord.result).toBe("SUCCEEDED");
      expect(applied.resultingDocument.nodes[fixture.textNodeId]?.transform.position.x).toBe(fixture.originalX);
      expect((applied.resultingDocument.nodes[fixture.textNodeId] as { content?: string }).content).not.toBe(
        fixture.originalText,
      );
    }
    expect(fixture.shiftedDocument).toEqual(before);
  });

  it("rolls back a failed dry run and blocks rejected evaluations", async () => {
    const fixture = await createCorrectionFixture();
    const session = createCorrectionSession(sessionInput(fixture));
    const generation = generateCorrectionCandidates({
      session,
      passNumber: 1,
      report: fixture.baselineReport,
      document: fixture.shiftedDocument,
    });
    const unsafe = { ...generation.candidates[0], changes: { dimensions: "invalid" } };
    if (!unsafe.id) throw new Error("Fixture correction candidate is missing.");
    const plan = compileCorrectionTransaction({
      session,
      passNumber: 1,
      candidates: [unsafe],
      document: fixture.shiftedDocument,
      timestamp: fixture.fixture.task.createdAt,
    });
    const before = structuredClone(fixture.shiftedDocument);
    const dryRun = dryRunCorrection(plan, fixture.shiftedDocument);
    expect(dryRun.success).toBe(false);
    expect(fixture.shiftedDocument).toEqual(before);
    const rejected = {
      accepted: false,
      reasons: ["OVERALL_NOT_IMPROVED"],
      transactionPlanId: plan.id,
      candidateDocumentVersion: fixture.shiftedDocument.documentVersion + 1,
      candidateDocumentFingerprint: `sha256:${"b".repeat(64)}`,
      baselineReportId: fixture.baselineReport.id,
      candidateReportId: fixture.baselineReport.id,
      overallBefore: 0,
      overallAfter: 0,
      overallDelta: 0,
      worstRegionBefore: 0,
      worstRegionAfter: 0,
      layoutBefore: 0,
      layoutAfter: 0,
      typographyBefore: 0,
      typographyAfter: 0,
      confidenceBefore: 0,
      confidenceAfter: 0,
      protectedRegionIds: [],
      regressedRegionIds: [],
      fingerprint: `sha256:${"a".repeat(64)}`,
    } as const;
    expect(applyCorrection(plan, fixture.shiftedDocument, rejected).success).toBe(false);
  });

  it("detects protected-region and score regressions", async () => {
    const fixture = await createCorrectionFixture();
    const protectedRegionId = fixture.baselineReport.regions.find(
      (region) => region.sourceNodeId === fixture.textNodeId,
    )?.regionId;
    if (!protectedRegionId) throw new Error("Fixture text validation region is missing.");
    const session = createCorrectionSession({
      ...sessionInput(fixture),
      configuration: {
        ...sessionInput(fixture).configuration,
        protectedRegionIds: [protectedRegionId],
      },
    });
    const generation = generateCorrectionCandidates({
      session,
      passNumber: 1,
      report: fixture.baselineReport,
      document: fixture.shiftedDocument,
    });
    const plan = compileCorrectionTransaction({
      session,
      passNumber: 1,
      candidates: generation.candidates,
      document: fixture.shiftedDocument,
      timestamp: fixture.fixture.task.createdAt,
    });
    const dryRun = dryRunCorrection(plan, fixture.shiftedDocument);
    if (!dryRun.success) throw new Error(dryRun.message);
    const candidateReport = await fixture.revalidate(dryRun.resultingDocument);
    const protectedEvaluation = evaluateCorrection({
      baselineReport: fixture.baselineReport,
      candidateReport,
      candidateDocument: dryRun.resultingDocument,
      configuration: session.configuration,
      transactionPlan: plan,
    });
    const regressedReport = {
      ...candidateReport,
      scores: { ...candidateReport.scores, overall: 0, layout: 0, typography: 0, worstRegion: 0 },
    };
    const regression = evaluateCorrection({
      baselineReport: fixture.baselineReport,
      candidateReport: regressedReport,
      candidateDocument: dryRun.resultingDocument,
      configuration: { ...session.configuration, protectedRegionIds: [] },
      transactionPlan: plan,
    });
    expect(protectedEvaluation.reasons).toContain("PROTECTED_REGION_CHANGED");
    expect(regression.accepted).toBe(false);
    expect(regression.reasons).toEqual(
      expect.arrayContaining([
        "OVERALL_NOT_IMPROVED",
        "WORST_REGION_REGRESSED",
        "LAYOUT_REGRESSED",
        "TYPOGRAPHY_REGRESSED",
      ]),
    );
  });

  it("runs bounded multiple passes, tracks accepted and rejected candidates, and reports convergence", async () => {
    const fixture = await createCorrectionFixture();
    const session = createCorrectionSession(sessionInput(fixture));
    const engine = createCorrectionEngine({ revalidationAdapter: { validate: fixture.revalidate } });
    const result = await engine.run({
      session,
      document: fixture.shiftedDocument,
      baselineReport: fixture.baselineReport,
      timestamp: fixture.fixture.task.createdAt,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.session.passes.map((entry) => entry.status)).toEqual(["ACCEPTED", "REJECTED"]);
    expect(result.report.stopReason).toBe("NO_CANDIDATES");
    expect(result.report.improvementScore).toBeGreaterThan(0);
    expect(result.report.acceptedCandidateIds.length).toBeGreaterThan(0);
    expect(result.report.rejectedCandidateIds.length).toBeGreaterThan(0);
    expect(Object.isFrozen(result.report)).toBe(true);
    expect(deserializeCorrectionReport(serializeCorrectionReport(result.report))).toEqual(result.report);
  });

  it("is deterministic across complete engine executions", async () => {
    const fixture = await createCorrectionFixture();
    const session = createCorrectionSession(sessionInput(fixture));
    const engine = createCorrectionEngine({ revalidationAdapter: { validate: fixture.revalidate } });
    const input = {
      session,
      document: fixture.shiftedDocument,
      baselineReport: fixture.baselineReport,
      timestamp: fixture.fixture.task.createdAt,
    };
    const first = await engine.run(input);
    const second = await engine.run(input);
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.session.fingerprint).toBe(second.session.fingerprint);
      expect(first.report.reportInputFingerprint).toBe(second.report.reportInputFingerprint);
      expect(first.document).toEqual(second.document);
    }
  });
});
