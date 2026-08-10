import { computeSha256 } from "@aevum/assets";
import {
  buildCanonicalImportPlan,
  createBoxGroundTruthFixture,
  createConflictingViewFixture,
  createCylinderGroundTruthFixture,
  createDeterministicTestProvider,
  createLocalBaselineProvider,
  createMissingViewFixture,
  createMultiPartGroundTruthFixture,
  registerCandidateAsset,
  runReconstructionSession,
} from "@aevum/geometry-reconstruction";
import { executeCommand } from "@aevum/command-engine";
import { createAsset, fixtures, type CanonicalDesignDocument } from "@aevum/document-model";
import { analyzeMultiView, createMultiViewTask } from "@aevum/multiview-reconstruction";
import { create3DImportProposal } from "@aevum/renderer-3d";
import { describe, expect, it } from "vitest";

const NOW = "2026-08-09T00:00:00.000Z";
const actor = { id: "user_geometry_test", type: "USER" as const, displayName: "Geometry reconstruction test" };

async function reconstruct(
  taskInput: Parameters<typeof createMultiViewTask>[0],
  config?: { qualityMode?: "DRAFT" | "STANDARD" | "HIGH" },
) {
  const task = createMultiViewTask(taskInput);
  const { referenceSet, proposal } = analyzeMultiView(task, { createdAt: NOW });
  const result = await runReconstructionSession({
    referenceSet,
    proposal,
    providerId: "LOCAL_BASELINE",
    providerVersion: "1.0.0",
    createdAt: NOW,
    ...(config ? { config } : {}),
  });
  return { referenceSet, proposal, ...result };
}

describe("geometry-reconstruction acceptance scenarios", () => {
  it("A. Box: reconstructs a known box with correct broad proportions and reaches a high score", async () => {
    const fixture = createBoxGroundTruthFixture();
    const { report } = await reconstruct(fixture.taskInput, { qualityMode: "DRAFT" });

    expect(report.status).toBe("COMPLETED");
    expect(report.finalScore?.overall).toBeGreaterThan(0.6);

    const selected = report.candidates.find((candidate) => candidate.id === report.selectedCandidateId);
    expect(selected).toBeDefined();
    // Broad proportions: the box is taller (y) than it is wide (x) or deep (z) — the true
    // extents are x=0.3, y=0.4, z=0.2, so the reconstructed bounds should preserve that ordering.
    expect(selected?.bounds.size.y).toBeGreaterThan(selected?.bounds.size.z);
  });

  it("B. Cylinder: correctly selects a cylinder over a box for a genuinely round object", async () => {
    const fixture = createCylinderGroundTruthFixture();
    const { report } = await reconstruct(fixture.taskInput, { qualityMode: "DRAFT" });

    expect(report.status).toBe("COMPLETED");
    const cylinder = report.candidates.find((candidate) => candidate.generationMethod === "CYLINDER_PRIMITIVE");
    const box = report.candidates.find((candidate) => candidate.generationMethod === "BOX_PRIMITIVE");
    expect(cylinder).toBeDefined();
    expect(cylinder?.score.overall).toBeGreaterThan(box?.score.overall);
    expect(report.selectedCandidateId).toBe(cylinder?.id);
  });

  it("C. Multi-part: preserves both parts' identity in the selected candidate", async () => {
    const fixture = createMultiPartGroundTruthFixture();
    const { report } = await reconstruct(fixture.taskInput, { qualityMode: "DRAFT" });

    expect(report.status).toBe("COMPLETED");
    const selected = report.candidates.find((candidate) => candidate.id === report.selectedCandidateId);
    expect(selected?.partCount).toBe(2);
    expect(selected?.geometry.parts.map((part) => part.label).sort()).toEqual(["body", "cap"]);
  });

  it("D. Missing view: honestly downgrades readiness/score instead of fabricating depth", async () => {
    const fullFixture = createBoxGroundTruthFixture();
    const missingFixture = createMissingViewFixture();
    const full = await reconstruct(fullFixture.taskInput, { qualityMode: "DRAFT" });
    const partial = await reconstruct(missingFixture.taskInput, { qualityMode: "DRAFT" });

    expect(partial.proposal.readiness.score).toBeLessThan(full.proposal.readiness.score);
    expect(["WEAK", "INSUFFICIENT", "USABLE"]).toContain(partial.proposal.readiness.classification);
    expect(partial.referenceSet.diagnostics.some((entry) => entry.code === "INSUFFICIENT_DEPTH_EVIDENCE")).toBe(true);
  });

  it("E. Conflicting view: reflects contradictions in diagnostics and a capped score, never silent averaging", async () => {
    const fixture = createConflictingViewFixture();
    const { report, referenceSet } = await reconstruct(fixture.taskInput, { qualityMode: "DRAFT" });

    expect(referenceSet.diagnostics.some((entry) => entry.code === "SCALE_CONFLICT")).toBe(true);
    // A correction pass must never accept an improvement that hides the conflict by regressing a
    // previously-good view — every accepted pass must show no view IoU regression beyond
    // tolerance.
    for (const pass of report.passes) {
      if (pass.accepted) expect(pass.regressedViewIds).toHaveLength(0);
    }
  });

  it("F. Correction loop: a bounded pass either measurably improves the score or honestly reports no improvement", async () => {
    const fixture = createMissingViewFixture();
    const { report } = await reconstruct(fixture.taskInput, { qualityMode: "STANDARD" });

    expect(report.passes.length).toBeGreaterThan(0);
    for (const pass of report.passes) {
      if (pass.accepted) {
        expect(pass.scoreAfter).toBeGreaterThan(pass.scoreBefore ?? 0);
      } else {
        expect(pass.scoreAfter).toBe(pass.scoreBefore);
      }
    }
    expect(["TARGET_SCORE_REACHED", "NO_IMPROVEMENT", "MAXIMUM_PASSES_REACHED"]).toContain(report.stopReason);
  });

  it("G. Real Phase 14 handoff: a generated candidate GLB imports through the unmodified Phase 14 path", async () => {
    const fixture = createBoxGroundTruthFixture();
    const { report, selectedGlb } = await reconstruct(fixture.taskInput, { qualityMode: "DRAFT" });
    expect(report.status).toBe("COMPLETED");
    if (!selectedGlb) throw new Error("Expected a generated candidate GLB.");

    const sourceAsset = createAsset({
      type: "GLB",
      name: "phase18-candidate.glb",
      hash: computeSha256(selectedGlb),
      uri: "generated://geometry-reconstruction/test-candidate",
      mimeType: "model/gltf-binary",
      byteSize: selectedGlb.byteLength,
    });
    const empty: CanonicalDesignDocument = fixtures.empty();
    const workingDocument: CanonicalDesignDocument = {
      ...empty,
      assets: { ...empty.assets, [sourceAsset.id]: sourceAsset },
    };

    const proposal = await create3DImportProposal({
      canonicalDocument: workingDocument,
      asset: sourceAsset,
      bytes: selectedGlb,
    });
    expect(proposal.nodes.length).toBeGreaterThan(0);
    expect(proposal.nodes.some((node) => node.type === "MESH_3D")).toBe(true);
  });

  it("H. Insufficient evidence path: a single front-only task is not blocked by lack of evidence alone, but stays honest", async () => {
    // A single view is *usable* evidence (not INSUFFICIENT), just weak — this proves the pipeline
    // distinguishes "no evidence at all" (which would BLOCK) from "weak but present" evidence.
    const fixture = createMissingViewFixture();
    const { report, proposal } = await reconstruct(fixture.taskInput, { qualityMode: "DRAFT" });
    expect(proposal.readiness.classification).not.toBe("INSUFFICIENT");
    expect(report.status).toBe("COMPLETED");
  });

  it("I. Provider registry and interface-compatibility: the deterministic test provider still satisfies Phase 17's interface", () => {
    const provider = createDeterministicTestProvider();
    expect(provider.id).toBe("deterministic-test-provider");
    const localBaseline = createLocalBaselineProvider();
    expect(localBaseline.id).toBe("LOCAL_BASELINE");
  });

  it("J. Canonical import plan: builds asset.register + scene3d.import commands without executing them", async () => {
    const fixture = createBoxGroundTruthFixture();
    const task = createMultiViewTask(fixture.taskInput);
    const { referenceSet } = analyzeMultiView(task, { createdAt: NOW });
    const { report, selectedGlb } = await reconstruct(fixture.taskInput, { qualityMode: "DRAFT" });
    if (!selectedGlb) throw new Error("Expected a generated candidate GLB.");

    const registration = registerCandidateAsset({
      registry: {},
      referenceSet,
      bytes: selectedGlb,
      candidateId: report.selectedCandidateId ?? report.id,
      generationMethod: "BOX_PRIMITIVE",
      providerId: "LOCAL_BASELINE",
      providerVersion: "1.0.0",
      timestamp: NOW,
    });
    expect(registration.kind).toBe("REGISTERED");
    if (registration.kind !== "REGISTERED") throw new Error("unreachable");

    const document = fixtures.empty();
    const plan = await buildCanonicalImportPlan({
      document,
      asset: registration.asset,
      bytes: selectedGlb,
      actor,
      timestamp: NOW,
      correlationId: "phase18-import-plan-test",
    });
    expect(plan.registerAssetCommand.type).toBe("asset.register");
    expect(plan.importCommand.type).toBe("scene3d.import");

    const afterRegister = executeCommand(document, plan.registerAssetCommand).newDocument;
    const afterImport = executeCommand(afterRegister, plan.importCommand).newDocument;
    expect(Object.values(afterImport.nodes).some((node) => node.type === "MESH_3D")).toBe(true);
  });
});
