import { describe, expect, it } from "vitest";
import {
  ReconstructionManifestSchema,
  analyzeReference,
  applyReconstructionProposal,
  confidence,
  createConfidenceSummary,
  createPhase6Fixture,
  createReconstructionEngine,
  createReconstructionProposal,
  deserializeReconstructionProposal,
  deserializeReferenceAnalysis,
  dryRunReconstructionProposal,
  serializeReconstructionProposal,
  serializeReferenceAnalysis,
  validateReconstructionProposal,
  validateReconstructionTask,
  type ReconstructionAssetResolver,
} from "@aevum/reconstruction";

function workflow() {
  const fixture = createPhase6Fixture();
  const engine = createReconstructionEngine({ assetResolver: fixture.resolver });
  const analysisResult = engine.analyze(fixture.task);
  if (!analysisResult.success) throw new Error(analysisResult.diagnostics[0]?.message);
  const proposalResult = engine.createProposal(fixture.task, analysisResult.analysis);
  if (!proposalResult.success) throw new Error(proposalResult.diagnostics[0]?.message);
  return { ...fixture, engine, analysis: analysisResult.analysis, proposal: proposalResult.proposal };
}

describe("Phase 6 reconstruction contracts", () => {
  it("creates a deterministic, runtime-valid task", () => {
    const fixture = createPhase6Fixture();
    const repeated = createPhase6Fixture();
    expect(validateReconstructionTask(fixture.task).success).toBe(true);
    expect(fixture.task.id).toBe(repeated.task.id);
    expect(Object.isFrozen(fixture.task)).toBe(true);
  });

  it("requires an expected version for an existing target", () => {
    const fixture = createPhase6Fixture();
    const invalid = { ...fixture.task, targetDocumentId: "doc_00000000-0000-4000-8000-000000000001" };
    expect(validateReconstructionTask(invalid).success).toBe(false);
  });

  it("rejects unsupported source MIME types", () => {
    const fixture = createPhase6Fixture();
    const resolver: ReconstructionAssetResolver = {
      resolve: () => ({
        kind: "READY",
        asset: { ...fixture.asset, mimeType: "application/pdf" },
        metadata:
          fixture.resolver.resolve(fixture.asset.id).kind === "READY"
            ? fixture.resolver.resolve(fixture.asset.id).metadata
            : ({} as never),
      }),
    };
    const result = analyzeReference(fixture.task, resolver);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.diagnostics.map((entry) => entry.code)).toContain("UNSUPPORTED_REFERENCE_TYPE");
  });

  it("blocks quarantined source assets", () => {
    const fixture = createPhase6Fixture();
    const result = analyzeReference(fixture.task, {
      resolve: () => ({
        kind: "QUARANTINED",
        assetId: fixture.asset.id,
        issues: [{ code: "MALWARE_DETECTED", message: "Unsafe fixture", severity: "CRITICAL" }],
      }),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.diagnostics[0]?.code).toBe("SOURCE_ASSET_QUARANTINED");
  });

  it("produces deterministic region IDs and analysis fingerprints", () => {
    const fixture = createPhase6Fixture();
    const first = analyzeReference(fixture.task, fixture.resolver);
    const second = analyzeReference(fixture.task, fixture.resolver);
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.analysis.regions.map((region) => region.id)).toEqual(
        second.analysis.regions.map((region) => region.id),
      );
      expect(first.analysis.analysisFingerprint).toBe(second.analysis.analysisFingerprint);
      expect(Object.isFrozen(first.analysis)).toBe(true);
    }
  });

  it("uses top-left source-pixel coordinates with normalized bounds", () => {
    const { analysis } = workflow();
    const hero = analysis.regions.find((region) => region.semanticHints.includes("hero"));
    expect(hero?.bounds.unit).toBe("SOURCE_PIXEL");
    expect(hero?.bounds.y).toBe(80);
    expect(hero?.bounds.normalized.y).toBeCloseTo(0.08);
  });

  it("creates text, image, shape, and basic layout candidates", () => {
    const { analysis } = workflow();
    expect(analysis.textCandidates.length).toBeGreaterThanOrEqual(4);
    expect(analysis.assetCandidates).toHaveLength(1);
    expect(analysis.shapeCandidates).toHaveLength(2);
    expect(analysis.layoutCandidates.some((entry) => entry.type === "GRID")).toBe(true);
    expect(analysis.layoutCandidates.some((entry) => entry.type === "HORIZONTAL_ROW")).toBe(true);
  });

  it("suggests components and exact repeated-value tokens without applying them", () => {
    const { analysis, proposal } = workflow();
    expect(analysis.componentCandidates).toHaveLength(1);
    expect(analysis.tokenCandidates).toHaveLength(1);
    expect(proposal.proposedComponents.every((entry) => !entry.applied)).toBe(true);
    // Suggested repeated-value tokens (keyed by analysis.tokenCandidates) stay unapplied — distinct
    // from the real, applied per-node color tokens the proposal builder now also creates from
    // sampled SHAPE fill/TEXT ink color, which are intentionally applied: true.
    const suggestedCandidateIds = new Set(analysis.tokenCandidates.map((candidate) => candidate.id));
    const suggestedTokens = proposal.proposedTokens.filter((entry) => suggestedCandidateIds.has(entry.candidateId));
    expect(suggestedTokens).toHaveLength(analysis.tokenCandidates.length);
    expect(suggestedTokens.every((entry) => !entry.applied)).toBe(true);
  });

  it("aggregates confidence using canonical boundaries", () => {
    expect(confidence(0.85).label).toBe("HIGH");
    expect(confidence(0.6).label).toBe("MEDIUM");
    expect(confidence(0.2).label).toBe("LOW");
    expect(confidence(0).label).toBe("UNKNOWN");
    expect(
      createConfidenceSummary({
        regions: [0.9, 0.7],
        semantics: [0.8],
        text: [0.8],
        assets: [],
        layouts: [],
        components: [],
        tokens: [],
      }).overall.score,
    ).toBeGreaterThan(0.7);
  });

  it("produces deterministic proposal and command-plan fingerprints", () => {
    const fixture = createPhase6Fixture();
    const analysis = analyzeReference(fixture.task, fixture.resolver);
    if (!analysis.success) throw new Error("Fixture analysis failed.");
    const first = createReconstructionProposal(fixture.task, analysis.analysis, fixture.resolver);
    const second = createReconstructionProposal(fixture.task, analysis.analysis, fixture.resolver);
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.proposal.proposalFingerprint).toBe(second.proposal.proposalFingerprint);
      expect(first.proposal.commandPlan.commandPlanFingerprint).toBe(
        second.proposal.commandPlan.commandPlanFingerprint,
      );
      expect(first.proposal.commandPlan.commands.map((command) => command.id)).toEqual(
        second.proposal.commandPlan.commands.map((command) => command.id),
      );
    }
  });

  it("orders commands by document, asset, reference, page, and node dependencies", () => {
    const { proposal } = workflow();
    const types = proposal.commandPlan.commands.map((command) => command.type);
    expect(types[0]).toBe("document.create");
    expect(types.indexOf("asset.register")).toBeLessThan(types.indexOf("reference.register"));
    expect(types.indexOf("reference.register")).toBeLessThan(types.indexOf("page.create"));
    expect(types.indexOf("page.create")).toBeLessThan(types.indexOf("node.create"));
  });

  it("detects duplicate proposal IDs", () => {
    const { proposal } = workflow();
    const invalid = structuredClone(proposal);
    const firstNode = invalid.proposedNodes[0];
    if (!firstNode) throw new Error("Fixture proposal requires a node.");
    invalid.proposedNodes.push(structuredClone(firstNode));
    const validation = validateReconstructionProposal(invalid);
    expect(validation.success).toBe(false);
    expect(validation.diagnostics.map((entry) => entry.code)).toContain("DUPLICATE_PROPOSED_ID");
  });

  it("detects invalid proposed parents", () => {
    const { proposal } = workflow();
    const invalid = structuredClone(proposal);
    const target = invalid.proposedNodes.find((entry) => entry.node.type === "TEXT");
    if (!target) throw new Error("Fixture proposal requires a text node.");
    target.node.parentId = "frame_00000000-0000-4000-8000-999999999999";
    const validation = validateReconstructionProposal(invalid);
    expect(validation.success).toBe(false);
    expect(validation.diagnostics.map((entry) => entry.code)).toContain("INVALID_PROPOSED_PARENT");
  });

  it("dry-runs and applies an immutable atomic command transaction", () => {
    const { task, proposal } = workflow();
    const dryRun = dryRunReconstructionProposal(proposal);
    const applied = applyReconstructionProposal(proposal, task);
    expect(dryRun.success).toBe(true);
    expect(applied.success).toBe(true);
    if (dryRun.success && applied.success) {
      expect(dryRun.resultingDocument).toEqual(applied.result.resultingDocument);
      expect(applied.result.resultingDocument.documentVersion).toBe(1);
      expect(applied.result.commandIds).toHaveLength(proposal.commandPlan.commands.length);
    }
  });

  it("reports dry-run failure without mutating the supplied document", () => {
    const { proposal } = workflow();
    const successful = dryRunReconstructionProposal(proposal);
    if (!successful.success || !successful.resultingDocument) throw new Error("Fixture dry-run failed.");
    const before = structuredClone(successful.resultingDocument);
    const failed = dryRunReconstructionProposal(proposal, successful.resultingDocument);
    expect(failed.success).toBe(false);
    expect(successful.resultingDocument).toEqual(before);
  });

  it("enforces region limits with structured diagnostics", () => {
    const fixture = createPhase6Fixture();
    const result = analyzeReference(fixture.task, fixture.resolver, { configuration: { maxRegions: 2 } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.diagnostics[0]?.code).toBe("LIMIT_EXCEEDED");
  });

  it("round-trips versioned analysis and proposal serialization", () => {
    const { analysis, proposal } = workflow();
    expect(deserializeReferenceAnalysis(serializeReferenceAnalysis(analysis))).toEqual(analysis);
    expect(deserializeReconstructionProposal(serializeReconstructionProposal(proposal))).toEqual(proposal);
  });

  it("rejects malformed annotation manifests instead of executing payloads", () => {
    const parsed = ReconstructionManifestSchema.safeParse({
      manifestVersion: "1.0.0",
      referenceType: "STATIC_2D",
      regions: [
        {
          key: "x",
          category: "TEXT",
          bounds: { x: 0, y: 0, width: 1, height: 1 },
          confidence: 1,
          script: "process.exit()",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
