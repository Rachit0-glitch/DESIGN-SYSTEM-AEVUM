import {
  analyzeMultiView,
  createConflictingFixture,
  createDeterministicMockProvider,
  createIncompleteFixture,
  createMultiViewTask,
  createStrongProductFixture,
  MULTIVIEW_FIXTURE_NOW,
} from "@aevum/multiview-reconstruction";
import { describe, expect, it } from "vitest";

describe("multi-view reconstruction workflow", () => {
  it("Scenario A: a complete 5-view product set reaches usable-or-better readiness with no conflicts", () => {
    const task = createMultiViewTask(createStrongProductFixture());
    const { report, referenceSet, proposal } = analyzeMultiView(task, { createdAt: MULTIVIEW_FIXTURE_NOW });

    expect(["USABLE", "STRONG", "EXCELLENT"]).toContain(report.readiness.classification);
    expect(report.diagnostics.some((entry) => entry.severity === "CRITICAL" || entry.severity === "ERROR")).toBe(false);
    expect(report.validation.status).toBe("PASS");
    expect(report.status).toBe("READY_FOR_PROPOSAL");
    expect(referenceSet.landmarks[0]?.estimated3D).toBeDefined();
    expect(proposal.readiness.classification).toBe(report.readiness.classification);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(referenceSet)).toBe(true);
  });

  it("Scenario B: a front-only image set is a valid reference set but honestly reports weak readiness", () => {
    const task = createMultiViewTask(createIncompleteFixture());
    const { report, referenceSet } = analyzeMultiView(task, { createdAt: MULTIVIEW_FIXTURE_NOW });

    expect(["INSUFFICIENT", "WEAK"]).toContain(report.readiness.classification);
    expect(
      report.diagnostics.some(
        (entry) => entry.code === "VIEW_COVERAGE_INSUFFICIENT" || entry.code === "INSUFFICIENT_DEPTH_EVIDENCE",
      ),
    ).toBe(true);
    expect(report.status).toBe("NEEDS_MORE_EVIDENCE");
    // A single front image can honestly yield 2D bounding-dimension/symmetry constraints, but
    // must never fabricate depth-requiring constraints (side depth, top footprint) it has no
    // evidence for.
    expect(
      referenceSet.constraints.some(
        (entry) => entry.details.label === "SIDE_DEPTH" || entry.details.label === "TOP_FOOTPRINT_AREA",
      ),
    ).toBe(false);
  });

  it("Scenario C: intentionally inconsistent evidence produces diagnostics instead of silent averaging", () => {
    const task = createMultiViewTask(createConflictingFixture());
    const { report } = analyzeMultiView(task, { createdAt: MULTIVIEW_FIXTURE_NOW });

    expect(report.diagnostics.some((entry) => entry.code === "VIEW_DUPLICATE")).toBe(true);
    expect(report.diagnostics.some((entry) => entry.code === "SCALE_CONFLICT")).toBe(true);
    expect(report.validation.status).not.toBe("PASS");
    expect(report.readiness.classification).not.toBe("STRONG");
    expect(report.readiness.classification).not.toBe("EXCELLENT");
  });

  it("Scenario E: a deterministic mock provider consumes the proposal without claiming real reconstruction", () => {
    const task = createMultiViewTask(createStrongProductFixture());
    const { proposal } = analyzeMultiView(task, { createdAt: MULTIVIEW_FIXTURE_NOW });
    const provider = createDeterministicMockProvider();
    const candidate = provider.reconstruct(proposal);

    expect(candidate.candidateAssetId).toBeUndefined();
    expect(
      candidate.diagnostics.some((entry) =>
        entry.message.toLowerCase().includes("not a real ai-generated reconstruction"),
      ),
    ).toBe(true);
    expect(candidate.generationProvenance.source).toBe("RECONSTRUCTION_PROVIDER");
  });

  it("protects user-provided evidence from being silently treated as replaceable by a provider", () => {
    const task = createMultiViewTask(createStrongProductFixture());
    const { proposal } = analyzeMultiView(task, { createdAt: MULTIVIEW_FIXTURE_NOW });

    // Every view in the strong fixture used a user-provided role hint.
    expect(proposal.protectedEvidenceIds.length).toBeGreaterThan(0);
    expect(proposal.protectedEvidenceIds).toEqual(expect.arrayContaining(proposal.viewIds));
  });
});
