import { FidelityReportSchema } from "@aevum/fidelity";
import { describe, expect, it } from "vitest";
import { createMcpTestFixture } from "../helpers/mcp-fixture.js";

const digest = `sha256:${"a".repeat(64)}`;

function report(nodeId: string) {
  return FidelityReportSchema.parse({
    id: `fidelity-report:${"b".repeat(32)}`,
    version: "1.0.0",
    taskId: `fidelity-task:${"c".repeat(32)}`,
    status: "FAIL",
    overallScore: 0.72,
    coverage: 1,
    confidence: 0.95,
    domainScores: [
      {
        domain: "TYPOGRAPHY",
        score: 0.44,
        coverage: 1,
        confidence: 0.95,
        measuredRegions: 1,
        totalRegions: 1,
        issueIds: [`fidelity-issue:${"d".repeat(32)}`],
        unsupportedFeatures: [],
      },
    ],
    issues: [
      {
        id: `fidelity-issue:${"d".repeat(32)}`,
        domain: "TYPOGRAPHY",
        code: "FONT_FALLBACK",
        severity: "BLOCKING",
        nodeId,
        region: { x: 10, y: 10, width: 200, height: 60 },
        property: "runs.0.style.fontFamily",
        expected: "Basic",
        actual: "Arial",
        measurement: 1,
        confidence: 0.95,
        supported: true,
        message: "A real font fallback changed shaping and line breaks.",
      },
    ],
    passes: [],
    stopReason: "NO_CORRECTIONS",
    unsupportedFeatures: [],
    provenance: {
      referenceHashes: [digest],
      documentFingerprint: digest,
      rendererVersion: "1.0.0",
      providerIds: ["local@1.0.0"],
      fontAssetIds: [],
      imageAssetIds: [],
    },
    fingerprint: digest,
  });
}

describe("MCP Maximum Fidelity boundary", () => {
  it("exposes honest read tools and a semantic dry-run-first idempotent Command Engine write", async () => {
    const fixture = createMcpTestFixture();
    const text = Object.values(fixture.document.nodes).find((node) => node.type === "TEXT");
    if (!text) throw new Error("Text fixture is missing.");
    const evidence = report(text.id);
    expect(await fixture.execute("fidelity.inspect", { profile: "MAXIMUM_FIDELITY" })).toMatchObject({
      success: true,
      data: {
        profile: "MAXIMUM_FIDELITY",
        documentVersion: fixture.document.documentVersion,
        capabilities: expect.arrayContaining(["REAL_RGBA_RASTER", "CUSTOM_FONT_LOADING"]),
      },
    });
    expect(await fixture.execute("fidelity.validate_report", { report: evidence })).toMatchObject({
      success: true,
      data: { valid: true, meetsDeclaredStatus: true, blockingIssueIds: [evidence.issues[0]?.id] },
    });
    expect(await fixture.execute("fidelity.propose_corrections", { report: evidence, limit: 8 })).toMatchObject({
      success: true,
      data: {
        reportFingerprint: evidence.fingerprint,
        proposals: [expect.objectContaining({ domain: "TYPOGRAPHY", nodeId: text.id, priority: 0 })],
      },
    });
    const input = {
      expectedDocumentVersion: fixture.document.documentVersion,
      reportFingerprint: evidence.fingerprint,
      issueId: evidence.issues[0]?.id,
      nodeId: text.id,
      changes: { name: "Corrected heading" },
      expectedBefore: { name: text.name },
    };
    const dryRun = await fixture.execute("fidelity.apply_correction", input, {
      dryRun: true,
      idempotencyKey: "phase22-dry-run",
    });
    expect(dryRun).toMatchObject({
      success: true,
      data: {
        dryRun: true,
        baseVersion: fixture.document.documentVersion,
        predictedDocumentVersion: fixture.document.documentVersion + 1,
      },
    });
    const first = await fixture.execute("fidelity.apply_correction", input, { idempotencyKey: "phase22-apply" });
    const replay = await fixture.execute("fidelity.apply_correction", input, { idempotencyKey: "phase22-apply" });
    expect(first).toMatchObject({
      success: true,
      data: { dryRun: false, resultVersion: fixture.document.documentVersion + 1 },
    });
    expect(replay.data).toEqual(first.data);
    const persisted = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(persisted?.nodes[text.id]?.name).toBe("Corrected heading");
    expect(fixture.audits.length).toBeGreaterThan(0);
  });

  it("enforces permissions, locks, expected-before state, and stale versions", async () => {
    const viewer = createMcpTestFixture({ role: "VIEWER" });
    const text = Object.values(viewer.document.nodes).find((node) => node.type === "TEXT");
    if (!text) throw new Error("Text fixture is missing.");
    const input = {
      expectedDocumentVersion: viewer.document.documentVersion,
      reportFingerprint: digest,
      issueId: `fidelity-issue:${"d".repeat(32)}`,
      nodeId: text.id,
      changes: { name: "Denied" },
    };
    expect(
      await viewer.execute("fidelity.apply_correction", input, { dryRun: true, idempotencyKey: "viewer-denied" }),
    ).toMatchObject({ success: false, errors: [{ code: "MCP_AUTHORIZATION_DENIED" }] });
    const owner = createMcpTestFixture();
    const ownerText = Object.values(owner.document.nodes).find((node) => node.type === "TEXT");
    if (!ownerText) throw new Error("Owner text fixture is missing.");
    const ownerInput = { ...input, nodeId: ownerText.id };
    expect(
      await owner.execute(
        "fidelity.apply_correction",
        { ...ownerInput, expectedDocumentVersion: 999 },
        { dryRun: true, idempotencyKey: "stale-version" },
      ),
    ).toMatchObject({ success: false, errors: [{ code: "MCP_DOCUMENT_VERSION_CONFLICT" }] });
    expect(
      await owner.execute(
        "fidelity.apply_correction",
        { ...ownerInput, expectedBefore: { name: "Changed elsewhere" } },
        { dryRun: true, idempotencyKey: "expected-before" },
      ),
    ).toMatchObject({ success: false, errors: [{ code: "MCP_DOCUMENT_VERSION_CONFLICT" }] });
    const lockedDocument = structuredClone(owner.document);
    const lockedText = lockedDocument.nodes[ownerText.id];
    if (!lockedText) throw new Error("Locked text fixture is missing.");
    lockedText.locked = true;
    const locked = createMcpTestFixture({ document: lockedDocument });
    expect(
      await locked.execute("fidelity.apply_correction", ownerInput, { dryRun: true, idempotencyKey: "locked-node" }),
    ).toMatchObject({ success: false, errors: [{ code: "MCP_AUTHORIZATION_DENIED" }] });
  });
});
