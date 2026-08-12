import {
  ResponsiveReconstructionTaskSchema,
  applyResponsiveProposal,
  createResponsiveReconstructionTask,
  deserializeResponsiveProposal,
  generateResponsiveProposal,
  serializeResponsiveProposal,
  validateResponsiveVariants,
} from "@aevum/responsive-reconstruction";
import { migrate, validateDocument } from "@aevum/document-model";
import { buildRenderGraph } from "@aevum/renderer-2d";
import { projectScene } from "@aevum/scene-runtime";
import { describe, expect, it } from "vitest";
import { RESPONSIVE_NOW, createResponsiveCandidate, createResponsiveFixture } from "../helpers/responsive-fixture.js";

describe("responsive reconstruction", () => {
  it("creates deterministic versioned tasks and requires the complete responsive target set", () => {
    const fixture = createResponsiveFixture();
    const repeated = createResponsiveReconstructionTask({
      ...fixture.task,
      id: undefined,
      taskVersion: undefined,
    });

    expect(repeated.id).toBe(fixture.task.id);
    expect(Object.isFrozen(repeated)).toBe(true);
    expect(
      ResponsiveReconstructionTaskSchema.safeParse({
        ...fixture.task,
        variants: fixture.task.variants.map((variant) => ({ ...variant, reducedMotion: false })),
      }).success,
    ).toBe(false);
  });

  it("generates deterministic semantic mobile rules without scaling or content invention", () => {
    const fixture = createResponsiveFixture();
    const first = generateResponsiveProposal(fixture.task, fixture.document);
    const second = generateResponsiveProposal(fixture.task, fixture.document);
    const mobile = first.changes.filter((change) => change.target.key === "mobile");
    const properties = new Set(mobile.flatMap((change) => change.properties));

    expect(first).toEqual(second);
    expect(first.mobileStrategy).toBe("REGENERATED");
    expect([...properties]).toEqual(
      expect.arrayContaining(["LAYOUT", "ORDER", "TYPOGRAPHY", "CROP", "CONSTRAINTS", "DIMENSIONS", "CAMERA"]),
    );
    expect(first.changes.every((change) => change.override.transform?.scale === undefined)).toBe(true);
    expect(JSON.stringify(first)).not.toContain('content"');
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("enforces locked nodes and protected properties while reference evidence wins deterministically", () => {
    const fixture = createResponsiveFixture();
    const document = structuredClone(fixture.document);
    const image = document.nodes[fixture.ids.image];
    if (!image) throw new Error("Fixture image missing.");
    image.locked = true;
    const mobile = fixture.task.variants.find((variant) => variant.breakpointId === "mobile");
    if (!mobile) throw new Error("Fixture mobile variant missing.");
    const task = createResponsiveReconstructionTask({
      ...fixture.task,
      id: undefined,
      taskVersion: undefined,
      referenceEvidence: [
        {
          id: "evidence:mobile-heading",
          viewportId: mobile.id,
          nodeId: fixture.ids.heading,
          target: { kind: "BREAKPOINT", key: "mobile" },
          override: { textStyle: { size: { value: 20, unit: "PX", mode: "FIXED" } } },
          confidence: 1,
          source: "HUMAN_DIRECTED",
          rationale: "Approved mobile type size.",
        },
      ],
      protectedProperties: [{ nodeId: fixture.ids.hero, property: "ORDER", reason: "Editorial order is locked." }],
    });
    const proposal = generateResponsiveProposal(task, document);
    const heading = proposal.changes.find(
      (change) => change.nodeId === fixture.ids.heading && change.target.key === "mobile",
    );

    expect(heading?.override.textStyle?.size).toMatchObject({ value: 20, unit: "PX" });
    expect(proposal.changes.some((change) => change.nodeId === fixture.ids.image)).toBe(false);
    expect(
      proposal.changes.some((change) => change.nodeId === fixture.ids.hero && change.properties.includes("ORDER")),
    ).toBe(false);
    expect(proposal.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["LOCKED_NODE", "PROTECTED_PROPERTY"]),
    );
  });

  it("compiles one atomic transaction, preserves input immutability, and validates responsive child order", () => {
    const candidate = createResponsiveCandidate();
    const before = JSON.stringify(candidate.document);

    expect(candidate.plan.commands.length).toBeGreaterThan(0);
    expect(new Set(candidate.plan.commands.map((command) => command.transactionId))).toEqual(
      new Set([candidate.plan.transactionId]),
    );
    expect(candidate.plan.commands.every((command) => command.type === "node.update")).toBe(true);
    expect(candidate.candidateDocument.documentVersion).toBe(candidate.document.documentVersion + 1);
    expect(JSON.stringify(candidate.document)).toBe(before);
    expect(validateDocument(candidate.candidateDocument).success).toBe(true);

    const malformed = structuredClone(candidate.candidateDocument);
    const hero = malformed.nodes[candidate.ids.hero];
    if (!hero?.responsive) throw new Error("Responsive hero missing.");
    const mobile = hero.responsive.breakpoints.mobile;
    if (!mobile) throw new Error("Mobile override missing.");
    mobile.childOrder = [candidate.ids.heading];
    expect(validateDocument(malformed).success).toBe(false);
  });

  it("projects and renders layout, order, typography, crop, camera, quality, and reduced motion overrides", () => {
    const candidate = createResponsiveCandidate();
    const mobileVariant = candidate.task.variants.find((variant) => variant.breakpointId === "mobile");
    const reducedVariant = candidate.task.variants.find((variant) => variant.reducedMotion);
    if (!mobileVariant || !reducedVariant) throw new Error("Responsive variants missing.");
    const mobileProjection = projectScene(candidate.candidateDocument, {
      id: mobileVariant.id,
      width: mobileVariant.width,
      height: mobileVariant.height,
      deviceScaleFactor: mobileVariant.deviceScaleFactor,
      orientation: mobileVariant.orientation,
      category: mobileVariant.category,
      reducedMotion: mobileVariant.reducedMotion,
      breakpointId: mobileVariant.breakpointId,
      containerQueryIds: mobileVariant.containerQueryIds,
      qualityMode: mobileVariant.qualityMode,
    });
    const hero = mobileProjection.nodes.get(candidate.ids.hero);
    const heading = mobileProjection.nodes.get(candidate.ids.heading);
    const image = mobileProjection.nodes.get(candidate.ids.image);
    const scene = mobileProjection.nodes.get(candidate.ids.scene);
    if (
      !hero ||
      heading?.resolvedNode.type !== "TEXT" ||
      image?.resolvedNode.type !== "IMAGE" ||
      scene?.resolvedNode.type !== "SCENE_3D"
    ) {
      throw new Error("Resolved responsive nodes missing.");
    }
    const graph = buildRenderGraph(mobileProjection);
    const textOperation = [...graph.operations.values()].find((operation) => operation.kind === "TEXT");
    const imageOperation = [...graph.operations.values()].find((operation) => operation.kind === "IMAGE");
    const reducedProjection = projectScene(candidate.candidateDocument, {
      id: reducedVariant.id,
      width: reducedVariant.width,
      height: reducedVariant.height,
      deviceScaleFactor: reducedVariant.deviceScaleFactor,
      orientation: reducedVariant.orientation,
      category: reducedVariant.category,
      reducedMotion: reducedVariant.reducedMotion,
      breakpointId: reducedVariant.breakpointId,
      containerQueryIds: reducedVariant.containerQueryIds,
      qualityMode: reducedVariant.qualityMode,
    });

    expect(hero.layout).toMatchObject({ type: "FLEX", direction: "COLUMN" });
    expect(hero.childIds.slice(0, 2)).toEqual([candidate.ids.heading, candidate.ids.image]);
    expect(heading.resolvedNode.runs[0]?.style.size.value).toBe(32);
    expect(image.resolvedNode.crop).toMatchObject({ width: 0.7 });
    expect(scene.resolvedNode.activeCameraId).toBe(candidate.ids.mobileCamera);
    expect(textOperation?.kind === "TEXT" ? textOperation.runs[0]?.style.size.value : undefined).toBe(32);
    expect(imageOperation?.kind === "IMAGE" ? imageOperation.crop?.width : undefined).toBe(0.7);
    expect(reducedProjection.nodes.get(candidate.ids.heading)?.responsive.motion).toMatchObject({
      behavior: "REDUCE",
      durationScale: 0.2,
    });
    expect(scene.responsive.appliedOverrideKeys).toContain("quality:DRAFT");
  });

  it("migrates 1.1 documents through responsive and animation contracts", () => {
    const fixture = createResponsiveFixture();
    const old = structuredClone(fixture.document) as unknown as Record<string, unknown>;
    old.schemaVersion = "1.1.0";
    old.migrationVersion = 1;
    const migrated = migrate(old);

    expect(migrated.schemaVersion).toBe("1.6.0");
    expect(migrated.migrationVersion).toBe(6);
    expect(migrated.stateMachines).toEqual({});
    expect(validateDocument(migrated).success).toBe(true);
  });

  it("requires every viewport reference and blocks application of unvalidated output", () => {
    const candidate = createResponsiveCandidate();
    const validation = validateResponsiveVariants({
      task: candidate.task,
      document: candidate.candidateDocument,
      references: {},
    });
    const application = applyResponsiveProposal(candidate.plan, candidate.document, validation);

    expect(validation.passed).toBe(false);
    expect(validation.variants.every((variant) => variant.validationStatus === "NOT_RUN")).toBe(true);
    expect(application).toMatchObject({
      success: false,
      message: "Unvalidated responsive proposal cannot be applied.",
    });
  });

  it("round-trips proposals without losing deterministic identity", () => {
    const candidate = createResponsiveCandidate();
    const serialized = serializeResponsiveProposal(candidate.proposal, true);
    const restored = deserializeResponsiveProposal(serialized);

    expect(restored).toEqual(candidate.proposal);
    expect(restored.proposalFingerprint).toBe(candidate.proposal.proposalFingerprint);
    expect(Object.isFrozen(candidate.proposal)).toBe(true);
    expect(candidate.plan.commands[0]?.timestamp).toBe(RESPONSIVE_NOW);
  });
});
