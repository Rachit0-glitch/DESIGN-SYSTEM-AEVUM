import { createResponsiveReconstructionEngine, validateResponsiveVariants } from "@aevum/responsive-reconstruction";
import { projectScene } from "@aevum/scene-runtime";
import { describe, expect, it } from "vitest";
import {
  RESPONSIVE_NOW,
  createResponsiveCandidate,
  createResponsiveFixture,
  createResponsiveReferences,
} from "../helpers/responsive-fixture.js";

describe("responsive reconstruction workflow", () => {
  it("dry-runs, independently validates every viewport, commits atomically, and reports evidence", () => {
    const candidate = createResponsiveCandidate();
    const references = createResponsiveReferences(candidate.candidateDocument, candidate.task);
    const validation = validateResponsiveVariants({
      task: candidate.task,
      document: candidate.candidateDocument,
      references,
      thresholdProfile: "STANDARD",
    });
    const engine = createResponsiveReconstructionEngine();
    const result = engine.run({
      task: candidate.task,
      document: candidate.document,
      references,
      timestamp: RESPONSIVE_NOW,
      thresholdProfile: "STANDARD",
    });

    expect(validation.passed).toBe(true);
    expect(validation.variants).toHaveLength(4);
    expect(
      validation.variants.every(
        (variant) => variant.validationStatus !== "FAIL" && variant.validationStatus !== "NOT_RUN",
      ),
    ).toBe(true);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.message);
    expect(result.application.auditRecord.commandTypes.every((type) => type === "node.update")).toBe(true);
    expect(result.application.auditRecord.fromVersion).toBe(candidate.document.documentVersion);
    expect(result.application.auditRecord.toVersion).toBe(candidate.document.documentVersion + 1);
    expect(result.report.status).toBe("VALIDATED");
    expect(result.report.mobileStrategy).toBe("REGENERATED");
    expect(result.report.validation.fingerprint).toBe(validation.fingerprint);

    for (const variant of candidate.task.variants) {
      const projection = projectScene(result.application.resultingDocument, {
        id: variant.id,
        width: variant.width,
        height: variant.height,
        deviceScaleFactor: variant.deviceScaleFactor,
        orientation: variant.orientation,
        category: variant.category,
        reducedMotion: variant.reducedMotion,
        breakpointId: variant.breakpointId,
        containerQueryIds: variant.containerQueryIds,
        qualityMode: variant.qualityMode,
      });
      expect(projection.complete).toBe(true);
      expect(projection.viewport.id).toBe(variant.id);
    }
  });

  it("rejects visually matching references when readability or focal-point invariants regress", () => {
    const fixture = createResponsiveFixture();
    const mobile = fixture.task.variants.find((variant) => variant.breakpointId === "mobile");
    if (!mobile) throw new Error("Mobile fixture missing.");
    const task = {
      ...fixture.task,
      referenceEvidence: [
        {
          id: "evidence:unreadable-heading",
          viewportId: mobile.id,
          nodeId: fixture.ids.heading,
          target: { kind: "BREAKPOINT" as const, key: "mobile" },
          override: { textStyle: { size: { value: 12, unit: "PX" as const, mode: "FIXED" as const } } },
          confidence: 1,
          source: "HUMAN_DIRECTED" as const,
          rationale: "Regression fixture.",
        },
        {
          id: "evidence:lost-focal-point",
          viewportId: mobile.id,
          nodeId: fixture.ids.image,
          target: { kind: "BREAKPOINT" as const, key: "mobile" },
          override: { crop: { x: 0, y: 0, width: 0.2, height: 0.2 }, objectFit: "COVER" as const },
          confidence: 1,
          source: "HUMAN_DIRECTED" as const,
          rationale: "Regression fixture.",
        },
      ],
    };
    const candidate = createResponsiveCandidate({ ...fixture, task });
    const references = createResponsiveReferences(candidate.candidateDocument, task);
    const validation = validateResponsiveVariants({ task, document: candidate.candidateDocument, references });
    const mobileResult = validation.variants.find((variant) => variant.viewport.id === mobile.id);

    expect(validation.passed).toBe(false);
    expect(mobileResult?.textReadable).toBe(false);
    expect(mobileResult?.focalPointsPreserved).toBe(false);
    expect(mobileResult?.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["TEXT_UNREADABLE", "FOCAL_POINT_LOST"]),
    );
  });
});
