import { createEntityId } from "@aevum/document-model";
import { describe, expect, it } from "vitest";
import { createInMemoryAssetStorage, createMcpTestFixture } from "../helpers/mcp-fixture.js";

/**
 * Block H9 — real MCP surface for timeline.create/update/delete and reference.register. The
 * consistency-matrix audit found these had real, tested Command Engine commands
 * (packages/command-engine/src/commands/timeline.ts, reference.ts) but zero external exposure at
 * all (timeline.*) or an asymmetric gap versus their sibling reconstruction-internal commands
 * (reference.register, unlike page.create/component.register/asset.register, never got a
 * standalone tool). This proves the exact same optimistic-concurrency and dry-run protections
 * every other write tool has, reached through the real MCP layer, not just executeCommand directly.
 */
function timelinePayload(id: string) {
  return {
    id,
    version: "1.0.0",
    name: "Intro sequence",
    type: "TIME" as const,
    duration: 2000,
    frameRate: 60,
    timeScale: 1,
    loop: { enabled: false, count: null, mode: "RESTART" as const },
    tracks: [],
    clips: [],
    markers: [],
    triggers: [],
    events: [],
    labels: {},
    metadata: {},
  };
}

describe("MCP timeline and reference-register lifecycle (Block H9)", () => {
  it("creates, updates, and deletes a real timeline through MCP, honoring stale-version rejection and dry-run", async () => {
    const fixture = createMcpTestFixture();
    const timelineId = createEntityId("timeline");
    const timeline = timelinePayload(timelineId);

    const staleCreate = await fixture.execute(
      "timeline.create",
      { expectedDocumentVersion: fixture.document.documentVersion + 1, timeline },
      { idempotencyKey: "h9-timeline-create-stale" },
    );
    expect(staleCreate.success).toBe(false);
    expect(staleCreate.errors[0]?.code).toBe("MCP_DOCUMENT_VERSION_CONFLICT");

    const dryRun = await fixture.execute(
      "timeline.create",
      { expectedDocumentVersion: fixture.document.documentVersion, timeline },
      { dryRun: true, idempotencyKey: "h9-timeline-create-dry-run" },
    );
    expect(dryRun.success, JSON.stringify(dryRun.errors)).toBe(true);
    const beforeCreate = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(beforeCreate?.timelines[timelineId]).toBeUndefined();

    const created = await fixture.execute(
      "timeline.create",
      { expectedDocumentVersion: fixture.document.documentVersion, timeline },
      { idempotencyKey: "h9-timeline-create" },
    );
    expect(created.success, JSON.stringify(created.errors)).toBe(true);
    const createdData = created.data as { resultVersion: number };
    const afterCreate = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterCreate?.timelines[timelineId]).toEqual(timeline);

    const updatedTimeline = { ...timeline, name: "Renamed sequence", duration: 3000 };
    const updated = await fixture.execute(
      "timeline.update",
      { expectedDocumentVersion: createdData.resultVersion, timeline: updatedTimeline },
      { idempotencyKey: "h9-timeline-update" },
    );
    expect(updated.success, JSON.stringify(updated.errors)).toBe(true);
    const updatedData = updated.data as { resultVersion: number };
    const afterUpdate = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterUpdate?.timelines[timelineId]?.name).toBe("Renamed sequence");
    expect(afterUpdate?.timelines[timelineId]?.duration).toBe(3000);

    const deleted = await fixture.execute(
      "timeline.delete",
      { expectedDocumentVersion: updatedData.resultVersion, timelineId },
      { idempotencyKey: "h9-timeline-delete" },
    );
    expect(deleted.success, JSON.stringify(deleted.errors)).toBe(true);
    const afterDelete = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterDelete?.timelines[timelineId]).toBeUndefined();
  }, 60_000);

  it("registers a real reference through MCP pointing at an already-registered asset, honoring dry-run and duplicate rejection", async () => {
    const storage = createInMemoryAssetStorage();
    const fixture = createMcpTestFixture({ assetStorageAdapter: storage });
    const registered = await fixture.execute(
      "asset.register",
      {
        expectedDocumentVersion: fixture.document.documentVersion,
        kind: "IMAGE",
        bytesBase64: Buffer.from("fake-bytes").toString("base64"),
        originalFilename: "reference-target.png",
        mimeType: "image/png",
        width: 10,
        height: 10,
        alpha: false,
      },
      { idempotencyKey: "h9-reference-asset-register" },
    );
    expect(registered.success, JSON.stringify(registered.errors)).toBe(true);
    const registeredData = registered.data as { assetId: string; resultVersion: number };

    const reference = {
      id: createEntityId("reference"),
      assetId: registeredData.assetId,
      type: "IMAGE" as const,
      role: "PRIMARY" as const,
      regions: [],
      metadata: {},
    };

    const dryRun = await fixture.execute(
      "reference.register",
      { expectedDocumentVersion: registeredData.resultVersion, reference },
      { dryRun: true, idempotencyKey: "h9-reference-register-dry-run" },
    );
    expect(dryRun.success, JSON.stringify(dryRun.errors)).toBe(true);
    const beforeRegister = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(beforeRegister?.references[reference.id]).toBeUndefined();

    const created = await fixture.execute(
      "reference.register",
      { expectedDocumentVersion: registeredData.resultVersion, reference },
      { idempotencyKey: "h9-reference-register" },
    );
    expect(created.success, JSON.stringify(created.errors)).toBe(true);
    const afterRegister = await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId);
    expect(afterRegister?.references[reference.id]).toEqual(reference);
    const createdData = created.data as { resultVersion: number };

    const duplicate = await fixture.execute(
      "reference.register",
      { expectedDocumentVersion: createdData.resultVersion, reference },
      { idempotencyKey: "h9-reference-register-duplicate" },
    );
    expect(duplicate.success).toBe(false);
    expect(duplicate.errors[0]?.code).toBe("MCP_COMMAND_FAILED");
  }, 60_000);
});
