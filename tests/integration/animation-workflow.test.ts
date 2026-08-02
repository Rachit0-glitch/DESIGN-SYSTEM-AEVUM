import { createAnimationWorker } from "@aevum/animation-worker";
import { CURRENT_COMMAND_VERSION, createCommandId, createTransactionId, executeCommand } from "@aevum/command-engine";
import { fixtures, validateDocument } from "@aevum/document-model";
import { buildRenderGraph } from "@aevum/renderer-2d";
import { createRuntimeViewport, projectScene } from "@aevum/scene-runtime";
import { describe, expect, it } from "vitest";
import { createAnimationTimeline } from "../helpers/animation-fixture.js";

const NOW = "2026-08-02T15:00:00.000Z";

describe("animation workflow", () => {
  it("creates a timeline transaction, resolves a fixed frame, and feeds only resolved values to the Render Graph", () => {
    const document = fixtures.landingPage();
    document.metadata.updatedAt = NOW;
    const target = Object.values(document.nodes).find((node) => node.type === "TEXT");
    if (!target) throw new Error("Animation integration requires a text node.");
    const timeline = createAnimationTimeline(target.id);
    const transactionId = createTransactionId();
    const result = executeCommand(document, {
      id: createCommandId(),
      commandVersion: CURRENT_COMMAND_VERSION,
      documentId: document.metadata.id,
      expectedDocumentVersion: document.documentVersion,
      timestamp: NOW,
      actor: { id: "phase10", type: "SYSTEM" },
      correlationId: "phase10-integration",
      transactionId,
      type: "timeline.create",
      payload: { timeline },
    });
    const viewport = {
      ...createRuntimeViewport(result.newDocument),
      animation: { time: 1, timelineIds: [timeline.id] },
    };
    const projection = projectScene(result.newDocument, viewport);
    const runtimeNode = projection.nodes.get(target.id);
    if (!runtimeNode) throw new Error("Animated runtime node is missing.");
    const graph = buildRenderGraph(projection);

    expect(validateDocument(result.newDocument).success).toBe(true);
    expect(result.auditRecord.commandTypes).toEqual(["timeline.create"]);
    expect(runtimeNode.resolvedNode.transform.position).toEqual({ x: 50, y: 20, z: 0 });
    expect(runtimeNode.sourceNode.transform.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(runtimeNode.animation.appliedTimelineIds).toEqual([timeline.id]);
    expect(runtimeNode.animation.changedPaths).toEqual(["transform.opacity", "transform.position"]);
    expect([...graph.operations.values()].some((operation) => operation.canonicalNodeId === target.id)).toBe(true);
    expect(document.timelines[timeline.id]).toBeUndefined();
  });

  it("runs the inactive worker deterministically without persistence or playback", () => {
    const document = fixtures.landingPage();
    const target = Object.values(document.nodes).find((node) => node.type === "TEXT");
    if (!target) throw new Error("Animation worker fixture requires a text node.");
    const timeline = createAnimationTimeline(target.id);
    const worker = createAnimationWorker();
    const first = worker.execute({ id: "animation-job-1", timeline, time: 1 });
    const second = worker.execute({ id: "animation-job-1", timeline, time: 1 });
    expect(first).toEqual(second);
    expect(first.success).toBe(true);
    if (!first.success) throw new Error("Worker validation failed.");
    expect(first.evaluation.effectiveTime).toBe(1);
  });
});
