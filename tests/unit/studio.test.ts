import { describe, expect, it } from "vitest";
import {
  createDeterministicStudioAgentGateway,
  createMemoryPersistence,
  createStudioProjectFixture,
  createStudioSession,
  snapValue,
  studioFixtureIds,
} from "@aevum/studio";

describe("AEVUM Studio canonical session", () => {
  it("projects through Scene Runtime and renderer, persists canonical commands, and restores the document", () => {
    const fixture = createStudioProjectFixture();
    const persistence = createMemoryPersistence();
    const session = createStudioSession({ ...fixture, persistence, openedAt: "2026-08-13T01:00:00.000Z" });
    const before = session.getSnapshot();
    const heading = before.document.nodes[studioFixtureIds.heading];
    expect(heading?.type).toBe("TEXT");
    expect(before.projection.complete).toBe(true);
    expect(before.renderer.complete).toBe(true);

    session.updateNode(studioFixtureIds.heading, {
      transform: { ...heading?.transform, position: { x: 160, y: 210, z: 0 } },
    });
    const after = session.getSnapshot();
    expect(after.document.documentVersion).toBe(2);
    expect(after.document.nodes[studioFixtureIds.heading]?.transform.position).toEqual({ x: 160, y: 210, z: 0 });
    expect(after.history.entries[0]?.auditRecord.commandTypes).toEqual(["node.update"]);
    expect(after.saveState).toBe("SAVED");

    const restored = createStudioSession({ ...fixture, persistence, openedAt: "2026-08-13T01:01:00.000Z" });
    expect(restored.getSnapshot().document.documentVersion).toBe(2);
    expect(restored.getSnapshot().document.nodes[studioFixtureIds.heading]?.transform.position.x).toBe(160);
  });

  it("keeps undo, redo, duplication, and optimistic conflicts inside Command Engine rules", () => {
    const fixture = createStudioProjectFixture();
    const session = createStudioSession({ ...fixture, persistence: createMemoryPersistence() });
    const duplicateId = session.duplicateNode(studioFixtureIds.card);
    expect(session.getSnapshot().document.nodes[duplicateId]?.name).toBe("Fidelity card copy");
    expect(session.getSnapshot().document.nodes[duplicateId]?.childIds).not.toEqual(
      session.getSnapshot().document.nodes[studioFixtureIds.card]?.childIds,
    );
    session.undo();
    expect(session.getSnapshot().document.nodes[duplicateId]).toBeUndefined();
    session.redo();
    expect(session.getSnapshot().document.nodes[duplicateId]).toBeDefined();

    expect(() =>
      session.updateNode(studioFixtureIds.heading, { name: "Stale" }, { expectedDocumentVersion: 1 }),
    ).toThrow(/version/i);
    expect(session.getSnapshot().saveState).toBe("CONFLICT");
  });

  it("snaps deterministically without mutating input targets", () => {
    const targets = Object.freeze([0, 40, 124]);
    expect(snapValue(121.4, targets)).toBe(124);
    expect(snapValue(81.2, targets)).toBe(81);
    expect(targets).toEqual([0, 40, 124]);
  });

  it("routes deterministic AI edits through typed MCP dry-run and Command Engine persistence", async () => {
    const fixture = createStudioProjectFixture();
    const persistence = createMemoryPersistence();
    const session = createStudioSession({ ...fixture, persistence });
    const gateway = createDeterministicStudioAgentGateway({
      session,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      documentId: fixture.document.id,
    });

    const result = await gateway.updateNode({
      nodeId: studioFixtureIds.heading,
      changes: { name: "Agent-reviewed heading" },
      expectedDocumentVersion: 1,
      correlationId: "studio-agent-test",
    });

    expect(result.dryRunRequestId).not.toBe(result.applyRequestId);
    expect(result.resultVersion).toBe(2);
    expect(session.getSnapshot().document.nodes[studioFixtureIds.heading]?.name).toBe("Agent-reviewed heading");
    expect(session.getSnapshot().history.entries[0]?.auditRecord.actor.type).toBe("MCP_AGENT");
    expect(
      createStudioSession({ ...fixture, persistence }).getSnapshot().document.nodes[studioFixtureIds.heading]?.name,
    ).toBe("Agent-reviewed heading");

    await expect(
      gateway.updateNode({
        nodeId: studioFixtureIds.heading,
        changes: { name: "Stale agent edit" },
        expectedDocumentVersion: 1,
        correlationId: "studio-agent-stale-test",
      }),
    ).rejects.toThrow(/version/i);
  });
});
